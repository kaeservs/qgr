import { CircleCheck, Eye, Hourglass, LoaderCircle, TriangleAlert } from 'lucide-react';
import { RUN_STATUS_LABEL } from '@/lib/pipeline';
import { cx } from '@/lib/cx';
import type { RunStatus } from '@/lib/types';
import styles from './ui.module.css';

const ICON = {
  queued: Hourglass,
  running: LoaderCircle,
  review: Eye,
  approved: CircleCheck,
  failed: TriangleAlert,
} as const;

export function StatusPill({ status, label, small = false }: { status: RunStatus; label?: string; small?: boolean }) {
  const Icon = ICON[status];
  return (
    <span className={cx(styles.status, styles[`status-${status}`], small && styles.statusSmall)}>
      <Icon size={small ? 13 : 14} strokeWidth={2.2} className={status === 'running' ? 'spin' : undefined} aria-hidden />
      {label ?? RUN_STATUS_LABEL[status]}
    </span>
  );
}
