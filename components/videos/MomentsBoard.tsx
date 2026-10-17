'use client';

import { ArrowRight, Check, ChevronLeft, Clapperboard, ChevronRight, FileVideo, Pause, Play, Plus, RotateCcw, Scissors, Search, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { askMomentsAgainAction, recordMomentRunAction, removeLongVideoAction } from '@/app/(app)/videos/actions';
import { cx } from '@/lib/cx';
import { clipTranscript, clock, MAX_MOMENT_SECONDS, MIN_MOMENT_SECONDS, momentOf, momentSeconds, momentText, nudge, sameFile } from '@/lib/long-video';
import { GOAL_LABEL, PLATFORM_LABEL } from '@/lib/platforms';
import { GOALS, PLATFORMS } from '@/lib/types';
import type { Clip, Goal, LongVideoWithTranscript, Moment, Platform } from '@/lib/types';
import { frameSize } from '@/lib/video/edit';
import type { VideoEdit } from '@/lib/video/edit';
import { VideoEditor } from '../video/VideoEditor';
import { keepLocalFile, localFile } from '@/lib/video/local-files';
import { LiveRefresh } from '../ui/LiveRefresh';
import { useToast } from '../ui/Toast';
import styles from './videos.module.css';

/** Room under Storage's 50 MB a clip: a file never comes out exactly the size it was aimed at. */
const AIM_BYTES = 45 * 1024 * 1024;
const MAX_CLIP_BYTES = 50 * 1024 * 1024;

const key = (m: Pick<Moment, 'first' | 'last'>) => `${m.first}-${m.last}`;

type Making = { key: string; label: string } | null;

/** A moment cut into its own clip on this computer: kept for the editor and for Make ads, so it is cut once. */
interface Cut {
  blob: Blob;
  clip: Omit<Clip, 'path'>;
  extension: string;
}

/**
 * A long video's moments: what the agent picked (and the team's own), each to
 * watch, nudge a line at either end and tick. The ticked ones are cut from the
 * file on this computer, uploaded as clips and started as runs, one by one;
 * each run is kept on its moment. The file is never uploaded whole.
 */
export function MomentsBoard({ video, brand }: { video: LongVideoWithTranscript; brand: { name: string; website: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [moments, setMoments] = useState<Moment[]>(video.moments);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [platforms, setPlatforms] = useState<Platform[]>(['meta', 'linkedin']);
  const [goal, setGoal] = useState<Goal>('consultations');
  const [making, setMaking] = useState<Making>(null);
  // Each moment's clip once cut, and the edit made to it before its run, by the moment's lines.
  const cuts = useRef(new Map<string, Cut>());
  const [edits, setEdits] = useState<Map<string, VideoEdit>>(new Map());
  const [editing, setEditing] = useState<{ key: string; clip: Clip; url: string } | null>(null);
  const [made, setMade] = useState<{ title: string; runId: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'again' | 'remove' | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [own, setOwn] = useState<{ first: number | null; last: number | null }>({ first: null, last: null });
  const player = useRef<HTMLVideoElement>(null);
  const until = useRef<number | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // The moments the server knows, and the team's own added here and not yet made into ads.
  useEffect(() => {
    setMoments((mine) => [...video.moments, ...mine.filter((m) => m.source === 'team' && m.runIds.length === 0 && !video.moments.some((v) => key(v) === key(m)))]);
  }, [video.moments]);

  // The file picked on the page before, if this tab still has it.
  useEffect(() => {
    const kept = localFile(video.id);
    if (kept) setFile(kept);
  }, [video.id]);
  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function pickAgain(f: File | undefined) {
    if (!f) return;
    setFileError(null);
    try {
      const { probeLong } = await import('@/lib/speech-long');
      const info = await probeLong(f);
      if (!sameFile(video.file, info)) return setFileError(`That isn’t the same video: this one is ${clock(info.duration)}, the one heard was ${clock(video.file.duration)}. Pick ${video.file.name}.`);
      keepLocalFile(video.id, f);
      setFile(f);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'That file can’t be read as a video.');
    }
  }

  function play(m: Moment) {
    const v = player.current;
    if (!v) return;
    if (playing === key(m) && !v.paused) {
      v.pause();
      return;
    }
    until.current = m.end;
    v.currentTime = m.start;
    void v.play();
    setPlaying(key(m));
    v.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function seek(seconds: number) {
    const v = player.current;
    if (!v) return;
    until.current = null;
    setPlaying(null);
    v.currentTime = seconds;
  }

  function change(m: Moment, next: Moment) {
    if (next === m) return;
    setMoments((list) => list.map((x) => (x === m ? next : x)));
    setPicked((set) => {
      if (!set.has(key(m))) return set;
      const copy = new Set(set);
      copy.delete(key(m));
      copy.add(key(next));
      return copy;
    });
  }

  function toggle(m: Moment) {
    setPicked((set) => {
      const copy = new Set(set);
      if (copy.has(key(m))) copy.delete(key(m));
      else copy.add(key(m));
      return copy;
    });
  }

  function addOwn() {
    if (own.first === null || own.last === null) return;
    const [a, b] = own.first <= own.last ? [own.first, own.last] : [own.last, own.first];
    const m = momentOf(video.transcript, a, b);
    if (!m) return;
    if (momentSeconds(m) > MAX_MOMENT_SECONDS) return setError('Keep a moment to two and a half minutes or less: it becomes an ad.');
    if (moments.some((x) => key(x) === key(m))) return setError('That moment is already in the list.');
    setError(null);
    setMoments((list) => [...list, m]);
    setPicked((set) => new Set(set).add(key(m)));
    setOwn({ first: null, last: null });
  }

  /** One moment cut from the file, uploaded as a clip and started as a run. */
  /** The moment cut into a clip of its own on this computer, once: the editor and Make ads share it. */
  async function cutOf(m: Moment, label: (what: string) => void): Promise<Cut> {
    const known = cuts.current.get(key(m));
    if (known) return known;
    if (!file) throw new Error('Pick the video first.');
    label('cutting 0%');
    const { bitrateToFit, probeClip, render } = await import('@/lib/video/render');
    const info = await probeClip(file);
    if (!info.canDecode) throw new Error('This browser can’t cut this video’s format. Try Chrome or Edge.');
    const size = frameSize({ aspect: 'original', fit: 'fill' }, { width: info.width, height: info.height }, 1920);
    const seconds = momentSeconds(m);
    let bitrate = bitrateToFit(size, Math.min(30, info.frameRate || 30), seconds, AIM_BYTES, info.hasAudio);
    const cut = () =>
      render({
        source: file,
        keep: [{ start: m.start, end: m.end }],
        tail: 0,
        size,
        bitrate,
        volume: 1,
        draw: (ctx, picture) => {
          if (picture) ctx.drawImage(picture.image, 0, 0, size.width, size.height);
        },
        onProgress: (share) => label(`cutting ${Math.round(share * 100)}%`),
      });
    let made = await cut();
    if (made.blob.size > MAX_CLIP_BYTES) {
      bitrate = Math.round(bitrate * 0.75 * (AIM_BYTES / made.blob.size));
      made = await cut();
    }
    if (made.blob.size > MAX_CLIP_BYTES) throw new Error('Even made smaller, this moment is over 50 MB. Make it shorter.');
    const piece: Cut = {
      blob: made.blob,
      extension: made.target.extension,
      clip: { name: `${video.title} · ${m.title}.${made.target.extension}`, duration: seconds, width: size.width, height: size.height, size: made.blob.size, transcript: clipTranscript(video.transcript, m.first, m.last) },
    };
    cuts.current.set(key(m), piece);
    return piece;
  }

  /** Opens the editor on a moment's clip, cutting it first: the edit goes with the clip into its run. */
  async function editMoment(m: Moment) {
    if (!file) return setError('Pick the video first: the clips are cut from it on this computer.');
    setError(null);
    try {
      const cut = await cutOf(m, (what) => setMaking({ key: key(m), label: `${m.title}: ${what}` }));
      const edit = edits.get(key(m));
      setEditing({ key: key(m), clip: { path: '', ...cut.clip, ...(edit ? { edit } : {}) }, url: URL.createObjectURL(cut.blob) });
    } catch (err) {
      setError(`${m.title}: ${err instanceof Error ? err.message : 'the clip could not be made.'}`);
    } finally {
      setMaking(null);
    }
  }

  async function makeOne(m: Moment): Promise<string> {
    const label = (what: string) => setMaking({ key: key(m), label: `${m.title}: ${what}` });
    const cut = await cutOf(m, label);
    const edit = edits.get(key(m));

    label('uploading 0%');
    const { uploadClip } = await import('@/lib/video/upload');
    const up = await uploadClip(cut.blob, (share) => label(`uploading ${Math.round(share * 100)}%`));

    label('starting the run');
    const words = momentText(video.transcript, m.first, m.last);
    const notes = `From the long video “${video.title}”, ${clock(m.start)} to ${clock(m.end)}. What is said: ${words}`.slice(0, 20_000);
    const direction = [video.guidance, `This clip is the moment “${m.title}” from a longer video.${m.hook ? ` A hook to try: ${m.hook}` : ''}`].filter(Boolean).join('\n\n').slice(0, 2000);
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: {
          kind: 'custom',
          type: 'video',
          clip: { path: up.path, ...cut.clip, ...(edit ? { edit } : {}) },
          notes,
        },
        platforms,
        goal,
        title: m.title,
        guidance: direction,
      }),
    });
    const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!res.ok || !body?.id) throw new Error(body?.error ?? 'The run could not be started.');
    const kept = await recordMomentRunAction(video.id, m.first, m.last, m.title, body.id);
    if (!kept.ok) console.error('Keeping the run on its moment failed', kept.error);
    return body.id;
  }

  async function makeAds() {
    const chosen = moments.filter((m) => picked.has(key(m)));
    if (chosen.length === 0) return setError('Tick the moments to make ads from.');
    if (platforms.length === 0) return setError('Pick at least one platform.');
    if (!file) return setError('Pick the video first: the clips are cut from it on this computer.');
    setError(null);
    const done: { title: string; runId: string }[] = [];
    for (const m of chosen) {
      try {
        const runId = await makeOne(m);
        done.push({ title: m.title, runId });
        setMade((list) => [...list, { title: m.title, runId }]);
        setPicked((set) => {
          const copy = new Set(set);
          copy.delete(key(m));
          return copy;
        });
      } catch (err) {
        setError(`${m.title}: ${err instanceof Error ? err.message : 'the clip could not be made.'}`);
        break;
      }
    }
    setMaking(null);
    if (done.length > 0) {
      toast(done.length === 1 ? 'Run started' : `${done.length} runs started`);
      router.refresh();
    }
  }

  async function again() {
    setBusy('again');
    const saved = await askMomentsAgainAction(video.id);
    setBusy(null);
    if (!saved.ok) return setError(saved.error);
    toast(saved.sample ? 'Picked again for this session' : 'Asked for the moments again');
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Take “${video.title}” out of the list? Its runs stay.`)) return;
    setBusy('remove');
    const saved = await removeLongVideoAction(video.id);
    setBusy(null);
    if (!saved.ok) return setError(saved.error);
    router.push('/videos');
  }

  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    return video.transcript.map((l, i) => ({ ...l, i })).filter((l) => !q || l.text.toLowerCase().includes(q));
  }, [search, video.transcript]);
  const ownMoment = own.first !== null && own.last !== null ? momentOf(video.transcript, Math.min(own.first, own.last), Math.max(own.first, own.last)) : null;
  const waiting = video.status === 'waiting' || video.status === 'working';

  return (
    <div className={styles.board}>
      <LiveRefresh active={waiting} />
      <section className={cx('card card-pad', styles.playerCard)} aria-label="The video">
        {url ? (
          // The file on this computer: nothing is streamed from anywhere.
          <video
            ref={player}
            className={styles.player}
            src={url}
            controls
            playsInline
            preload="metadata"
            onTimeUpdate={(e) => {
              if (until.current !== null && e.currentTarget.currentTime >= until.current) {
                e.currentTarget.pause();
                until.current = null;
                setPlaying(null);
              }
            }}
            onPause={() => setPlaying(null)}
          />
        ) : video.example ? (
          <div className={styles.pickAgain}>
            <FileVideo size={26} aria-hidden />
            <p>
              <strong>An example with no file.</strong> Its transcript shows how moments look; to watch and cut them, start a long video of your own on the Video page.
            </p>
            <Link href="/videos" className="btn btn-primary btn-sm">
              Start one
            </Link>
          </div>
        ) : (
          <div className={styles.pickAgain}>
            <FileVideo size={26} aria-hidden />
            <p>
              <strong>Pick {video.file.name} again</strong> to watch the moments and cut them. It was never uploaded, so it is read from this computer.
            </p>
            <input
              ref={picker}
              type="file"
              accept="video/*,audio/*"
              hidden
              onChange={(e) => {
                void pickAgain(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => picker.current?.click()}>
              Pick the file
            </button>
            {fileError && (
              <p className="error-text" role="alert">
                {fileError}
              </p>
            )}
          </div>
        )}
        <p className="muted small">
          {video.file.name} · {clock(video.file.duration)} · {video.lines.toLocaleString('en-US')} lines heard
          {video.guidance ? ` · Direction: ${video.guidance}` : ''}
        </p>
      </section>

      <section className={styles.moments} aria-labelledby="moments-title">
        <div className={styles.momentsHead}>
          <h2 id="moments-title" className="card-title">
            Moments
          </h2>
          {(video.status === 'done' || video.status === 'failed') && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void again()} disabled={busy !== null} aria-busy={busy === 'again'}>
              <RotateCcw size={15} aria-hidden />
              {video.status === 'failed' ? 'Try again' : 'Pick again'}
            </button>
          )}
        </div>
        {video.sample && <p className="muted small">Sample data: these moments were picked by their place in the video, not by the agent.</p>}
        {waiting && (
          <p className={styles.notice} role="status">
            {video.status === 'working' ? 'The agent is reading the transcript for the moments worth an ad…' : 'Waiting for the agent to read the transcript…'} This takes a minute or two; the page updates by
            itself.
          </p>
        )}
        {video.status === 'failed' && (
          <p className="error-text" role="alert">
            {video.error ?? 'The moments could not be found.'}
          </p>
        )}

        {moments.map((m) => {
          const k = key(m);
          const length = momentSeconds(m);
          return (
            <article key={k} className={cx('card', styles.moment, picked.has(k) && styles.momentOn)}>
              <label className={styles.momentTick}>
                <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(m)} disabled={making !== null} />
                <span className="sr-only">Make an ad from {m.title}</span>
              </label>
              <div className={styles.momentBody}>
                <div className={styles.momentTop}>
                  <h3 className={styles.momentTitle}>{m.title}</h3>
                  {m.source === 'team' && <span className="pill pill-quiet pill-sm">Yours</span>}
                </div>
                <p className="muted small">
                  {clock(m.start)} to {clock(m.end)} · {Math.round(length)} s
                  {length < MIN_MOMENT_SECONDS ? ' · very short' : ''}
                </p>
                {m.why && <p className={styles.momentWhy}>{m.why}</p>}
                {m.hook && (
                  <p className={styles.momentHook}>
                    <span className="muted small">Hook:</span> {m.hook}
                  </p>
                )}
                {m.warnings.length > 0 && (
                  <p className={styles.momentWarn}>
                    <TriangleAlert size={14} aria-hidden /> {m.warnings.join('; ')}
                  </p>
                )}
                <blockquote className={styles.momentQuote}>{momentText(video.transcript, m.first, m.last)}</blockquote>
                <div className={styles.momentActions}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => play(m)} disabled={!url}>
                    {playing === k ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
                    {playing === k ? 'Pause' : 'Play'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void editMoment(m)} disabled={!url || making !== null} aria-busy={making?.key === k && !making.label.includes('upload')}>
                    <Clapperboard size={15} aria-hidden />
                    {edits.has(k) ? 'Edited · change' : 'Edit video'}
                  </button>
                  <span className={styles.nudges} aria-label="Move the start or the end by a line">
                    Start
                    <button type="button" className="icon-btn" aria-label="Start a line earlier" onClick={() => change(m, nudge(video.transcript, m, 'start', -1))}>
                      <ChevronLeft size={15} aria-hidden />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Start a line later" onClick={() => change(m, nudge(video.transcript, m, 'start', 1))}>
                      <ChevronRight size={15} aria-hidden />
                    </button>
                    End
                    <button type="button" className="icon-btn" aria-label="End a line earlier" onClick={() => change(m, nudge(video.transcript, m, 'end', -1))}>
                      <ChevronLeft size={15} aria-hidden />
                    </button>
                    <button type="button" className="icon-btn" aria-label="End a line later" onClick={() => change(m, nudge(video.transcript, m, 'end', 1))}>
                      <ChevronRight size={15} aria-hidden />
                    </button>
                  </span>
                  {m.runIds.length > 0 && (
                    <span className={styles.madeFrom}>
                      <Check size={14} aria-hidden /> Ads made:{' '}
                      {m.runIds.map((id, i) => (
                        <Link key={id} href={`/runs/${id}`} className="link small">
                          run {i + 1}
                        </Link>
                      ))}
                    </span>
                  )}
                </div>
                {making?.key === k && (
                  <p className={styles.notice} role="status">
                    {making.label}
                  </p>
                )}
              </div>
            </article>
          );
        })}
        {moments.length === 0 && !waiting && video.status !== 'failed' && <p className="muted">No moments yet. Pick your own from the transcript.</p>}
      </section>

      <aside className={cx('card card-pad', styles.makePanel)} aria-labelledby="make-ads-title">
        <h2 id="make-ads-title" className="card-title">
          Make ads
        </h2>
        <p className="muted small">Each ticked moment is cut on this computer, uploaded as a clip and started as a run: the agents write a strategy and three ads over it, and the studio edits it.</p>
        <fieldset className={styles.fieldsetPlain}>
          <legend className="label">Ads for</legend>
          <div className={styles.segmented}>
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                className={cx(styles.segment, platforms.includes(p) && styles.segmentOn)}
                aria-pressed={platforms.includes(p)}
                onClick={() => setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || list.includes(x))))}
              >
                {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span className="label">Goal</span>
          <select className="input" value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {GOAL_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn btn-primary" onClick={() => void makeAds()} disabled={making !== null || picked.size === 0} aria-busy={making !== null}>
          <Scissors size={16} aria-hidden />
          {making ? 'Making…' : picked.size === 0 ? 'Tick moments to make ads' : `Make ads from ${picked.size} moment${picked.size === 1 ? '' : 's'}`}
        </button>
        {!file && <p className="muted small">Pick the video above first: the clips are cut from it here.</p>}
        {made.length > 0 && (
          <ul className={styles.madeList}>
            {made.map((r) => (
              <li key={r.runId}>
                <Link href={`/runs/${r.runId}`} className="link">
                  {r.title} <ArrowRight size={14} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => void remove()} disabled={busy !== null || making !== null} aria-busy={busy === 'remove'}>
          <Trash2 size={15} aria-hidden />
          Take this video out of the list
        </button>
      </aside>

      <section className={cx('card card-pad', styles.transcript)} aria-labelledby="transcript-title">
        <div className={styles.momentsHead}>
          <h2 id="transcript-title" className="card-title">
            Transcript
          </h2>
          <label className={styles.searchBox}>
            <Search size={15} aria-hidden />
            <input className="input" placeholder="Find words" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find words in the transcript" />
          </label>
        </div>
        <p className="muted small">Click a line to watch from there. To make a moment of your own, mark its first and last line, then add it.</p>
        <div className={styles.ownBar}>
          <span className="small">{ownMoment ? `${clock(ownMoment.start)} to ${clock(ownMoment.end)} · ${Math.round(momentSeconds(ownMoment))} s` : own.first !== null ? 'Now mark the last line' : 'Mark a first line'}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addOwn} disabled={!ownMoment}>
            <Plus size={15} aria-hidden />
            Add as a moment
          </button>
        </div>
        <ol className={styles.lines}>
          {found.slice(0, 1500).map((l) => {
            const inOwn = ownMoment && l.i >= ownMoment.first && l.i <= ownMoment.last;
            return (
              <li key={l.i} className={cx(inOwn && styles.lineOwn)}>
                <button type="button" className={styles.lineTime} onClick={() => seek(l.start)} disabled={!url}>
                  {clock(l.start)}
                </button>
                <span className={styles.lineText}>{l.text}</span>
                <button
                  type="button"
                  className={styles.lineMark}
                  onClick={() => setOwn((o) => (o.first === null || o.last !== null ? { first: l.i, last: null } : { first: o.first, last: l.i }))}
                  aria-label={own.first === null || own.last !== null ? `Mark ${clock(l.start)} as the first line` : `Mark ${clock(l.start)} as the last line`}
                >
                  {own.first === l.i ? 'First' : own.last === l.i ? 'Last' : 'Mark'}
                </button>
              </li>
            );
          })}
        </ol>
        {found.length > 1500 && <p className="muted small">Showing the first 1,500 lines that match. Find words to narrow it.</p>}
      </section>
      {editing && (
        <VideoEditor
          clip={editing.clip}
          url={editing.url}
          brand={brand}
          setTitle={editing.clip.name}
          onClose={() => {
            URL.revokeObjectURL(editing.url);
            setEditing(null);
          }}
          onApply={(edit) =>
            setEdits((was) => {
              const next = new Map(was);
              if (edit) next.set(editing.key, edit);
              else next.delete(editing.key);
              return next;
            })
          }
        />
      )}
    </div>
  );
}
