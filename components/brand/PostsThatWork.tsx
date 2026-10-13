'use client';

import { BookmarkCheck, ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addBrandExampleAction, removeBrandExampleAction } from '@/app/(app)/brand/actions';
import { cx } from '@/lib/cx';
import { LIMITS } from '@/lib/edit-input';
import { EXAMPLE_PLACES } from '@/lib/types';
import type { BrandExample, ExamplePlace } from '@/lib/types';
import { EmptyState } from '../ui/EmptyState';
import { useToast } from '../ui/Toast';
import { ExampleIcon, EXAMPLE_LABEL } from './ExampleIcon';
import settings from '../settings/settings.module.css';
import styles from './brand.module.css';

/**
 * Posts that work for the brand, newest first: pasted here, or kept with
 * "This worked" on a post that went out. The Content Agent writes like them.
 */
export function PostsThatWork({ examples }: { examples: BrandExample[] }) {
  const toast = useToast();
  const router = useRouter();
  const [place, setPlace] = useState<ExamplePlace>('instagram');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setAdding(true);
    setError(null);
    const saved = await addBrandExampleAction({ place, text, note });
    setAdding(false);
    if (!saved.ok) return setError(saved.error);
    setText('');
    setNote('');
    toast(saved.sample ? 'Kept for this session' : 'Kept in brand memory');
    router.refresh();
  }

  async function remove(example: BrandExample) {
    setRemoving(example.id);
    const saved = await removeBrandExampleAction(example.id);
    setRemoving(null);
    if (!saved.ok) return toast(saved.error, 'info');
    toast(saved.sample ? 'Taken out for this session' : 'Taken out of brand memory');
    router.refresh();
  }

  return (
    <section className={cx('card card-pad', styles.section)} aria-labelledby="posts-that-work">
      <div>
        <h2 id="posts-that-work" className="card-title">
          Posts that work
        </h2>
        <p className="muted small">The Content Agent writes like these: their format, their length, their tone. Paste one, or press This worked on a post that went out.</p>
      </div>

      {examples.length === 0 ? (
        <EmptyState icon={ClipboardPaste} title="No posts yet">
          Paste a post that did well for you, on any platform.
        </EmptyState>
      ) : (
        <ul className={styles.examples}>
          {examples.map((e) => (
            <li key={e.id} className={styles.example}>
              <div className={styles.exampleHead}>
                <span className={styles.examplePlace}>
                  <ExampleIcon place={e.place} />
                  {EXAMPLE_LABEL[e.place]}
                </span>
                {e.source === 'marked' ? (
                  <Link href={e.postId ? `/posts#post-${e.postId}` : '/posts'} className={cx('pill pill-sm', styles.marked)}>
                    <BookmarkCheck size={13} aria-hidden />
                    This worked
                  </Link>
                ) : (
                  <span className="pill pill-quiet pill-sm">Pasted</span>
                )}
                <button type="button" className={cx('icon-btn icon-btn-plain', styles.exampleRemove)} aria-label="Take out of brand memory" disabled={removing !== null} aria-busy={removing === e.id} onClick={() => void remove(e)}>
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
              <p className={styles.exampleText}>{e.text}</p>
              {e.note && <p className={styles.exampleNote}>{e.note}</p>}
            </li>
          ))}
        </ul>
      )}

      <form
        className={styles.addExample}
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <h3 className={styles.subTitle}>Add a post that works</h3>
        <div className={styles.addRow}>
          <label className="field">
            <span className="label">Where it ran</span>
            <select className="select" value={place} onChange={(e) => setPlace(e.target.value as ExamplePlace)}>
              {EXAMPLE_PLACES.map((p) => (
                <option key={p} value={p}>
                  {EXAMPLE_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Why it worked (optional)</span>
            <input className="input" placeholder="E.g. Saved and shared a lot: lists work" value={note} maxLength={LIMITS.exampleNote} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="label">The post</span>
          <textarea className="textarea" rows={5} placeholder="Paste the post as it ran, hashtags and all." value={text} maxLength={LIMITS.example} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className={settings.actions}>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={adding || !text.trim()} aria-busy={adding}>
            <Plus size={16} aria-hidden />
            {adding ? 'Keeping…' : 'Keep it'}
          </button>
        </div>
      </form>
    </section>
  );
}
