import { HomeDashboard } from '@/components/home/HomeDashboard';
import { LiveRefresh } from '@/components/ui/LiveRefresh';
import { getActivity, getAgents, getCurrentUser, getFrameBrand, getNextScan, getNow, getPosts, getRuns, getTeamSettings, getVideoBudget, usingSampleData } from '@/lib/data';
import { mediaSetup } from '@/lib/run-media';

export default async function HomePage() {
  const [user, runs, agents, now, nextScan, posts, settings, activity, brand, budget] = await Promise.all([
    getCurrentUser(),
    getRuns(),
    getAgents(),
    getNow(),
    getNextScan(),
    getPosts(),
    getTeamSettings(),
    getActivity(),
    getFrameBrand(),
    getVideoBudget(),
  ]);
  const moving = !usingSampleData() && runs.some((r) => r.status === 'queued' || r.status === 'running');
  return (
    <>
      <LiveRefresh active={moving} />
      <HomeDashboard user={user} runs={runs} posts={posts} agents={agents} now={now} nextScan={nextScan} timeZone={settings.timeZone} adsSource={settings.adsSource} activity={activity} brand={brand} mediaSetup={mediaSetup(settings, budget, usingSampleData())} />
    </>
  );
}
