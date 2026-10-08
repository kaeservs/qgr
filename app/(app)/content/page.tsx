import { CalendarDays, Play, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Creative } from '@/components/content/Creative';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlatformIcons } from '@/components/ui/PlatformIcon';
import { StatusPill } from '@/components/ui/StatusPill';
import { getAdSets, getRuns } from '@/lib/data';
import { formatShortDate } from '@/lib/format';
import type { AdSet, RunStatus } from '@/lib/types';
import styles from '@/components/content/content.module.css';

export const metadata: Metadata = { title: 'Content' };

const STATUS: Record<AdSet['status'], { status: RunStatus; label?: string }> = {
  generating: { status: 'running', label: 'Writing' },
  review: { status: 'review' },
  approved: { status: 'approved' },
};

export default async function ContentPage() {
  const [sets, runs] = await Promise.all([getAdSets(), getRuns()]);
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display h1">Content</h1>
          <p className="lead">Three variants a run, ready to edit and approve.</p>
        </div>
      </header>
      {sets.length === 0 && (
        <EmptyState icon={Sparkles} title="No ads yet">
          At the end of every run the Content Agent writes three variants, ready to edit and approve here.
        </EmptyState>
      )}
      <div className={styles.sets}>
        {sets.map((set) => {
          const run = runs.find((r) => r.id === set.runId);
          const { status, label } = STATUS[set.status];
          return (
            <article key={set.id} className={styles.set}>
              <div className={styles.setThumbs} aria-hidden>
                {set.variants.length > 0
                  ? set.variants.map((v) => (
                      <div key={v.id} className={styles.setThumb}>
                        <Creative text={v.creative.text} style={v.creative.style} image={v.imageUrl} ratio="square" />
                        {set.clip && (
                          <span className={styles.videoBadge}>
                            <Play size={11} aria-hidden />
                            Video
                          </span>
                        )}
                      </div>
                    ))
                  : [0, 1, 2].map((i) => (
                      <span key={i} className={styles.setPending}>
                        <Sparkles size={20} />
                      </span>
                    ))}
              </div>
              <div className={styles.setBody}>
                <div className={styles.setTop}>
                  <h2 className={styles.setTitle}>
                    <Link href={`/content/${set.id}`} className={styles.stretch}>
                      {set.title}
                    </Link>
                  </h2>
                  <StatusPill status={status} small {...(label ? { label } : {})} />
                </div>
                <p className={styles.setMeta}>
                  {run && <span>From {run.title}</span>}
                  {run && <PlatformIcons platforms={run.platforms} size={14} />}
                  <span>
                    <CalendarDays size={14} aria-hidden />
                    {formatShortDate(set.createdAt)}
                  </span>
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
