'use client';

import { useEffect, useMemo, useState } from 'react';
import { editAiVideosAction } from '@/app/(app)/videos/actions';
import { aiStates } from '@/lib/video/ai-pieces';
import type { AiStates } from '@/lib/video/ai-pieces';
import { aiVideosOf } from '@/lib/video/timeline';
import type { VideoEdit } from '@/lib/video/edit';
import type { AiVideo } from '@/lib/types';

const AI_POLL_MS = 15_000;

/**
 * How an edit's AI videos stand: asked at once, and again every 15 s while
 * one is being made, so a preview shows it as on its way and then plays it
 * once Higgsfield has made it. Nothing is asked for an edit without one.
 */
export function useAiStates(edit: VideoEdit): { states: AiStates; known: Map<string, AiVideo> | null; follow: (video: AiVideo) => void } {
  const [known, setKnown] = useState<Map<string, AiVideo> | null>(null);
  const aiIds = useMemo(() => aiVideosOf(edit), [edit]);
  const aiKey = aiIds.join(',');
  const states = useMemo(() => aiStates(edit, aiIds.length === 0 ? new Map() : known), [edit, aiIds, known]);
  const waitingCount = states.waiting.size;
  useEffect(() => {
    if (!aiKey) return;
    let alive = true;
    const ask = () =>
      void editAiVideosAction(aiKey.split(',')).then((r) => {
        if (alive && r.ok) setKnown(new Map(r.value.map((v) => [v.id, v])));
      });
    ask();
    if (known !== null && waitingCount === 0) return () => void (alive = false);
    const timer = setInterval(ask, AI_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // `known` only says whether the server has answered at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiKey, waitingCount, known === null]);
  // One just asked for is followed at once, before the server's next answer says how it stands.
  const follow = (video: AiVideo) => setKnown((was) => new Map([...(was ?? []), [video.id, video]]));
  return { states, known, follow };
}
