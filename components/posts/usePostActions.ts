'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cancelPostAction, reschedulePostAction, retryPostAction } from '@/app/(app)/posts/actions';
import { PLACE_LABEL } from '@/lib/post-input';
import { formatInZone } from '@/lib/schedule';
import { postState } from '@/lib/posts';
import type { Place, Post } from '@/lib/types';
import { useToast } from '../ui/Toast';

type Result = { ok: true; sample: boolean } | { ok: false; error: string };

/** Cancel, try again and move, with the toast each one says and a fresh page after. One post at a time. */
export function usePostActions(timeZone: string) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(postId: string, run: () => Promise<Result>, done: string): Promise<boolean> {
    setBusy(postId);
    const result = await run();
    setBusy(null);
    if (!result.ok) {
      toast(result.error, 'info');
      return false;
    }
    toast(result.sample ? `${done} for this session` : done);
    router.refresh();
    return true;
  }

  return {
    busy,
    cancel: (post: Post) => act(post.id, () => cancelPostAction(post.id), postState(post) === 'waiting' ? 'Post cancelled' : 'Post dismissed'),
    retry: (post: Post, place: Place) => act(post.id, () => retryPostAction(post.id, place), `Sending to ${PLACE_LABEL[place]} again`),
    /** `at` is a wall time in the team's zone, or null for now. */
    move: (post: Post, at: string | null, utc: string | null) =>
      act(post.id, () => reschedulePostAction(post.id, at), at && utc ? `Moved to ${formatInZone(utc, timeZone)}` : 'Sent now'),
  };
}
