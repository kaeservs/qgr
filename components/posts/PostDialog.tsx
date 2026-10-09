'use client';

import { ArrowRight, CalendarClock, Send, X as Close } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cancellable, movable, postState } from '@/lib/posts';
import { formatInZone, localTime, wallTime, zonedToUtc, zoneLabel } from '@/lib/schedule';
import type { Post } from '@/lib/types';
import video from '../video/video.module.css';
import { PostTargetRow } from './PostTargetRow';
import type { usePostActions } from './usePostActions';
import styles from './posts.module.css';

const AHEAD_DAYS = 90;

/**
 * One post from the calendar: what goes out where, and how each place went.
 * A post nothing of which has gone out yet can be moved to another time in
 * the team's zone, or sent now.
 */
export function PostDialog({ post, timeZone, actions, onClose }: { post: Post; timeZone: string; actions: ReturnType<typeof usePostActions>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const was = wallTime(post.scheduledFor, timeZone);
  const [date, setDate] = useState(was.date);
  const [time, setTime] = useState(was.time);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = actions.busy === post.id;
  const canMove = movable(post);
  const local = localTime(date, time);
  const target = local ? zonedToUtc(local, timeZone) : null;
  const changed = local !== null && (date !== was.date || time !== was.time);
  const today = wallTime(new Date().toISOString(), timeZone).date;
  const lastDay = wallTime(new Date(Date.now() + AHEAD_DAYS * 86_400_000).toISOString(), timeZone).date;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  async function move(at: string | null) {
    if (at && target && Date.parse(target) < Date.now() - 60_000) return setProblem('Pick a time that has not passed.');
    setProblem(null);
    if (await actions.move(post, at, target)) onClose();
  }

  return (
    <dialog
      ref={dialog}
      className={`${video.dialog} ${styles.dialog}`}
      aria-labelledby="post-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className={video.dialogHead}>
        <div>
          <h2 id="post-dialog-title">
            {post.adSetTitle}, variant {post.variantLabel}
          </h2>
          <p className={`muted small ${styles.dialogWhen}`}>
            <CalendarClock size={14} aria-hidden />
            {formatInZone(post.scheduledFor, timeZone)}, {zoneLabel(timeZone)} time
          </p>
        </div>
        <button type="button" className="icon-btn icon-btn-plain" aria-label="Close" onClick={onClose}>
          <Close size={18} aria-hidden />
        </button>
      </header>

      <div className={video.dialogBody}>
        <div className={styles.detail}>
          {post.thumbnail ? (
            // A plain img: a small data URL the post keeps.
            <img className={styles.thumb} src={post.thumbnail} alt="" />
          ) : (
            <span className={`${styles.thumb} ${styles.thumbArt}`} aria-hidden>
              {post.variantLabel}
            </span>
          )}
          <p className={styles.detailText}>{post.targets[0]?.text}</p>
        </div>
        <ul className={styles.targets}>
          {post.targets.map((t) => (
            <PostTargetRow key={t.place} target={t} busy={busy} timeZone={timeZone} onRetry={() => void actions.retry(post, t.place)} />
          ))}
        </ul>

        {canMove && (
          <fieldset className={styles.section} disabled={busy}>
            <legend className={styles.sectionTitle}>Move it</legend>
            <span className={styles.whenFields}>
              <input type="date" aria-label="Date" value={date} min={today} max={lastDay} onChange={(e) => setDate(e.target.value)} />
              <input type="time" aria-label="Time" value={time} step={300} onChange={(e) => setTime(e.target.value)} />
              <span className={styles.zone}>{zoneLabel(timeZone)} time</span>
            </span>
          </fieldset>
        )}
        {problem && (
          <p className="error-text" role="alert">
            {problem}
          </p>
        )}
      </div>

      <footer className={video.dialogFoot}>
        <Link href={`/content/${post.adSetId}`} className={`link small ${styles.footLink}`}>
          Open the ads
          <ArrowRight size={14} aria-hidden />
        </Link>
        {cancellable(post) && (
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void actions.cancel(post).then((ok) => ok && onClose())}>
            {postState(post) === 'waiting' ? 'Cancel post' : 'Dismiss'}
          </button>
        )}
        {canMove && (
          <>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void move(null)}>
              <Send size={16} aria-hidden />
              Send now
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !changed || !local} onClick={() => void move(local)}>
              <CalendarClock size={16} aria-hidden />
              {changed && target ? `Move to ${formatInZone(target, timeZone)}` : 'Move'}
            </button>
          </>
        )}
      </footer>
    </dialog>
  );
}
