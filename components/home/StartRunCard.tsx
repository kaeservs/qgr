'use client';

import { ArrowRight, AudioLines, FileText, LoaderCircle, Mic, Newspaper, Paperclip, Radar, Upload, Video, WandSparkles, X as Close } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { cx } from '@/lib/cx';
import { STAGE_INFO, STAGE_ORDER } from '@/lib/pipeline';
import { GOAL_LABEL, PLATFORM_LABEL } from '@/lib/platforms';
import { competitorInputFor, MAX_UPLOADS, MIN_EXCERPT, MIN_NOTES, normalizeUrl } from '@/lib/run-input';
import { transcriptText } from '@/lib/transcribe';
import { GOALS, PLATFORMS } from '@/lib/types';
import type { CustomSourceType, Goal, Platform, RunSource } from '@/lib/types';
import { PlatformIcon } from '../ui/PlatformIcon';
import { ClipField } from '../video/ClipField';
import type { ClipStatus } from '../video/ClipField';
import { useClipTranscript } from '../video/useClipTranscript';
import { LinkStatus, useLinkCheck } from './LinkCheck';
import { useToast } from '../ui/Toast';
import styles from './home.module.css';

export type StartTab = 'competitor' | 'custom' | 'upload';

const TABS = [
  { key: 'competitor', label: 'Track competitor', icon: Radar },
  { key: 'custom', label: 'Custom run', icon: WandSparkles },
  { key: 'upload', label: 'Upload ads', icon: Upload },
] as const;

const SOURCES = [
  { key: 'podcast', label: 'Podcast', icon: Mic, placeholder: 'Paste the episode link' },
  { key: 'blog', label: 'Blog post', icon: Newspaper, placeholder: 'Paste the blog post link' },
  { key: 'video', label: 'Video', icon: Video, placeholder: 'Paste the video link' },
  { key: 'text', label: 'Text', icon: FileText, placeholder: 'Paste the transcript or article' },
] as const;

const MAX_FILE_MB = 50;

export function StartRunCard({ initialTab = 'competitor', initialUrl = '' }: { initialTab?: StartTab; initialUrl?: string }) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [tab, setTab] = useState<StartTab>(initialTab);
  const [url, setUrl] = useState(initialUrl);
  const [sourceType, setSourceType] = useState<CustomSourceType>('podcast');
  const [excerpt, setExcerpt] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>([...PLATFORMS]);
  const [goal, setGoal] = useState<Goal>('consultations');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A video is a link to read, or a clip uploaded from here.
  const [videoFrom, setVideoFrom] = useState<'link' | 'upload'>('link');
  const [clipStatus, setClipStatus] = useState<ClipStatus>({ state: 'empty' });
  const [notes, setNotes] = useState('');
  const transcript = useClipTranscript(clipStatus);
  const heard = transcript.state === 'done' ? transcriptText(transcript.lines) : '';
  // What was said fills the notes once, if they are empty: the team reads it over before the run starts.
  useEffect(() => {
    if (heard) setNotes((n) => (n.trim() ? n : heard));
  }, [heard]);

  const source = SOURCES.find((s) => s.key === sourceType) ?? SOURCES[0];
  const clipMode = tab === 'custom' && sourceType === 'video' && videoFrom === 'upload';

  // The link the run will read, if this tab reads one.
  const readsLink = tab === 'competitor' || (tab === 'custom' && sourceType !== 'text' && !clipMode);
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

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = [...list];
    const tooBig = incoming.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    const wrongType = incoming.filter((f) => !f.type.startsWith('image/') && !f.type.startsWith('video/'));
    const ok = incoming.filter((f) => !tooBig.includes(f) && !wrongType.includes(f));
    const merged = [...files, ...ok].slice(0, MAX_UPLOADS);
    setFiles(merged);
    if (tooBig.length) setError(`${tooBig[0]?.name} is over ${MAX_FILE_MB} MB.`);
    else if (wrongType.length) setError('Only images and videos can be uploaded.');
    else if (files.length + ok.length > MAX_UPLOADS) setError(`Up to ${MAX_UPLOADS} ads at a time.`);
    else setError(null);
  }

  /** The same rules the server applies, checked first so the person hears about them at once. */
  function buildSource(): RunSource | string {
    if (tab === 'upload') {
      if (!competitorName.trim()) return 'Name the competitor these ads are from.';
      if (files.length === 0) return 'Add at least one ad.';
      return { kind: 'competitor', input: 'upload', name: competitorName.trim(), files: files.map((f) => f.name) };
    }
    if (tab === 'custom' && sourceType === 'text') {
      if (excerpt.trim().length < MIN_EXCERPT) return `Paste at least ${MIN_EXCERPT} characters.`;
      return { kind: 'custom', type: 'text', excerpt: excerpt.trim() };
    }
    if (clipMode) {
      if (clipStatus.state === 'empty') return 'Add the clip first.';
      if (clipStatus.state === 'working') return 'Wait for the clip to finish uploading.';
      if (clipStatus.state === 'failed') return clipStatus.error;
      if (notes.trim().length < MIN_NOTES) return `Say what is said in the clip, in at least ${MIN_NOTES} characters: the agents can’t watch it.`;
      const clip = transcript.state === 'done' ? { ...clipStatus.clip, transcript: transcript.lines } : clipStatus.clip;
      return { kind: 'custom', type: 'video', clip, notes: notes.trim() };
    }
    const normalized = normalizeUrl(url);
    if (!normalized) return tab === 'competitor' ? 'Paste a full website or ad link, like horizonvisa.com.' : 'Paste the full link.';
    if (tab === 'competitor') return { kind: 'competitor', input: competitorInputFor(normalized), url: normalized };
    return { kind: 'custom', type: sourceType === 'text' ? 'podcast' : sourceType, url: normalized };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const built = buildSource();
    if (typeof built === 'string') return setError(built);
    if (platforms.length === 0) return setError('Pick at least one platform.');
    setError(null);
    setBusy(true);
    try {
      // Uploaded files go to storage once the backend is connected; for now the run records their names.
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: built, platforms, goal, ...(title.trim() ? { title: title.trim() } : {}) }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) throw new Error(body?.error ?? 'The run could not be started.');
      toast('Run started');
      router.push(`/runs/${body.id}`);
    } catch (err) {
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

        {clipMode ? (
          <div className={styles.clipBlock}>
            <ClipField onStatus={setClipStatus} />
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
            {transcript.state === 'working' && (
              <p className={styles.heard} aria-live="polite">
                <LoaderCircle size={14} className="spin" aria-hidden />
                Listening to the clip…
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
            {transcript.state === 'failed' && <p className={cx('muted small', styles.heard)}>{transcript.error}</p>}
            <div className={styles.clipGo}>
              <button type="submit" className={cx('btn btn-primary', styles.go)} disabled={busy || clipStatus.state === 'working'}>
                {busy ? 'Starting…' : clipStatus.state === 'working' ? clipStatus.label : 'Start run'}
                {!busy && clipStatus.state !== 'working' && <ArrowRight size={17} aria-hidden />}
              </button>
            </div>
          </div>
        ) : (
        <div className={styles.inputRow}>
          {tab === 'upload' ? (
            <input className="input" placeholder="Competitor name, e.g. Atlas Residency Group" aria-label="Competitor name" value={competitorName} onChange={(e) => setCompetitorName(e.target.value)} />
          ) : tab === 'custom' && sourceType === 'text' ? (
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
          <button type="submit" className={cx('btn btn-primary', styles.go)} disabled={busy}>
            {busy ? (readsLink && !adLibrary ? 'Reading the page…' : 'Starting…') : 'Start run'}
            {!busy && <ArrowRight size={17} aria-hidden />}
          </button>
        </div>
        )}

        {readsLink && (
          <LinkStatus
            check={linkCheck}
            needsText={tab === 'custom'}
            onPasteText={() => {
              setSourceType('text');
              setError(null);
            }}
          />
        )}

        {tab === 'upload' && (
          <div
            className={cx(styles.drop, dragging && styles.dropOn)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            {files.length === 0 ? (
              <button type="button" className={styles.dropButton} onClick={() => fileInput.current?.click()}>
                <Paperclip size={18} aria-hidden />
                <span>
                  Drop their ads here, or <span className="link">browse</span>
                </span>
                <span className="muted small">Images or videos · up to {MAX_UPLOADS} · {MAX_FILE_MB} MB each</span>
              </button>
            ) : (
              <div className={styles.files}>
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="pill pill-quiet">
                    {f.name}
                    <button type="button" className={styles.removeFile} aria-label={`Remove ${f.name}`} onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}>
                      <Close size={13} aria-hidden />
                    </button>
                  </span>
                ))}
                {files.length < MAX_UPLOADS && (
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => fileInput.current?.click()}>
                    Add more
                  </button>
                )}
              </div>
            )}
          </div>
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
        </div>

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
