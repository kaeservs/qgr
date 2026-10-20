'use client';

import { ArrowRight, X as Close } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import video from '../video/video.module.css';
import styles from './runs.module.css';

/** What a run is asked once Start run is pressed, before anything is saved. */
export interface RunAnswers {
  /** The run waits after each agent for the team to pick what the next one works from. */
  pickFirst: boolean;
}

/**
 * Whether a run goes straight through or waits for the team's picks: the
 * report's ads the strategy answers, then the strategy's angles the ads are
 * written from. A run that skips the tracker only has angles to pick.
 */
export function PickFirstChoice({ skipsTracker, value, onChange, disabled = false }: { skipsTracker: boolean; value: boolean; onChange: (pickFirst: boolean) => void; disabled?: boolean }) {
  const name = useId();
  return (
    <fieldset className={styles.question} disabled={disabled}>
      <legend className="label">Between the agents</legend>
      <label className={cx(styles.answer, !value && styles.answerOn)}>
        <input type="radio" name={name} checked={!value} onChange={() => onChange(false)} />
        <span>
          <strong>Straight through</strong>
          <span className="muted small">Each agent starts as soon as the one before it finishes, and works from everything it made.</span>
        </span>
      </label>
      <label className={cx(styles.answer, value && styles.answerOn)}>
        <input type="radio" name={name} checked={value} onChange={() => onChange(true)} />
        <span>
          <strong>{skipsTracker ? 'Let me pick the angles' : 'Let me pick the ads and angles'}</strong>
          <span className="muted small">
            {skipsTracker
              ? 'The run waits after the Ad Strategist for you to tick the angles the ads are written from.'
              : 'The run waits after the Competitor Tracker for you to tick the ads the strategy answers, and after the Ad Strategist for the angles the ads are written from.'}{' '}
            Use all goes on with everything.
          </span>
        </span>
      </label>
    </fieldset>
  );
}

/** The questions a run is asked after Start run, in a dialog: Back keeps the form as it was. */
export function RunQuestions({ skipsTracker, busy, busyLabel = 'Starting…', onStart, onClose }: { skipsTracker: boolean; busy: boolean; busyLabel?: string; onStart: (answers: RunAnswers) => void; onClose: () => void }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pickFirst, setPickFirst] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={cx(video.dialog, styles.questions)}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className={video.dialogHead}>
        <div>
          <h2 id={`${id}-title`}>Before the agents start</h2>
          <p className="muted small">How should this run go?</p>
        </div>
        <button type="button" className="icon-btn icon-btn-plain" aria-label="Close" onClick={onClose} disabled={busy}>
          <Close size={18} aria-hidden />
        </button>
      </header>
      <div className={video.dialogBody}>
        <PickFirstChoice skipsTracker={skipsTracker} value={pickFirst} onChange={setPickFirst} disabled={busy} />
        <p className="muted small">Three ads are written either way: one angle picked gets three takes on it, two get two and one.</p>
      </div>
      <footer className={video.dialogFoot}>
        <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onStart({ pickFirst })} disabled={busy} aria-busy={busy}>
          {busy ? busyLabel : 'Start run'}
          {!busy && <ArrowRight size={16} aria-hidden />}
        </button>
      </footer>
    </dialog>
  );
}
