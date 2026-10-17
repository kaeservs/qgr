import { HomeDashboard } from '@/components/home/HomeDashboard';
import { LiveRefresh } from '@/components/ui/LiveRefresh';
import { getActivity, getAgents, getCurrentUser, getFrameBrand, getNextScan, getNow, getPosts, getRuns, getTeamSettings, usingSampleData } from '@/lib/data';

export default async function HomePage() {
  const [user, runs, agents, now, nextScan, posts, settings, activity, brand] = await Promise.all([
    getCurrentUser(),
    getRuns(),
    getAgents(),
    getNow(),
    getNextScan(),
    getPosts(),
    getTeamSettings(),
    getActivity(),
    getFrameBrand(),
  ]);
  const moving = !usingSampleData() && runs.some((r) => r.status === 'queued' || r.status === 'running');
  return (
    <>
      <LiveRefresh active={moving} />
      <HomeDashboard user={user} runs={runs} posts={posts} agents={agents} now={now} nextScan={nextScan} timeZone={settings.timeZone} adsSource={settings.adsSource} activity={activity} brand={brand} />
    </>
  );
}
