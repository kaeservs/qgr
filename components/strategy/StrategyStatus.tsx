import { CircleCheck, PencilLine } from 'lucide-react';
import { cx } from '@/lib/cx';
import type { Strategy } from '@/lib/types';
import ui from '../ui/ui.module.css';

export function StrategyStatus({ status }: { status: Strategy['status'] }) {
  return status === 'approved' ? (
    <span className={cx(ui.status, ui['status-approved'])}>
      <CircleCheck size={14} strokeWidth={2.2} aria-hidden />
      Approved
    </span>
  ) : (
    <span className={cx(ui.status, ui['status-queued'])}>
      <PencilLine size={14} strokeWidth={2.2} aria-hidden />
      Draft
    </span>
  );
}
