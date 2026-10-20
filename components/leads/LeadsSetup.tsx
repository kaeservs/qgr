'use client';

import { CircleAlert, Plug, RefreshCw, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { judgeLeadsAgainAction, readLeadsNowAction, saveLeadCriteriaAction, savePostLinkAction, setLeadsSourceAction } from '@/app/(app)/leads/actions';
import { cx } from '@/lib/cx';
import { CRITERIA_LIMITS, taggedLink, zohoAddress } from '@/lib/leads';
import { formatInZone } from '@/lib/schedule';
import type { LeadSettings } from '@/lib/types';
import { useToast } from '../ui/Toast';
import styles from './leads.module.css';

/**
 * How leads come in and are judged: what makes a lead qualified (Claude's
 * criteria), where leads come from (Zoho, read by n8n), and the link posts send
 * people to, tagged so a lead is tied back to the post it followed.
 */
export function LeadsSetup({ settings, olderCount, timeZone, sample }: { settings: LeadSettings; olderCount: number; timeZone: string; sample: boolean }) {
  return (
    <div className={styles.setup}>
      <CriteriaForm settings={settings} olderCount={olderCount} sample={sample} />
      <ZohoForm settings={settings} timeZone={timeZone} sample={sample} />
      <PostLinkForm settings={settings} />
    </div>
  );
}

function useSaving() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return { busy, error, setError, setBusy };
}

function CriteriaForm({ settings, olderCount, sample }: { settings: LeadSettings; olderCount: number; sample: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState(settings.criteria);
  const { busy, error, setError, setBusy } = useSaving();
  return (
    <form
      className={cx('card card-pad', styles.form)}
      aria-labelledby="criteria-title"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy('save');
        setError(null);
        const saved = await saveLeadCriteriaAction(text);
        setBusy(null);
        if (!saved.ok) return setError(saved.error);
        toast(saved.sample ? 'Saved for this session' : 'Criteria saved: new leads are judged on them');
        router.refresh();
      }}
    >
      <div>
        <h2 id="criteria-title" className="card-title">
          What makes a lead qualified
        </h2>
        <p className="muted small">
          Claude judges every new lead against these words, and quotes what the lead said for each reason. Write them as you would brief a new colleague: who is a fit, who is not, and when to say you can’t tell. Judge only on what a lead says, never on a name or where someone is from.
        </p>
      </div>
      <label className="label sr-only" htmlFor="criteria">
        What makes a lead qualified
      </label>
      <textarea id="criteria" className={cx('textarea', styles.criteria)} value={text} maxLength={CRITERIA_LIMITS.max} onChange={(e) => setText(e.target.value)} />
      <div className={styles.row}>
        <button type="submit" className="btn btn-primary" aria-busy={busy === 'save'} disabled={busy !== null || text.trim() === settings.criteria}>
          Save the criteria
        </button>
        <span className="muted small">
          {text.length.toLocaleString('en-US')} / {CRITERIA_LIMITS.max.toLocaleString('en-US')}
        </span>
      </div>
      {olderCount > 0 && (
        <div className={styles.note}>
          <RotateCcw size={16} aria-hidden />
          <div className={styles.row}>
            <span>
              {olderCount} lead{olderCount === 1 ? ' was' : 's were'} judged before the criteria last changed{sample ? '.' : ', or could not be judged.'}
            </span>
            {!sample && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-busy={busy === 'again'}
                disabled={busy !== null}
                onClick={async () => {
                  setBusy('again');
                  setError(null);
                  const again = await judgeLeadsAgainAction(null);
                  setBusy(null);
                  if (!again.ok) return setError(again.error);
                  toast(`${again.value.count} lead${again.value.count === 1 ? ' is' : 's are'} judged again, ten every few seconds`);
                  router.refresh();
                }}
              >
                Judge them again
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function ZohoForm({ settings, timeZone, sample }: { settings: LeadSettings; timeZone: string; sample: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [address, setAddress] = useState(settings.zoho ? zohoAddress(settings.zoho) : '');
  const { busy, error, setError, setBusy } = useSaving();
  const on = settings.source === 'zoho';

  const act = async (key: string, run: () => Promise<{ ok: true; sample: boolean } | { ok: false; error: string }>, done: string) => {
    setBusy(key);
    setError(null);
    const result = await run();
    setBusy(null);
    if (!result.ok) return setError(result.error);
    toast(result.sample ? 'Saved for this session' : done);
    router.refresh();
  };

  return (
    <section className={cx('card card-pad', styles.form)} aria-labelledby="zoho-title">
      <div>
        <h2 id="zoho-title" className="card-title">
          Where leads come from: Zoho CRM
        </h2>
        <p className="muted small">
          n8n reads the leads added or changed in Zoho every fifteen minutes, the last 90 days the first time. Only what this page needs is copied: names, what each lead said, where it came from and its status. Email addresses, phone numbers and street addresses stay in Zoho, a link away.
        </p>
      </div>

      <dl className={styles.status}>
        <div>
          <dt className="sr-only">Now</dt>
          <dd style={{ margin: 0 }}>
            <strong>{on ? 'On' : 'Off'}</strong>
            {on && settings.zoho ? ` · ${zohoAddress(settings.zoho)}` : ''}
          </dd>
        </div>
        {settings.checkedAt && (
          <div>
            <dt className="sr-only">Last read</dt>
            <dd style={{ margin: 0 }}>
              Last asked {formatInZone(settings.checkedAt, timeZone)}
              {settings.syncedAt ? ` · newest change read ${formatInZone(settings.syncedAt, timeZone)}` : ''}
            </dd>
          </div>
        )}
      </dl>
      {settings.syncError && (
        <div className={cx(styles.note, styles.noteWarn)} role="status">
          <CircleAlert size={16} aria-hidden />
          <span>{settings.syncError}</span>
        </div>
      )}

      <ol className={styles.steps}>
        <li>
          In n8n, create a <strong>Zoho OAuth2 API</strong> credential for your Zoho’s region, signed in as a Zoho admin, and attach it to <strong>Zoho: the lead fields</strong> and <strong>Zoho: the leads</strong> in “QGR · Leads”.
        </li>
        <li>So each lead says which ad it came from: send Meta lead forms to Zoho with Zoho’s LeadChain (it brings the campaign and the ad), and keep the UTM tags your website form receives in fields named UTM Source, UTM Campaign and UTM Content.</li>
        <li>Paste your Zoho CRM’s address below, as your browser shows it, and connect.</li>
      </ol>

      <div className="field">
        <label className="label" htmlFor="zoho-address">
          Your Zoho CRM’s address
        </label>
        <input id="zoho-address" className="input" type="url" inputMode="url" placeholder="https://crm.zoho.com/crm/org123456789/tab/Home/begin" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className={styles.row}>
        <button type="button" className="btn btn-primary" aria-busy={busy === 'on'} disabled={busy !== null || !address.trim() || sample} onClick={() => act('on', () => setLeadsSourceAction(address), 'Zoho on: n8n reads it now')}>
          <Plug size={16} aria-hidden />
          {on ? 'Save the address' : 'Connect Zoho'}
        </button>
        {on && (
          <>
            <button type="button" className="btn btn-ghost" aria-busy={busy === 'now'} disabled={busy !== null} onClick={() => act('now', () => readLeadsNowAction(), 'n8n is reading Zoho')}>
              <RefreshCw size={16} aria-hidden />
              Read Zoho now
            </button>
            <button type="button" className="btn btn-quiet" aria-busy={busy === 'off'} disabled={busy !== null} onClick={() => act('off', () => setLeadsSourceAction(null), 'Zoho off: the leads read so far stay')}>
              Turn off
            </button>
          </>
        )}
      </div>
      {sample && <p className="muted small">The sample data is not connected to Zoho: its leads are examples, with made-up names.</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function PostLinkForm({ settings }: { settings: LeadSettings }) {
  const router = useRouter();
  const toast = useToast();
  const [link, setLink] = useState(settings.postLink ?? '');
  const { busy, error, setError, setBusy } = useSaving();
  const shown = link.trim() || 'https://quantumglobalresidency.com/consultation';
  return (
    <form
      className={cx('card card-pad', styles.form)}
      aria-labelledby="link-title"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy('save');
        setError(null);
        const saved = await savePostLinkAction(link);
        setBusy(null);
        if (!saved.ok) return setError(saved.error);
        toast(saved.sample ? 'Saved for this session' : link.trim() ? 'Link saved' : 'Posts carry no link now');
        router.refresh();
      }}
    >
      <div>
        <h2 id="link-title" className="card-title">
          Where posts send people
        </h2>
        <p className="muted small">
          A post can end with this link, tagged with its run, its variant and where it went, so a lead who follows it is tied back to that ad. You choose per post as you publish it; Instagram gets none, since a link in its words cannot be followed.
        </p>
      </div>
      <div className="field">
        <label className="label" htmlFor="post-link">
          The page posts send people to
        </label>
        <input id="post-link" className="input" type="url" inputMode="url" placeholder="https://quantumglobalresidency.com/consultation" value={link} onChange={(e) => setLink(e.target.value)} />
      </div>
      <p className={styles.example}>
        A Facebook post of variant A would end with <code>{taggedLink(shown, '1a2b3c4d-0000', 'A', 'facebook')}</code>
      </p>
      <div className={styles.row}>
        <button type="submit" className="btn btn-primary" aria-busy={busy === 'save'} disabled={busy !== null || link.trim() === (settings.postLink ?? '')}>
          Save the link
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
