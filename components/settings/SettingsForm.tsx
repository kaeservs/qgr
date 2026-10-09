'use client';

import { AudioLines, CircleCheck, CircleDashed, Database, Plus, Workflow, X } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { saveBrandProfileAction } from '@/app/(app)/settings/actions';
import { cx } from '@/lib/cx';
import { PLACE_LABEL } from '@/lib/post-input';
import { PLACES } from '@/lib/types';
import type { BrandProfile, Place } from '@/lib/types';
import { PlaceIcon, PlatformIcon } from '../ui/PlatformIcon';
import { useToast } from '../ui/Toast';
import styles from './settings.module.css';

const VOICES = ['Calm', 'Expert', 'Plain English', 'Warm', 'Direct', 'Premium'];

function Connection({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return on ? (
    <span className={cx('pill pill-sm', styles.connected)}>
      <CircleCheck size={13} aria-hidden />
      {onLabel}
    </span>
  ) : (
    <span className="pill pill-quiet pill-sm">
      <CircleDashed size={13} aria-hidden />
      {offLabel}
    </span>
  );
}

/** How each place last went: posting for real, through its stand-in, or not tried yet. */
export type PostingState = 'live' | 'stand-in' | 'untried';

const POSTING_LABEL: Record<PostingState, string> = { live: 'Posting', 'stand-in': 'Stand-in', untried: 'Not tried yet' };

/**
 * The brand profile every agent reads before it writes, and what the agents
 * run on. The agents' and the Pages' cards come in as `children`, below it.
 */
export function SettingsForm({
  profile,
  connections,
  children,
}: {
  profile: BrandProfile;
  connections: { supabase: boolean; agents: boolean; transcripts: boolean; posting: Record<Place, PostingState> };
  children?: ReactNode;
}) {
  const toast = useToast();
  const [form, setForm] = useState(profile);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voices = [...VOICES, ...form.voice.filter((v) => !VOICES.includes(v))];

  const set = <K extends keyof BrandProfile>(key: K, value: BrandProfile[K]) => setForm((f) => ({ ...f, [key]: value }));
  const addRule = () => {
    const rule = draft.trim();
    if (rule && !form.guardrails.includes(rule)) set('guardrails', [...form.guardrails, rule]);
    setDraft('');
  };

  return (
    <div className={styles.layout}>
      <div className={styles.column}>
        <form
          className={cx('card card-pad', styles.form)}
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setError(null);
            const saved = await saveBrandProfileAction(form);
            setSaving(false);
            if (!saved.ok) return setError(saved.error);
            toast(saved.sample ? 'Saved for this session' : 'Brand profile saved');
          }}
        >
          <div>
            <h2 className="card-title">Brand profile</h2>
            <p className="muted small">Every agent reads this before it writes.</p>
          </div>

          <div className={styles.row}>
            <label className="field">
              <span className="label">Company</span>
              <input className="input" value={form.company} onChange={(e) => set('company', e.target.value)} required />
            </label>
            <label className="field">
              <span className="label">Website</span>
              <input className="input" value={form.website} onChange={(e) => set('website', e.target.value)} required />
            </label>
          </div>

          <label className="field">
            <span className="label">What you offer</span>
            <textarea className="textarea" rows={3} value={form.offer} onChange={(e) => set('offer', e.target.value)} required />
          </label>

          <label className="field">
            <span className="label">Who it’s for</span>
            <textarea className="textarea" rows={2} value={form.audience} onChange={(e) => set('audience', e.target.value)} required />
          </label>

          <fieldset className={styles.fieldset}>
            <legend className="label">Voice</legend>
            <div className={styles.chips}>
              {voices.map((v) => {
                const on = form.voice.includes(v);
                return (
                  <button key={v} type="button" aria-pressed={on} className={cx(styles.chip, on && styles.chipOn)} onClick={() => set('voice', on ? form.voice.filter((x) => x !== v) : [...form.voice, v])}>
                    {v}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className="label">Guardrails every ad follows</legend>
            <ul className={styles.rules}>
              {form.guardrails.map((r) => (
                <li key={r}>
                  <span>{r}</span>
                  <button type="button" className="icon-btn icon-btn-plain" aria-label={`Remove: ${r}`} onClick={() => set('guardrails', form.guardrails.filter((x) => x !== r))}>
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.addRule}>
              <input
                className="input"
                placeholder="Add a rule, e.g. Never name a competitor"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addRule();
                  }
                }}
              />
              <button type="button" className="btn btn-ghost" onClick={addRule} disabled={!draft.trim()}>
                <Plus size={16} aria-hidden />
                Add
              </button>
            </div>
          </fieldset>

          <div className={styles.row}>
            <label className="field">
              <span className="label">Page name in ads</span>
              <input className="input" value={form.pageName} onChange={(e) => set('pageName', e.target.value)} required />
            </label>
            <label className="field">
              <span className="label">X handle</span>
              <input className="input" value={form.xHandle} onChange={(e) => set('xHandle', e.target.value)} required />
            </label>
          </div>

          <div className={styles.actions}>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
        {children}
      </div>

      <section className={cx('card card-pad', styles.connections)} aria-labelledby="connections">
        <div>
          <h2 id="connections" className="card-title">
            Connections
          </h2>
          <p className="muted small">What the agents run on.</p>
        </div>
        <ul className={styles.services}>
          <li>
            <span className={styles.serviceIcon}>
              <Database size={18} aria-hidden />
            </span>
            <span className={styles.serviceText}>
              <strong>Supabase</strong>
              <span className="muted small">Runs, reports and ads</span>
            </span>
            <Connection on={connections.supabase} onLabel="Connected" offLabel="Sample data" />
          </li>
          <li>
            <span className={styles.serviceIcon}>
              <Workflow size={18} aria-hidden />
            </span>
            <span className={styles.serviceText}>
              <strong>n8n</strong>
              <span className="muted small">The three agents</span>
            </span>
            <Connection on={connections.agents} onLabel="Connected" offLabel="Needs keys" />
          </li>
          <li>
            <span className={styles.serviceIcon}>
              <AudioLines size={18} aria-hidden />
            </span>
            <span className={styles.serviceText}>
              <strong>Deepgram</strong>
              <span className="muted small">What is said in an uploaded clip</span>
            </span>
            <Connection on={connections.transcripts} onLabel="Connected" offLabel="Needs a key" />
          </li>
          {PLACES.map((place) => (
            <li key={place}>
              <span className={styles.serviceIcon}>
                <PlaceIcon place={place} size={18} decorative />
              </span>
              <span className={styles.serviceText}>
                <strong>{PLACE_LABEL[place]}</strong>
                <span className="muted small">Posts approved variants, through n8n</span>
              </span>
              {connections.posting[place] === 'live' ? (
                <Connection on onLabel={POSTING_LABEL.live} offLabel="" />
              ) : (
                <span className="pill pill-quiet pill-sm">{POSTING_LABEL[connections.posting[place]]}</span>
              )}
            </li>
          ))}
          <li>
            <span className={styles.serviceIcon}>
              <PlatformIcon platform="x" size={18} decorative />
            </span>
            <span className={styles.serviceText}>
              <strong>X</strong>
              <span className="muted small">Copy to paste: posting to X needs its paid API</span>
            </span>
            <span className="pill pill-quiet pill-sm">Copy only</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
