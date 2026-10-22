'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cancelPostAction, rememberPostAction, removePostAction, reschedulePostAction, retryPostAction } from '@/app/(app)/posts/actions';
import { PLACE_LABEL } from '@/lib/post-input';
import { formatInZone } from '@/lib/schedule';
import { deletePostQuestion, postState } from '@/lib/posts';
import type { Place, Post } from '@/lib/types';
import { useToast } from '../ui/Toast';

type Result = { ok: true; sample: boolean } | { ok: false; error: string };

/** Which action is being sent: cancel, delete, move, now, try one place again, or keep one place in brand memory. */
export type PostAction = 'cancel' | 'remove' | 'move' | 'now' | `retry-${Place}` | `remember-${Place}`;

/** Cancel, try again and move, with the toast each one says and a fresh page after. One post at a time. */
export function usePostActions(timeZone: string) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [doing, setDoing] = useState<PostAction | null>(null);

  async function act(postId: string, action: PostAction, run: () => Promise<Result>, done: string): Promise<boolean> {
    setBusy(postId);
    setDoing(action);
    const result = await run();
    setBusy(null);
    setDoing(null);
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
    /** The action being sent for the busy post. */
    doing,
    cancel: (post: Post) => act(post.id, 'cancel', () => cancelPostAction(post.id), postState(post) === 'waiting' ? 'Post cancelled' : 'Post dismissed'),
    /** Asks first, saying what is still to go out and what already went; then deletes. False when not confirmed or refused. */
    remove: async (post: Post) => {
      if (!window.confirm(deletePostQuestion(post, timeZone))) return false;
      return act(post.id, 'remove', () => removePostAction(post.id), 'Post deleted');
    },
    retry: (post: Post, place: Place) => act(post.id, `retry-${place}`, () => retryPostAction(post.id, place), `Sending to ${PLACE_LABEL[place]} again`),
    remember: (post: Post, place: Place) => act(post.id, `remember-${place}`, () => rememberPostAction(post.id, place), 'Kept in brand memory'),
    /** `at` is a wall time in the team's zone, or null for now. */
    move: (post: Post, at: string | null, utc: string | null) =>
      act(post.id, at ? 'move' : 'now', () => reschedulePostAction(post.id, at), at && utc ? `Moved to ${formatInZone(utc, timeZone)}` : 'Sent now'),
  };
}
