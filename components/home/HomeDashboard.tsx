'use client';

import { Workflow } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { RunWithStatus } from '@/lib/data';
import type { MediaSetup } from '@/lib/run-media';
import { dayKey } from '@/lib/format';
import { postsByDay, postState } from '@/lib/posts';
import type { ActivityItem, AdsSetting, Agent, Post, User } from '@/lib/types';
import { EmptyState } from '../ui/EmptyState';
import { AgentPanel } from './AgentPanel';
import { DayPanel } from './DayPanel';
import { RunCalendar } from './RunCalendar';
import { RunCard } from './RunCard';
import { StartRunCard } from './StartRunCard';
import styles from './home.module.css';

export function HomeDashboard({
  user,
  runs,
  posts,
  agents,
  now,
  nextScan,
  timeZone,
  adsSource,
  activity,
  brand,
  mediaSetup,
}: {
  user: User;
  runs: RunWithStatus[];
  posts: Post[];
  agents: Agent[];
  now: string;
  nextScan: string | null;
  timeZone: string;
  adsSource: AdsSetting;
  /** What the agents are doing now, as the top bar reads it. */
  activity: ActivityItem[];
  brand: { name: string; website: string };
  /** What the question after Start run needs to know. */
  mediaSetup: MediaSetup;
}) {
  // A day picked on the calendar: its posts and runs show under the calendar.
  const [day, setDay] = useState<string | null>(null);
  const byDay = useMemo(() => postsByDay(posts, timeZone), [posts, timeZone]);
  // Everything still to go out, soonest first (postsByDay sorts by time).
  const waiting = useMemo(() => [...byDay.values()].flat().filter((p) => postState(p) === 'waiting'), [byDay]);

  return (
    <div className={styles.home}>
      <div className={styles.mainCol}>
        <header className={styles.greeting}>
          <h1 className="display h1">Hello, {user.firstName}</h1>
          <p className="lead">Your AI marketing team is ready.</p>
        </header>

        <StartRunCard adsSource={adsSource} brand={brand} mediaSetup={mediaSetup} />

        <section className="section" aria-labelledby="recent-runs">
          <div className="section-head">
            <h2 id="recent-runs" className="display h2">
              Recent runs
            </h2>
            <Link href="/runs" className="link small">
              View all
            </Link>
          </div>
          {runs.length === 0 ? (
            <EmptyState icon={Workflow} title="No runs yet">
              Start one above, from a competitor’s website or from your own podcast, blog post or text.
            </EmptyState>
          ) : (
            <div className={styles.runList}>
              {runs.slice(0, 4).map((run) => (
                <RunCard key={run.id} run={run} />
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className={`card ${styles.sideCol}`} aria-label="Calendar and agents">
        <RunCalendar
          runDates={runs.map((r) => r.createdAt)}
          postDays={[...byDay].flatMap(([d, list]) => list.map(() => d))}
          today={now}
          selected={day}
          onSelect={setDay}
          nextScan={nextScan}
          timeZone={timeZone}
        />
        <DayPanel
          day={day}
          runs={day ? runs.filter((r) => dayKey(r.createdAt) === day) : []}
          posts={day ? (byDay.get(day) ?? []) : []}
          comingUp={waiting.slice(0, 4)}
          scheduled={waiting.length}
          timeZone={timeZone}
          onClose={() => setDay(null)}
        />
        <AgentPanel agents={agents} activity={activity} />
      </aside>
    </div>
  );
}
