// What is said in a clip, heard in the browser and on the team's own computer:
// the page decodes the clip's sound to what Whisper hears (16 kHz, one
// channel) and a worker runs Whisper on it (public/speech/whisper-worker.js).
// Free, and the clip's sound never leaves the tab; the model is fetched from
// Hugging Face the first time and kept by the browser.

import { linesFromChunks } from './transcribe';
import type { TranscriptLine } from './types';

/** How far along it is: the model coming in (the first time only), then the clip being heard. Shares are 0 to 1, null when unknown. */
export type Hearing = { stage: 'loading'; share: number | null } | { stage: 'listening'; share: number | null };

/** A reason a person can act on: no sound, no speech, or Whisper could not run here (worth another try). */
export class SpeechError extends Error {
  constructor(
    message: string,
    readonly retry = false,
  ) {
    super(message);
  }
}

const SAMPLE_RATE = 16_000;
const WORKER = '/speech/whisper-worker.js';
/** Quieter than this throughout, there is nothing to hear. */
const SILENCE = 0.002;

/** The clip's sound as Whisper hears it: one channel at 16 kHz, the channels mixed. */
export async function soundOf(file: Blob): Promise<Float32Array> {
  if (typeof AudioContext === 'undefined') throw new SpeechError('This browser cannot read a clip’s sound. Type what is said.');
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer()).catch(() => {
      throw new SpeechError('No sound could be read from the clip. Type what is said.');
    });
    const out = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < out.length; i += 1) out[i] = (out[i] ?? 0) + (channel[i] ?? 0) / buffer.numberOfChannels;
    }
    return out;
  } finally {
    void context.close();
  }
}

const silent = (sound: Float32Array) => !sound.some((v) => Math.abs(v) > SILENCE);

/**
 * What is said in the clip, as caption lines in its own seconds, none past
 * `length` (the clip's, which its sound can outlast). Each call starts a
 * worker of its own and ends it when done, so the memory the model takes is
 * given back; the model's files stay in the browser's cache.
 */
export async function hear(file: Blob, length: number, onProgress: (h: Hearing) => void, signal: AbortSignal): Promise<TranscriptLine[]> {
  const sound = await soundOf(file);
  if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
  if (sound.length === 0 || silent(sound)) throw new SpeechError('The clip has no sound to hear. Type what is said.');
  const duration = Math.min(sound.length / SAMPLE_RATE, length);

  const chunks = await new Promise<unknown>((resolve, reject) => {
    const worker = new Worker(WORKER, { type: 'module' });
    const finish = () => {
      worker.terminate();
      signal.removeEventListener('abort', stop);
    };
    const stop = () => {
      finish();
      reject(new DOMException('Stopped', 'AbortError'));
    };
    signal.addEventListener('abort', stop);
    worker.onmessage = (e: MessageEvent<{ type?: string; stage?: string; share?: number | null; chunks?: unknown; error?: string }>) => {
      const m = e.data;
      if (m.type === 'loading' || m.type === 'listening') onProgress({ stage: m.type, share: typeof m.share === 'number' ? m.share : null });
      else if (m.type === 'done') {
        finish();
        resolve(m.chunks);
      } else if (m.type === 'failed') {
        finish();
        const why = m.error ?? 'Whisper did not run';
        reject(
          new SpeechError(
            m.stage === 'loading'
              ? `The speech model could not be downloaded (${why}). Try again in a moment, or type what is said.`
              : `The clip could not be heard here (${why}). Type what is said.`,
            true,
          ),
        );
      }
    };
    worker.onerror = () => {
      finish();
      reject(new SpeechError('The speech model could not start in this browser. Type what is said.', true));
    };
    worker.postMessage({ id: 1, audio: sound }, [sound.buffer]);
  });

  const lines = linesFromChunks(chunks, duration);
  if (lines.length === 0) throw new SpeechError('No speech was heard in the clip. Type what is said instead.');
  return lines;
}
