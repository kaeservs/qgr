import { ArrowLeft, LoaderCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdStudio } from '@/components/content/AdStudio';
import { getAdSet, getRun, getStrategy } from '@/lib/data';
import styles from '@/components/content/content.module.css';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const set = await getAdSet((await params).id);
  return { title: set ? `${set.title} · Ads` : 'Ads' };
}

export default async function AdSetPage({ params }: Props) {
  const set = await getAdSet((await params).id);
  if (!set) notFound();
  const [run, strategy] = await Promise.all([getRun(set.runId), getStrategy(set.strategyId)]);

  if (set.status === 'generating' || set.variants.length === 0) {
    return (
      <div className="page">
        <Link href="/content" className="back">
          <ArrowLeft size={16} aria-hidden />
          Content
        </Link>
        <h1 className="display h1">{set.title}</h1>
        <div className={`card ${styles.waiting}`}>
          <LoaderCircle size={28} className="spin" aria-hidden />
          <h2>The Content Agent is writing three variants</h2>
          <p className="muted">They will appear here when they are ready.</p>
          {run && (
            <Link href={`/runs/${run.id}`} className="link">
              Follow the run
            </Link>
          )}
        </div>
      </div>
    );
  }

  return <AdStudio adSet={set} strategy={strategy} platforms={run?.platforms ?? ['meta', 'linkedin', 'x']} />;
}
