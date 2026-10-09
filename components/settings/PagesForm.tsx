'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { savePostPagesAction } from '@/app/(app)/settings/actions';
import { cx } from '@/lib/cx';
import type { PostPages } from '@/lib/types';
import { PlaceIcon } from '../ui/PlatformIcon';
import { useToast } from '../ui/Toast';
import styles from './settings.module.css';

interface Fields {
  facebookId: string;
  facebookName: string;
  instagramId: string;
  instagramName: string;
  linkedinId: string;
  linkedinName: string;
}

const fieldsOf = (pages: PostPages): Fields => ({
  facebookId: pages.facebook?.id ?? '',
  facebookName: pages.facebook?.name ?? '',
  instagramId: pages.instagram?.id ?? '',
  instagramName: pages.instagram?.username ?? '',
  linkedinId: pages.linkedin?.id ?? '',
  linkedinName: pages.linkedin?.name ?? '',
});

/**
 * The Pages posts go to. The ids are what the platforms' APIs take; the names
 * are what the dashboard shows. The keys that post are n8n credentials and
 * never come here.
 */
export function PagesForm({ pages }: { pages: PostPages }) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState(() => fieldsOf(pages));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Fields, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const changed = JSON.stringify(form) !== JSON.stringify(fieldsOf(pages));

  return (
    <form
      className={cx('card card-pad', styles.form)}
      aria-labelledby="pages-title"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const saved = await savePostPagesAction({
          facebook: { id: form.facebookId, name: form.facebookName },
          instagram: { id: form.instagramId, username: form.instagramName },
          linkedin: { id: form.linkedinId, name: form.linkedinName },
        });
        setSaving(false);
        if (!saved.ok) return setError(saved.error);
        toast(saved.sample ? 'Saved for this session' : 'Pages saved');
        router.refresh();
      }}
    >
      <div>
        <h2 id="pages-title" className="card-title">
          Where posts go
        </h2>
        <p className="muted small">The company Pages approved variants are posted to. Leave a place empty if you don’t post there.</p>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={cx('label', styles.legendIcon)}>
          <PlaceIcon place="facebook" size={16} decorative /> Facebook Page
        </legend>
        <div className={styles.row}>
          <label className="field">
            <span className="label">Page name</span>
            <input className="input" value={form.facebookName} onChange={(e) => set('facebookName', e.target.value)} placeholder="Quantum Global Residency" />
          </label>
          <label className="field">
            <span className="label">Page ID</span>
            <input className="input" inputMode="numeric" value={form.facebookId} onChange={(e) => set('facebookId', e.target.value)} placeholder="From the Page’s About, Page transparency" />
          </label>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={cx('label', styles.legendIcon)}>
          <PlaceIcon place="instagram" size={16} decorative /> Instagram account
        </legend>
        <div className={styles.row}>
          <label className="field">
            <span className="label">Username</span>
            <input className="input" value={form.instagramName} onChange={(e) => set('instagramName', e.target.value)} placeholder="quantumglobalresidency" />
          </label>
          <label className="field">
            <span className="label">Account ID</span>
            <input className="input" inputMode="numeric" value={form.instagramId} onChange={(e) => set('instagramId', e.target.value)} placeholder="The professional account’s ID" />
          </label>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={cx('label', styles.legendIcon)}>
          <PlaceIcon place="linkedin" size={16} decorative /> LinkedIn Page
        </legend>
        <div className={styles.row}>
          <label className="field">
            <span className="label">Page name</span>
            <input className="input" value={form.linkedinName} onChange={(e) => set('linkedinName', e.target.value)} placeholder="Quantum Global Residency" />
          </label>
          <label className="field">
            <span className="label">Organization ID</span>
            <input className="input" inputMode="numeric" value={form.linkedinId} onChange={(e) => set('linkedinId', e.target.value)} placeholder="The number in the Page’s admin link" />
          </label>
        </div>
      </fieldset>

      <p className="muted small">Posting itself is n8n’s, with keys kept in its credentials. Until they are added, posts go through stand-ins and the Posts page says so.</p>

      <div className={styles.actions}>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving || !changed} aria-busy={saving}>
          {saving ? 'Saving…' : 'Save Pages'}
        </button>
      </div>
    </form>
  );
}
