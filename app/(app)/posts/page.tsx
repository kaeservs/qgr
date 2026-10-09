import type { Metadata } from 'next';
import { PostsList } from '@/components/posts/PostsList';
import { LiveRefresh } from '@/components/ui/LiveRefresh';
import { getPosts, getTeamSettings, usingSampleData } from '@/lib/data';
import { zoneLabel } from '@/lib/schedule';

export const metadata: Metadata = { title: 'Posts' };

export default async function PostsPage() {
  const [posts, settings] = await Promise.all([getPosts(), getTeamSettings()]);
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
      </header>
      <PostsList posts={posts} timeZone={settings.timeZone} />
    </div>
  );
}
