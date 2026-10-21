'use client';

import { CircleAlert, Film, LoaderCircle, Settings, Sparkles, Trash2, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { aiLibraryAction, askForVideoAction, priceVideoAction, writeVideoPromptAction } from '@/app/(app)/videos/actions';
import { creditsLeft, formatCredits, MAX_VIDEO_PROMPT, MIN_VIDEO_PROMPT, modelOf, qualityLabel, VIDEO_MODELS, videoTitle } from '@/lib/ai-video';
import type { VideoAspect, VideoModelKey } from '@/lib/ai-video';
import { cx } from '@/lib/cx';
import type { AiVideo, TranscriptLine, VideoBudget } from '@/lib/types';
import { aiMediaOf, withoutFile } from '@/lib/video/ai-pieces';
import type { AiStates } from '@/lib/video/ai-pieces';
import { cutawayRoom, length } from '@/lib/video/edit';
import type { VideoEdit } from '@/lib/video/edit';
import { addCutaway, CUT, cutawaySeconds, DEFAULT_EFFECTS, insertAt, keepOfSequence, moveCutaway, newId, removeCutaway, sequenceOf, shiftCutaways } from '@/lib/video/timeline';
import type { Segment } from '@/lib/video/timeline';
import { linesAround } from '@/lib/video-prompt';
import type { PromptMode } from '@/lib/video-prompt';
import { useToast } from '../ui/Toast';
import { Choices } from './EditorPanels';
import { playableUrl } from './media';
import type { Changes } from './EditorPanels';
import styles from './video.module.css';

type Price = { state: 'idle' } | { state: 'asking' } | { state: 'ready'; credits: number; balance: number | null } | { state: 'failed'; error: string };
type Made = Pick<AiVideo, 'id' | 'title' | 'seconds' | 'aspect' | 'quality'>;

const MODE_LABEL: Record<PromptMode, string> = { insert: 'Insert here', cover: 'Over the video' };
const STATUS: Partial<Record<AiVideo['status'], string>> = { asked: 'Waiting to be sent', making: 'Being made', ready: 'Ready' };

/**
 * AI video in the editor: put a video Higgsfield made, or is making, into
 * the edit at the playhead, either inserted (the piece under the playhead
 * splits, and what follows plays later) or over the video for a stretch (its
 * sound goes on under it: B-roll over a talk). From the library, or made
 * here: the prompt written by the person or drafted by Claude from what is
 * said around the playhead, priced by Higgsfield before Generate, held to the
 * month's limit, made only when the person presses Generate (rule 12).
 */
export function AiVideoPanel({
  c,
  t,
  sequenceEnd,
  shape,
  transcript,
  clipSecondAt,
  longVideoId,
  known,
  states,
  selected,
  onSelect,
  onSeek,
  onAsked,
}: {
  c: Changes;
  /** The playhead, in the edited video's seconds. */
  t: number;
  /** Where the sequence ends (before any end card): a cutaway stays inside it. */
  sequenceEnd: number;
  /** The shape asked for: the edit's, near enough. */
  shape: VideoAspect;
  /** What is said in the clip, for "Write it from what's said here". */
  transcript: readonly TranscriptLine[] | undefined;
  /** The clip's own second showing at an edited second, or null over anything else. */
  clipSecondAt: (t: number) => number | null;
  longVideoId?: string | undefined;
  /** The edit's AI videos as the server last said, by id. */
  known: ReadonlyMap<string, AiVideo> | null;
  states: AiStates;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onSeek: (t: number) => void;
  /** A video was put in: the editor follows it until it is made. */
  onAsked: (video: Made) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<PromptMode>('insert');
  const [library, setLibrary] = useState<{ videos: AiVideo[]; budget: VideoBudget; sample: boolean } | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [why, setWhy] = useState<string | null>(null);
  const [model, setModel] = useState<VideoModelKey>('seedance_2_0_mini');
  const [seconds, setSeconds] = useState(5);
  const [quality, setQuality] = useState('480p');
  const [price, setPrice] = useState<Price>({ state: 'idle' });
  const [busy, setBusy] = useState<'writing' | 'asking' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const spec = modelOf(model);
  const cutaways = c.edit.cutaways ?? [];
  const live = library?.budget.live ?? false;

  useEffect(() => {
    let alive = true;
    void aiLibraryAction().then((r) => {
      if (!alive) return;
      if (r.ok) setLibrary({ ...r.value, sample: r.sample });
      else setLibraryError(r.error);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Higgsfield's price for what is chosen, asked a moment after each change, while AI video is on.
  useEffect(() => {
    if (!live) return;
    setPrice({ state: 'asking' });
    let alive = true;
    const timer = setTimeout(() => {
      void priceVideoAction({ prompt, model, seconds, aspect: shape, quality, sound: false, picture: null }).then((r) => {
        if (alive) setPrice(r.ok ? { state: 'ready', credits: r.value.credits, balance: r.value.balance } : { state: 'failed', error: r.error });
      });
    }, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // The prompt's words do not change the price.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, model, seconds, quality, shape]);

  function pickModel(key: VideoModelKey) {
    const next = modelOf(key);
    setModel(key);
    setSeconds([...next.seconds].sort((a, b) => Math.abs(a - seconds) - Math.abs(b - seconds))[0] ?? next.seconds[0]!);
    setQuality(next.qualities.some((q) => q.key === quality) ? quality : next.qualities[0]!.key);
  }

  /**
   * The edit `from` with a video put in at the playhead, as the chosen way
   * says, or why there is no room. Inserted, it plays where it goes in and
   * the videos over the talk after it move with that talk.
   */
  function withVideo(video: Pick<Made, 'id' | 'title' | 'seconds' | 'aspect' | 'quality'>, from: VideoEdit): VideoEdit | string {
    const media = aiMediaOf(video);
    if (mode === 'insert') {
      const sequence = sequenceOf(from);
      const piece: Segment = { id: newId(), kind: 'clip', media, start: 0, end: video.seconds, speed: 1, volume: 1, effects: DEFAULT_EFFECTS, transition: CUT };
      const next = insertAt(sequence, piece, t);
      if (next.length === sequence.length) return 'Up to 40 pieces in a video: take one out first.';
      return { ...from, sequence: next, keep: keepOfSequence(next), ...(from.cutaways ? { cutaways: shiftCutaways(from.cutaways, t, video.seconds) } : {}) };
    }
    const list = from.cutaways ?? [];
    const next = addCutaway(list, { id: newId('c'), media, at: t, start: 0, end: video.seconds }, cutawayRoom(from));
    if (next.length === list.length) return 'No room for it here: another video is already over the video at the playhead, or this is the end. Move the playhead.';
    return { ...from, cutaways: next };
  }

  /** Puts a video into the edit as it is now (not as it was when it was asked for). False when there is no room. */
  function putIn(video: Made): boolean {
    setProblem(null);
    const from = c.latest();
    const next = withVideo(video, from);
    if (typeof next === 'string') {
      setProblem(next);
      return false;
    }
    c.replace(next);
    const added = (next.cutaways ?? []).find((x) => !(from.cutaways ?? []).some((y) => y.id === x.id));
    if (added) onSelect(added.id);
    onAsked(video);
    return true;
  }

  async function write() {
    setProblem(null);
    const from = clipSecondAt(t) ?? clipSecondAt(Math.max(0, t - 0.5)) ?? 0;
    const until = mode === 'cover' ? (clipSecondAt(Math.min(sequenceEnd - 0.01, t + seconds)) ?? from + seconds) : from;
    const lines = linesAround(transcript ?? [], from, Math.max(from, until));
    setBusy('writing');
    const r = await writeVideoPromptAction({ longVideoId, at: from, seconds, aspect: shape, mode, idea: prompt.trim().slice(0, 400), lines });
    setBusy(null);
    if (!r.ok) return setProblem(r.error);
    setPrompt(r.value.prompt);
    setWhy(r.value.why || null);
  }

  async function generate() {
    setProblem(null);
    const text = prompt.trim();
    if (text.length < MIN_VIDEO_PROMPT) return setProblem(`Describe the video in at least ${MIN_VIDEO_PROMPT} characters: what is seen, how it moves, the light.`);
    // Where it goes is checked before anything is spent: with no room, no credits go on it.
    const room = withVideo({ id: 'room', title: '', seconds, aspect: shape, quality }, c.latest());
    if (typeof room === 'string') return setProblem(room);
    setBusy('asking');
    const r = await askForVideoAction({ prompt: text, model, seconds, aspect: shape, quality, sound: false, picture: null });
    setBusy(null);
    if (!r.ok) return setProblem(r.error);
    const video: Made = { id: r.value.id, title: videoTitle(text), seconds, aspect: shape, quality };
    if (putIn(video)) toast('Higgsfield is making it: it plays in place once it is ready, in a minute or two');
    setLibrary((was) => (was ? { ...was, videos: [{ ...video, prompt: text, model, sound: false, picture: null, credits: price.state === 'ready' ? price.credits : 0, status: 'asked', createdAt: new Date().toISOString() }, ...was.videos] } : was));
  }

  const usable = (library?.videos ?? []).filter((v) => v.status === 'ready' || v.status === 'asked' || v.status === 'making');
  const left = library ? creditsLeft(library.budget) : null;
  const canWrite = (transcript?.length ?? 0) > 0 || prompt.trim().length > 0;

  return (
    <>
      {states.lost.length > 0 && (
        <div className={styles.section} role="alert">
          <p className={styles.sectionTitle}>
            <CircleAlert size={14} aria-hidden /> Not made
          </p>
          {states.lost.map((l) => (
            <div key={l.path} className={styles.pieceHead}>
              <span className="small">
                <strong>{l.name}</strong>: {l.why}
              </span>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  const next = withoutFile(c.edit, l.path);
                  c.replace({ ...next, keep: keepOfSequence(next.sequence ?? c.sequence) });
                }}
              >
                Take it out
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.section}>
        <Choices<PromptMode> label={`At ${length(t)}`} options={['insert', 'cover']} value={mode} name={(v) => MODE_LABEL[v]} onPick={setMode} />
        <span className="muted small">
          {mode === 'insert'
            ? 'The video plays here and what follows plays after it: the edit gets longer.'
            : 'The video plays over this stretch while the sound goes on: what is said stays, the picture changes (B-roll).'}
        </span>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>
          <Sparkles size={14} aria-hidden /> Make one
        </p>
        <label className="field">
          <span className="label">What it shows</span>
          <textarea
            className="input"
            rows={4}
            value={prompt}
            maxLength={MAX_VIDEO_PROMPT}
            placeholder="E.g. A student walks across a sunny American campus, seen from behind, golden hour."
            onChange={(e) => {
              setPrompt(e.target.value);
              setWhy(null);
            }}
          />
        </label>
        {transcript !== undefined && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null || !canWrite} aria-busy={busy === 'writing'} onClick={() => void write()}>
            <Wand2 size={14} aria-hidden />
            {busy === 'writing' ? 'Writing…' : 'Write it from what’s said here'}
          </button>
        )}
        {why && <span className="muted small">{why}</span>}
        <label className="field">
          <span className="label">Model</span>
          <select className="input" value={model} onChange={(e) => pickModel(e.target.value as VideoModelKey)}>
            {VIDEO_MODELS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}: {m.job}
              </option>
            ))}
          </select>
        </label>
        <Choices<number> label="Length" options={spec.seconds} value={seconds} name={(v) => `${v} s`} onPick={setSeconds} />
        <Choices<string> label="Quality" options={spec.qualities.map((q) => q.key)} value={quality} name={(v) => qualityLabel(model, v)} onPick={setQuality} />
        <span className="muted small">
          {shape}, the edit’s shape, silent: the edit’s own sound carries on.
        </span>
        {library && !live && (
          <p className="small" role="note">
            {library.sample ? 'The sample data makes no videos: there is no Higgsfield to ask. Put in the sample video from the library below to try it.' : 'AI video is off: Generate makes nothing until it is switched on.'}{' '}
            {!library.sample && (
              <Link href="/settings#ai-video-title" className="link">
                <Settings size={13} aria-hidden /> Settings
              </Link>
            )}
          </p>
        )}
        {live && (
          <p className="small" aria-live="polite">
            {price.state === 'asking' && (
              <>
                <LoaderCircle size={13} className="spin" aria-hidden /> Asking Higgsfield’s price…
              </>
            )}
            {price.state === 'ready' && (
              <>
                <strong>{formatCredits(price.credits)}</strong> for this video
                {left !== null ? ` · ${formatCredits(left)} left of this month’s limit` : ''}
                {price.balance !== null ? ` · ${formatCredits(price.balance)} on the plan` : ''}
              </>
            )}
            {price.state === 'failed' && price.error}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy !== null || !live || (price.state === 'ready' && left !== null && price.credits > left)}
          aria-busy={busy === 'asking'}
          onClick={() => void generate()}
        >
          <Sparkles size={14} aria-hidden />
          {busy === 'asking' ? 'Asking…' : `Generate and ${mode === 'insert' ? 'insert it' : 'put it over the video'}`}
        </button>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>
          <Film size={14} aria-hidden /> From the library
        </p>
        {!library && !libraryError && <span className="muted small">Reading the library…</span>}
        {libraryError && <span className="small">{libraryError}</span>}
        {library && usable.length === 0 && <span className="muted small">No AI videos yet: make one above, or on Video, AI video.</span>}
        {usable.map((v) => (
          <div key={v.id} className={styles.aiItem}>
            {v.url ? <video className={styles.aiThumb} src={playableUrl(v.url)} muted preload="metadata" playsInline aria-hidden /> : <span className={styles.aiThumb} aria-hidden />}
            <span className="small">
              <strong>{v.title}</strong>
              <br />
              <span className="muted">
                {v.seconds} s · {v.aspect}
                {v.aspect !== shape ? ', fitted into the frame' : ''} · {STATUS[v.status]}
              </span>
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => putIn(v) && toast(mode === 'insert' ? 'Inserted at the playhead' : 'Over the video from the playhead')}>
              {mode === 'insert' ? 'Insert' : 'Put over'}
            </button>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Over the video</p>
        {cutaways.length === 0 && <span className="muted small">Videos over a stretch of the video show here. Pick “Over the video” above, then put one in at the playhead.</span>}
        {cutaways.map((x) => {
          const id = x.media.path.startsWith('ai:') ? x.media.path.slice(3) : null;
          const state = id ? known?.get(id)?.status : undefined;
          return (
            <div key={x.id} className={cx(styles.overlayItem, selected === x.id && styles.overlayItemOn)}>
              <div className={styles.pieceHead}>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => {
                    onSelect(x.id);
                    onSeek(x.at);
                  }}
                >
                  {length(x.at)} to {length(x.at + cutawaySeconds(x))} · {x.media.name}
                </button>
                <button type="button" className="icon-btn icon-btn-plain" aria-label={`Take ${x.media.name} off the video`} onClick={() => c.set({ cutaways: removeCutaway(cutaways, x.id) })}>
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
              {states.waiting.has(x.media.path) && <span className="muted small">{state === 'asked' ? 'Waiting to be sent to Higgsfield' : 'Higgsfield is making it'}: it shows here once it is ready.</span>}
              <div className={styles.addRow}>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => c.set({ cutaways: moveCutaway(cutaways, x.id, { at: t }, sequenceEnd) })}>
                  Start at the playhead
                </button>
                <button type="button" className="btn btn-quiet btn-sm" disabled={cutawaySeconds(x) <= 1} onClick={() => c.set({ cutaways: moveCutaway(cutaways, x.id, { end: x.end - 1 }, sequenceEnd) })}>
                  1 s shorter
                </button>
                <button type="button" className="btn btn-quiet btn-sm" disabled={x.end >= (x.media.duration ?? x.end)} onClick={() => c.set({ cutaways: moveCutaway(cutaways, x.id, { end: x.end + 1 }, sequenceEnd) })}>
                  1 s longer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {problem && (
        <p className="small" role="alert">
          {problem}
        </p>
      )}
    </>
  );
}
