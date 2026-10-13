'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { saveBrandProfileAction } from '@/app/(app)/brand/actions';
import { cx } from '@/lib/cx';
import type { BrandProfile } from '@/lib/types';
import { useToast } from '../ui/Toast';
// The Settings forms' look: fields, chips and the rules list.
import styles from '../settings/settings.module.css';

const VOICES = ['Calm', 'Expert', 'Plain English', 'Warm', 'Direct', 'Premium'];

/** Who Quantum Global is and how it sounds: the profile every agent reads before it writes. */
export function BrandProfileForm({ profile }: { profile: BrandProfile }) {
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
    <form
      className={cx('card card-pad', styles.form)}
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const saved = await saveBrandProfileAction(form);
        setSaving(false);
        if (!saved.ok) return setError(saved.error);
        toast(saved.sample ? 'Saved for this session' : 'Voice and rules saved');
      }}
    >
      <div>
        <h2 className="card-title">Voice and rules</h2>
        <p className="muted small">Who you are and how you sound. Every agent reads this before it writes.</p>
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
  );
}
