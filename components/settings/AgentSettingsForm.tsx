'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveAgentSettingsAction } from '@/app/(app)/settings/actions';
import { cx } from '@/lib/cx';
import { STAGE_INFO } from '@/lib/pipeline';
import { hourLabel, SCAN_EVERY_LABEL, TIME_ZONES, WEEKDAYS, zoneLabel } from '@/lib/schedule';
import type { AdsSetting, AgentSettings, ScanEvery } from '@/lib/types';
import { Toggle } from '../ui/Toggle';
import { useToast } from '../ui/Toast';
import styles from './settings.module.css';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * When the tracker scans on its own, which agents start by themselves, and the
 * team's time zone, which scans and scheduled posts keep to.
 */
export function AgentSettingsForm({ settings }: { settings: AgentSettings }) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zones = TIME_ZONES.includes(form.timeZone as (typeof TIME_ZONES)[number]) ? TIME_ZONES : [form.timeZone, ...TIME_ZONES];
  const set = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => setForm((f) => ({ ...f, [key]: value }));
  const changed = JSON.stringify(form) !== JSON.stringify(settings);

  return (
    <form
      className={cx('card card-pad', styles.form)}
      aria-labelledby="agents-title"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const saved = await saveAgentSettingsAction(form);
        setSaving(false);
        if (!saved.ok) return setError(saved.error);
        toast(saved.sample ? 'Saved for this session' : 'Agents saved');
        router.refresh();
      }}
    >
      <div>
        <h2 id="agents-title" className="card-title">
          Agents
        </h2>
        <p className="muted small">When competitors are scanned, and which agents go on by themselves.</p>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className="label">{STAGE_INFO.tracker.name}: scan tracked competitors</legend>
        <div className={styles.inline}>
          <select className="input" aria-label="How often" value={form.scanEvery} onChange={(e) => set('scanEvery', e.target.value as ScanEvery)}>
            {(Object.keys(SCAN_EVERY_LABEL) as ScanEvery[]).map((k) => (
              <option key={k} value={k}>
                {SCAN_EVERY_LABEL[k]}
              </option>
            ))}
          </select>
          {form.scanEvery === 'week' && (
            <select className="input" aria-label="Day" value={form.scanDay} onChange={(e) => set('scanDay', Number(e.target.value))}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          )}
          {form.scanEvery !== 'off' && (
            <select className="input" aria-label="Hour" value={form.scanHour} onChange={(e) => set('scanHour', Number(e.target.value))}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="muted small">
          Each scan reads a tracked competitor’s ads again, with their website as it was last read. Stop scanning one from its page under Competitors.
        </p>
      </fieldset>

      <label className="field">
        <span className="label">{STAGE_INFO.tracker.name}: competitors’ ads</span>
        <select className="input" value={form.adsSource} onChange={(e) => set('adsSource', e.target.value as AdsSetting)}>
          <option value="sample">Sample ads</option>
          <option value="apify">Their real ads, from Meta’s Ad Library (Apify)</option>
        </select>
        <span className="muted small">
          {form.adsSource === 'apify'
            ? 'Apify reads each competitor’s active ads in Meta’s Ad Library: at a link to their ads there, or by looking their name up. It needs the Apify token in n8n; without it, a scan stops and says why.'
            : 'The same example ads for every competitor, so runs work before Apify is connected. Their reports say so.'}
        </span>
      </label>

      <div className={styles.switchRow}>
        <span>
          <strong>{STAGE_INFO.strategist.name}</strong>
          <span className="muted small"> builds a strategy after every scan</span>
        </span>
        <Toggle checked={form.strategistAuto} label={`Run the ${STAGE_INFO.strategist.name} after every scan`} onChange={(on) => set('strategistAuto', on)} />
      </div>
      <div className={styles.switchRow}>
        <span>
          <strong>{STAGE_INFO.content.name}</strong>
          <span className="muted small"> writes ads from every strategy</span>
        </span>
        <Toggle checked={form.contentAuto} label={`Run the ${STAGE_INFO.content.name} after every strategy`} onChange={(on) => set('contentAuto', on)} />
      </div>
      <p className="muted small">Off: the run waits on its page until someone gives the go-ahead. A run someone starts by hand always starts.</p>

      <div className={styles.switchRow}>
        <span>
          <strong>Pictures</strong>
          <span className="muted small"> an image model makes one for every new ad</span>
        </span>
        <Toggle checked={form.picturesAuto} label="Make a picture for every new ad" onChange={(on) => set('picturesAuto', on)} />
      </div>
      <p className="muted small">Off: a picture is made only when someone asks for one in the studio. Either way, until the image model’s key is in n8n, none is made and the design is drawn.</p>

      <label className="field">
        <span className="label">Time zone</span>
        <select className="input" value={form.timeZone} onChange={(e) => set('timeZone', e.target.value)}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {zoneLabel(z)}
            </option>
          ))}
        </select>
        <span className="muted small">Scans and scheduled posts keep to this zone’s clock.</span>
      </label>

      <div className={styles.actions}>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving || !changed} aria-busy={saving}>
          {saving ? 'Saving…' : 'Save agents'}
        </button>
      </div>
    </form>
  );
}
