'use client';

import { Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { approveSuggestionAction } from '@/app/(app)/leads/actions';
import { cx } from '@/lib/cx';
import type { LeadSuggestion } from '@/lib/leads';
import { useToast } from '../ui/Toast';
import styles from './leads.module.css';

/**
 * Where one ad's leads qualify more, or less, often than the rest of its
 * campaign's by more than chance would explain, worked out from the counts.
 * Nothing happens until a person approves: for a QGR variant that starts a run
 * from its words, with the counts as the agents' direction.
 */
export function Suggestions({ suggestions }: { suggestions: LeadSuggestion[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  if (suggestions.length === 0) return null;
  return (
    <section className={styles.suggestions} aria-labelledby="suggestions-title">
      <div>
        <h2 id="suggestions-title" className="card-title">
          Suggestions
        </h2>
        <p className="muted small">Where one ad’s leads qualify more, or less, often than the rest of its campaign’s by more than chance would explain. Nothing changes until you approve.</p>
      </div>
      {suggestions.map((s) => {
        const Icon = s.kind === 'more-like' ? TrendingUp : TrendingDown;
        return (
          <article key={s.id} className={cx('card', styles.suggestion, s.kind === 'rethink' && styles.suggestionRethink)}>
            <span className={styles.suggestionIcon}>
              <Icon size={18} aria-hidden />
            </span>
            <div className={styles.suggestionBody}>
              <h3 className={styles.suggestionTitle}>{s.kind === 'more-like' ? `Make more like ${s.ad}` : `Rethink ${s.ad}`}</h3>
              <p className={styles.suggestionText}>
                {s.facts.qualified} of {s.facts.judged} of its leads qualified, against {s.facts.restQualified} of {s.facts.restJudged} for the rest of {s.campaign}. A gap this size comes by chance {s.facts.p < 0.01 ? 'less than 1 time in 100' : `about ${Math.max(1, Math.round(s.facts.p * 100))} times in 100`}.
              </p>
              {s.variantId ? (
                <div className={styles.suggestionActions}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    aria-busy={busy === s.id}
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy(s.id);
                      setError(null);
                      const started = await approveSuggestionAction(s.id);
                      setBusy(null);
                      if (!started.ok) return setError({ id: s.id, text: started.error });
                      toast(started.sample ? 'Run started for this session' : 'Run started');
                      router.push(`/runs/${started.value.id}`);
                    }}
                  >
                    <Sparkles size={15} aria-hidden />
                    {s.kind === 'more-like' ? 'Approve: make more like it' : 'Approve: try a new angle'}
                  </button>
                  <span className="muted small">Starts a run from its words{s.angle ? ` (angle: ${s.angle})` : ''}, with these counts as the agents’ direction.</span>
                </div>
              ) : (
                <p className="muted small">This ad is not one of Quantum Global’s runs, so there are no words to start from: act on it in Ads Manager. Name an ad “qgr-&lt;run&gt;-&lt;variant&gt;” there to tie its leads to a run.</p>
              )}
              {error?.id === s.id && (
                <p className="error-text" role="alert">
                  {error.text}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
