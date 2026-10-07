import { CalendarDays, Compass, Layers } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { StrategyStatus } from '@/components/strategy/StrategyStatus';
import { getCompetitors, getStrategies } from '@/lib/data';
import { formatShortDate } from '@/lib/format';
import styles from '@/components/strategy/strategy.module.css';

export const metadata: Metadata = { title: 'Strategy' };

export default async function StrategiesPage() {
  const [strategies, competitors] = await Promise.all([getStrategies(), getCompetitors()]);
  const nameOf = (id: string) => competitors.find((c) => c.id === id)?.name ?? id;
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display h1">Strategy</h1>
          <p className="lead">The plan behind every set of ads.</p>
        </div>
        <Link href="/runs/new?type=custom" className="btn btn-primary">
          <Compass size={18} aria-hidden />
          Custom run
        </Link>
      </header>
      <div className="grid-2">
        {strategies.map((s) => (
          <article key={s.id} className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>
                <Link href={`/strategy/${s.id}`} className={styles.stretch}>
                  {s.title}
                </Link>
              </h2>
              <StrategyStatus status={s.status} />
            </div>
            <p className={styles.cardPositioning}>{s.positioning}</p>
            <p className={styles.cardMeta}>
              <span className="pill pill-sm">{s.competitorIds.length ? s.competitorIds.map(nameOf).join(', ') : (s.sourceLabel ?? 'Custom run')}</span>
              <span>
                <Layers size={14} aria-hidden />
                {s.angles.length} angles
              </span>
              <span>
                <CalendarDays size={14} aria-hidden />
                {formatShortDate(s.createdAt)}
              </span>
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
