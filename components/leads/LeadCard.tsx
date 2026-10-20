'use client';

import { CircleCheck, CircleX, ExternalLink, RotateCcw, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { judgeLeadsAgainAction, setLeadVerdictAction } from '@/app/(app)/leads/actions';
import { cx } from '@/lib/cx';
import { adOf, campaignOf, finalVerdict, LEAD_PLATFORM_LABEL, NOTE_LIMIT, VERDICT_LABEL } from '@/lib/leads';
import { formatInZone } from '@/lib/schedule';
import type { Lead } from '@/lib/types';
import { useToast } from '../ui/Toast';
import { LeadPlatformIcon, VerdictPill } from './LeadBits';
import styles from './leads.module.css';

/**
 * One lead: where it came from, what it counts as and why, quoting what the
 * lead said, and what it said in full. A person can set the verdict, with a
 * reason the next judgements read as an example, or take theirs back.
 */
export function LeadCard({ lead, timeZone, sample }: { lead: Lead; timeZone: string; sample: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [setting, setSetting] = useState<'qualified' | 'not_qualified' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verdict = finalVerdict(lead);
  const campaign = campaignOf(lead);
  const ad = adOf(lead);

  const save = async (next: 'qualified' | 'not_qualified' | null) => {
    setBusy(next ?? 'back');
    setError(null);
    const saved = await setLeadVerdictAction(lead.id, next, next ? note : null);
    setBusy(null);
    if (!saved.ok) return setError(saved.error);
    setSetting(null);
    setNote('');
    toast(saved.sample ? 'Saved for this session' : next ? 'Verdict saved: Claude reads your reason next time' : 'Taken back: Claude’s verdict counts again');
    router.refresh();
  };

  return (
    <article className={cx('card', styles.lead)} aria-labelledby={`lead-${lead.id}`}>
      <div className={styles.leadHead}>
        <div>
          <h3 id={`lead-${lead.id}`} className={styles.leadName}>
            {lead.name}
          </h3>
          <div className={styles.leadMeta}>
            <span>{formatInZone(lead.createdAt, timeZone)}</span>
            <span className={styles.platforms}>
              <LeadPlatformIcon platform={lead.platform} size={13} />
              {LEAD_PLATFORM_LABEL[lead.platform]}
            </span>
            <span className={styles.leadFrom}>
              {campaign.kind === 'none' ? campaign.name : ad.key === 'none' ? campaign.name : `${campaign.name} › ${ad.name}`}
            </span>
          </div>
        </div>
        <div className={styles.leadSide}>
          {lead.zohoStatus && <span className="pill pill-quiet pill-sm">Zoho: {lead.zohoStatus}</span>}
          {lead.zohoUrl && (
            <a href={lead.zohoUrl} target="_blank" rel="noreferrer" className="btn btn-quiet btn-sm">
              <ExternalLink size={14} aria-hidden />
              Open in Zoho
            </a>
          )}
        </div>
      </div>

      <div className={styles.verdictRow}>
        <VerdictPill verdict={lead.judging === 'failed' && verdict === 'waiting' ? 'failed' : verdict} />
        {lead.person ? (
          <span className={styles.verdictBy}>Set by the team{lead.ai ? ` · Claude said ${VERDICT_LABEL[lead.ai.verdict].toLowerCase()}` : ''}</span>
        ) : lead.ai ? (
          <span className={styles.verdictBy}>Claude’s verdict{lead.ai.olderCriteria ? ', on criteria since changed' : ''}</span>
        ) : lead.judging === 'failed' ? (
          <span className={styles.verdictBy}>{lead.judgeError ?? 'Claude could not judge it.'}</span>
        ) : (
          <span className={styles.verdictBy}>{sample ? 'No model judges the sample’s leads.' : 'Claude judges it within fifteen minutes.'}</span>
        )}
      </div>

      {lead.person?.note && <p className={styles.personNote}>{lead.person.note}</p>}
      {lead.ai && lead.ai.reasons.length > 0 && (
        <ul className={styles.reasons} aria-label={lead.person ? 'What Claude said' : 'Why'}>
          {lead.ai.reasons.map((r, i) => (
            <li key={i}>
              {r.text}
              {r.quote && (
                <>
                  {' '}
                  <span className={styles.quote}>“{r.quote}”</span>
                  {r.field && <span className={styles.quoteField}> ({r.field})</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {lead.answers.length > 0 && (
        <details className={styles.answers}>
          <summary>What they said ({lead.answers.length})</summary>
          <dl className={styles.answerList}>
            {lead.answers.map((a) => (
              <div key={a.field} style={{ display: 'contents' }}>
                <dt>{a.field}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {setting ? (
        <form
          className={styles.verdictForm}
          onSubmit={(e) => {
            e.preventDefault();
            void save(setting);
          }}
        >
          <label className="label" htmlFor={`why-${lead.id}`}>
            Why is it {setting === 'qualified' ? 'qualified' : 'not qualified'}? Claude reads this when it judges the next leads.
          </label>
          <textarea id={`why-${lead.id}`} className="textarea" maxLength={NOTE_LIMIT} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, and what makes it useful" />
          <div className={styles.leadActions}>
            <button type="submit" className="btn btn-primary btn-sm" aria-busy={busy === setting} disabled={busy !== null}>
              Save: {VERDICT_LABEL[setting].toLowerCase()}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSetting(null)} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.leadActions}>
          {lead.person ? (
            <button type="button" className="btn btn-ghost btn-sm" aria-busy={busy === 'back'} disabled={busy !== null} onClick={() => void save(null)}>
              <Undo2 size={14} aria-hidden />
              Take my verdict back
            </button>
          ) : (
            <>
              <span className="muted small">Your verdict:</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSetting('qualified')}>
                <CircleCheck size={14} aria-hidden />
                Qualified
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSetting('not_qualified')}>
                <CircleX size={14} aria-hidden />
                Not qualified
              </button>
            </>
          )}
          {!sample && (lead.judging === 'failed' || lead.ai?.olderCriteria) && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              aria-busy={busy === 'again'}
              disabled={busy !== null}
              onClick={async () => {
                setBusy('again');
                setError(null);
                const again = await judgeLeadsAgainAction(lead.id);
                setBusy(null);
                if (!again.ok) return setError(again.error);
                toast('Claude judges it again in a minute or two');
                router.refresh();
              }}
            >
              <RotateCcw size={14} aria-hidden />
              Judge again
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
