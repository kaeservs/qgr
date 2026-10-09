import { HomeDashboard } from '@/components/home/HomeDashboard';
import { LiveRefresh } from '@/components/ui/LiveRefresh';
import { getAgents, getCurrentUser, getNextScan, getNow, getPosts, getRuns, getTeamSettings, usingSampleData } from '@/lib/data';

export default async function HomePage() {
  const [user, runs, agents, now, nextScan, posts, settings] = await Promise.all([getCurrentUser(), getRuns(), getAgents(), getNow(), getNextScan(), getPosts(), getTeamSettings()]);
  const moving = !usingSampleData() && runs.some((r) => r.status === 'queued' || r.status === 'running');
  const nextPost = posts
    .filter((p) => p.targets.some((t) => t.status === 'scheduled') && p.scheduledFor >= now)
    .map((p) => p.scheduledFor)
    .sort()[0];
  return (
    <>
      <LiveRefresh active={moving} />
      <HomeDashboard user={user} runs={runs} agents={agents} now={now} nextScan={nextScan} nextPost={nextPost ?? null} timeZone={settings.timeZone} />
    </>
  );
}
