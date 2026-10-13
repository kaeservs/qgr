'use client';

import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveBrandMemoryAction } from '@/app/(app)/brand/actions';
import { cx } from '@/lib/cx';
import { LIMITS } from '@/lib/edit-input';
import { EXAMPLE_PLACES } from '@/lib/types';
import type { BrandMemory, ExamplePlace } from '@/lib/types';
import { useToast } from '../ui/Toast';
import { ExampleIcon, EXAMPLE_LABEL } from './ExampleIcon';
import settings from '../settings/settings.module.css';
import styles from './brand.module.css';

const FORMAT_HINT: Record<ExamplePlace, string> = {
  facebook: 'E.g. Two or three short paragraphs. Open with a question families ask, end with one next step.',
  instagram: 'E.g. A first line that stops the scroll, short lines, then 4 to 6 hashtags on the last line.',
  linkedin: 'E.g. A strong first line, short paragraphs for professionals, at most three hashtags.',
  x: 'E.g. One idea in plain words, no hashtags.',
};

/**
 * What the team posts about, how it formats a post on each platform, and how
 * its pictures look. The strategist keeps to the topics, the Content Agent to
 * the formats, and every picture prompt to the style.
 */
export function BrandMemoryForm({ memory }: { memory: BrandMemory }) {
  const toast = useToast();
  const router = useRouter();
  const [topics, setTopics] = useState(memory.topics);
  const [draft, setDraft] = useState('');
  const [formats, setFormats] = useState(memory.postFormats);
  const [pictureStyle, setPictureStyle] = useState(memory.pictureStyle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTopic = () => {
    const topic = draft.trim();
    if (topic && !topics.includes(topic) && topics.length < LIMITS.topics) setTopics([...topics, topic]);
    setDraft('');
  };

  return (
    <form
      className={cx('card card-pad', settings.form)}
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const saved = await saveBrandMemoryAction({ topics, postFormats: formats, pictureStyle });
        setSaving(false);
        if (!saved.ok) return setError(saved.error);
        toast(saved.sample ? 'Saved for this session' : 'Brand memory saved');
        router.refresh();
      }}
    >
      <div>
        <h2 className="card-title">What you post, and how</h2>
        <p className="muted small">The strategist keeps to these topics, the Content Agent writes each post in your format, and every picture prompt follows your picture style.</p>
      </div>

      <fieldset className={settings.fieldset}>
        <legend className="label">What you usually post about</legend>
        {topics.length > 0 && (
          <ul className={styles.topics}>
            {topics.map((t) => (
              <li key={t} className="pill">
                {t}
                <button type="button" className={styles.topicRemove} aria-label={`Remove: ${t}`} onClick={() => setTopics(topics.filter((x) => x !== t))}>
                  <X size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={settings.addRule}>
          <input
            className="input"
            placeholder="Add a topic, e.g. Rural (TEA) projects"
            value={draft}
            maxLength={LIMITS.topic}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTopic();
              }
            }}
          />
          <button type="button" className="btn btn-ghost" onClick={addTopic} disabled={!draft.trim() || topics.length >= LIMITS.topics}>
            <Plus size={16} aria-hidden />
            Add
          </button>
        </div>
      </fieldset>

      <fieldset className={settings.fieldset}>
        <legend className="label">How you format a post</legend>
        {EXAMPLE_PLACES.map((place) => (
          <label key={place} className={cx('field', styles.formatField)}>
            <span className={styles.formatLabel}>
              <ExampleIcon place={place} />
              {EXAMPLE_LABEL[place]}
            </span>
            <textarea
              className="textarea"
              rows={2}
              placeholder={FORMAT_HINT[place]}
              value={formats[place] ?? ''}
              maxLength={LIMITS.formatNote}
              onChange={(e) => setFormats((f) => ({ ...f, [place]: e.target.value }))}
            />
          </label>
        ))}
      </fieldset>

      <label className="field">
        <span className="label">How your pictures look</span>
        <textarea
          className="textarea"
          rows={3}
          placeholder="E.g. Warm natural light: homes, desks, city skylines at dusk. Indigo and gold accents. No identifiable faces, no flags, no money."
          value={pictureStyle}
          maxLength={LIMITS.pictureStyle}
          onChange={(e) => setPictureStyle(e.target.value)}
        />
      </label>

      <div className={settings.actions}>
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
