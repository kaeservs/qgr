import { BarChart3, CalendarDays, List } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PostsCalendar } from '@/components/posts/PostsCalendar';
import { PostResults } from '@/components/posts/PostResults';
import { PostsList } from '@/components/posts/PostsList';
import styles from '@/components/posts/posts.module.css';
import { LiveRefresh } from '@/components/ui/LiveRefresh';
import { getNow, getPosts, getTeamSettings, usingSampleData } from '@/lib/data';
import { dayInZone, zoneLabel } from '@/lib/schedule';

export const metadata: Metadata = { title: 'Posts' };

export default async function PostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const view = params.view === 'calendar' || params.view === 'results' ? params.view : 'list';
  const [posts, settings, now] = await Promise.all([getPosts(), getTeamSettings(), getNow()]);
  // While one is going out, or about to, the page follows it.
  const soon = Date.now() + 2 * 60_000;
  const moving = !usingSampleData() && posts.some((p) => p.targets.some((t) => t.status === 'posting' || (t.status === 'scheduled' && Date.parse(p.scheduledFor) <= soon)));
  return (
    <div className="page">
      <LiveRefresh active={moving} />
      <header className="page-head">
        <div>
          <h1 className="display h1">Posts</h1>
          <p className="lead">Approved variants sent to Facebook, Instagram and LinkedIn, and when. Times are {zoneLabel(settings.timeZone)} time.</p>
        </div>
        <nav className={styles.views} aria-label="Show posts as">
          <Link href="/posts" aria-current={view === 'list' ? 'page' : undefined}>
            <List size={16} aria-hidden />
            List
          </Link>
          <Link href="/posts?view=calendar" aria-current={view === 'calendar' ? 'page' : undefined}>
            <CalendarDays size={16} aria-hidden />
            Calendar
          </Link>
          <Link href="/posts?view=results" aria-current={view === 'results' ? 'page' : undefined}>
            <BarChart3 size={16} aria-hidden />
            Results
          </Link>
        </nav>
      </header>
      {view === 'calendar' && <PostsCalendar posts={posts} timeZone={settings.timeZone} today={dayInZone(now, settings.timeZone)} />}
      {view === 'results' && <PostResults posts={posts} timeZone={settings.timeZone} />}
      {view === 'list' && <PostsList posts={posts} timeZone={settings.timeZone} />}
    </div>
  );
}
