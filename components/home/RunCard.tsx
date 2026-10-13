import { ArrowUpRight, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { cx } from '@/lib/cx';
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
  // Each count is an agent's result, and opens it: the report, the strategy, the ads.
  const counts = [
    run.counts.hooks !== undefined && { label: `Hooks: ${run.counts.hooks}`, href: run.output.competitorId && `/competitors/${run.output.competitorId}`, opens: 'the competitor report' },
    run.counts.angles !== undefined && { label: `Angles: ${run.counts.angles}`, href: run.output.strategyId && `/strategy/${run.output.strategyId}`, opens: 'the strategy' },
    run.counts.variants !== undefined && { label: `Variants: ${run.counts.variants}`, href: run.output.adSetId && `/content/${run.output.adSetId}`, opens: 'the ads' },
  ].filter((c) => c !== false);

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
            <li key={c.label}>
              {c.href ? (
                <Link href={c.href} className={cx('pill', styles.countLink)} title={`Open ${c.opens}`}>
                  {c.label}
                  <ArrowUpRight size={13} aria-hidden />
                </Link>
              ) : (
                <span className="pill">{c.label}</span>
              )}
            </li>
          ))}
        </ul>
        <PipelineBar stages={run.stages} />
      </div>
    </article>
  );
}
