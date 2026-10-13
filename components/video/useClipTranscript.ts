'use client';

import { useEffect, useRef, useState } from 'react';
import type { TranscriptLine } from '@/lib/types';
import type { ClipStatus } from './ClipField';

export type TranscriptState =
  | { state: 'idle' }
  /** The speech model coming in, the first time only: the share so far, or null while unknown. */
  | { state: 'loading'; share: number | null }
  /** The clip being heard: the share so far, or null while unknown. */
  | { state: 'working'; share: number | null }
  | { state: 'done'; lines: TranscriptLine[] }
  /** Why not; retry when another try could help (the model's download, not a silent clip). */
  | { state: 'failed'; error: string; retry: boolean };

/**
 * What is said in the clip, heard on this computer once the clip is ready
 * (lib/speech.ts, Whisper in the browser): free, and the clip's sound goes
 * nowhere. The sample data's clips are heard too, since nothing is stored.
 * A failure leaves the team to type, as before.
 */
export function useClipTranscript(clip: ClipStatus): [TranscriptState, () => void] {
  const [state, setState] = useState<TranscriptState>({ state: 'idle' });
  // Raised to hear the same clip again after a failure.
  const [attempt, setAttempt] = useState(0);
  const asked = useRef<string | null>(null);
  const key = clip.state === 'ready' ? clip.clip.path : null;
  const file = clip.state === 'ready' ? clip.file : null;
  const length = clip.state === 'ready' ? clip.clip.duration : 0;

  useEffect(() => {
    if (!key || !file) {
      asked.current = null;
      setState({ state: 'idle' });
      return;
    }
    const ask = `${key}#${attempt}`;
    if (asked.current === ask) return;
    asked.current = ask;
    const controller = new AbortController();
    setState({ state: 'working', share: null });
    // Loaded when a clip is heard: most visits to the page never need it.
    import('@/lib/speech')
      .then(({ hear, SpeechError }) =>
        hear(
          file,
          length,
          (h) => {
            if (asked.current === ask) setState(h.stage === 'loading' ? { state: 'loading', share: h.share } : { state: 'working', share: h.share });
          },
          controller.signal,
        )
          .then((lines) => {
            if (asked.current === ask) setState({ state: 'done', lines });
          })
          .catch((err: unknown) => {
            if (controller.signal.aborted || asked.current !== ask) return;
            setState(err instanceof SpeechError ? { state: 'failed', error: err.message, retry: err.retry } : { state: 'failed', error: 'The clip could not be heard here. Type what is said.', retry: true });
          }),
      )
      .catch(() => {
        if (!controller.signal.aborted && asked.current === ask) setState({ state: 'failed', error: 'The clip could not be heard here. Type what is said.', retry: true });
      });
    return () => {
      controller.abort();
      if (asked.current === ask) asked.current = null;
    };
  }, [key, file, length, attempt]);

  return [state, () => setAttempt((n) => n + 1)];
}
