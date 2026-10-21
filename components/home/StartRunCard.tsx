'use client';

import { ArrowRight, AudioLines, FileText, LoaderCircle, Mic, Newspaper, Radar, Video, WandSparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { cx } from '@/lib/cx';
import { STAGE_INFO, STAGE_ORDER } from '@/lib/pipeline';
import { GOAL_LABEL, PLATFORM_LABEL } from '@/lib/platforms';
import { competitorInputFor, MAX_GUIDANCE, MIN_EXCERPT, MIN_NOTES, normalizeUrl } from '@/lib/run-input';
import { transcriptText } from '@/lib/transcribe';
import { GOALS, PLATFORMS } from '@/lib/types';
import type { AdsSetting, CustomSourceType, Goal, Platform, RunSource } from '@/lib/types';
import type { VideoEdit } from '@/lib/video/edit';
import { PlatformIcon } from '../ui/PlatformIcon';
import { ClipEditButton } from '../video/ClipEditButton';
import type { FrameBrandWords } from '../video/ClipEditButton';
import { ClipField } from '../video/ClipField';
import { firstDraft } from '../runs/MediaChoice';
import type { MediaDraft } from '../runs/MediaChoice';
import { RunQuestions } from '../runs/RunQuestions';
import type { RunAnswers } from '../runs/RunQuestions';
import type { MediaSetup } from '@/lib/run-media';
import { ShotsField } from './ShotsField';
import type { ShotsStatus } from './ShotsField';
import type { ClipStatus } from '../video/ClipField';
import { useClipTranscript } from '../video/useClipTranscript';
import { LinkStatus, useLinkCheck } from './LinkCheck';
import { useToast } from '../ui/Toast';
import styles from './home.module.css';

export type StartTab = 'competitor' | 'custom';

const TABS = [
  { key: 'competitor', label: 'Track competitor', icon: Radar },
  { key: 'custom', label: 'Custom run', icon: WandSparkles },
] as const;

const SOURCES = [
  { key: 'podcast', label: 'Podcast', icon: Mic, placeholder: 'Paste the episode link' },
  { key: 'blog', label: 'Blog post', icon: Newspaper, placeholder: 'Paste the blog post link' },
  { key: 'video', label: 'Video', icon: Video, placeholder: 'Paste the video link' },
  { key: 'text', label: 'Text', icon: FileText, placeholder: 'Paste the transcript or article' },
] as const;


// What a direction can say, by where the run starts: the agents read it as the team's brief.
const DIRECTION_EXAMPLE: Record<StartTab, string> = {
  competitor: 'E.g. Look at how they talk about processing times. We want hooks for families whose children are close to 21.',
  custom: 'E.g. This is our founder’s talk at the Dubai seminar. Make ads about the rural projects and lead with the family angle.',
};

/** A video from the AI video library, to start a run from as if it were uploaded. */
export interface StartFromVideo {
  url: string;
  name: string;
  title: string;
  notes: string;
}

export function StartRunCard({
  initialTab = 'competitor',
  initialUrl = '',
  adsSource = 'sample',
  fromVideo,
  shotsFor,
  brand,
  mediaSetup,
}: {
  initialTab?: StartTab;
  initialUrl?: string;
  /** Opens on screenshots of this competitor's ads. */
  shotsFor?: string | undefined;
  adsSource?: AdsSetting;
  fromVideo?: StartFromVideo | undefined;
  /** The page's name and site, drawn on the video as the editor previews it. */
  brand: FrameBrandWords;
  /** What the question after Start run needs: the team's picture switch and model, AI video's switch and credits. */
  mediaSetup: MediaSetup;
}) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [tab, setTab] = useState<StartTab>(fromVideo ? 'custom' : initialTab);
  const [url, setUrl] = useState(initialUrl);
  const [sourceType, setSourceType] = useState<CustomSourceType>(fromVideo ? 'video' : 'podcast');
  const [excerpt, setExcerpt] = useState('');
  const [title, setTitle] = useState(fromVideo?.title ?? '');
  const [platforms, setPlatforms] = useState<Platform[]>([...PLATFORMS]);
  const [goal, setGoal] = useState<Goal>('consultations');
  const [guidance, setGuidance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The run as built, while the questions after Start run are open. */
  const [asking, setAsking] = useState<RunSource | null>(null);
  // What the ads are made of, kept here so Back (or a start that fails) keeps the answer and its uploads.
  const [mediaDraft, setMediaDraft] = useState<MediaDraft>(() => firstDraft(mediaSetup));
  // A video is a link to read, or a clip uploaded from here.
  const [videoFrom, setVideoFrom] = useState<'link' | 'upload'>(fromVideo ? 'upload' : 'link');
  const [clipStatus, setClipStatus] = useState<ClipStatus>({ state: 'empty' });
  // A competitor is their website or ad link, or screenshots of their ads uploaded from here.
  const [competitorFrom, setCompetitorFrom] = useState<'link' | 'shots'>(shotsFor !== undefined ? 'shots' : 'link');
  const [competitorName, setCompetitorName] = useState(shotsFor ?? '');
  const [shots, setShots] = useState<ShotsStatus>({ paths: [], uploading: false, sample: false });
  const onShots = useCallback((status: ShotsStatus) => {
    setShots(status);
    // A screenshot added answers "add a screenshot".
    if (status.paths.length > 0 || status.uploading) setError(null);
  }, []);
  const [notes, setNotes] = useState(fromVideo?.notes ?? '');
  // The edit made before the run, for the clip uploaded now; a new clip starts without one.
  const [clipEdit, setClipEdit] = useState<{ path: string; edit: VideoEdit } | null>(null);
  const readyClip = clipStatus.state === 'ready' ? clipStatus.clip : null;
  const editFor = readyClip && clipEdit?.path === readyClip.path ? clipEdit.edit : null;
  const [transcript, hearAgain] = useClipTranscript(clipStatus);
  const heard = transcript.state === 'done' ? transcriptText(transcript.lines) : '';
  // What was said fills the notes once, if they are empty: the team reads it over before the run starts.
  useEffect(() => {
    if (heard) setNotes((n) => (n.trim() ? n : heard));
  }, [heard]);

  const source = SOURCES.find((s) => s.key === sourceType) ?? SOURCES[0];
  const clipMode = tab === 'custom' && sourceType === 'video' && videoFrom === 'upload';
  const shotsMode = tab === 'competitor' && competitorFrom === 'shots';

  // The link the run will read, if this tab reads one.
  const readsLink = (tab === 'competitor' && !shotsMode) || (tab === 'custom' && sourceType !== 'text' && !clipMode);
  const normalizedUrl = readsLink ? normalizeUrl(url) : null;
  // An ad library link is Apify's to read, so the run does not fetch it.
  const adLibrary = tab === 'competitor' && normalizedUrl !== null && competitorInputFor(normalizedUrl) === 'ad_link';
  const linkCheck = useLinkCheck(normalizedUrl, adLibrary);

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    const t = TABS[next];
    if (t) {
      setTab(t.key);
      setError(null);
      tabRefs.current[next]?.focus();
    }
  }


  /** The same rules the server applies, checked first so the person hears about them at once. */
  function buildSource(): RunSource | string {
    if (tab === 'custom' && sourceType === 'text') {
      if (excerpt.trim().length < MIN_EXCERPT) return `Paste at least ${MIN_EXCERPT} characters.`;
      return { kind: 'custom', type: 'text', excerpt: excerpt.trim() };
    }
    if (shotsMode) {
      if (!competitorName.trim()) return 'Say whose ads these are.';
      if (shots.uploading) return 'Wait for the screenshots to finish uploading.';
      if (shots.paths.length === 0) return 'Add at least one screenshot of their ads.';
      return { kind: 'competitor', input: 'upload', name: competitorName.trim(), files: shots.paths };
    }
    if (clipMode) {
      if (clipStatus.state === 'empty') return 'Add the clip first.';
      if (clipStatus.state === 'working') return 'Wait for the clip to finish uploading.';
      if (clipStatus.state === 'failed') return clipStatus.error;
      if (notes.trim().length < MIN_NOTES) return `Say what is said in the clip, in at least ${MIN_NOTES} characters: the agents can’t watch it.`;
      const clip = { ...clipStatus.clip, ...(transcript.state === 'done' ? { transcript: transcript.lines } : {}), ...(editFor ? { edit: editFor } : {}) };
      return { kind: 'custom', type: 'video', clip, notes: notes.trim() };
    }
    const normalized = normalizeUrl(url);
    if (!normalized) return tab === 'competitor' ? 'Paste a full website or ad link, like horizonvisa.com.' : 'Paste the full link.';
    if (tab === 'competitor') return { kind: 'competitor', input: competitorInputFor(normalized), url: normalized };
    return { kind: 'custom', type: sourceType === 'text' ? 'podcast' : sourceType, url: normalized };
  }

  // Start run checks the form, then asks how the run should go before anything is saved.
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const built = buildSource();
    if (typeof built === 'string') return setError(built);
    if (platforms.length === 0) return setError('Pick at least one platform.');
    setError(null);
    setAsking(built);
  }

  async function start(built: RunSource, answers: RunAnswers) {
    setBusy(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: built,
          platforms,
          goal,
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(guidance.trim() ? { guidance: guidance.trim() } : {}),
          ...(answers.pickFirst ? { pickFirst: true } : {}),
          ...(answers.media ? { media: answers.media } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) throw new Error(body?.error ?? 'The run could not be started.');
      toast('Run started');
      router.push(`/runs/${body.id}`);
    } catch (err) {
      // What went wrong is about the form (a page that can't be read, say), so it shows there.
      setAsking(null);
      setError(err instanceof Error ? err.message : 'The run could not be started.');
      setBusy(false);
    }
  }

  const togglePlatform = (p: Platform) => setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || list.includes(x))));

  const skipsTracker = tab === 'custom';

  return (
    <section className={cx('card', styles.start)} aria-label="Start a run">
      <div role="tablist" aria-label="Run type" className={styles.tabs}>
        {TABS.map(({ key, label, icon: Icon }, i) => (
          <button
            key={key}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`${id}-panel`}
            tabIndex={tab === key ? 0 : -1}
            className={cx(styles.tab, tab === key && styles.tabActive)}
            onClick={() => {
              setTab(key);
              setError(null);
            }}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            <Icon size={19} strokeWidth={1.8} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <form id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className={styles.startBody} onSubmit={onSubmit} noValidate>
        {tab === 'competitor' && (
          <div className={styles.videoFrom} role="radiogroup" aria-label="Their ads">
            {(
              [
                ['link', 'Website or ad link'],
                ['shots', 'Screenshots of their ads'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={competitorFrom === key}
                className={cx(styles.videoFromOption, competitorFrom === key && styles.videoFromOn)}
                onClick={() => {
                  setCompetitorFrom(key);
                  setError(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {tab === 'custom' && (
          <div className={styles.sourceTypes} role="radiogroup" aria-label="Source">
            {SOURCES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={sourceType === key}
                className={cx(styles.sourceType, sourceType === key && styles.sourceTypeOn)}
                onClick={() => {
                  setSourceType(key);
                  setError(null);
                }}
              >
                <Icon size={16} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === 'custom' && sourceType === 'video' && (
          <div className={styles.videoFrom} role="radiogroup" aria-label="The video">
            {(
              [
                ['link', 'Paste a link'],
                ['upload', 'Upload a clip'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={videoFrom === key}
                className={cx(styles.videoFromOption, videoFrom === key && styles.videoFromOn)}
                onClick={() => {
                  setVideoFrom(key);
                  setError(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {tab === 'custom' && sourceType === 'video' && !clipMode && (
          <p className="muted small">
            From a link, the agents read the video’s title and description (on YouTube, the whole description), not what is said in it, and the ads are pictures. For what is said,
            and ads made from the video itself, upload the clip: it is transcribed on this computer, free.
          </p>
        )}

        {shotsMode ? (
          <div className={styles.clipBlock}>
            <label className="field">
              <span className="label">Whose ads are these?</span>
              <input className="input" placeholder="E.g. Horizon Visa Partners" value={competitorName} onChange={(e) => setCompetitorName(e.target.value)} maxLength={80} autoComplete="organization" />
            </label>
            <ShotsField onStatus={onShots} />
            <p className="muted small">
              The Competitor Tracker reads each ad out of the pictures: its words, headline and button. How long an ad has run shows only when the screenshot says when it started, as Meta’s Ad Library does.
              {shots.sample && ' Sample data keeps no uploads, so the screenshots stay in this browser.'}
            </p>
            <div className={styles.clipGo}>
              <button type="submit" className={cx('btn btn-primary', styles.go)} disabled={busy || shots.uploading} aria-busy={busy || shots.uploading}>
                {busy ? 'Starting…' : shots.uploading ? 'Uploading…' : 'Start run'}
                {!busy && !shots.uploading && <ArrowRight size={17} aria-hidden />}
              </button>
            </div>
          </div>
        ) : clipMode ? (
          <div className={styles.clipBlock}>
            <ClipField onStatus={setClipStatus} initial={fromVideo ? { url: fromVideo.url, name: fromVideo.name } : undefined} />
            {clipStatus.state === 'ready' && (
              <ClipEditButton
                clip={{ ...clipStatus.clip, ...(transcript.state === 'done' ? { transcript: transcript.lines } : {}) }}
                file={clipStatus.file}
                edit={editFor}
                onEdit={(edit) => setClipEdit(edit ? { path: clipStatus.clip.path, edit } : null)}
                brand={brand}
                title={title.trim() || clipStatus.clip.name}
              />
            )}
            <label className="field">
              <span className="label">What’s said in the clip?</span>
              <textarea
                className={cx('textarea', styles.notes)}
                placeholder="The agents can’t watch video yet. In a few sentences, say what is said and shown."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={20_000}
              />
              <span className="muted small">{notes.trim().length < MIN_NOTES ? `At least ${MIN_NOTES} characters.` : 'The strategist and the Content Agent work from these notes.'}</span>
            </label>
            {transcript.state === 'loading' && (
              <p className={styles.heard} aria-live="polite">
                <LoaderCircle size={14} className="spin" aria-hidden />
                Getting the speech model ready, the first time only{transcript.share !== null ? `: ${Math.round(transcript.share * 100)}%` : '…'}
              </p>
            )}
            {transcript.state === 'working' && (
              <p className={styles.heard} aria-live="polite">
                <LoaderCircle size={14} className="spin" aria-hidden />
                Listening to the clip on this computer{transcript.share !== null ? `: ${Math.round(transcript.share * 100)}%` : '…'} You can write the notes meanwhile.
              </p>
            )}
            {transcript.state === 'done' && (
              <p className={styles.heard} aria-live="polite">
                <AudioLines size={14} aria-hidden />
                {notes.trim() === heard ? 'Filled in from what is said in the clip. Read it over: the agents work from it.' : 'What is said in the clip was heard.'}
                {notes.trim() !== heard && (
                  <button type="button" className="link small" onClick={() => setNotes(heard)}>
                    Use it instead
                  </button>
                )}
              </p>
            )}
            {transcript.state === 'failed' && (
              <p className={cx('muted small', styles.heard)}>
                {transcript.error}
                {transcript.retry && (
                  <button type="button" className="link small" onClick={hearAgain}>
                    Try again
                  </button>
                )}
              </p>
            )}
            <div className={styles.clipGo}>
              <button type="submit" className={cx('btn btn-primary', styles.go)} disabled={busy || clipStatus.state === 'working'} aria-busy={busy || clipStatus.state === 'working'}>
                {busy ? 'Starting…' : clipStatus.state === 'working' ? clipStatus.label : 'Start run'}
                {!busy && clipStatus.state !== 'working' && <ArrowRight size={17} aria-hidden />}
              </button>
            </div>
          </div>
        ) : (
        <div className={styles.inputRow}>
          {tab === 'custom' && sourceType === 'text' ? (
            <textarea className={cx('textarea', styles.excerpt)} placeholder={source.placeholder} aria-label="Text to turn into ads" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={4} />
          ) : (
            <input
              className="input"
              inputMode="url"
              autoComplete="url"
              placeholder={tab === 'competitor' ? "Paste a competitor's website or ad link" : source.placeholder}
              aria-label={tab === 'competitor' ? 'Competitor website or ad link' : `${source.label} link`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
          <button type="submit" className={cx('btn btn-primary', styles.go)} disabled={busy} aria-busy={busy}>
            {busy ? (readsLink && !adLibrary ? 'Reading the page…' : 'Starting…') : 'Start run'}
            {!busy && <ArrowRight size={17} aria-hidden />}
          </button>
        </div>
        )}

        {readsLink && (
          <LinkStatus
            check={linkCheck}
            needsText={tab === 'custom'}
            adsSource={adsSource}
            onPasteText={() => {
              setSourceType('text');
              setError(null);
            }}
          />
        )}


        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className={styles.options}>
          <label className="field">
            <span className="label">Run name (optional)</span>
            <input className="input" placeholder="E.g. Q4 consultation push" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </label>
          <div className="field">
            <span className="label" id={`${id}-platforms`}>
              Ads for
            </span>
            <div className={styles.platformPick} role="group" aria-labelledby={`${id}-platforms`}>
              {PLATFORMS.map((p) => (
                <button key={p} type="button" aria-pressed={platforms.includes(p)} className={cx(styles.platformChip, platforms.includes(p) && styles.platformChipOn)} onClick={() => togglePlatform(p)}>
                  <PlatformIcon platform={p} size={15} decorative />
                  {PLATFORM_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span className="label">Goal</span>
            <select className="select" value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
              {GOALS.map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABEL[g]}
                </option>
              ))}
            </select>
          </label>
          <label className={cx('field', styles.direction)}>
            <span className="label">Direction for the agents (optional)</span>
            <textarea
              className={cx('textarea', styles.directionBox)}
              placeholder={DIRECTION_EXAMPLE[tab]}
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              rows={2}
              maxLength={MAX_GUIDANCE}
            />
            <span className="muted small">Every agent on this run reads it: what to focus on, the hooks to try, what to leave out.</span>
          </label>
        </div>

        {asking && (
          <RunQuestions
            skipsTracker={asking.kind === 'custom'}
            media={'clip' in asking ? undefined : { setup: mediaSetup, draft: mediaDraft, setDraft: setMediaDraft }}
            busy={busy}
            busyLabel={readsLink && !adLibrary ? 'Reading the page…' : 'Starting…'}
            onStart={(answers) => void start(asking, answers)}
            onClose={() => setAsking(null)}
          />
        )}

        <ol className={styles.flow} aria-label="Agents this run uses">
          {STAGE_ORDER.map((key, i) => {
            const skipped = key === 'tracker' && skipsTracker;
            return (
              <li key={key} className={cx(styles.flowStep, skipped && styles.flowSkipped)}>
                <span className={styles.flowNum}>{i + 1}</span>
                <span>{STAGE_INFO[key].name}</span>
                {skipped && <span className="pill pill-quiet pill-sm">Skipped</span>}
              </li>
            );
          })}
        </ol>
      </form>
    </section>
  );
}
