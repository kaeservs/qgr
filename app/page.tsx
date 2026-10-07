import { HomeDashboard } from '@/components/home/HomeDashboard';
import { getAgents, getCurrentUser, getNextScan, getNow, getRuns } from '@/lib/data';

export default async function HomePage() {
  const [user, runs, agents, now, nextScan] = await Promise.all([getCurrentUser(), getRuns(), getAgents(), getNow(), getNextScan()]);
  return <HomeDashboard user={user} runs={runs} agents={agents} now={now} nextScan={nextScan} />;
}
