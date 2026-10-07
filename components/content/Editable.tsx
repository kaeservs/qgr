'use client';

import { cx } from '@/lib/cx';
import { lengthState } from '@/lib/platforms';
import { AutoTextarea } from './AutoTextarea';
import styles from './previews.module.css';

/**
 * Text in an ad preview. Read-only it is plain text; on the selected variant
 * it becomes a field in the same place and the same type, with a counter
 * against the platform's limit that shows while you type.
 */
export function Editable({
  editable,
  value,
  onChange,
  label,
  className,
  limit,
  multiline = false,
}: {
  editable: boolean;
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string | undefined;
  limit?: number | undefined;
  multiline?: boolean;
}) {
  if (!editable) return value ? <span className={cx(styles.static, className)}>{value}</span> : null;
  const state = limit ? lengthState(value.length, limit) : 'ok';
  return (
    <span className={cx(styles.edit, state === 'over' && styles.editOver)}>
      <AutoTextarea className={cx(styles.field, className)} value={value} onChange={onChange} aria-label={label} singleLine={!multiline} placeholder={label} spellCheck />
      {limit !== undefined && (
        <span className={cx(styles.counter, styles[`counter-${state}`])}>
          {value.length}/{limit}
          <span className="sr-only">{state === 'over' ? ', over the length the platform shows in full' : ' characters'}</span>
        </span>
      )}
    </span>
  );
}
