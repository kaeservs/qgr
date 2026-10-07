'use client';

import { Workflow, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { RunWithStatus } from '@/lib/data';
import { dayKey, formatShortDate } from '@/lib/format';
import type { Agent, User } from '@/lib/types';
import { EmptyState } from '../ui/EmptyState';
import { AgentPanel } from './AgentPanel';
import { RunCalendar } from './RunCalendar';
import { RunCard } from './RunCard';
import { StartRunCard } from './StartRunCard';
import styles from './home.module.css';

export function HomeDashboard({ user, runs, agents, now, nextScan }: { user: User; runs: RunWithStatus[]; agents: Agent[]; now: string; nextScan: string | null }) {
  const [day, setDay] = useState<string | null>(null);
  const shown = day ? runs.filter((r) => dayKey(r.createdAt) === day) : runs.slice(0, 4);

  return (
    <div className={styles.home}>
      <div className={styles.mainCol}>
        <header className={styles.greeting}>
          <h1 className="display h1">Hello, {user.firstName}</h1>
          <p className="lead">Your AI marketing team is ready.</p>
        </header>

        <StartRunCard />

        <section className="section" aria-labelledby="recent-runs">
          <div className="section-head">
            <h2 id="recent-runs" className="display h2">
              {day ? `Runs on ${formatShortDate(day)}` : 'Recent runs'}
            </h2>
            {day ? (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDay(null)}>
                <X size={15} aria-hidden />
                Show all
              </button>
            ) : (
              <Link href="/runs" className="link small">
                View all
              </Link>
            )}
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={Workflow} title="No runs yet">
              Start one above, from a competitor’s website or from your own podcast, blog post or text.
            </EmptyState>
          ) : (
            <div className={styles.runList}>
              {shown.map((run) => (
                <RunCard key={run.id} run={run} />
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className={`card ${styles.sideCol}`} aria-label="Calendar and agents">
        <RunCalendar runDates={runs.map((r) => r.createdAt)} today={now} selected={day} onSelect={setDay} nextScan={nextScan} />
        <AgentPanel agents={agents} />
      </aside>
    </div>
  );
}
