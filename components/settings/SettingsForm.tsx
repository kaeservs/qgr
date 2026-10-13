'use client';

import { AudioLines, BookMarked, CircleCheck, CircleDashed, Database, ImagePlus, Workflow } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { PLACE_LABEL } from '@/lib/post-input';
import { PLACES } from '@/lib/types';
import type { PictureModel, Place } from '@/lib/types';
import { PlaceIcon, PlatformIcon } from '../ui/PlatformIcon';
import styles from './settings.module.css';

function Connection({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return on ? (
    <span className={cx('pill pill-sm', styles.connected)}>
      <CircleCheck size={13} aria-hidden />
      {onLabel}
    </span>
  ) : (
    <span className="pill pill-quiet pill-sm">
      <CircleDashed size={13} aria-hidden />
      {offLabel}
    </span>
  );
}

/** How each place last went: posting for real, through its stand-in, or not tried yet. */
export type PostingState = 'live' | 'stand-in' | 'untried';

const POSTING_LABEL: Record<PostingState, string> = { live: 'Posting', 'stand-in': 'Stand-in', untried: 'Not tried yet' };

/**
 * What the agents run on, beside the agents' and the Pages' cards, which come
 * in as `children`. The brand's voice and rules live in Brand memory.
 */
export function SettingsForm({
  connections,
  children,
}: {
  connections: { supabase: boolean; agents: boolean; pictures: PictureModel; posting: Record<Place, PostingState> };
  children?: ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <div className={styles.column}>
        <section className={cx('card card-pad', styles.moved)} aria-labelledby="brand-moved">
          <BookMarked size={20} aria-hidden />
          <div>
            <h2 id="brand-moved" className="card-title">
              Brand voice and rules live in Brand memory
            </h2>
            <p className="muted small">With what you post about, how you format posts, how pictures look, and the posts that work.</p>
          </div>
          <Link href="/brand" className="btn btn-ghost btn-sm">
            Open Brand memory
          </Link>
        </section>
        {children}
      </div>

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
            <Connection on={connections.supabase} onLabel="Connected" offLabel="Sample data" />
          </li>
          <li>
            <span className={styles.serviceIcon}>
              <Workflow size={18} aria-hidden />
            </span>
            <span className={styles.serviceText}>
              <strong>n8n</strong>
              <span className="muted small">The three agents</span>
            </span>
            <Connection on={connections.agents} onLabel="Connected" offLabel="Needs keys" />
          </li>
          <li>
            <span className={styles.serviceIcon}>
              <ImagePlus size={18} aria-hidden />
            </span>
            <span className={styles.serviceText}>
              <strong>{connections.pictures === 'cloudflare' ? 'Cloudflare Workers AI' : 'Image model'}</strong>
              <span className="muted small">Pictures for ads, through n8n: chosen under Agents</span>
            </span>
            {connections.pictures === 'cloudflare' ? <Connection on onLabel="FLUX.1 schnell, free" offLabel="" /> : <span className="pill pill-quiet pill-sm">Stand-in</span>}
          </li>
          <li>
            <span className={styles.serviceIcon}>
              <AudioLines size={18} aria-hidden />
            </span>
            <span className={styles.serviceText}>
              <strong>Whisper</strong>
              <span className="muted small">What is said in an uploaded clip, heard on your own computer</span>
            </span>
            <Connection on onLabel="In the browser, free" offLabel="" />
          </li>
          {PLACES.map((place) => (
            <li key={place}>
              <span className={styles.serviceIcon}>
                <PlaceIcon place={place} size={18} decorative />
              </span>
              <span className={styles.serviceText}>
                <strong>{PLACE_LABEL[place]}</strong>
                <span className="muted small">Posts approved variants, through n8n</span>
              </span>
              {connections.posting[place] === 'live' ? (
                <Connection on onLabel={POSTING_LABEL.live} offLabel="" />
              ) : (
                <span className="pill pill-quiet pill-sm">{POSTING_LABEL[connections.posting[place]]}</span>
              )}
            </li>
          ))}
          <li>
            <span className={styles.serviceIcon}>
              <PlatformIcon platform="x" size={18} decorative />
            </span>
            <span className={styles.serviceText}>
              <strong>X</strong>
              <span className="muted small">Copy to paste: posting to X needs its paid API</span>
            </span>
            <span className="pill pill-quiet pill-sm">Copy only</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
