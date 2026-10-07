import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import type { RunWithStatus } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { SOURCE_LABEL, sourceKind } from '@/lib/sources';
import { PipelineBar } from '../ui/PipelineBar';
import { PlatformIcons } from '../ui/PlatformIcon';
import { SourceIcon } from '../ui/SourceIcon';
import { StatusPill } from '../ui/StatusPill';
import styles from './home.module.css';

export function RunCard({ run }: { run: RunWithStatus }) {
  const kind = sourceKind(run.source);
  const counts = [
    run.counts.hooks !== undefined && `Hooks: ${run.counts.hooks}`,
    run.counts.angles !== undefined && `Angles: ${run.counts.angles}`,
    run.counts.variants !== undefined && `Variants: ${run.counts.variants}`,
  ].filter((c): c is string => Boolean(c));

  return (
    <article className={styles.run}>
      <div className={styles.runHead}>
        <div className={styles.runTitleBlock}>
          <h3 className={styles.runTitle}>
            <Link href={`/runs/${run.id}`} className={styles.stretch}>
              {run.title}
            </Link>
          </h3>
          <p className={styles.runMeta}>
            <span>
              <CalendarDays size={15} strokeWidth={1.9} aria-hidden />
              {formatDate(run.createdAt)}
            </span>
            <span className={styles.sep} aria-hidden />
            <span>
              <SourceIcon kind={kind} />
              {SOURCE_LABEL[kind]}
            </span>
            <span className={styles.sep} aria-hidden />
            <PlatformIcons platforms={run.platforms} size={15} />
          </p>
        </div>
        <StatusPill status={run.status} />
      </div>
      {run.summary && <p className={styles.runSummary}>{run.summary}</p>}
      <div className={styles.runFoot}>
        <ul className={styles.counts}>
          {counts.map((c) => (
            <li key={c} className="pill">
              {c}
            </li>
          ))}
        </ul>
        <PipelineBar stages={run.stages} />
      </div>
    </article>
  );
}
