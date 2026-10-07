import { HomeDashboard } from '@/components/home/HomeDashboard';
import { LiveRefresh } from '@/components/ui/LiveRefresh';
import { getAgents, getCurrentUser, getNextScan, getNow, getRuns, usingSampleData } from '@/lib/data';

export default async function HomePage() {
  const [user, runs, agents, now, nextScan] = await Promise.all([getCurrentUser(), getRuns(), getAgents(), getNow(), getNextScan()]);
  const moving = !usingSampleData() && runs.some((r) => r.status === 'queued' || r.status === 'running');
  return (
    <>
      <LiveRefresh active={moving} />
      <HomeDashboard user={user} runs={runs} agents={agents} now={now} nextScan={nextScan} />
    </>
  );
}
