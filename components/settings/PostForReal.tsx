'use client';

import { TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setPostForRealAction } from '@/app/(app)/settings/actions';
import { PLACE_LABEL } from '@/lib/post-input';
import type { Place } from '@/lib/types';
import { Toggle } from '../ui/Toggle';
import { useToast } from '../ui/Toast';
import styles from './settings.module.css';

/** What each place needs in n8n before its posts can go out for real. */
const NEEDS: Record<Place, string> = {
  facebook:
    'the “Facebook Graph API” credential (the Page’s access token, with pages_manage_posts, pages_read_engagement and pages_read_user_content) attached to “Facebook: post” in QGR · Publisher and to “Meta: its numbers” in QGR · Post results.',
  instagram:
    'the same “Facebook Graph API” credential (with instagram_basic, instagram_content_publish and instagram_manage_insights) attached to the four Instagram steps in QGR · Publisher and to “Meta: its numbers” in QGR · Post results. The Instagram account must be a professional account linked to the Facebook Page.',
  linkedin:
    'the “LinkedIn Community Management” credential attached to the LinkedIn steps in QGR · Publisher and to “LinkedIn: its numbers” in QGR · Post results. LinkedIn grants it only once it has approved the app for its Community Management API.',
};

/**
 * Whether a place's posts go out for real. Off, they go through its stand-in
 * and nothing is posted, as until now. It can be turned on once the place's
 * Page or account is saved (`ready`); turning it on says first what the place
 * needs in n8n, and asks once more: from then on an approved post is
 * published on the Page.
 */
export function PostForReal({ place, on, ready, pageName }: { place: Place; on: boolean; ready: boolean; pageName: string | null }) {
  const toast = useToast();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = PLACE_LABEL[place];

  async function save(next: boolean) {
    setBusy(true);
    const saved = await setPostForRealAction(place, next);
    setBusy(false);
    setAsking(false);
    if (!saved.ok) return toast(saved.error, 'info');
    toast(saved.sample ? 'Saved for this session' : next ? `${label} posts go out for real from now on` : `${label} posts go through the stand-in again`);
    router.refresh();
  }

  return (
    <div className={styles.forReal}>
      <div className={styles.switchRow}>
        <span>
          <strong>Post for real</strong>
          <span className="muted small">
            {' '}
            {on
              ? `approved posts are published${pageName ? ` on ${pageName}` : ''}`
              : ready
                ? 'off: through the stand-in, nothing goes out'
                : `off: save the ${place === 'instagram' ? 'account' : place === 'linkedin' ? 'Organization' : 'Page'} ID above first`}
          </span>
        </span>
        <Toggle checked={on || asking} busy={busy} disabled={!on && !ready} label={`Post to ${label} for real`} onChange={(next) => (next ? setAsking(true) : void save(false))} />
      </div>
      {asking && !on && (
        <div className={styles.forRealAsk} role="alert">
          <TriangleAlert size={16} aria-hidden />
          <div>
            <p>
              From now on, approved posts for {label} are published{pageName ? ` on ${pageName}` : ''} for everyone to see. It needs {NEEDS[place]} Without it, a post fails and says why: nothing goes out.
            </p>
            <div className={styles.forRealButtons}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void save(true)} disabled={busy} aria-busy={busy}>
                Post to {label} for real
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAsking(false)} disabled={busy}>
                Not yet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
