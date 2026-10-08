import { Plus, Radar } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CompetitorCard } from '@/components/competitors/CompetitorCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { getCompetitors, getNow } from '@/lib/data';

export const metadata: Metadata = { title: 'Competitors' };

export default async function CompetitorsPage() {
  const [competitors, now] = await Promise.all([getCompetitors(), getNow()]);
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display h1">Competitors</h1>
          <p className="lead">What is working for them, ranked by how long it keeps running.</p>
        </div>
        <Link href="/runs/new" className="btn btn-primary">
          <Plus size={18} aria-hidden />
          Track a competitor
        </Link>
      </header>
      {competitors.length === 0 ? (
        <EmptyState icon={Radar} title="No competitors yet">
          Give the Competitor Tracker a website or an ad library link, and its report appears here.
        </EmptyState>
      ) : (
        <div className="grid-2">
          {competitors.map((c) => (
            <CompetitorCard key={c.id} competitor={c} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
