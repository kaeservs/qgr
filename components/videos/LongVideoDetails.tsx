'use client';

import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateLongVideoAction } from '@/app/(app)/videos/actions';
import { MAX_LONG_DESCRIPTION, MAX_LONG_GUIDANCE, MAX_LONG_TITLE } from '@/lib/long-video';
import type { LongVideo } from '@/lib/types';
import { useToast } from '../ui/Toast';
import styles from './videos.module.css';

/**
 * A long video's name, what it is about and the direction for the agents:
 * shown at the top of its page, and changed there at any time. The Moments
 * agent reads the description and direction the next time it picks, and the
 * runs cut from the video carry them.
 */
export function LongVideoDetails({ video }: { video: Pick<LongVideo, 'id' | 'title' | 'description' | 'guidance'> }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description ?? '');
  const [guidance, setGuidance] = useState(video.guidance ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setTitle(video.title);
    setDescription(video.description ?? '');
    setGuidance(video.guidance ?? '');
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!title.trim()) return setError('Name the video.');
    setSaving(true);
    const saved = await updateLongVideoAction(video.id, { title, description, guidance });
    setSaving(false);
    if (!saved.ok) return setError(saved.error);
    setEditing(false);
    toast(saved.sample ? 'Saved for this session' : 'Saved');
    router.refresh();
  }

  if (editing) {
    return (
      <form
        className={styles.details}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={title} maxLength={MAX_LONG_TITLE} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="label">Description</span>
          <textarea
            className="textarea"
            rows={3}
            maxLength={MAX_LONG_DESCRIPTION}
            value={description}
            placeholder="What the video is about: e.g. Our Q4 webinar on the Gold Card and EB-5, for families in India."
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="label">Direction for the agents</span>
          <textarea
            className="textarea"
            rows={2}
            maxLength={MAX_LONG_GUIDANCE}
            value={guidance}
            placeholder="E.g. Find the moments about families with children close to 21, and the debt vs equity answer."
            onChange={(e) => setGuidance(e.target.value)}
          />
        </label>
        <p className="muted small">The Moments agent reads the description and direction the next time it picks, and so do the agents of every run made from this video.</p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className={styles.detailsActions}>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving} aria-busy={saving}>
            Save
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.detailsShown}>
      <div className={styles.detailsTitle}>
        <h1 className="display h1">{video.title}</h1>
        <button type="button" className="btn btn-ghost btn-sm" onClick={open}>
          <Pencil size={15} aria-hidden />
          Edit name and description
        </button>
      </div>
      {video.description ? <p className="lead">{video.description}</p> : <p className="muted small">No description yet: say what the video is about, for the team and the agents.</p>}
      {video.guidance && (
        <p className="small">
          <span className="muted">Direction for the agents:</span> {video.guidance}
        </p>
      )}
    </div>
  );
}
