'use client';

import { useEffect, useRef, useState } from 'react';
import type { TranscriptLine } from '@/lib/types';
import type { ClipStatus } from './ClipField';

export type TranscriptState = { state: 'idle' } | { state: 'working' } | { state: 'done'; lines: TranscriptLine[] } | { state: 'failed'; error: string };

/**
 * What is said in the clip, asked for once it has uploaded (/api/transcribe,
 * Deepgram). A clip the sample data kept in the browser has nothing stored
 * to transcribe; a failure leaves the team to type, as before.
 */
export function useClipTranscript(clip: ClipStatus): TranscriptState {
  const [state, setState] = useState<TranscriptState>({ state: 'idle' });
  const asked = useRef<string | null>(null);
  const path = clip.state === 'ready' && !clip.sample ? clip.clip.path : null;

  useEffect(() => {
    if (!path) {
      asked.current = null;
      setState({ state: 'idle' });
      return;
    }
    if (asked.current === path) return;
    asked.current = path;
    const controller = new AbortController();
    setState({ state: 'working' });
    void fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { lines?: TranscriptLine[]; error?: string } | null;
        if (asked.current !== path) return;
        if (res.ok && body?.lines) setState({ state: 'done', lines: body.lines });
        else setState({ state: 'failed', error: body?.error ?? 'The clip could not be transcribed. Type what is said.' });
      })
      .catch(() => {
        if (!controller.signal.aborted && asked.current === path) setState({ state: 'failed', error: 'The clip could not be transcribed. Type what is said.' });
      });
    return () => {
      controller.abort();
      if (asked.current === path) asked.current = null;
    };
  }, [path]);

  return state;
}
