'use client';

import { Database, Plus, Workflow, X } from 'lucide-react';
import { useState } from 'react';
import { BRAND } from '@/lib/brand';
import { cx } from '@/lib/cx';
import { PLATFORMS } from '@/lib/types';
import { PLATFORM_LABEL } from '@/lib/platforms';
import { PlatformIcon } from '../ui/PlatformIcon';
import { useToast } from '../ui/Toast';
import styles from './settings.module.css';

const VOICES = ['Calm', 'Expert', 'Plain English', 'Warm', 'Direct', 'Premium'];

/** The brand profile every agent reads. Kept in the page until Supabase stores it. */
export function SettingsForm({ guardrails }: { guardrails: string[] }) {
  const toast = useToast();
  const [voice, setVoice] = useState<string[]>(['Calm', 'Expert', 'Plain English']);
  const [rules, setRules] = useState(guardrails);
  const [draft, setDraft] = useState('');

  const addRule = () => {
    const rule = draft.trim();
    if (rule && !rules.includes(rule)) setRules([...rules, rule]);
    setDraft('');
  };

  return (
    <div className={styles.layout}>
      <form
        className={cx('card card-pad', styles.form)}
        onSubmit={(e) => {
          e.preventDefault();
          toast('Saved for this session');
        }}
      >
        <div>
          <h2 className="card-title">Brand profile</h2>
          <p className="muted small">Every agent reads this before it writes.</p>
        </div>

        <div className={styles.row}>
          <label className="field">
            <span className="label">Company</span>
            <input className="input" defaultValue={BRAND.legalName} />
          </label>
          <label className="field">
            <span className="label">Website</span>
            <input className="input" defaultValue={BRAND.domain} />
          </label>
        </div>

        <label className="field">
          <span className="label">What you offer</span>
          <textarea className="textarea" rows={3} defaultValue="EB-5 investor visa guidance with independent due diligence on every project, from first call to green card." />
        </label>

        <label className="field">
          <span className="label">Who it’s for</span>
          <textarea className="textarea" rows={2} defaultValue="Indian professionals and families planning a move to the U.S., many on H-1B visas." />
        </label>

        <fieldset className={styles.fieldset}>
          <legend className="label">Voice</legend>
          <div className={styles.chips}>
            {VOICES.map((v) => (
              <button key={v} type="button" aria-pressed={voice.includes(v)} className={cx(styles.chip, voice.includes(v) && styles.chipOn)} onClick={() => setVoice((list) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]))}>
                {v}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className="label">Guardrails every ad follows</legend>
          <ul className={styles.rules}>
            {rules.map((r) => (
              <li key={r}>
                <span>{r}</span>
                <button type="button" className="icon-btn icon-btn-plain" aria-label={`Remove: ${r}`} onClick={() => setRules(rules.filter((x) => x !== r))}>
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
            <input className="input" defaultValue={BRAND.name} />
          </label>
          <label className="field">
            <span className="label">X handle</span>
            <input className="input" defaultValue={BRAND.xHandle} />
          </label>
        </div>

        <div className={styles.actions}>
          <button type="submit" className="btn btn-primary">
            Save changes
          </button>
        </div>
      </form>

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
            <span className="pill pill-quiet pill-sm">Next step</span>
          </li>
          <li>
            <span className={styles.serviceIcon}>
              <Workflow size={18} aria-hidden />
            </span>
            <span className={styles.serviceText}>
              <strong>n8n</strong>
              <span className="muted small">The three agents</span>
            </span>
            <span className="pill pill-quiet pill-sm">Next step</span>
          </li>
          {PLATFORMS.map((p) => (
            <li key={p}>
              <span className={styles.serviceIcon}>
                <PlatformIcon platform={p} size={18} decorative />
              </span>
              <span className={styles.serviceText}>
                <strong>{PLATFORM_LABEL[p]} Ads</strong>
                <span className="muted small">Publish approved ads</span>
              </span>
              <span className="pill pill-quiet pill-sm">Later</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
