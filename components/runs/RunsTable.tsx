'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cx } from '@/lib/cx';
import type { RunWithStatus } from '@/lib/data';
import { formatShortDate } from '@/lib/format';
import { RUN_STATUS_LABEL } from '@/lib/pipeline';
import { SOURCE_LABEL, sourceDetail, sourceKind } from '@/lib/sources';
import type { RunStatus } from '@/lib/types';
import { PipelineBar } from '../ui/PipelineBar';
import { PlatformIcons } from '../ui/PlatformIcon';
import { SourceIcon } from '../ui/SourceIcon';
import { StatusPill } from '../ui/StatusPill';
import styles from './runs.module.css';

const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'competitor', label: 'Competitor' },
  { key: 'custom', label: 'Custom' },
] as const;

export function RunsTable({ runs }: { runs: RunWithStatus[] }) {
  const [type, setType] = useState<(typeof TYPES)[number]['key']>('all');
  const [status, setStatus] = useState<RunStatus | 'all'>('all');
  const shown = runs.filter((r) => (type === 'all' || r.source.kind === type) && (status === 'all' || r.status === status));

  return (
    <div className={cx('card', styles.table)}>
      <div className={styles.filters}>
        <div className={styles.segmented} role="radiogroup" aria-label="Run type">
          {TYPES.map((t) => (
            <button key={t.key} type="button" role="radio" aria-checked={type === t.key} className={cx(styles.segment, type === t.key && styles.segmentOn)} onClick={() => setType(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <select className={cx('select', styles.statusSelect)} value={status} onChange={(e) => setStatus(e.target.value as RunStatus | 'all')} aria-label="Status">
          <option value="all">Any status</option>
          {(Object.keys(RUN_STATUS_LABEL) as RunStatus[]).map((s) => (
            <option key={s} value={s}>
              {RUN_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.headRow} aria-hidden>
        <span>Run</span>
        <span>Platforms</span>
        <span>Agents</span>
        <span>Status</span>
        <span>Started</span>
      </div>

      {shown.length === 0 ? (
        <p className="empty">No runs match these filters.</p>
      ) : (
        <ul className={styles.rows}>
          {shown.map((run) => {
            const kind = sourceKind(run.source);
            return (
              <li key={run.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowIcon}>
                    <SourceIcon kind={kind} size={17} />
                  </span>
                  <span className={styles.rowText}>
                    <Link href={`/runs/${run.id}`} className={styles.rowLink}>
                      {run.title}
                    </Link>
                    <span className="muted small">
                      {SOURCE_LABEL[kind]} · {sourceDetail(run.source)}
                    </span>
                  </span>
                </div>
                <PlatformIcons platforms={run.platforms} />
                <PipelineBar stages={run.stages} />
                <StatusPill status={run.status} small />
                <span className={styles.rowDate}>{formatShortDate(run.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
