'use client';

import { BarChart3, BookmarkCheck, BookmarkPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { rememberPostAction } from '@/app/(app)/posts/actions';
import { cx } from '@/lib/cx';
import { PLACE_LABEL } from '@/lib/post-input';
import { formatCount, formatRate } from '@/lib/results';
import type { Place } from '@/lib/types';
import { EmptyState } from '../ui/EmptyState';
import { PlaceIcon } from '../ui/PlatformIcon';
import { useToast } from '../ui/Toast';
import styles from './brand.module.css';

/** A place a post went out to for real, with its numbers. */
export interface BestPost {
  postId: string;
  place: Place;
  text: string;
  title: string;
  rate: number;
  reached: number;
  remembered: boolean;
}

/**
 * The team's posts with the best engagement, from the platforms' own numbers.
 * The strategist and the Content Agent read these too; one kept in brand
 * memory is also written like.
 */
export function BestPosts({ best }: { best: BestPost[] }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function keep(post: BestPost) {
    setBusy(`${post.postId}:${post.place}`);
    const saved = await rememberPostAction(post.postId, post.place);
    setBusy(null);
    if (!saved.ok) return toast(saved.error, 'info');
    toast(saved.sample ? 'Kept for this session' : 'Kept in brand memory');
    router.refresh();
  }

  return (
    <section className={cx('card card-pad', styles.section)} aria-labelledby="best-posts">
      <div>
        <h2 id="best-posts" className="card-title">
          Best by results
        </h2>
        <p className="muted small">Engagement per person reached, from each platform’s numbers. The strategist and the Content Agent read these too.</p>
      </div>
      {best.length === 0 ? (
        <EmptyState icon={BarChart3} title="No results yet">
          Once posts go out for real, the ones that engage best show here.
        </EmptyState>
      ) : (
        <ol className={styles.examples}>
          {best.map((p) => {
            const key = `${p.postId}:${p.place}`;
            return (
              <li key={key} className={styles.example}>
                <div className={styles.exampleHead}>
                  <span className={styles.examplePlace}>
                    <PlaceIcon place={p.place} size={16} decorative />
                    {PLACE_LABEL[p.place]}
                  </span>
                  <strong className={styles.rate}>{formatRate(p.rate)}</strong>
                  <span className="muted small">{formatCount(p.reached)} reached</span>
                </div>
                <p className={styles.exampleText}>{p.text}</p>
                <div className={styles.exampleFoot}>
                  <Link href={`/posts#post-${p.postId}`} className="link small">
                    {p.title}
                  </Link>
                  {p.remembered ? (
                    <span className={cx('pill pill-sm', styles.marked)}>
                      <BookmarkCheck size={13} aria-hidden />
                      In brand memory
                    </span>
                  ) : (
                    <button type="button" className="btn btn-quiet btn-sm" disabled={busy !== null} aria-busy={busy === key} onClick={() => void keep(p)}>
                      <BookmarkPlus size={14} aria-hidden />
                      Keep in memory
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
