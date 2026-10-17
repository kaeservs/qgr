'use client';

import { Clapperboard } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Clip } from '@/lib/types';
import type { VideoEdit } from '@/lib/video/edit';
import { sequenceOf } from '@/lib/video/timeline';
import { VideoEditor } from './VideoEditor';
import styles from './video.module.css';

export type FrameBrandWords = { name: string; website: string };

/** What an edit made before the run adds, in a few words: "3 pieces · music · 2 texts". */
function summary(edit: VideoEdit): string {
  const parts: string[] = [];
  const pieces = sequenceOf(edit).length;
  if (pieces > 1) parts.push(`${pieces} pieces`);
  if (edit.music) parts.push('music');
  const texts = edit.overlays?.length ?? 0;
  if (texts > 0) parts.push(`${texts} text${texts === 1 ? '' : 's'}`);
  if (edit.captions.length > 0) parts.push('captions');
  if (edit.endCard) parts.push('end card');
  if (edit.aspect !== 'original') parts.push(edit.aspect);
  return parts.length > 0 ? parts.join(' · ') : 'cut and framed';
}

/**
 * The video editor for a clip before its run: opened from the clip's own
 * file in this browser, so it works the moment the clip is ready. The edit
 * is handed back to go with the clip; every ad the agents make from it
 * starts from that edit, and each can still be changed in Content.
 */
export function ClipEditButton({ clip, file, edit, onEdit, brand, title }: { clip: Clip; file: Blob; edit: VideoEdit | null; onEdit: (edit: VideoEdit | null) => void; brand: FrameBrandWords; title: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  // A link to the file in this tab, for as long as the button is shown.
  useEffect(() => {
    const link = URL.createObjectURL(file);
    setUrl(link);
    return () => URL.revokeObjectURL(link);
  }, [file]);

  return (
    <div className={styles.clipEdit}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} disabled={!url}>
        <Clapperboard size={15} aria-hidden />
        {edit ? 'Change the edit' : 'Edit video'}
      </button>
      <span className="muted small">
        {edit ? `Edited: ${summary(edit)}. Every ad starts from this.` : 'Add other videos, pictures, title cards, effects, slow motion, transitions, text and music now, or later in Content.'}
      </span>
      {open && url && (
        <VideoEditor
          clip={{ ...clip, ...(edit ? { edit } : {}) }}
          url={url}
          brand={brand}
          setTitle={title}
          onClose={() => setOpen(false)}
          onApply={onEdit}
        />
      )}
    </div>
  );
}
