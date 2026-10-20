'use client';

import { TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setVideoSettingsAction } from '@/app/(app)/settings/actions';
import { creditsLeft, formatCredits } from '@/lib/ai-video';
import { cx } from '@/lib/cx';
import type { VideoBudget } from '@/lib/types';
import { Toggle } from '../ui/Toggle';
import { useToast } from '../ui/Toast';
import styles from './settings.module.css';

/**
 * The team's Higgsfield spending: whether AI video makes real videos, and the
 * one monthly limit that videos and pictures (when Higgsfield makes them) keep
 * to together. Off, Generate goes through the stand-in: nothing is made and
 * nothing is spent. Turning it on says first what it costs and asks once more.
 * The limit counts only what the dashboard asks for; whatever the team makes
 * on Higgsfield's own site spends the same plan without counting here.
 */
export function VideoSettingsForm({ budget }: { budget: VideoBudget }) {
  const toast = useToast();
  const router = useRouter();
  const [cap, setCap] = useState(String(budget.cap));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<'switch' | 'cap' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const capNumber = Number(cap);
  const capValid = cap.trim() !== '' && Number.isInteger(capNumber) && capNumber >= 0 && capNumber <= 100_000;

  async function save(live: boolean, limit: number, what: 'switch' | 'cap') {
    setBusy(what);
    setError(null);
    const saved = await setVideoSettingsAction(live, limit);
    setBusy(null);
    setAsking(false);
    if (!saved.ok) return setError(saved.error);
    toast(
      saved.sample
        ? 'Saved for this session'
        : what === 'cap'
          ? `This month’s limit is ${formatCredits(limit)}`
          : live
            ? 'AI video makes real videos from now on'
            : 'AI video goes through the stand-in again',
    );
    router.refresh();
  }

  return (
    <form
      id="ai-video"
      className={cx('card card-pad', styles.form)}
      aria-labelledby="ai-video-title"
      onSubmit={(e) => {
        e.preventDefault();
        if (capValid) void save(budget.live, capNumber, 'cap');
      }}
    >
      <div>
        <h2 id="ai-video-title" className="card-title">
          Higgsfield
        </h2>
        <p className="muted small">AI video, and pictures when Higgsfield makes them (Agents, above), on the team’s own Higgsfield plan.</p>
      </div>

      <div className={styles.forReal}>
        <div className={styles.switchRow}>
          <span>
            <strong>Make real videos</strong>
            <span className="muted small">
              {' '}
              {budget.live ? 'each Generate spends credits from the Higgsfield plan' : 'off: Generate goes through the stand-in, nothing is made or spent'}
            </span>
          </span>
          <Toggle
            checked={budget.live || asking}
            busy={busy === 'switch'}
            disabled={busy !== null}
            label="Make real videos with Higgsfield"
            onChange={(next) => (next ? setAsking(true) : void save(false, budget.cap, 'switch'))}
          />
        </div>
        {asking && !budget.live && (
          <div className={styles.forRealAsk} role="alert">
            <TriangleAlert size={16} aria-hidden />
            <div>
              <p>
                From now on, each Generate makes a video with Higgsfield and spends the credits its price says, from the plan the team uses on Higgsfield’s own site too. It needs the “Higgsfield” credential (Higgsfield’s MCP, signed in to that plan)
                attached to the Higgsfield steps in QGR · AI video. This month’s limit below holds what the dashboard may spend: {formatCredits(budget.cap)}.
              </p>
              <div className={styles.forRealButtons}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void save(true, budget.cap, 'switch')} disabled={busy !== null} aria-busy={busy === 'switch'}>
                  Make real videos
                </button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAsking(false)} disabled={busy !== null}>
                  Not yet
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <label className="field">
        <span className="label">This month’s limit, in credits, for videos and pictures</span>
        <input className="input" type="number" inputMode="numeric" min={0} max={100_000} step={1} value={cap} onChange={(e) => setCap(e.target.value)} />
        <span className="muted small">
          {formatCredits(budget.spent)} used this month in the team’s time zone{budget.pictures > 0 ? `, ${formatCredits(budget.pictures)} of it on pictures` : ''}, {formatCredits(creditsLeft(budget))} left. A video or picture that would go
          past the limit is not made; one that fails gives its credits back here. The month starts again on the 1st.
        </span>
      </label>

      <div className={styles.actions}>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy !== null || !capValid || capNumber === budget.cap} aria-busy={busy === 'cap'}>
          {busy === 'cap' ? 'Saving…' : 'Save the limit'}
        </button>
      </div>
    </form>
  );
}
