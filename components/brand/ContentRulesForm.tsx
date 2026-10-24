'use client';

import { Ban, Check, Plus, TriangleAlert, X } from 'lucide-react';
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

type RuleList = 'copyRules' | 'copyDonts' | 'pictureRules' | 'pictureDonts' | 'videoRules' | 'videoDonts';
type Draft = RuleList | 'flagPhrases';

/** Each part of an ad, with the list of what the AI does and the list of what it never does. */
const SECTIONS: { title: string; hint: string; does: RuleList; donts: RuleList; doExample: string; dontExample: string }[] = [
  {
    title: 'Words and tone',
    hint: 'Every hook, headline, words on a picture and post. The strategist builds its angles on them too.',
    does: 'copyRules',
    donts: 'copyDonts',
    doExample: 'Speak to parents planning their children’s future',
    dontExample: 'Mention processing fees',
  },
  {
    title: 'Pictures',
    hint: 'Every AI picture, after its scene: who is in it, the look, the setting.',
    does: 'pictureRules',
    donts: 'pictureDonts',
    doExample: 'Families outdoors, in daylight',
    dontExample: 'Office desks or paperwork',
  },
  {
    title: 'Videos',
    hint: 'Every AI video prompt: the ads’ and the ones written in the video editor.',
    does: 'videoRules',
    donts: 'videoDonts',
    doExample: 'Slow camera moves only',
    dontExample: 'Crowds or busy streets',
  },
];

const EMPTY_DRAFTS: Record<Draft, string> = { copyRules: '', copyDonts: '', pictureRules: '', pictureDonts: '', videoRules: '', videoDonts: '', flagPhrases: '' };

/**
 * How content is made: for the words, pictures and videos, the Do's the AI
 * follows and the Don'ts it never does (hard no's, over a run's direction),
 * and the phrases the studio flags. The team edits them here; the next run
 * follows them. What keeps an ad legally safe (no promised outcome, timeline
 * or return, never "guaranteed") stays in code and is not listed.
 */
export function ContentRulesForm({ rules }: { rules: ContentRules }) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState(rules);
  const [drafts, setDrafts] = useState(EMPTY_DRAFTS);
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

  const add = (key: Draft) => {
    const value = drafts[key].trim();
    const limit = key === 'flagPhrases' ? LIMITS.flagPhrases : LIMITS.contentRules;
    if (value && !form[key].some((r) => r.toLowerCase() === value.toLowerCase()) && form[key].length < limit) setForm({ ...form, [key]: [...form[key], value] });
    setDrafts({ ...drafts, [key]: '' });
  };
  const setRule = (key: RuleList, i: number, value: string) => setForm({ ...form, [key]: form[key].map((r, j) => (j === i ? value : r)) });
  const remove = (key: Draft, i: number) => setForm({ ...form, [key]: form[key].filter((_, j) => j !== i) });
  const onEnter = (key: Draft) => (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    add(key);
  };

  /** One column: the Do's or the Don'ts of a section, each editable, and a box to add one. */
  const column = (section: (typeof SECTIONS)[number], kind: 'do' | 'dont') => {
    const key = kind === 'do' ? section.does : section.donts;
    const label = kind === 'do' ? 'Do' : 'Don’t';
    const name = `${section.title}, ${kind === 'do' ? 'do' : 'don’t'}`;
    return (
      <div className={cx(styles.ruleColumn, kind === 'do' ? styles.ruleDo : styles.ruleDont)}>
        <p className={styles.ruleHead}>
          {kind === 'do' ? <Check size={16} aria-hidden /> : <Ban size={16} aria-hidden />}
          <span>
            <strong>{label}</strong> <span className="muted">{kind === 'do' ? 'the AI follows these' : 'hard no: the AI never does these'}</span>
          </span>
        </p>
        {form[key].length > 0 ? (
          <ol className={cx(settings.rules, styles.ruleList)}>
            {form[key].map((r, i) => (
              <li key={`${key}-${i}`}>
                <AutoTextarea className={cx('textarea', styles.ruleText)} value={r} onChange={(v) => setRule(key, i, v)} aria-label={`${name} ${i + 1}`} maxLength={LIMITS.contentRule} />
                <button type="button" className="icon-btn icon-btn-plain" aria-label={`Remove ${name.toLowerCase()} ${i + 1}`} onClick={() => remove(key, i)}>
                  <X size={16} />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className={cx('muted small', styles.ruleNone)}>{kind === 'do' ? 'Nothing yet.' : 'No hard no’s yet.'}</p>
        )}
        <div className={settings.addRule}>
          <input
            className="input"
            placeholder={`${label}: e.g. ${kind === 'do' ? section.doExample : section.dontExample}`}
            aria-label={`Add a ${name.toLowerCase()}`}
            value={drafts[key]}
            maxLength={LIMITS.contentRule}
            onChange={(e) => setDrafts({ ...drafts, [key]: e.target.value })}
            onKeyDown={onEnter(key)}
          />
          <button type="button" className="btn btn-ghost" onClick={() => add(key)} disabled={!drafts[key].trim() || form[key].length >= LIMITS.contentRules}>
            <Plus size={16} aria-hidden />
            Add
          </button>
        </div>
      </div>
    );
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
        const tidy = (key: RuleList) => form[key].filter((r) => r.trim());
        const saved = await saveContentRulesAction({
          ...form,
          copyRules: tidy('copyRules'),
          copyDonts: tidy('copyDonts'),
          pictureRules: tidy('pictureRules'),
          pictureDonts: tidy('pictureDonts'),
          videoRules: tidy('videoRules'),
          videoDonts: tidy('videoDonts'),
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
          What the AI does and never does when it writes, draws and films, and the phrases the studio flags. A Do is followed; a Don’t is a hard no, kept even when a run’s direction asks otherwise. Change them here: the next run follows them. What keeps every ad legally safe (no promised outcome, timeline or return, never “guaranteed”, no approved green card or money in a picture) is built in and always applies.
        </p>
      </div>

      {SECTIONS.map((section) => (
        <fieldset key={section.title} className={settings.fieldset}>
          <legend className="label">{section.title}</legend>
          <p className="muted small">{section.hint}</p>
          <div className={styles.doDont}>
            {column(section, 'do')}
            {column(section, 'dont')}
          </div>
        </fieldset>
      ))}

      <fieldset className={settings.fieldset}>
        <legend className="label">Phrases to flag</legend>
        <p className="muted small">The studio flags each of these, whole and in any case, wherever it shows up in an ad, for whoever approves it. It never changes the words.</p>
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
