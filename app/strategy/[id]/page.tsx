import { ArrowLeft, ArrowRight, CalendarDays, CornerDownRight, ShieldCheck, Target, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StrategyStatus } from '@/components/strategy/StrategyStatus';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { getCompetitors, getStrategy } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { GOAL_LABEL, PLATFORM_LABEL } from '@/lib/platforms';
import styles from '@/components/strategy/strategy.module.css';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getStrategy((await params).id);
  return { title: s?.title ?? 'Strategy' };
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export default async function StrategyPage({ params }: Props) {
  const [s, competitors] = await Promise.all([getStrategy((await params).id), getCompetitors()]);
  if (!s) notFound();
  const competitor = (id: string) => competitors.find((c) => c.id === id);

  return (
    <div className="page">
      <Link href="/strategy" className="back">
        <ArrowLeft size={16} aria-hidden />
        Strategy
      </Link>

      <header className="page-head">
        <div>
          <h1 className="display h1">{s.title}</h1>
          <p className={styles.meta}>
            <span>
              {s.competitorIds.length ? 'From ' : ''}
              {s.competitorIds.length
                ? s.competitorIds.map((id, i) => (
                    <span key={id}>
                      {i > 0 && ', '}
                      <Link href={`/competitors/${id}`} className="link">
                        {competitor(id)?.name ?? id}
                      </Link>
                    </span>
                  ))
                : s.sourceLabel}
            </span>
            <span>
              <Target size={15} aria-hidden />
              {GOAL_LABEL[s.goal]}
            </span>
            <span>
              <CalendarDays size={15} aria-hidden />
              {formatDate(s.createdAt)}
            </span>
          </p>
        </div>
        <div className="page-actions">
          <StrategyStatus status={s.status} />
          {s.adSetId && (
            <Link href={`/content/${s.adSetId}`} className="btn btn-primary">
              Open the ads
              <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </div>
      </header>

      <section className={styles.positioning} aria-labelledby="positioning">
        <p id="positioning" className={styles.positioningLabel}>
          Positioning
        </p>
        <p className={styles.positioningText}>{s.positioning}</p>
      </section>

      <section className="section" aria-labelledby="angles">
        <h2 id="angles" className="display h2">
          Angles
        </h2>
        <div className="grid-3">
          {s.angles.map((a, i) => {
            const from = a.basedOn ? competitor(a.basedOn.competitorId) : undefined;
            return (
              <article key={a.id} className={`card ${styles.angle}`}>
                <div className={styles.angleHead}>
                  <span className={styles.letter}>{LETTERS[i]}</span>
                  <h3 className={styles.angleName}>{a.name}</h3>
                </div>
                <p className={styles.why}>{a.why}</p>
                <div className={styles.hookBox}>
                  <span className="eyebrow">Hook to test</span>
                  <p>“{a.hook}”</p>
                </div>
                {a.basedOn && (
                  <p className={styles.basedOn}>
                    <CornerDownRight size={14} aria-hidden />
                    <span>
                      Answers{' '}
                      <Link href={`/competitors/${a.basedOn.competitorId}`} className="link">
                        {from?.name ?? 'a competitor'}
                      </Link>
                      : “{a.basedOn.hook}”
                    </span>
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid-2">
        <section className="card card-pad" aria-labelledby="channels">
          <h2 id="channels" className="card-title">
            Channel plan
          </h2>
          <ul className={styles.channels}>
            {s.channels.map((c) => (
              <li key={c.platform} className={styles.channel}>
                <span className={styles.channelIcon}>
                  <PlatformIcon platform={c.platform} size={18} decorative />
                </span>
                <div className={styles.channelBody}>
                  <div className={styles.channelTop}>
                    <strong>{PLATFORM_LABEL[c.platform]}</strong>
                    <span className={styles.share}>{c.share}%</span>
                  </div>
                  <span className={styles.meter} aria-hidden>
                    <span style={{ width: `${c.share}%` }} />
                  </span>
                  <span className="muted small">
                    {c.role} · {c.format}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="muted small">Share of budget</p>
        </section>

        <div className={styles.sideStack}>
          <section className="card card-pad" aria-labelledby="audience">
            <h2 id="audience" className="card-title">
              Who it’s for
            </h2>
            <ul className={styles.list}>
              {s.audiences.map((a) => (
                <li key={a}>
                  <Users size={16} aria-hidden />
                  {a}
                </li>
              ))}
            </ul>
          </section>
          <section className="card card-pad" aria-labelledby="guardrails">
            <h2 id="guardrails" className="card-title">
              Guardrails
            </h2>
            <ul className={styles.list}>
              {s.guardrails.map((g) => (
                <li key={g}>
                  <ShieldCheck size={16} aria-hidden />
                  {g}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
