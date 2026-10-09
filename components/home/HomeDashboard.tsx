'use client';

import { Workflow, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { RunWithStatus } from '@/lib/data';
import { dayKey, formatShortDate } from '@/lib/format';
import { postsByDay, postState } from '@/lib/posts';
import type { ActivityItem, AdsSetting, Agent, Post, User } from '@/lib/types';
import { PostRows } from '../posts/PostRows';
import { EmptyState } from '../ui/EmptyState';
import { AgentPanel } from './AgentPanel';
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
  nextPost,
  timeZone,
  adsSource,
  activity,
}: {
  user: User;
  runs: RunWithStatus[];
  posts: Post[];
  agents: Agent[];
  now: string;
  nextScan: string | null;
  nextPost: string | null;
  timeZone: string;
  adsSource: AdsSetting;
  /** What the agents are doing now, as the top bar reads it. */
  activity: ActivityItem[];
}) {
  const [day, setDay] = useState<string | null>(null);
  const shown = day ? runs.filter((r) => dayKey(r.createdAt) === day) : runs.slice(0, 4);
  const byDay = useMemo(() => postsByDay(posts, timeZone), [posts, timeZone]);
  // A chosen day's posts; otherwise the next few still to go out.
  const dayPosts = day ? (byDay.get(day) ?? []) : [...byDay.values()].flat().filter((p) => postState(p) === 'waiting').slice(0, 3);

  return (
    <div className={styles.home}>
      <div className={styles.mainCol}>
        <header className={styles.greeting}>
          <h1 className="display h1">Hello, {user.firstName}</h1>
          <p className="lead">Your AI marketing team is ready.</p>
        </header>

        <StartRunCard adsSource={adsSource} />

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
            day ? (
              <p className="muted small">No runs started that day.</p>
            ) : (
              <EmptyState icon={Workflow} title="No runs yet">
                Start one above, from a competitor’s website or from your own podcast, blog post or text.
              </EmptyState>
            )
          ) : (
            <div className={styles.runList}>
              {shown.map((run) => (
                <RunCard key={run.id} run={run} />
              ))}
            </div>
          )}
        </section>

        {dayPosts.length > 0 && (
          <section className="section" aria-labelledby="home-posts">
            <div className="section-head">
              <h2 id="home-posts" className="display h2">
                {day ? `Posts on ${formatShortDate(day)}` : 'Coming up'}
              </h2>
              <Link href="/posts?view=calendar" className="link small">
                Calendar
              </Link>
            </div>
            <PostRows posts={dayPosts} timeZone={timeZone} />
          </section>
        )}
      </div>

      <aside className={`card ${styles.sideCol}`} aria-label="Calendar and agents">
        <RunCalendar
          runDates={runs.map((r) => r.createdAt)}
          postDays={[...byDay].flatMap(([d, list]) => list.map(() => d))}
          today={now}
          selected={day}
          onSelect={setDay}
          nextScan={nextScan}
          nextPost={nextPost}
          timeZone={timeZone}
        />
        <AgentPanel agents={agents} activity={activity} />
      </aside>
    </div>
  );
}
