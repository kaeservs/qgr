'use client';

import { CalendarClock, Send, TriangleAlert, X as Close } from 'lucide-react';
import Link from 'next/link';
import { cx } from '@/lib/cx';
import { cancellable, postState } from '@/lib/posts';
import type { PostState } from '@/lib/posts';
import { formatInZone } from '@/lib/schedule';
import type { Place, Post } from '@/lib/types';
import { EmptyState } from '../ui/EmptyState';
import { PostTargetRow } from './PostTargetRow';
import { usePostActions } from './usePostActions';
import type { PostAction } from './usePostActions';
import styles from './posts.module.css';

function PostCard({
  post,
  timeZone,
  busy,
  doing,
  onCancel,
  onRetry,
}: {
  post: Post;
  timeZone: string;
  busy: boolean;
  /** What is being sent for this post, while busy. */
  doing: PostAction | null;
  onCancel: () => void;
  onRetry: (place: Place) => void;
}) {
  const text = post.targets[0]?.text ?? '';
  return (
    <article id={`post-${post.id}`} className={cx('card', styles.post)} aria-label={`${post.adSetTitle}, variant ${post.variantLabel}`}>
      {post.thumbnail ? (
        // A plain img: a small data URL the post keeps.
        <img className={styles.thumb} src={post.thumbnail} alt="" />
      ) : (
        <span className={cx(styles.thumb, styles.thumbArt)} aria-hidden>
          {post.variantLabel}
        </span>
      )}
      <div className={styles.postMain}>
        <h3 className={styles.postTitle}>
          <Link href={`/content/${post.adSetId}`} className="link">
            {post.adSetTitle}
          </Link>
          , variant {post.variantLabel}
        </h3>
        <span className={styles.postWhen}>
          <CalendarClock size={14} aria-hidden />
          {formatInZone(post.scheduledFor, timeZone)}
        </span>
        <p className={styles.postText}>{text}</p>
        <ul className={styles.targets}>
          {post.targets.map((t) => (
            <PostTargetRow key={t.place} target={t} busy={busy} retrying={doing === `retry-${t.place}`} timeZone={timeZone} onRetry={() => onRetry(t.place)} />
          ))}
        </ul>
      </div>
      <div className={styles.postActions}>
        {cancellable(post) && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onCancel} disabled={busy} aria-busy={doing === 'cancel'}>
            <Close size={14} aria-hidden />
            {postState(post) === 'waiting' ? 'Cancel' : 'Dismiss'}
          </button>
        )}
      </div>
    </article>
  );
}

const GROUPS: { state: PostState; title: string }[] = [
  { state: 'look', title: 'Needs a look' },
  { state: 'waiting', title: 'Scheduled' },
  { state: 'sent', title: 'Sent' },
  { state: 'cancelled', title: 'Cancelled' },
];

/** Every post, as the publisher left it: what needs a look first, then what waits, what went out and what was called off. */
export function PostsList({ posts, timeZone }: { posts: Post[]; timeZone: string }) {
  const actions = usePostActions(timeZone);

  if (posts.length === 0) {
    return (
      <EmptyState icon={Send} title="No posts yet">
        Approve a variant in Content, then post it now or schedule it for Facebook, Instagram and LinkedIn.
      </EmptyState>
    );
  }

  return (
    <div className={styles.list}>
      {GROUPS.map(({ state, title }) => {
        const list = posts.filter((p) => postState(p) === state);
        // What waits reads soonest first; the rest, newest first.
        if (state === 'waiting') list.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
        if (list.length === 0) return null;
        return (
          <section key={state} className={styles.list} aria-label={title}>
            <h2 className={cx('display h2', styles.groupTitle)}>
              {state === 'look' && <TriangleAlert size={18} aria-hidden />} {title}
            </h2>
            {list.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                timeZone={timeZone}
                busy={actions.busy === post.id}
                doing={actions.busy === post.id ? actions.doing : null}
                onCancel={() => void actions.cancel(post)}
                onRetry={(place) => void actions.retry(post, place)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
