'use client';

import { CalendarClock, ExternalLink, RotateCcw, Send, TriangleAlert, X as Close } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cancelPostAction, retryPostAction } from '@/app/(app)/posts/actions';
import { cx } from '@/lib/cx';
import { PLACE_LABEL } from '@/lib/post-input';
import { formatInZone } from '@/lib/schedule';
import type { Place, Post, PostStatus, PostTarget } from '@/lib/types';
import { EmptyState } from '../ui/EmptyState';
import { PlaceIcon } from '../ui/PlatformIcon';
import { useToast } from '../ui/Toast';
import ui from '../ui/ui.module.css';
import styles from './posts.module.css';

const STATUS: Record<PostStatus, { label: string; tone: string }> = {
  scheduled: { label: 'Scheduled', tone: 'status-waiting' },
  posting: { label: 'Sending', tone: 'status-running' },
  posted: { label: 'Posted', tone: 'status-approved' },
  failed: { label: 'Failed', tone: 'status-failed' },
  unknown: { label: 'Check the Page', tone: 'status-failed' },
  cancelled: { label: 'Cancelled', tone: 'status-queued' },
};

const needsLook = (p: Post) => p.targets.some((t) => t.status === 'failed' || t.status === 'unknown');
const waiting = (p: Post) => p.targets.some((t) => t.status === 'scheduled' || t.status === 'posting');
const cancelled = (p: Post) => p.targets.every((t) => t.status === 'cancelled');

function Target({ target, onRetry, busy }: { target: PostTarget; onRetry: () => void; busy: boolean }) {
  const { label, tone } = STATUS[target.status];
  return (
    <li className={styles.target}>
      <span className={styles.targetPlace}>
        <PlaceIcon place={target.place} size={16} decorative />
        {PLACE_LABEL[target.place]}
      </span>
      <span className={cx(ui.status, ui.statusSmall, ui[tone])}>{label}</span>
      {target.status === 'posted' && target.standIn && <span className={styles.targetNote}>Through the stand-in: nothing was posted</span>}
      {target.url && (
        <a href={target.url} className="link small" target="_blank" rel="noreferrer noopener">
          View post
          <ExternalLink size={13} aria-hidden />
        </a>
      )}
      {(target.status === 'failed' || target.status === 'unknown') && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={onRetry} disabled={busy}>
          <RotateCcw size={14} aria-hidden />
          {target.status === 'unknown' ? 'It isn’t there: send again' : 'Try again'}
        </button>
      )}
      {target.error && <p className={styles.targetError}>{target.error}</p>}
    </li>
  );
}

function PostCard({ post, timeZone, busy, onCancel, onRetry }: { post: Post; timeZone: string; busy: boolean; onCancel: () => void; onRetry: (place: Place) => void }) {
  const open = post.targets.some((t) => t.status === 'scheduled' || t.status === 'failed' || t.status === 'unknown');
  const text = post.targets[0]?.text ?? '';
  return (
    <article className={cx('card', styles.post)} aria-label={`${post.adSetTitle}, variant ${post.variantLabel}`}>
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
            <Target key={t.place} target={t} busy={busy} onRetry={() => onRetry(t.place)} />
          ))}
        </ul>
      </div>
      <div className={styles.postActions}>
        {open && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onCancel} disabled={busy}>
            <Close size={14} aria-hidden />
            {waiting(post) ? 'Cancel' : 'Dismiss'}
          </button>
        )}
      </div>
    </article>
  );
}

/** Every post, as the publisher left it: what needs a look first, then what waits, what went out and what was called off. */
export function PostsList({ posts, timeZone }: { posts: Post[]; timeZone: string }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(postId: string, run: () => Promise<{ ok: true; sample: boolean } | { ok: false; error: string }>, done: string) {
    setBusy(postId);
    const result = await run();
    setBusy(null);
    if (!result.ok) return toast(result.error, 'info');
    toast(result.sample ? `${done} for this session` : done);
    router.refresh();
  }

  if (posts.length === 0) {
    return (
      <EmptyState icon={Send} title="No posts yet">
        Approve a variant in Content, then post it now or schedule it for Facebook, Instagram and LinkedIn.
      </EmptyState>
    );
  }

  const groups: { title: string; list: Post[] }[] = [
    { title: 'Needs a look', list: posts.filter(needsLook) },
    { title: 'Scheduled', list: posts.filter((p) => !needsLook(p) && waiting(p)).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)) },
    { title: 'Sent', list: posts.filter((p) => !needsLook(p) && !waiting(p) && !cancelled(p)) },
    { title: 'Cancelled', list: posts.filter(cancelled) },
  ];

  return (
    <div className={styles.list}>
      {groups
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <section key={g.title} className={styles.list} aria-label={g.title}>
            <h2 className={cx('display h2', styles.groupTitle)}>
              {g.title === 'Needs a look' && <TriangleAlert size={18} aria-hidden />} {g.title}
            </h2>
            {g.list.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                timeZone={timeZone}
                busy={busy === post.id}
                onCancel={() => void act(post.id, () => cancelPostAction(post.id), waiting(post) ? 'Post cancelled' : 'Post dismissed')}
                onRetry={(place) => void act(post.id, () => retryPostAction(post.id, place), `Sending to ${PLACE_LABEL[place]} again`)}
              />
            ))}
          </section>
        ))}
    </div>
  );
}
