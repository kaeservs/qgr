import { STAGE_INFO, STAGE_ORDER } from '@/lib/pipeline';
import { cx } from '@/lib/cx';
import type { Stage, StageKey } from '@/lib/types';
import styles from './ui.module.css';

const WORD: Record<Stage['status'], string> = {
  done: 'done',
  running: 'running',
  queued: 'queued',
  waiting: 'waiting for you',
  skipped: 'skipped',
  failed: 'failed',
};

/** Three segments, one per agent. The label carries the same facts for screen readers. */
export function PipelineBar({ stages }: { stages: Record<StageKey, Stage> }) {
  const label = STAGE_ORDER.map((k) => `${STAGE_INFO[k].name} ${WORD[stages[k].status]}`).join(', ');
  return (
    <span className={styles.pipeline} role="img" aria-label={label} title={label}>
      {STAGE_ORDER.map((k) => (
        <span key={k} className={cx(styles.segment, styles[`seg-${stages[k].status}`])} />
      ))}
    </span>
  );
}
