import { ArrowLeft, ArrowRight, Clock3, ExternalLink, FlaskConical, Layers, Radar } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdThumb } from '@/components/competitors/AdThumb';
import { AngleBars } from '@/components/competitors/AngleBars';
import { Avatar } from '@/components/ui/Avatar';
import { PlatformIcon, PlatformIcons } from '@/components/ui/PlatformIcon';
import { getCompetitor, getNow, getStrategyForCompetitor } from '@/lib/data';
import { timeAgo } from '@/lib/format';
import { PLATFORM_LABEL } from '@/lib/platforms';
import styles from '@/components/competitors/competitors.module.css';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCompetitor((await params).id);
  return { title: c?.name ?? 'Competitor' };
}

const FORMAT = { video: 'Video', image: 'Image', carousel: 'Carousel', document: 'Document', text: 'Text' } as const;

export default async function CompetitorPage({ params }: Props) {
  const { id } = await params;
  const [c, now, strategy] = await Promise.all([getCompetitor(id), getNow(), getStrategyForCompetitor(id)]);
  if (!c) notFound();

  const hooks = [...c.hooks].sort((a, b) => b.daysRunning - a.daysRunning);
  const longest = hooks[0]?.daysRunning ?? 0;
  // A competitor known only from uploaded ads has no site to scan: upload again instead.
  const rescan = c.domain ? `/runs/new?url=${encodeURIComponent(c.domain)}` : '/runs/new?type=upload';

  return (
    <div className="page">
      <Link href="/competitors" className="back">
        <ArrowLeft size={16} aria-hidden />
        Competitors
      </Link>

      <header className="page-head">
        <div>
          <div className={styles.reportHead}>
            <Avatar name={c.name} size={56} />
            <div>
              <h1 className="display h1">{c.name}</h1>
              <p className={styles.reportMeta}>
                {c.domain && (
                  <a href={`https://${c.domain}`} target="_blank" rel="noreferrer noopener" className="link">
                    {c.domain}
                    <ExternalLink size={13} aria-hidden />
                  </a>
                )}
                <PlatformIcons platforms={c.platforms} />
              </p>
            </div>
          </div>
        </div>
        <div className="page-actions">
          <Link href={rescan} className="btn btn-ghost">
            <Radar size={17} aria-hidden />
            Scan again
          </Link>
          {strategy ? (
            <Link href={`/strategy/${strategy.id}`} className="btn btn-primary">
              View strategy
              <ArrowRight size={16} aria-hidden />
            </Link>
          ) : (
            <Link href={rescan} className="btn btn-primary">
              Build a strategy
              <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </div>
      </header>

      {c.dataSource === 'placeholder' && (
        <p className={styles.sampleNote}>
          <FlaskConical size={17} aria-hidden />
          <span>
            <strong>Sample ads.</strong> Apify isn’t connected yet, so this report reads example ads, not this competitor’s.
          </span>
        </p>
      )}

      <dl className={styles.kpis}>
        <div className="card">
          <dt>Active ads</dt>
          <dd>{c.activeAds}</dd>
        </div>
        <div className="card">
          <dt>Winning hooks</dt>
          <dd>{c.hooks.length}</dd>
        </div>
        <div className="card">
          <dt>Longest running</dt>
          <dd>
            {longest}
            <span> days</span>
          </dd>
        </div>
        <div className="card">
          <dt>Last scan</dt>
          <dd className={styles.kpiText}>{timeAgo(c.lastScanAt, now)}</dd>
        </div>
      </dl>

      <div className={styles.reportGrid}>
        <section className="card card-pad" aria-labelledby="working">
          <h2 id="working" className="card-title">
            What’s working
          </h2>
          <ol className={styles.insights}>
            {c.insights.map((text, i) => (
              <li key={i}>
                <span className={styles.insightNum}>{i + 1}</span>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="card card-pad" aria-labelledby="angles">
          <h2 id="angles" className="card-title">
            Angles in their ads
          </h2>
          <p className="muted small">Share of {c.activeAds} active ads</p>
          <AngleBars angles={c.angles} total={c.activeAds} />
        </section>
      </div>

      <section className="section" aria-labelledby="hooks">
        <div className="section-head">
          <h2 id="hooks" className="display h2">
            Winning hooks
          </h2>
          <span className="muted small">Ranked by how long they’ve kept running</span>
        </div>
        <ol className={`card ${styles.hooks}`}>
          {hooks.map((h, i) => (
            <li key={h.id} className={styles.hook}>
              <span className={styles.hookRank}>{i + 1}</span>
              <div className={styles.hookBody}>
                <p className={styles.hookText}>“{h.text}”</p>
                <p className={styles.hookMeta}>
                  <span>
                    <PlatformIcon platform={h.platform} size={14} decorative />
                    {PLATFORM_LABEL[h.platform]}
                  </span>
                  <span>{FORMAT[h.format]}</span>
                  <span>
                    <Layers size={13} aria-hidden />
                    {h.variations} version{h.variations === 1 ? '' : 's'}
                  </span>
                </p>
              </div>
              <div className={styles.hookDays}>
                <span className={styles.hookDaysValue}>
                  <Clock3 size={14} aria-hidden />
                  {h.daysRunning} days
                </span>
                <span className={styles.meter} aria-hidden>
                  <span style={{ width: `${(h.daysRunning / longest) * 100}%` }} />
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="their-ads">
        <h2 id="their-ads" className="display h2">
          Their ads
        </h2>
        <div className={styles.gallery}>
          {c.examples.map((ad) => (
            <AdThumb key={ad.id} ad={ad} />
          ))}
        </div>
      </section>
    </div>
  );
}
