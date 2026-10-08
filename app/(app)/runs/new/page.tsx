import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { StartRunCard } from '@/components/home/StartRunCard';
import type { StartTab } from '@/components/home/StartRunCard';
import { STAGE_INFO, STAGE_ORDER } from '@/lib/pipeline';
import styles from '@/components/runs/runs.module.css';

export const metadata: Metadata = { title: 'New run' };

const TABS: readonly StartTab[] = ['competitor', 'custom', 'upload'];

export default async function NewRunPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const type = typeof params.type === 'string' && (TABS as readonly string[]).includes(params.type) ? (params.type as StartTab) : 'competitor';
  const url = typeof params.url === 'string' ? params.url : '';

  return (
    <div className={`page ${styles.narrow}`}>
      <Link href="/runs" className="back">
        <ArrowLeft size={16} aria-hidden />
        Runs
      </Link>
      <header className="page-head">
        <div>
          <h1 className="display h1">New run</h1>
          <p className="lead">Start from a competitor, or from your own content.</p>
        </div>
      </header>
      <StartRunCard initialTab={type} initialUrl={url} />
      <section className={`card card-pad ${styles.howItWorks}`} aria-labelledby="how">
        <h2 id="how" className="card-title">
          How a run works
        </h2>
        <ol className={styles.howSteps}>
          {STAGE_ORDER.map((key, i) => (
            <li key={key}>
              <span className={styles.howNum}>{i + 1}</span>
              <span>
                <strong>{STAGE_INFO[key].name}</strong>
                <span className="muted small">{STAGE_INFO[key].job}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="muted small">A custom run (podcast, blog post, video or text) has no competitor, so it starts at step 2.</p>
      </section>
    </div>
  );
}
