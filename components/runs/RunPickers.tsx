'use client';

import { ArrowRight, CornerDownRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { continueWithAdsAction, continueWithAnglesAction } from '@/app/(app)/runs/actions';
import type { Saved } from '@/lib/data';
import { cx } from '@/lib/cx';
import { angleSpreadSaid } from '@/lib/pipeline';
import { MAX_CHOSEN_ADS } from '@/lib/run-input';
import type { AdExample, StageKey, StrategyAngle } from '@/lib/types';
import { AdThumb } from '../competitors/AdThumb';
import { useToast } from '../ui/Toast';
import competitors from '../competitors/competitors.module.css';
import styles from './runs.module.css';

type Started = Saved<{ stage: StageKey }>;

/** Starts the waiting agent with what was picked, then shows the run as it now is. */
function useStart(name: string) {
  const router = useRouter();
  const toast = useToast();
  return async (start: () => Promise<Started>): Promise<void> => {
    const result = await start().catch((): Started => ({ ok: false, status: 500, error: `The ${name} could not be started.` }));
    if (!result.ok) return toast(result.error, 'info');
    toast(result.sample ? `${name} started, for this session: sample data doesn’t run the agents` : `${name} started`);
    router.refresh();
  };
}

/** Why the agent waits: the run asked to pick first, or the agent's switch is off. */
function Why({ held, children }: { held: boolean; children: string }) {
  return <p className="muted small">{held ? `Its switch is off under Settings, Agents. ${children}` : `You asked to pick before it starts. ${children}`}</p>;
}

/**
 * The run's report, its ads ticked for the Ad Strategist to build on, in the
 * order ticked; the rest of the report stays as context. Use all goes on with
 * every ad, as a run that does not wait does.
 */
export function PickAds({ runId, ads, held }: { runId: string; ads: AdExample[]; held: boolean }) {
  const id = useId();
  const start = useStart('Ad Strategist');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<'picked' | 'all' | null>(null);
  const full = picked.length >= MAX_CHOSEN_ADS;
  const toggle = (adId: string, on: boolean) => setPicked((list) => (on ? (list.includes(adId) || list.length >= MAX_CHOSEN_ADS ? list : [...list, adId]) : list.filter((x) => x !== adId)));
  const go = async (which: 'picked' | 'all') => {
    setBusy(which);
    await start(() => continueWithAdsAction(runId, which === 'all' ? [] : picked));
    setBusy(null);
  };

  return (
    <section className={cx('card card-pad', styles.picker)} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="card-title">
        Pick the ads the strategy answers
      </h2>
      <Why held={held}>The Ad Strategist builds its angles on the ads you tick, in the order you tick them; the rest of the report stays as context.</Why>
      <div className={styles.pickerBar}>
        <p className="muted small">
          {picked.length === 0 ? `${ads.length} ad${ads.length === 1 ? '' : 's'} in the report.` : `${picked.length} of ${ads.length} picked${full ? `: up to ${MAX_CHOSEN_ADS}` : ''}.`}
        </p>
        {picked.length > 0 && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPicked([])} disabled={busy !== null}>
            Clear
          </button>
        )}
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => void go('all')} disabled={busy !== null} aria-busy={busy === 'all'}>
          Use all {ads.length}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void go('picked')} disabled={busy !== null || picked.length === 0} aria-busy={busy === 'picked'}>
          {busy === 'picked' ? 'Starting…' : `Build the strategy from ${picked.length === 1 ? 'this ad' : picked.length === 0 ? 'these' : `these ${picked.length}`}`}
          {busy !== 'picked' && <ArrowRight size={15} aria-hidden />}
        </button>
      </div>
      <div className={competitors.gallery}>
        {ads.map((ad) => (
          <AdThumb key={ad.id} ad={ad} chosen={picked.includes(ad.id)} onChoose={(on) => toggle(ad.id, on)} chooseLabel="Build the strategy on this ad" />
        ))}
      </div>
    </section>
  );
}

/**
 * The strategy's angles, ticked for the Content Agent to write from. It
 * always writes three variants: one angle picked gets three takes on it, two
 * get two and one. Use all writes one variant per angle, as before.
 */
export function PickAngles({ runId, angles, held }: { runId: string; angles: StrategyAngle[]; held: boolean }) {
  const id = useId();
  const start = useStart('Content Agent');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<'picked' | 'all' | null>(null);
  // In the strategy's order, whichever was ticked first: that is the order the variants follow.
  const inOrder = angles.filter((a) => picked.includes(a.id));
  const go = async (which: 'picked' | 'all') => {
    setBusy(which);
    await start(() => continueWithAnglesAction(runId, which === 'all' ? [] : inOrder.map((a) => a.id)));
    setBusy(null);
  };

  return (
    <section className={cx('card card-pad', styles.picker)} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="card-title">
        Pick the angles the ads are written from
      </h2>
      <Why held={held}>The Content Agent always writes three variants, spread over the angles you tick.</Why>
      <ul className={styles.angles}>
        {angles.map((a, i) => {
          const on = picked.includes(a.id);
          return (
            <li key={a.id}>
              <label className={cx(styles.angle, on && styles.angleOn)}>
                <input type="checkbox" checked={on} disabled={busy !== null} onChange={(e) => setPicked((list) => (e.target.checked ? [...list, a.id] : list.filter((x) => x !== a.id)))} />
                <span>
                  <span className={styles.angleName}>
                    <span className={styles.angleNum}>{i + 1}</span>
                    {a.name}
                  </span>
                  <span className="muted small">{a.why}</span>
                  <span className={styles.angleHook}>“{a.hook}”</span>
                  {a.basedOn && (
                    <span className={cx('muted small', styles.angleFrom)}>
                      <CornerDownRight size={13} aria-hidden />
                      Answers their hook “{a.basedOn.hook}”
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className={styles.pickerBar}>
        <p className="muted small" aria-live="polite">
          {angleSpreadSaid(inOrder.map((a) => a.name))}
        </p>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => void go('all')} disabled={busy !== null} aria-busy={busy === 'all'}>
          Use all {angles.length}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void go('picked')} disabled={busy !== null || inOrder.length === 0} aria-busy={busy === 'picked'}>
          {busy === 'picked' ? 'Starting…' : `Write the ads from ${inOrder.length === 1 ? 'this angle' : inOrder.length === 0 ? 'these' : `these ${inOrder.length}`}`}
          {busy !== 'picked' && <ArrowRight size={15} aria-hidden />}
        </button>
      </div>
    </section>
  );
}
