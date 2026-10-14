// Turns a clip and its edit into a video file in the browser, through
// Mediabunny and the browser's own encoders (WebCodecs): frames are decoded,
// drawn by the caller (scaled as they are for the cutter, drawFrame for the
// studio), and encoded again; the sound of the kept parts follows them, with
// a few milliseconds' fade at every cut so it never clicks. Nothing here
// leaves the browser: the cutter uploads what it makes, the studio downloads it.
//
// MP4 with H.264 and AAC is what the ad platforms take, so it is made
// whenever the browser can. Browsers without an AAC encoder get Mediabunny's
// own (loaded only then); a browser that cannot make H.264 at all makes WebM.

import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  UrlSource,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import type { InputAudioTrack, InputVideoTrack } from 'mediabunny';
import { clipTimeAt, editedSeconds, keptSeconds } from './edit';
import type { Part, Size, VideoEdit } from './edit';
import { frameAt, hasSound, layout, musicGainAt, pieceGainAt, sequenceOf } from './timeline';
import type { Placed, Showing } from './timeline';
import type { Picture } from './draw';
import { RenderError } from './errors';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** A signed link that has expired should fail the export, not retry for ever. */
const fromSource = (source: Blob | string) =>
  new Input({
    source: typeof source === 'string' ? new UrlSource(source, { getRetryDelay: (attempts) => (attempts < 3 ? 2 ** attempts : null) }) : new BlobSource(source),
    formats: ALL_FORMATS,
  });

export interface ClipInfo {
  /** Seconds. */
  duration: number;
  /** As shown: after rotation and pixel aspect. */
  width: number;
  height: number;
  frameRate: number;
  hasAudio: boolean;
  /** False when this browser cannot decode the clip's video, so it cannot cut or export it. */
  canDecode: boolean;
}

export async function probeClip(source: Blob | string): Promise<ClipInfo> {
  const input = fromSource(source);
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new RenderError('This file has no video in it.');
    const audio = await input.getPrimaryAudioTrack();
    const [duration, width, height, stats, canDecode] = await Promise.all([
      input.computeDuration(),
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      video.computePacketStats(90),
      video.canDecode(),
    ]);
    return { duration, width, height, frameRate: stats.averagePacketRate, hasAudio: audio !== null, canDecode };
  } catch (err) {
    if (err instanceof RenderError) throw err;
    throw new RenderError('This file can’t be read as a video.');
  } finally {
    input.dispose();
  }
}

/** How long a piece of music runs, in seconds. Throws RenderError when the browser can't play its sound. */
export async function probeAudio(source: Blob): Promise<number> {
  const input = fromSource(source);
  try {
    const audio = await input.getPrimaryAudioTrack();
    if (!audio) throw new RenderError('This file has no sound in it.');
    if (!(await audio.canDecode())) throw new RenderError('This browser can’t play this file’s sound. Try an MP3 or M4A.');
    const duration = await input.computeDuration();
    if (!(duration > 0)) throw new RenderError('This file’s length can’t be read.');
    return duration;
  } catch (err) {
    if (err instanceof RenderError) throw err;
    throw new RenderError('This file can’t be read as music.');
  } finally {
    input.dispose();
  }
}

export interface Target {
  container: 'mp4' | 'webm';
  video: 'avc' | 'vp9' | 'vp8';
  audio: 'aac' | 'opus' | null;
  mime: 'video/mp4' | 'video/webm';
  extension: 'mp4' | 'webm';
}

const AUDIO_BITRATE = 128_000;
const audioCheck = { numberOfChannels: 2, sampleRate: 48_000, quality: new Quality({ bitrate: AUDIO_BITRATE }) };

let aacLoaded: Promise<boolean> | null = null;
/** Mediabunny's own AAC encoder, for browsers without one. Loaded once, and only when needed. */
function loadAac(): Promise<boolean> {
  aacLoaded ??= import('@mediabunny/aac-encoder')
    .then(({ registerAacEncoder }) => {
      registerAacEncoder();
      return canEncodeAudio('aac', audioCheck);
    })
    .catch(() => false);
  return aacLoaded;
}

/** What this browser can make a file of this size in: MP4 if it can, WebM if not, null if neither. */
export async function chooseTarget(size: Size, bitrate: number, withAudio: boolean): Promise<Target | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const check = { width: size.width, height: size.height, quality: new Quality({ bitrate }) };
  if (await canEncodeVideo('avc', check)) {
    const aac = withAudio && ((await canEncodeAudio('aac', audioCheck)) || (await loadAac()));
    return { container: 'mp4', video: 'avc', audio: aac ? 'aac' : null, mime: 'video/mp4', extension: 'mp4' };
  }
  for (const video of ['vp9', 'vp8'] as const) {
    if (await canEncodeVideo(video, check)) {
      const opus = withAudio && (await canEncodeAudio('opus', audioCheck));
      return { container: 'webm', video, audio: opus ? 'opus' : null, mime: 'video/webm', extension: 'webm' };
    }
  }
  return null;
}

/** Bits a second for the picture: about what the platforms re-encode ads to, from 1 to 8 Mbit/s. */
export const videoBitrate = (size: Size, frameRate: number): number => Math.round(clamp(size.width * size.height * frameRate * 0.1, 1_000_000, 8_000_000));

/**
 * The bitrate for a clip that must fit in `bytes` once it is `seconds` long,
 * sound included: the usual rate when it fits, less when it would not, and
 * never so little that the picture falls apart.
 */
export function bitrateToFit(size: Size, frameRate: number, seconds: number, bytes: number, withAudio: boolean): number {
  const budget = (bytes * 8) / Math.max(1, seconds) - (withAudio ? AUDIO_BITRATE : 0);
  return Math.round(clamp(Math.min(videoBitrate(size, frameRate), budget), 300_000, 8_000_000));
}

export interface RenderJob {
  source: Blob | string;
  /** The parts of the clip to keep, in its own seconds. */
  keep: readonly Part[];
  /** Seconds after the last part with no picture: the end card. */
  tail: number;
  size: Size;
  bitrate: number;
  /** 0 leaves the sound out. */
  volume: number;
  /** Draws one frame: `picture` is null on the end card, `clipTime` the clip's second it shows (null there too). */
  draw: (ctx: CanvasRenderingContext2D, picture: Picture | null, time: number, clipTime: number | null) => void;
  /** From 0 to 1. */
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
  /** The clip's own rate up to this; 30 is what the platforms show. */
  maxFrameRate?: number;
  /** Refuse to make WebM: a post to Instagram or Facebook must be an MP4. */
  requireMp4?: boolean;
}

const FADE = 0.008;

/** The part of an audio sample inside `part`, or null if none of it is. Closes what it does not return. */
function within(sample: AudioSample, part: Part): AudioSample | null {
  const rate = sample.sampleRate;
  const from = Math.max(0, Math.round((part.start - sample.timestamp) * rate));
  const to = Math.min(sample.numberOfFrames, Math.round((part.end - sample.timestamp) * rate));
  if (to <= from) {
    sample.close();
    return null;
  }
  if (from === 0 && to === sample.numberOfFrames) return sample;
  const piece = sample.trim(from, to);
  sample.close();
  return piece;
}

/** A sample at its place in the edited video, at the edit's volume, faded at the part's edges. */
function shaped(sample: AudioSample, part: Part, offset: number, volume: number): AudioSample {
  const frames = sample.numberOfFrames;
  const channels = sample.numberOfChannels;
  const rate = sample.sampleRate;
  const data = new Float32Array(frames * channels);
  for (let c = 0; c < channels; c++) sample.copyTo(data.subarray(c * frames, (c + 1) * frames), { planeIndex: c, format: 'f32-planar' });
  for (let f = 0; f < frames; f++) {
    const t = sample.timestamp + f / rate;
    const edge = Math.min(t - part.start, part.end - t);
    const gain = volume * (edge < FADE ? Math.max(0, edge / FADE) : 1);
    if (gain === 1) continue;
    for (let c = 0; c < channels; c++) data[c * frames + f] = (data[c * frames + f] ?? 0) * gain;
  }
  return new AudioSample({ data, format: 'f32-planar', numberOfChannels: channels, sampleRate: rate, timestamp: offset + (sample.timestamp - part.start) });
}

const aborted = () => new DOMException('The video was not finished.', 'AbortError');

/** Renders the job to a file. Throws RenderError with a reason a person can act on, or an AbortError when cancelled. */
export async function render(job: RenderJob): Promise<{ blob: Blob; target: Target }> {
  const input = fromSource(job.source);
  let output: Output | null = null;
  const stop = () => void output?.cancel();
  job.signal?.addEventListener('abort', stop, { once: true });
  try {
    const video: InputVideoTrack | null = await input.getPrimaryVideoTrack();
    if (!video) throw new RenderError('This file has no video in it.');
    if (!(await video.canDecode())) throw new RenderError('This browser can’t read this video’s format. Try Chrome, Edge or Safari.');
    const audioTrack = await input.getPrimaryAudioTrack();
    const audio: InputAudioTrack | null = audioTrack && job.volume > 0 && (await audioTrack.canDecode()) ? audioTrack : null;

    const stats = await video.computePacketStats(90);
    const frameRate = clamp(Math.round(stats.averagePacketRate) || 30, 10, job.maxFrameRate ?? 30);
    const target = await chooseTarget(job.size, job.bitrate, audio !== null);
    if (!target) throw new RenderError('This browser can’t make video files. Use Chrome, Edge or Safari.');
    if (job.requireMp4 && target.container !== 'mp4') throw new RenderError('This browser can only make WebM, and posts go out as MP4. Post it from Chrome, Edge or Safari.');
    if (job.signal?.aborted) throw aborted();

    // Frames are decoded no larger than 1080p: enough for any frame this makes.
    const shown = { width: await video.getDisplayWidth(), height: await video.getDisplayHeight() };
    const scale = Math.min(1, 1920 / Math.max(shown.width, shown.height));
    const sink = new CanvasSink(video, { width: Math.round(shown.width * scale), height: Math.round(shown.height * scale), fit: 'fill', poolSize: 3 });

    const canvas = document.createElement('canvas');
    canvas.width = job.size.width;
    canvas.height = job.size.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new RenderError('This browser can’t draw video frames.');

    output = new Output({
      format: target.container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const frames = new CanvasSource(canvas, { codec: target.video, quality: new Quality({ bitrate: job.bitrate }), keyFrameInterval: 2 });
    output.addVideoTrack(frames, { frameRate });
    const sound = audio && target.audio ? new AudioSampleSource({ codec: target.audio, quality: new Quality({ bitrate: AUDIO_BITRATE }) }) : null;
    if (sound) output.addAudioTrack(sound);
    await output.start();

    const first = await video.getFirstTimestamp();
    const kept = Math.max(1, Math.round(keptSeconds(job.keep) * frameRate));
    const total = kept + Math.round(job.tail * frameRate);
    // Each frame shows the clip at the middle of its time, so a cut never repeats or skips one.
    const times = Array.from({ length: kept }, (_, i) => Math.max(first, clipTimeAt(job.keep, (i + 0.5) / frameRate) ?? first));

    const pictures = async () => {
      let i = 0;
      let last: Picture | null = null;
      for await (const frame of sink.canvasesAtTimestamps(times)) {
        if (job.signal?.aborted) throw aborted();
        if (frame) last = { image: frame.canvas, width: frame.canvas.width, height: frame.canvas.height };
        job.draw(ctx, last, i / frameRate, times[i] ?? null);
        await frames.add(i / frameRate, 1 / frameRate);
        i++;
        job.onProgress?.(i / total);
      }
      for (; i < total; i++) {
        if (job.signal?.aborted) throw aborted();
        job.draw(ctx, null, i / frameRate, null);
        await frames.add(i / frameRate, 1 / frameRate);
        job.onProgress?.((i + 1) / total);
      }
      frames.close();
    };

    const samples = async () => {
      if (!audio || !sound) return;
      const sink = new AudioSampleSink(audio);
      let offset = 0;
      for (const part of job.keep) {
        for await (const raw of sink.samples(part.start, part.end)) {
          if (job.signal?.aborted) {
            raw.close();
            throw aborted();
          }
          const piece = within(raw, part);
          if (!piece) continue;
          const out = shaped(piece, part, offset, job.volume);
          piece.close();
          await sound.add(out);
          out.close();
        }
        offset += part.end - part.start;
      }
      sound.close();
    };

    await Promise.all([pictures(), samples()]);
    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new RenderError('The video came out empty.');
    return { blob: new Blob([buffer], { type: target.mime }), target };
  } catch (err) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined);
    if (job.signal?.aborted) throw aborted();
    if (err instanceof RenderError) throw err;
    console.error('Rendering the video failed', err);
    throw new RenderError('The video could not be made in this browser.');
  } finally {
    job.signal?.removeEventListener('abort', stop);
    input.dispose();
  }
}

/**
 * Small frames across a clip, for the cutter's timeline: object URLs of
 * JPEGs, which the caller revokes. Empty when the browser cannot decode it.
 */
export async function filmstrip(source: Blob | string, duration: number, count: number, height: number, signal?: AbortSignal): Promise<string[]> {
  const input = fromSource(source);
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video || !(await video.canDecode())) return [];
    const sink = new CanvasSink(video, { height, poolSize: 2 });
    const first = await video.getFirstTimestamp();
    const times = Array.from({ length: count }, (_, i) => Math.max(first, ((i + 0.5) / count) * duration));
    const urls: string[] = [];
    for await (const frame of sink.canvasesAtTimestamps(times)) {
      if (signal?.aborted) break;
      if (!frame) continue;
      const canvas = frame.canvas;
      const blob = canvas instanceof HTMLCanvasElement ? await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.7)) : await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
      if (blob) urls.push(URL.createObjectURL(blob));
    }
    return urls;
  } catch {
    return [];
  } finally {
    input.dispose();
  }
}

// ---------------------------------------------------------------- a whole timeline

export interface TimelineJob {
  /** The run's clip. */
  clip: Blob;
  /** Every other file the edit uses, by its path (lib/video/timeline.ts, mediaOf). */
  media: ReadonlyMap<string, Blob>;
  edit: VideoEdit;
  size: Size;
  bitrate: number;
  /** Draws the frame at the edited video's second `time`, asking `pictureOf` for what each piece on screen shows. */
  draw: (ctx: CanvasRenderingContext2D, time: number, pictureOf: (showing: Showing) => Picture | null) => void;
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
  maxFrameRate?: number;
  requireMp4?: boolean;
}

interface Opened {
  input: Input;
  video: InputVideoTrack | null;
  audio: InputAudioTrack | null;
  first: number;
}

/** A file's tracks, opened once: its picture when the browser can decode it, its sound when it has some. */
async function open(source: Blob, label: string): Promise<Opened> {
  const input = fromSource(source);
  try {
    const video = await input.getPrimaryVideoTrack();
    if (video && !(await video.canDecode())) throw new RenderError(`This browser can’t read ${label}. Try Chrome, Edge or Safari.`);
    const track = await input.getPrimaryAudioTrack();
    const audio = track && (await track.canDecode()) ? track : null;
    return { input, video, audio, first: video ? await video.getFirstTimestamp() : 0 };
  } catch (err) {
    input.dispose();
    if (err instanceof RenderError) throw err;
    throw new RenderError(`${label.charAt(0).toUpperCase()}${label.slice(1)} can’t be read as a video or sound.`);
  }
}

const RATE = 48_000;
/** The sound is mixed this many seconds at a time: an hour of music never sits in memory. */
const CHUNK = 10;
/** Gain is set this many times a second: smooth enough for fades and ducking. */
const STEPS = 100;

function curve(from: number, seconds: number, gain: (t: number) => number): Float32Array {
  const n = Math.max(2, Math.ceil(seconds * STEPS) + 1);
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) out[k] = gain(from + (k / (n - 1)) * seconds);
  return out;
}

/** Puts the buffers of `track` between `start` and `end` (its own seconds) on `ctx` at `at` (the chunk's seconds), through `node`. */
async function schedule(ctx: OfflineAudioContext, node: AudioNode, track: InputAudioTrack, start: number, end: number, at: number, signal?: AbortSignal) {
  for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(start, end)) {
    if (signal?.aborted) throw aborted();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(node);
    const when = at + (timestamp - start);
    if (when < 0) {
      if (-when < buffer.duration) source.start(0, -when);
    } else source.start(when);
  }
}

/**
 * Renders an edit's whole timeline to a file: every piece decoded in order
 * from its own file (the run's clip, other videos, pictures), each frame drawn
 * by the caller, and one sound track mixed from the clips' sound, faded
 * through the transitions, and the music, faded and ducked. Throws RenderError
 * with a reason a person can act on, or an AbortError when cancelled.
 */
export async function renderTimeline(job: TimelineJob): Promise<{ blob: Blob; target: Target }> {
  const opened = new Map<string, Opened>();
  const bitmaps = new Map<string, ImageBitmap>();
  let output: Output | null = null;
  const stop = () => void output?.cancel();
  job.signal?.addEventListener('abort', stop, { once: true });
  try {
    const sequence = sequenceOf(job.edit);
    const placed: Placed[] = layout(sequence);
    const total = editedSeconds(job.edit);

    const run = await open(job.clip, 'the clip');
    opened.set('', run);
    if (!run.video) throw new RenderError('This file has no video in it.');
    for (const s of sequence) {
      if (s.kind === 'clip' && s.media && !opened.has(s.media.path)) {
        const blob = job.media.get(s.media.path);
        if (!blob) throw new RenderError(`${s.media.name} could not be fetched. Reload the page to try again.`);
        const file = await open(blob, s.media.name);
        if (!file.video) throw new RenderError(`${s.media.name} has no video in it.`);
        opened.set(s.media.path, file);
      } else if (s.kind === 'image' && !bitmaps.has(s.media.path)) {
        const blob = job.media.get(s.media.path);
        if (!blob) throw new RenderError(`${s.media.name} could not be fetched. Reload the page to try again.`);
        bitmaps.set(s.media.path, await createImageBitmap(blob).catch(() => Promise.reject(new RenderError(`${s.media.name} can’t be read as a picture.`))));
      }
    }
    const music = job.edit.music ?? null;
    let musicTrack: InputAudioTrack | null = null;
    if (music) {
      const blob = job.media.get(music.media.path);
      if (!blob) throw new RenderError(`${music.media.name} could not be fetched. Reload the page to try again.`);
      const file = await open(blob, music.media.name);
      opened.set(music.media.path, file);
      musicTrack = file.audio;
    }

    const audioOf = (s: Showing['placed']['segment']) => (s.kind === 'clip' ? (opened.get(s.media?.path ?? '')?.audio ?? null) : null);
    const speaks = job.edit.volume > 0 && placed.some((p) => hasSound(p.segment) && audioOf(p.segment));
    const withAudio = speaks || musicTrack !== null;

    const stats = await run.video.computePacketStats(90);
    const frameRate = clamp(Math.round(stats.averagePacketRate) || 30, 10, job.maxFrameRate ?? 30);
    const target = await chooseTarget(job.size, job.bitrate, withAudio);
    if (!target) throw new RenderError('This browser can’t make video files. Use Chrome, Edge or Safari.');
    if (job.requireMp4 && target.container !== 'mp4') throw new RenderError('This browser can only make WebM, and posts go out as MP4. Post it from Chrome, Edge or Safari.');
    if (job.signal?.aborted) throw aborted();

    const canvas = document.createElement('canvas');
    canvas.width = job.size.width;
    canvas.height = job.size.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new RenderError('This browser can’t draw video frames.');

    output = new Output({
      format: target.container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const frames = new CanvasSource(canvas, { codec: target.video, quality: new Quality({ bitrate: job.bitrate }), keyFrameInterval: 2 });
    output.addVideoTrack(frames, { frameRate });
    const sound = withAudio && target.audio ? new AudioBufferSource({ codec: target.audio, quality: new Quality({ bitrate: AUDIO_BITRATE }) }) : null;
    if (sound) output.addAudioTrack(sound);
    await output.start();

    // Each frame shows the middle of its time. First, which second of its source every clip piece shows on each frame it is on screen.
    const count = Math.max(1, Math.round(total * frameRate));
    const at = (i: number) => (i + 0.5) / frameRate;
    const times = new Map<number, number[]>();
    for (let i = 0; i < count; i++) {
      const f = frameAt(placed, at(i));
      for (const s of [f.current, f.previous]) {
        if (!s || s.placed.segment.kind !== 'clip' || s.source === null) continue;
        const list = times.get(s.placed.index) ?? [];
        list.push(s.source);
        times.set(s.placed.index, list);
      }
    }

    // A decoder per piece, opened as it comes on screen and closed after it: two at most at any time.
    const playing = new Map<number, { frames: AsyncGenerator<{ canvas: HTMLCanvasElement | OffscreenCanvas } | null>; last: Picture | null; left: number }>();
    const pull = async (s: Showing): Promise<Picture | null> => {
      const seg = s.placed.segment;
      if (seg.kind !== 'clip') return null;
      let piece = playing.get(s.placed.index);
      if (!piece) {
        const file = opened.get(seg.media?.path ?? '');
        const list = times.get(s.placed.index) ?? [];
        if (!file?.video) return null;
        const w = await file.video.getDisplayWidth();
        const h = await file.video.getDisplayHeight();
        const scale = Math.min(1, 1920 / Math.max(w, h));
        const sink = new CanvasSink(file.video, { width: Math.round(w * scale), height: Math.round(h * scale), fit: 'fill', poolSize: 2 });
        const first = file.first;
        piece = { frames: sink.canvasesAtTimestamps(list.map((t) => Math.max(first, t))), last: null, left: list.length };
        playing.set(s.placed.index, piece);
      }
      const next = await piece.frames.next();
      piece.left -= 1;
      if (!next.done && next.value) piece.last = { image: next.value.canvas, width: next.value.canvas.width, height: next.value.canvas.height };
      if (piece.left <= 0) {
        await piece.frames.return(undefined);
        playing.delete(s.placed.index);
      }
      return piece.last;
    };

    const pictures = async () => {
      for (let i = 0; i < count; i++) {
        if (job.signal?.aborted) throw aborted();
        const t = at(i);
        const f = frameAt(placed, t);
        const shown = new Map<number, Picture | null>();
        for (const s of [f.current, f.previous]) {
          if (!s) continue;
          const seg = s.placed.segment;
          if (seg.kind === 'clip') shown.set(s.placed.index, await pull(s));
          else if (seg.kind === 'image') {
            const bitmap = bitmaps.get(seg.media.path);
            shown.set(s.placed.index, bitmap ? { image: bitmap, width: bitmap.width, height: bitmap.height } : null);
          }
        }
        job.draw(ctx, t, (s) => shown.get(s.placed.index) ?? null);
        await frames.add(i / frameRate, 1 / frameRate);
        job.onProgress?.((i + 1) / count);
      }
      frames.close();
    };

    const samples = async () => {
      if (!sound) return;
      for (let c0 = 0; c0 < total - 0.0005; c0 += CHUNK) {
        const seconds = Math.min(CHUNK, total - c0);
        const mix = new OfflineAudioContext(2, Math.max(1, Math.round(seconds * RATE)), RATE);
        if (job.edit.volume > 0) {
          for (const p of placed) {
            const track = audioOf(p.segment);
            const seg = p.segment;
            if (!track || seg.kind !== 'clip' || !hasSound(seg) || p.until <= c0 || p.at >= c0 + seconds) continue;
            const from = Math.max(c0, p.at);
            const to = Math.min(c0 + seconds, p.until);
            const gain = mix.createGain();
            gain.gain.setValueCurveAtTime(curve(c0, seconds, (t) => pieceGainAt(placed, p.index, t, job.edit.volume)), 0, seconds);
            gain.connect(mix.destination);
            await schedule(mix, gain, track, seg.start + (from - p.at), seg.start + (to - p.at), from - c0, job.signal);
          }
        }
        if (music && musicTrack) {
          const gain = mix.createGain();
          gain.gain.setValueCurveAtTime(curve(c0, seconds, (t) => musicGainAt(music, placed, t, total, job.edit.volume)), 0, seconds);
          gain.connect(mix.destination);
          // The music starts again when it runs out.
          const length = music.media.duration ?? total;
          for (let loop = Math.floor(c0 / length) * length; loop < c0 + seconds; loop += length) {
            const from = Math.max(c0, loop);
            const to = Math.min(c0 + seconds, loop + length);
            if (to > from) await schedule(mix, gain, musicTrack, from - loop, to - loop, from - c0, job.signal);
          }
        }
        const mixed = await mix.startRendering();
        if (job.signal?.aborted) throw aborted();
        await sound.add(mixed);
      }
      sound.close();
    };

    await Promise.all([pictures(), samples()]);
    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new RenderError('The video came out empty.');
    return { blob: new Blob([buffer], { type: target.mime }), target };
  } catch (err) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined);
    if (job.signal?.aborted) throw aborted();
    if (err instanceof RenderError) throw err;
    console.error('Rendering the video failed', err);
    throw new RenderError('The video could not be made in this browser.');
  } finally {
    job.signal?.removeEventListener('abort', stop);
    for (const file of opened.values()) file.input.dispose();
    for (const bitmap of bitmaps.values()) bitmap.close();
  }
}
