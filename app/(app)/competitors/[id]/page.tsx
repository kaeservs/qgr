import { ArrowLeft, ArrowRight, Clock3, ExternalLink, FlaskConical, ImagePlus, Images, Layers, Radar } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AngleBars } from '@/components/competitors/AngleBars';
import { ChooseAds } from '@/components/competitors/ChooseAds';
import { TrackedSwitch } from '@/components/competitors/TrackedSwitch';
import { Avatar } from '@/components/ui/Avatar';
import { AdSignalBadge } from '@/components/competitors/AdSignalBadge';
import { PLACE_LABEL, PlaceIcon } from '@/components/competitors/PlaceIcon';
import { PlatformIcons } from '@/components/ui/PlatformIcon';
import { bestPerformers } from '@/lib/competitor-signal';
import { getCompetitor, getNow, getStrategyForCompetitor, getTeamSettings, getVideoBudget, usingSampleData } from '@/lib/data';
import { mediaSetup } from '@/lib/run-media';
import { timeAgo } from '@/lib/format';
import styles from '@/components/competitors/competitors.module.css';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCompetitor((await params).id);
  return { title: c?.name ?? 'Competitor' };
}

const FORMAT = { video: 'Video', image: 'Image', carousel: 'Carousel', document: 'Document', text: 'Text' } as const;

export default async function CompetitorPage({ params }: Props) {
  const { id } = await params;
  const [c, now, strategy, settings, budget] = await Promise.all([getCompetitor(id), getNow(), getStrategyForCompetitor(id), getTeamSettings(), getVideoBudget()]);
  if (!c) notFound();

  // Ranked by how long they have run; one whose days are not known (a screenshot rarely shows them) comes after.
  const hooks = [...c.hooks].sort((a, b) => (b.daysRunning ?? -1) - (a.daysRunning ?? -1));
  const longest = hooks[0]?.daysRunning ?? null;
  const shots = c.dataSource === 'upload';
  const best = bestPerformers(c.examples);
  // A competitor known from screenshots has no site to scan: more screenshots, then.
  const rescan = c.domain ? `/runs/new?url=${encodeURIComponent(c.domain)}` : `/runs/new?shots=${encodeURIComponent(c.name)}`;

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
          {c.domain && <TrackedSwitch competitorId={c.id} name={c.name} tracked={c.tracked} />}
          <Link href={rescan} className="btn btn-ghost">
            {c.domain ? <Radar size={17} aria-hidden /> : <ImagePlus size={17} aria-hidden />}
            {c.domain ? 'Scan again' : 'Add screenshots'}
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
            <strong>Sample ads.</strong> This report read example ads, not this competitor’s: the tracker reads sample ads until Apify is switched on in Settings.
          </span>
        </p>
      )}

      {shots && (
        <p className={styles.sampleNote}>
          <Images size={17} aria-hidden />
          <span>
            <strong>Read from screenshots.</strong> The tracker read these ads from screenshots the team uploaded. How long an ad has run shows only where its screenshot said when it started.
          </span>
        </p>
      )}

      <dl className={styles.kpis}>
        <div className="card">
          <dt>{shots ? 'Ads read' : 'Active ads'}</dt>
          <dd>{c.activeAds}</dd>
        </div>
        <div className="card">
          <dt>Winning hooks</dt>
          <dd>{c.hooks.length}</dd>
        </div>
        <div className="card">
          <dt>Longest running</dt>
          <dd>
            {longest ?? '—'}
            {longest !== null && <span> days</span>}
          </dd>
        </div>
        <div className="card">
          <dt>Last scan</dt>
          <dd className={styles.kpiText}>{timeAgo(c.lastScanAt, now)}</dd>
        </div>
      </dl>

      <section className="section" aria-labelledby="best">
        <div className="section-head">
          <h2 id="best" className="display h2">
            Their best performers
          </h2>
          <span className="muted small">From what is public: how long each has run, how many versions they run, where it is placed and the reactions a screenshot shows</span>
        </div>
        {best.length > 0 ? (
          <ol className={`card ${styles.best}`}>
            {best.map(({ ad }, i) => (
              <li key={ad.id} className={styles.bestItem}>
                <span className={styles.hookRank}>{i + 1}</span>
                {ad.screenshot ? <img className={styles.bestArt} src={ad.screenshot} alt="" /> : <span className={styles.bestArt}><PlaceIcon place={ad.platform} size={22} decorative /></span>}
                <div className={styles.bestBody}>
                  <p className={styles.bestText}>“{ad.text.length > 160 ? `${ad.text.slice(0, 160).trimEnd()}…` : ad.text}”</p>
                  <AdSignalBadge ad={ad} />
                  {ad.url && (
                    <a className="link small" href={ad.url} target="_blank" rel="noopener noreferrer">
                      See the ad
                      <ExternalLink size={12} aria-hidden />
                      <span className="sr-only"> in Meta’s Ad Library (opens in a new tab)</span>
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="card card-pad muted">
            {shots
              ? 'Nothing here shows yet how well it is doing: a screenshot from Meta’s Ad Library shows when an ad started and how many versions run, and a post shows its reactions.'
              : 'None of their ads has run long enough, or in enough versions, to show it is working.'}
          </p>
        )}
        <p className={`muted small ${styles.bestNote}`}>Meta does not publish another advertiser’s spend, clicks or reach, so nothing here claims them. The rating is worked out from the facts beside it.</p>
      </section>

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
          <p className="muted small">
            Share of {c.activeAds} {shots ? 'ads read' : 'active ads'}
          </p>
          <AngleBars angles={c.angles} total={c.activeAds} />
        </section>
      </div>

      <section className="section" aria-labelledby="hooks">
        <div className="section-head">
          <h2 id="hooks" className="display h2">
            Winning hooks
          </h2>
          <span className="muted small">{shots ? 'Ranked by how long they’ve kept running, where a screenshot shows it' : 'Ranked by how long they’ve kept running'}</span>
        </div>
        <ol className={`card ${styles.hooks}`}>
          {hooks.map((h, i) => (
            <li key={h.id} className={styles.hook}>
              <span className={styles.hookRank}>{i + 1}</span>
              <div className={styles.hookBody}>
                <p className={styles.hookText}>“{h.text}”</p>
                <p className={styles.hookMeta}>
                  <span>
                    <PlaceIcon place={h.platform} size={14} decorative />
                    {PLACE_LABEL[h.platform]}
                  </span>
                  <span>{FORMAT[h.format]}</span>
                  <span>
                    <Layers size={13} aria-hidden />
                    {h.variations} version{h.variations === 1 ? '' : 's'}
                  </span>
                </p>
              </div>
              <div className={styles.hookDays}>
                {h.daysRunning !== null && longest ? (
                  <>
                    <span className={styles.hookDaysValue}>
                      <Clock3 size={14} aria-hidden />
                      {h.daysRunning} days
                    </span>
                    <span className={styles.meter} aria-hidden>
                      <span style={{ width: `${(h.daysRunning / longest) * 100}%` }} />
                    </span>
                  </>
                ) : (
                  <span className="muted small">{h.daysRunning === 0 ? 'Started today' : 'Days not shown'}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="their-ads">
        <div className="section-head">
          <h2 id="their-ads" className="display h2">
            Their ads
          </h2>
          {c.dataSource === 'apify' && <span className="muted small">Active in Meta’s Ad Library, read through Apify</span>}
          {shots && <span className="muted small">Each as its screenshot, with the words the tracker read from it</span>}
        </div>
        <ChooseAds competitor={c.name} reportId={c.reportId} ads={c.examples} mediaSetup={mediaSetup(settings, budget, usingSampleData())} />
      </section>
    </div>
  );
}
