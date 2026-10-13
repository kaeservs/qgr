import { BarChart3, CalendarClock, CalendarDays, FlaskConical, List } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PostsCalendar } from '@/components/posts/PostsCalendar';
import { PostResults } from '@/components/posts/PostResults';
import { PostTests } from '@/components/posts/PostTests';
import { PostsList } from '@/components/posts/PostsList';
import { ScheduledPosts } from '@/components/posts/ScheduledPosts';
import styles from '@/components/posts/posts.module.css';
import { LiveRefresh } from '@/components/ui/LiveRefresh';
import { ScrollingNav } from '@/components/ui/ScrollingNav';
import { getNow, getPosts, getTeamSettings, usingSampleData } from '@/lib/data';
import { postState } from '@/lib/posts';
import { dayInZone, zoneLabel } from '@/lib/schedule';

export const metadata: Metadata = { title: 'Posts' };

export default async function PostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const view = params.view === 'scheduled' || params.view === 'calendar' || params.view === 'results' || params.view === 'tests' ? params.view : 'list';
  const [posts, settings, now] = await Promise.all([getPosts(), getTeamSettings(), getNow()]);
  // While one is going out, or about to, the page follows it.
  const soon = Date.now() + 2 * 60_000;
  const moving = !usingSampleData() && posts.some((p) => p.targets.some((t) => t.status === 'posting' || (t.status === 'scheduled' && Date.parse(p.scheduledFor) <= soon)));
  const scheduled = posts.filter((p) => postState(p) === 'waiting').length;
  return (
    <div className="page">
      <LiveRefresh active={moving} />
      <header className="page-head">
        <div>
          <h1 className="display h1">Posts</h1>
          <p className="lead">Approved variants sent to Facebook, Instagram and LinkedIn, and when. Times are {zoneLabel(settings.timeZone)} time.</p>
        </div>
        <ScrollingNav className={styles.views} label="Show posts as" current={view}>
          <Link href="/posts" aria-current={view === 'list' ? 'page' : undefined}>
            <List size={16} aria-hidden />
            List
          </Link>
          <Link href="/posts?view=scheduled" aria-current={view === 'scheduled' ? 'page' : undefined}>
            <CalendarClock size={16} aria-hidden />
            Scheduled{scheduled > 0 && <span className={styles.viewCount}>{scheduled}</span>}
          </Link>
          <Link href="/posts?view=calendar" aria-current={view === 'calendar' ? 'page' : undefined}>
            <CalendarDays size={16} aria-hidden />
            Calendar
          </Link>
          <Link href="/posts?view=results" aria-current={view === 'results' ? 'page' : undefined}>
            <BarChart3 size={16} aria-hidden />
            Results
          </Link>
          <Link href="/posts?view=tests" aria-current={view === 'tests' ? 'page' : undefined}>
            <FlaskConical size={16} aria-hidden />
            Tests
          </Link>
        </ScrollingNav>
      </header>
      {view === 'calendar' && <PostsCalendar posts={posts} timeZone={settings.timeZone} today={dayInZone(now, settings.timeZone)} />}
      {view === 'scheduled' && <ScheduledPosts posts={posts} timeZone={settings.timeZone} today={dayInZone(now, settings.timeZone)} />}
      {view === 'results' && <PostResults posts={posts} timeZone={settings.timeZone} />}
      {view === 'tests' && <PostTests posts={posts} timeZone={settings.timeZone} />}
      {view === 'list' && <PostsList posts={posts} timeZone={settings.timeZone} />}
    </div>
  );
}
