// What is said in a long video (a webinar, a talk: up to three hours), heard
// on the team's own computer as clips are (lib/speech.ts), without ever
// holding the whole file in memory or sending it anywhere. The sound is read
// from the file five minutes at a time (Mediabunny reads only the bytes it
// needs), mixed to one channel at 16 kHz and handed to one Whisper worker,
// which keeps the model loaded between pieces. Lines come back as each piece
// is heard, so the page can show the transcript growing.

import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import type { AudioSample } from 'mediabunny';
import { SpeechError } from './speech';
import { linesFromChunks, MAX_LONG_LINES } from './transcribe';
import type { TranscriptLine } from './types';

const RATE = 16_000;
const WORKER = '/speech/whisper-worker.js';
/** Five minutes a piece: 19 MB of sound, and a sign of progress often enough. */
export const PIECE_SECONDS = 300;
/** Three hours: a long webinar, with room. */
export const MAX_LONG_SECONDS = 3 * 3600;
const SILENCE = 0.002;

export interface LongFile {
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
}

export interface LongHearing {
  stage: 'loading' | 'listening';
  /** Of the whole video, 0 to 1; null while the model's size is unknown. */
  share: number | null;
  /** The lines heard so far, in the video's seconds. */
  lines: TranscriptLine[];
}

/** What the file is, read from its first bytes: its length, its picture's size, and whether it has sound. */
export async function probeLong(file: File): Promise<LongFile> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const [video, audio, duration] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack(), input.computeDuration()]);
    if (!audio) throw new SpeechError('This video has no sound, so there is nothing to hear in it.');
    if (!(await audio.canDecode())) throw new SpeechError('This browser can’t read this video’s sound. Try Chrome or Edge.');
    if (!Number.isFinite(duration) || duration <= 0) throw new SpeechError('This video’s length can’t be read.');
    if (duration > MAX_LONG_SECONDS + 60) throw new SpeechError('A long video can be up to three hours. Cut it into parts first.');
    const [width, height] = video ? await Promise.all([video.getDisplayWidth(), video.getDisplayHeight()]) : [0, 0];
    return { name: file.name, size: file.size, duration, width, height };
  } catch (err) {
    if (err instanceof SpeechError) throw err;
    throw new SpeechError('This file can’t be read as a video.');
  } finally {
    input.dispose();
  }
}

/**
 * Adds one decoded sample's sound to `out` (one channel at 16 kHz, starting at
 * `from` seconds): its channels mixed, and every output sample the average of
 * the source samples it covers, which is low-pass enough for speech.
 */
export function addToPiece(out: Float32Array, from: number, sample: { timestamp: number; sampleRate: number; numberOfFrames: number; channels: Float32Array[] }): void {
  const { timestamp, sampleRate: rate, numberOfFrames: frames, channels } = sample;
  if (frames === 0 || channels.length === 0) return;
  const ratio = rate / RATE;
  const startK = Math.max(0, Math.ceil((timestamp - from) * RATE));
  const endK = Math.min(out.length, Math.floor((timestamp + frames / rate - from) * RATE));
  for (let k = startK; k < endK; k += 1) {
    const at = (from + k / RATE - timestamp) * rate;
    const i0 = Math.max(0, Math.floor(at));
    const i1 = Math.min(frames, Math.max(i0 + 1, Math.floor(at + ratio)));
    let sum = 0;
    for (const channel of channels) for (let i = i0; i < i1; i += 1) sum += channel[i] ?? 0;
    out[k] = sum / ((i1 - i0) * channels.length);
  }
}

function channelsOf(sample: AudioSample): Float32Array[] {
  const frames = sample.numberOfFrames;
  return Array.from({ length: sample.numberOfChannels }, (_, c) => {
    const data = new Float32Array(frames);
    sample.copyTo(data, { planeIndex: c, format: 'f32-planar' });
    return data;
  });
}

/** One Whisper worker for every piece, so the model loads once. */
class Listener {
  private worker = new Worker(WORKER, { type: 'module' });
  private next = 1;
  private pending = new Map<number, { resolve: (chunks: unknown[]) => void; reject: (err: unknown) => void; onProgress: (stage: 'loading' | 'listening', share: number | null) => void }>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<{ id?: number; type?: string; stage?: string; share?: number | null; chunks?: unknown; error?: string }>) => {
      const m = e.data;
      const job = typeof m.id === 'number' ? this.pending.get(m.id) : undefined;
      if (!job) return;
      if (m.type === 'loading' || m.type === 'listening') job.onProgress(m.type, typeof m.share === 'number' ? m.share : null);
      else if (m.type === 'done') {
        this.pending.delete(m.id!);
        job.resolve(Array.isArray(m.chunks) ? m.chunks : []);
      } else if (m.type === 'failed') {
        this.pending.delete(m.id!);
        const why = m.error ?? 'Whisper did not run';
        job.reject(
          new SpeechError(
            m.stage === 'loading' ? `The speech model could not be downloaded (${why}). Try again in a moment.` : `The video could not be heard here (${why}). Try again, or in Chrome or Edge.`,
            true,
          ),
        );
      }
    };
    this.worker.onerror = () => {
      for (const job of this.pending.values()) job.reject(new SpeechError('The speech model could not start in this browser. Try Chrome or Edge.', true));
      this.pending.clear();
    };
  }

  listen(audio: Float32Array, onProgress: (stage: 'loading' | 'listening', share: number | null) => void): Promise<unknown[]> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ id, audio }, [audio.buffer]);
    });
  }

  end() {
    this.worker.terminate();
    for (const job of this.pending.values()) job.reject(new DOMException('Stopped', 'AbortError'));
    this.pending.clear();
  }
}

/**
 * What is said in a long video, as caption-sized lines in its own seconds.
 * `onProgress` hears the share of the whole video done and the lines so far
 * after every piece. Stops, with an AbortError, when `signal` is aborted.
 */
export async function hearLong(file: File, duration: number, onProgress: (h: LongHearing) => void, signal: AbortSignal): Promise<TranscriptLine[]> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const listener = new Listener();
  const stop = () => listener.end();
  signal.addEventListener('abort', stop, { once: true });
  const chunks: { timestamp: [number, number | null]; text: string }[] = [];
  let lines: TranscriptLine[] = [];
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new SpeechError('This video has no sound, so there is nothing to hear in it.');
    const sink = new AudioSampleSink(track);
    const pieces = Math.max(1, Math.ceil(duration / PIECE_SECONDS));
    let heardAny = false;

    for (let p = 0; p < pieces; p += 1) {
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
      const from = p * PIECE_SECONDS;
      const to = Math.min(duration, from + PIECE_SECONDS);
      const piece = new Float32Array(Math.max(1, Math.ceil((to - from) * RATE)));
      for await (const sample of sink.samples(from, to)) {
        try {
          addToPiece(piece, from, { timestamp: sample.timestamp, sampleRate: sample.sampleRate, numberOfFrames: sample.numberOfFrames, channels: channelsOf(sample) });
        } finally {
          sample.close();
        }
        if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
      }
      // A silent stretch (music, a pause) has nothing for Whisper.
      if (!piece.some((v) => Math.abs(v) > SILENCE)) {
        onProgress({ stage: 'listening', share: (p + 1) / pieces, lines });
        continue;
      }
      heardAny = true;
      const got = await listener.listen(piece, (stage, share) =>
        onProgress({ stage, share: stage === 'loading' ? share : (p + (share ?? 0)) / pieces, lines }),
      );
      for (const c of got) {
        const chunk = c as { timestamp?: [number, number | null]; text?: unknown } | null;
        const ts = chunk?.timestamp;
        if (!Array.isArray(ts) || typeof ts[0] !== 'number' || typeof chunk?.text !== 'string') continue;
        chunks.push({ timestamp: [ts[0] + from, typeof ts[1] === 'number' ? ts[1] + from : null], text: chunk.text });
      }
      lines = linesFromChunks(chunks, duration, MAX_LONG_LINES);
      onProgress({ stage: 'listening', share: (p + 1) / pieces, lines });
    }

    if (!heardAny) throw new SpeechError('The video is silent throughout: there is nothing to hear in it.');
    if (lines.length === 0) throw new SpeechError('No speech was heard in the video.');
    return lines;
  } catch (err) {
    if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
    if (err instanceof SpeechError) throw err;
    console.error('Hearing the long video failed', err);
    throw new SpeechError('The video could not be heard in this browser. Try Chrome or Edge.', true);
  } finally {
    signal.removeEventListener('abort', stop);
    listener.end();
    input.dispose();
  }
}
