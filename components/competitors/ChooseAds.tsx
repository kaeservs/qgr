'use client';

import { ArrowRight, X as Close } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { startFromAdsAction } from '@/app/(app)/competitors/actions';
import { cx } from '@/lib/cx';
import { GOAL_LABEL, PLATFORM_LABEL } from '@/lib/platforms';
import { MAX_CHOSEN_ADS, MAX_GUIDANCE } from '@/lib/run-input';
import { GOALS, PLATFORMS } from '@/lib/types';
import type { AdExample, Goal, Platform } from '@/lib/types';
import { PickFirstChoice } from '../runs/RunQuestions';
import { PlatformIcon } from '../ui/PlatformIcon';
import { useToast } from '../ui/Toast';
import home from '../home/home.module.css';
import video from '../video/video.module.css';
import { AdThumb } from './AdThumb';
import styles from './competitors.module.css';

/**
 * A report's ads, any few of which a person can tick and build a run on. The
 * run skips the tracker (the report is already there) and the strategist
 * builds its angles on the ads chosen, with the rest of the report as context.
 */
export function ChooseAds({ competitor, reportId, ads }: { competitor: string; reportId: string; ads: AdExample[] }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const full = chosen.length >= MAX_CHOSEN_ADS;
  const toggle = (id: string, on: boolean) => setChosen((list) => (on ? (list.includes(id) || list.length >= MAX_CHOSEN_ADS ? list : [...list, id]) : list.filter((x) => x !== id)));

  return (
    <>
      <div className={styles.chooseBar} role="region" aria-label="Choose ads to build on">
        <p className="muted small">
          {chosen.length === 0
            ? 'Tick the ads you want to answer, and the agents build the next run on them alone.'
            : `${chosen.length} chosen${full ? `: up to ${MAX_CHOSEN_ADS}` : ''}. The strategist builds its angles on these; the rest of the report is context.`}
        </p>
        {chosen.length > 0 && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setChosen([])}>
            Clear
          </button>
        )}
        <button type="button" className="btn btn-primary btn-sm" disabled={chosen.length === 0} onClick={() => setOpen(true)}>
          Make ads from {chosen.length === 0 ? 'these' : chosen.length === 1 ? 'this one' : `these ${chosen.length}`}
          <ArrowRight size={15} aria-hidden />
        </button>
      </div>
      <div className={styles.gallery}>
        {ads.map((ad) => (
          <AdThumb key={ad.id} ad={ad} chosen={chosen.includes(ad.id)} onChoose={(on) => toggle(ad.id, on)} />
        ))}
      </div>
      {open && <StartFromAds competitor={competitor} reportId={reportId} ads={ads.filter((a) => chosen.includes(a.id))} onClose={() => setOpen(false)} />}
    </>
  );
}

function StartFromAds({ competitor, reportId, ads, onClose }: { competitor: string; reportId: string; ads: AdExample[]; onClose: () => void }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([...PLATFORMS]);
  const [goal, setGoal] = useState<Goal>('consultations');
  const [guidance, setGuidance] = useState('');
  const [title, setTitle] = useState('');
  const [pickFirst, setPickFirst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  const togglePlatform = (p: Platform) => setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || list.includes(x))));

  async function start() {
    if (platforms.length === 0) return setError('Pick at least one platform.');
    setError(null);
    setBusy(true);
    const result = await startFromAdsAction({
      reportId,
      adIds: ads.map((a) => a.id),
      platforms,
      goal,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(guidance.trim() ? { guidance: guidance.trim() } : {}),
      ...(pickFirst ? { pickFirst: true } : {}),
    }).catch(() => ({ ok: false as const, status: 500, error: 'The run could not be started.' }));
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }
    toast(result.sample ? 'Run started. Sample data: the agents don’t run here' : 'Run started at the strategist');
    router.push(`/runs/${result.value.id}`);
  }

  return (
    <dialog
      ref={dialog}
      className={cx(video.dialog, styles.chooseDialog)}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className={video.dialogHead}>
        <div>
          <h2 id={`${id}-title`}>Make ads from {ads.length === 1 ? 'this ad' : `these ${ads.length} ads`}</h2>
          <p className="muted small">The run starts at the strategist and builds on the ads you chose. The Competitor Tracker is skipped: the report on {competitor} is already here.</p>
        </div>
        <button type="button" className="icon-btn icon-btn-plain" aria-label="Close" onClick={onClose} disabled={busy}>
          <Close size={18} aria-hidden />
        </button>
      </header>
      <div className={video.dialogBody}>
        <ol className={styles.chosenList} aria-label="The ads chosen">
          {ads.map((ad) => (
            <li key={ad.id}>
              <PlatformIcon platform={ad.platform} size={14} decorative />
              <span>“{ad.text.length > 120 ? `${ad.text.slice(0, 120).trimEnd()}…` : ad.text}”</span>
            </li>
          ))}
        </ol>
        <div className="field">
          <span className="label" id={`${id}-platforms`}>
            Ads for
          </span>
          <div className={home.platformPick} role="group" aria-labelledby={`${id}-platforms`}>
            {PLATFORMS.map((p) => (
              <button key={p} type="button" aria-pressed={platforms.includes(p)} className={cx(home.platformChip, platforms.includes(p) && home.platformChipOn)} onClick={() => togglePlatform(p)}>
                <PlatformIcon platform={p} size={15} decorative />
                {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="label">Goal</span>
          <select className="select" value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {GOAL_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Direction for the agents (optional)</span>
          <textarea
            className="textarea"
            rows={2}
            maxLength={MAX_GUIDANCE}
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder="E.g. Answer their age-out ad with our plain timeline, and leave the cost talk out."
          />
        </label>
        <label className="field">
          <span className="label">Run name (optional)</span>
          <input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${competitor} · ${ads.length} chosen ad${ads.length === 1 ? '' : 's'}`} />
        </label>
        <PickFirstChoice skipsTracker value={pickFirst} onChange={setPickFirst} disabled={busy} />
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className={video.dialogFoot}>
        <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={busy} aria-busy={busy}>
          {busy ? 'Starting…' : 'Start run'}
          {!busy && <ArrowRight size={16} aria-hidden />}
        </button>
      </footer>
    </dialog>
  );
}
