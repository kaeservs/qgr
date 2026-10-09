import { CircleCheck, Hand, Hourglass, LoaderCircle, SkipForward, TriangleAlert } from 'lucide-react';
import { cx } from '@/lib/cx';
import type { StageStatus } from '@/lib/types';
import ui from '../ui/ui.module.css';

const VIEW: Record<StageStatus, { label: string; icon: typeof CircleCheck; tone: string }> = {
  done: { label: 'Done', icon: CircleCheck, tone: 'status-approved' },
  running: { label: 'Working', icon: LoaderCircle, tone: 'status-running' },
  queued: { label: 'Waiting', icon: Hourglass, tone: 'status-queued' },
  waiting: { label: 'Waits for you', icon: Hand, tone: 'status-waiting' },
  skipped: { label: 'Skipped', icon: SkipForward, tone: 'status-queued' },
  failed: { label: 'Failed', icon: TriangleAlert, tone: 'status-failed' },
};

export function StageBadge({ status }: { status: StageStatus }) {
  const { label, icon: Icon, tone } = VIEW[status];
  return (
    <span className={cx(ui.status, ui.statusSmall, ui[tone])}>
      <Icon size={13} strokeWidth={2.2} className={status === 'running' ? 'spin' : undefined} aria-hidden />
      {label}
    </span>
  );
}
