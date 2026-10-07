import { ArrowRight, Radar, WandSparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { STAGE_INFO, STAGE_ORDER } from '@/lib/pipeline';
import styles from '@/components/runs/runs.module.css';

export const metadata: Metadata = { title: 'Help & support' };

const FAQ = [
  {
    q: 'How are winning hooks picked?',
    a: 'By how long each ad has kept running. Advertisers stop paying for ads that do not work, so an ad still running after weeks is one that does.',
  },
  {
    q: 'What does a custom run skip?',
    a: 'The Competitor Tracker. A podcast, blog post, video or text has no competitor to track, so the Ad Strategist works from your content directly.',
  },
  {
    q: 'Can I change what the agents write?',
    a: 'Yes. On any set of ads, pick a variant and edit its text, headline, button and image words in place. Reset brings back what the agent wrote.',
  },
  {
    q: 'Will an ad ever promise a result?',
    a: 'No. Every strategy carries guardrails: no promised outcome, timeline or return, and processing times are always called estimates. You can add your own in Settings.',
  },
];

export default function HelpPage() {
  return (
    <div className={`page ${styles.narrow}`}>
      <header className="page-head">
        <div>
          <h1 className="display h1">Help & support</h1>
          <p className="lead">How the three agents work together.</p>
        </div>
      </header>

      <section className="card card-pad" aria-labelledby="how">
        <h2 id="how" className="card-title">
          The agents
        </h2>
        <ol className={styles.howSteps} style={{ marginTop: 16 }}>
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
      </section>

      <div className="grid-2">
        <Link href="/runs/new" className={`card card-pad ${styles.startCard}`}>
          <Radar size={22} aria-hidden />
          <strong>Competitor run</strong>
          <span className="muted small">A website, an ad link or their ads. All three agents run.</span>
          <span className="link small">
            Start one <ArrowRight size={14} aria-hidden />
          </span>
        </Link>
        <Link href="/runs/new?type=custom" className={`card card-pad ${styles.startCard}`}>
          <WandSparkles size={22} aria-hidden />
          <strong>Custom run</strong>
          <span className="muted small">A podcast, blog post, video or text. Starts at the strategy.</span>
          <span className="link small">
            Start one <ArrowRight size={14} aria-hidden />
          </span>
        </Link>
      </div>

      <section className="section" aria-labelledby="faq">
        <h2 id="faq" className="display h2">
          Questions
        </h2>
        <div className={`card ${styles.faq}`}>
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
