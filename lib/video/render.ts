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
import { clipTimeAt, keptSeconds } from './edit';
import type { Part, Size } from './edit';
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
