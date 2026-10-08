import { ArrowLeft, ArrowRight, CalendarDays, CircleCheck, ExternalLink, Target, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RetryButton } from '@/components/runs/RetryButton';
import { StageBadge } from '@/components/runs/StageBadge';
import { LiveRefresh } from '@/components/ui/LiveRefresh';
import { PlatformIcons } from '@/components/ui/PlatformIcon';
import { SourceIcon } from '@/components/ui/SourceIcon';
import { StatusPill } from '@/components/ui/StatusPill';
import { ClipPreview } from '@/components/video/ClipPreview';
import { cx } from '@/lib/cx';
import { getClipUrl, getRun, usingSampleData } from '@/lib/data';
import { formatDate, formatTime } from '@/lib/format';
import { STAGE_INFO, STAGE_ORDER } from '@/lib/pipeline';
import { GOAL_LABEL } from '@/lib/platforms';
import { SOURCE_LABEL, sourceKind } from '@/lib/sources';
import type { Run, StageKey } from '@/lib/types';
import { length } from '@/lib/video/edit';
import styles from '@/components/runs/runs.module.css';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const run = await getRun((await params).id);
  return { title: run?.title ?? 'Run' };
}

const WAITING: Record<StageKey, string> = {
  tracker: 'Waiting to scan.',
  strategist: 'Waiting for the report.',
  content: 'Waiting for the strategy.',
};

function outputLink(key: StageKey, run: Run): { href: string; label: string } | null {
  if (run.stages[key].status !== 'done') return null;
  if (key === 'tracker' && run.output.competitorId) return { href: `/competitors/${run.output.competitorId}`, label: 'Open report' };
  if (key === 'strategist' && run.output.strategyId) return { href: `/strategy/${run.output.strategyId}`, label: 'Open strategy' };
  if (key === 'content' && run.output.adSetId) return { href: `/content/${run.output.adSetId}`, label: 'Open ads' };
  return null;
}

function SourceBlock({ run, clipUrl }: { run: Run; clipUrl: string | null }) {
  const { source } = run;
  if ('clip' in source) {
    const { clip } = source;
    return (
      <>
        {clipUrl ? (
          <ClipPreview url={clipUrl} name={clip.name} />
        ) : (
          <p className={cx(styles.pageRead, styles.pageReadFailed)}>
            <TriangleAlert size={15} aria-hidden />
            <span>{usingSampleData() ? 'Sample data keeps no uploads, so this clip can’t be played here.' : 'The clip can’t be played right now. Reload to try again.'}</span>
          </p>
        )}
        <p className="muted small">
          {clip.name} · {length(clip.duration)}
          {clip.width > 0 && ` · ${clip.width}×${clip.height}`}
          {clip.size > 0 && ` · ${(clip.size / 1024 / 1024).toFixed(1)} MB`}
        </p>
        <h3 className={styles.notesTitle}>What’s said in it</h3>
        <blockquote className={styles.excerpt}>{source.notes}</blockquote>
      </>
    );
  }
  if (source.kind === 'competitor' && source.input === 'upload') {
    return (
      <ul className={styles.fileList}>
        {source.files.map((f) => (
          <li key={f} className="pill pill-quiet">
            {f}
          </li>
        ))}
      </ul>
    );
  }
  if (source.kind === 'custom' && source.type === 'text') {
    return <blockquote className={styles.excerpt}>{source.excerpt}</blockquote>;
  }
  return (
    <>
      <a href={source.url} className={cx('link', styles.sourceUrl)} target="_blank" rel="noreferrer noopener">
        {source.url}
        <ExternalLink size={14} aria-hidden />
      </a>
      {run.page && (
        <p className={cx(styles.pageRead, !run.page.ok && styles.pageReadFailed)}>
          {run.page.ok ? <CircleCheck size={15} aria-hidden /> : <TriangleAlert size={15} aria-hidden />}
          <span>
            {run.page.ok ? (
              <>
                Read <strong>{run.page.title ?? 'the page'}</strong>
                {run.page.words > 0 && ` · ${run.page.words.toLocaleString('en-GB')} words`}
              </>
            ) : (
              run.page.error
            )}
          </span>
        </p>
      )}
    </>
  );
}

export default async function RunPage({ params }: Props) {
  const run = await getRun((await params).id);
  if (!run) notFound();
  const kind = sourceKind(run.source);
  const clipUrl = 'clip' in run.source ? await getClipUrl(run.source.clip.path) : null;

  return (
    <div className="page">
      <LiveRefresh active={!usingSampleData() && (run.status === 'queued' || run.status === 'running')} />
      <Link href="/runs" className="back">
        <ArrowLeft size={16} aria-hidden />
        Runs
      </Link>

      <header className="page-head">
        <div>
          <h1 className="display h1">{run.title}</h1>
          <p className={styles.meta}>
            <span>
              <CalendarDays size={15} aria-hidden />
              {formatDate(run.createdAt)}, {formatTime(run.createdAt)}
            </span>
            <span>
              <Target size={15} aria-hidden />
              {GOAL_LABEL[run.goal]}
            </span>
            <PlatformIcons platforms={run.platforms} />
          </p>
        </div>
        <div className="page-actions">
          <StatusPill status={run.status} />
        </div>
      </header>

      {run.status === 'review' && run.output.adSetId && (
        <div className={styles.callout}>
          <span>
            <strong>Your ads are ready.</strong> Pick a variant, edit it, approve it.
          </span>
          <Link href={`/content/${run.output.adSetId}`} className="btn btn-gold">
            Review ads
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      )}

      <section className={cx('card card-pad', styles.source)} aria-labelledby="source">
        <div className={styles.sourceHead}>
          <span className={styles.rowIcon}>
            <SourceIcon kind={kind} size={18} />
          </span>
          <div>
            <h2 id="source" className="card-title">
              {SOURCE_LABEL[kind]}
            </h2>
            <p className="muted small">What this run started from</p>
          </div>
        </div>
        <SourceBlock run={run} clipUrl={clipUrl} />
      </section>

      <section className="section" aria-labelledby="agents">
        <h2 id="agents" className="display h2">
          Agents
        </h2>
        <ol className={styles.stages}>
          {STAGE_ORDER.map((key, i) => {
            const stage = run.stages[key];
            const link = outputLink(key, run);
            return (
              <li key={key} className={cx('card', styles.stage, styles[`stage-${stage.status}`])}>
                <div className={styles.stageTop}>
                  <span className={styles.stageNum}>{i + 1}</span>
                  <StageBadge status={stage.status} />
                </div>
                <h3 className={styles.stageName}>{STAGE_INFO[key].name}</h3>
                <p className={styles.stageText}>
                  {stage.status === 'skipped'
                    ? 'Skipped: a custom run has no competitor to track.'
                    : stage.status === 'failed'
                      ? stage.error
                      : (stage.summary ?? (stage.status === 'running' ? 'Working on it.' : key === 'strategist' && run.source.kind === 'custom' ? 'Waiting to start.' : WAITING[key]))}
                </p>
                {link && (
                  <Link href={link.href} className={cx('link', styles.stageLink)}>
                    {link.label}
                    <ArrowRight size={15} aria-hidden />
                  </Link>
                )}
                {stage.status === 'failed' &&
                  (run.source.kind === 'competitor' && run.source.input === 'upload' ? (
                    <Link href="/runs/new?type=upload" className="btn btn-primary btn-sm">
                      Upload again
                    </Link>
                  ) : (
                    <RetryButton source={run.source} platforms={run.platforms} goal={run.goal} title={run.title} />
                  ))}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card card-pad" aria-labelledby="activity">
        <h2 id="activity" className="card-title">
          Activity
        </h2>
        <ol className={styles.timeline}>
          {[...run.activity].reverse().map((e, i) => (
            <li key={i}>
              <time dateTime={e.at} className="muted small">
                {formatTime(e.at)}
              </time>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
