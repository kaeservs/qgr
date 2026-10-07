import type { Metadata } from 'next';
import { RunsTable } from '@/components/runs/RunsTable';
import { getRuns } from '@/lib/data';

export const metadata: Metadata = { title: 'Runs' };

export default async function RunsPage() {
  const runs = await getRuns();
  return (
    <div className="page">
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
