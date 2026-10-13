'use client';

import { CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cx } from '@/lib/cx';
import { postsByDay, postState } from '@/lib/posts';
import { dayLabel } from '@/lib/schedule';
import type { Post } from '@/lib/types';
import { EmptyState } from '../ui/EmptyState';
import { PostDialog } from './PostDialog';
import { PostCard } from './PostsList';
import { usePostActions } from './usePostActions';
import styles from './posts.module.css';

/** `Today`, `Tomorrow`, or the date, for a wall date in the team's zone. */
function dayTitle(day: string, today: string): string {
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (day === today) return `Today, ${dayLabel(day)}`;
  if (day === tomorrow) return `Tomorrow, ${dayLabel(day)}`;
  return dayLabel(day);
}

/**
 * Every post still to go out, soonest first, a day at a time in the team's
 * zone. Each can be moved, sent now or cancelled until it starts going out.
 */
export function ScheduledPosts({ posts, timeZone, today }: { posts: Post[]; timeZone: string; today: string }) {
  const actions = usePostActions(timeZone);
  const [openId, setOpenId] = useState<string | null>(null);
  const waiting = posts.filter((p) => postState(p) === 'waiting');
  const days = [...postsByDay(waiting, timeZone)];
  const open = waiting.find((p) => p.id === openId) ?? null;

  if (waiting.length === 0) {
    return (
      <EmptyState icon={CalendarClock} title="Nothing scheduled">
        Approve a variant in <Link href="/content" className="link">Content</Link>, then schedule it for Facebook, Instagram and LinkedIn. It waits here until it goes out.
      </EmptyState>
    );
  }

  return (
    <div className={styles.list}>
      <p className="muted">
        {waiting.length} post{waiting.length === 1 ? '' : 's'} waiting to go out, over {days.length} day{days.length === 1 ? '' : 's'}.
      </p>
      {days.map(([day, list]) => (
        <section key={day} className={styles.list} aria-label={dayLabel(day)}>
          <h2 className={cx('display h2', styles.groupTitle)}>{dayTitle(day, today)}</h2>
          {list.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              timeZone={timeZone}
              busy={actions.busy === post.id}
              doing={actions.busy === post.id ? actions.doing : null}
              onCancel={() => void actions.cancel(post)}
              onRetry={(place) => void actions.retry(post, place)}
              onMove={() => setOpenId(post.id)}
            />
          ))}
        </section>
      ))}
      {open && <PostDialog key={open.id} post={open} timeZone={timeZone} actions={actions} onClose={() => setOpenId(null)} />}
    </div>
  );
}
