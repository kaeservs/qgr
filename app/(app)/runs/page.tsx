import type { Metadata } from 'next';
import { RunsTable } from '@/components/runs/RunsTable';
import { LiveRefresh } from '@/components/ui/LiveRefresh';
import { getRuns, usingSampleData } from '@/lib/data';

export const metadata: Metadata = { title: 'Runs' };

export default async function RunsPage() {
  const runs = await getRuns();
  const moving = !usingSampleData() && runs.some((r) => r.status === 'queued' || r.status === 'running');
  return (
    <div className="page">
      <LiveRefresh active={moving} />
      <header className="page-head">
        <div>
          <h1 className="display h1">Runs</h1>
          <p className="lead">Every run, and which agent it is with.</p>
        </div>
      </header>
      <RunsTable runs={runs} />
    </div>
  );
}
