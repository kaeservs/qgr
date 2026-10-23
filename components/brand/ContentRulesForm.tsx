'use client';

import { Plus, TriangleAlert, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { saveContentRulesAction } from '@/app/(app)/brand/actions';
import { cx } from '@/lib/cx';
import { LIMITS } from '@/lib/edit-input';
import type { ContentRules } from '@/lib/types';
import { AutoTextarea } from '../content/AutoTextarea';
import { useToast } from '../ui/Toast';
import settings from '../settings/settings.module.css';
import styles from './brand.module.css';

type RuleList = 'copyRules' | 'pictureRules' | 'videoRules';

const LISTS: { key: RuleList; title: string; hint: string; placeholder: string }[] = [
  {
    key: 'copyRules',
    title: 'Words and tone',
    hint: 'Every hook, headline, words on a picture and post follows these. The strategist keeps its angles to them too.',
    placeholder: 'Add a rule, e.g. Speak to parents planning their children’s future',
  },
  {
    key: 'pictureRules',
    title: 'Pictures',
    hint: 'Every AI picture is asked for with these, after its scene: who is in it, the look, the setting.',
    placeholder: 'Add a rule, e.g. Show families outdoors, in daylight',
  },
  {
    key: 'videoRules',
    title: 'Videos',
    hint: 'Every AI video prompt keeps to these, the ads’ and the ones written in the video editor.',
    placeholder: 'Add a rule, e.g. Slow camera moves only',
  },
];

/**
 * How content is made: the rules the agents write, draw and film by, and the
 * phrases the checks flag in the studio. The team edits them here; the next
 * run follows them. What keeps an ad legally safe (no promised outcome,
 * timeline or return, never "guaranteed") stays in code and is not listed.
 */
export function ContentRulesForm({ rules }: { rules: ContentRules }) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState(rules);
  const [drafts, setDrafts] = useState<Record<RuleList | 'flagPhrases', string>>({ copyRules: '', pictureRules: '', videoRules: '', flagPhrases: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = JSON.stringify(form) !== JSON.stringify(rules);

  // A change takes effect only once saved: say so, and ask before leaving.
  useEffect(() => {
    if (!changed) return;
    const stay = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', stay);
    return () => window.removeEventListener('beforeunload', stay);
  }, [changed]);

  const add = (key: RuleList | 'flagPhrases') => {
    const value = drafts[key].trim();
    const limit = key === 'flagPhrases' ? LIMITS.flagPhrases : LIMITS.contentRules;
    if (value && !form[key].some((r) => r.toLowerCase() === value.toLowerCase()) && form[key].length < limit) setForm({ ...form, [key]: [...form[key], value] });
    setDrafts({ ...drafts, [key]: '' });
  };
  const setRule = (key: RuleList, i: number, value: string) => setForm({ ...form, [key]: form[key].map((r, j) => (j === i ? value : r)) });
  const remove = (key: RuleList | 'flagPhrases', i: number) => setForm({ ...form, [key]: form[key].filter((_, j) => j !== i) });
  const onEnter = (key: RuleList | 'flagPhrases') => (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    add(key);
  };

  return (
    <form
      className={cx('card card-pad', settings.form)}
      aria-labelledby="content-rules-title"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        // A rule emptied while editing is taken out.
        const saved = await saveContentRulesAction({
          ...form,
          copyRules: form.copyRules.filter((r) => r.trim()),
          pictureRules: form.pictureRules.filter((r) => r.trim()),
          videoRules: form.videoRules.filter((r) => r.trim()),
        });
        setSaving(false);
        if (!saved.ok) return setError(saved.error);
        toast(saved.sample ? 'Saved for this session' : 'Content rules saved: the next run follows them');
        router.refresh();
      }}
    >
      <div>
        <h2 id="content-rules-title" className="card-title">
          How content is made
        </h2>
        <p className="muted small">
          The rules the agents write, draw and film by, and the phrases the studio flags. Change them here: the next run follows them. What keeps every ad legally safe (no promised outcome, timeline or return, never “guaranteed”, no approved green card or money in a picture) is built in and always applies.
        </p>
      </div>

      {LISTS.map((list) => (
        <fieldset key={list.key} className={settings.fieldset}>
          <legend className="label">{list.title}</legend>
          <p className="muted small">{list.hint}</p>
          {form[list.key].length > 0 && (
            <ol className={cx(settings.rules, styles.ruleList)}>
              {form[list.key].map((r, i) => (
                <li key={`${list.key}-${i}`}>
                  <AutoTextarea className={cx('textarea', styles.ruleText)} value={r} onChange={(v) => setRule(list.key, i, v)} aria-label={`${list.title}, rule ${i + 1}`} maxLength={LIMITS.contentRule} />
                  <button type="button" className="icon-btn icon-btn-plain" aria-label={`Remove ${list.title.toLowerCase()} rule ${i + 1}`} onClick={() => remove(list.key, i)}>
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className={settings.addRule}>
            <input className="input" placeholder={list.placeholder} value={drafts[list.key]} maxLength={LIMITS.contentRule} onChange={(e) => setDrafts({ ...drafts, [list.key]: e.target.value })} onKeyDown={onEnter(list.key)} />
            <button type="button" className="btn btn-ghost" onClick={() => add(list.key)} disabled={!drafts[list.key].trim() || form[list.key].length >= LIMITS.contentRules}>
              <Plus size={16} aria-hidden />
              Add
            </button>
          </div>
        </fieldset>
      ))}

      <fieldset className={settings.fieldset}>
        <legend className="label">Phrases to flag</legend>
        <p className="muted small">The studio flags each of these, whole and in any case, for whoever approves the ad. It never changes the words.</p>
        {form.flagPhrases.length > 0 && (
          <ul className={styles.topics}>
            {form.flagPhrases.map((p, i) => (
              <li key={p} className="pill">
                {p}
                <button type="button" className={styles.topicRemove} aria-label={`Stop flagging: ${p}`} onClick={() => remove('flagPhrases', i)}>
                  <X size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={settings.addRule}>
          <input
            className="input"
            placeholder="Add a phrase, e.g. act now"
            value={drafts.flagPhrases}
            maxLength={LIMITS.flagPhrase}
            onChange={(e) => setDrafts({ ...drafts, flagPhrases: e.target.value })}
            onKeyDown={onEnter('flagPhrases')}
          />
          <button type="button" className="btn btn-ghost" onClick={() => add('flagPhrases')} disabled={drafts.flagPhrases.trim().length < 2 || form.flagPhrases.length >= LIMITS.flagPhrases}>
            <Plus size={16} aria-hidden />
            Add
          </button>
        </div>
      </fieldset>

      <div className={cx(settings.actions, changed && settings.unsaved)}>
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : (
          changed && (
            <p className={settings.unsavedNote} role="status">
              <TriangleAlert size={16} aria-hidden /> Not saved yet: the agents follow these once you press Save content rules.
            </p>
          )
        )}
        <button type="submit" className="btn btn-primary" disabled={saving || !changed} aria-busy={saving}>
          {saving ? 'Saving…' : 'Save content rules'}
        </button>
      </div>
    </form>
  );
}
