'use client';

import { Download, Film, RotateCcw, Scissors, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { editAiVideosAction, saveLongVideoEditAction } from '@/app/(app)/videos/actions';
import { aboutVideo, clock, transcriptThroughEdit } from '@/lib/long-video';
import type { Clip, Goal, LongVideoWithTranscript, Platform } from '@/lib/types';
import { defaultEdit, editedSeconds, frameSize, length, MAX_CLIP_SECONDS } from '@/lib/video/edit';
import type { VideoEdit } from '@/lib/video/edit';
import { RenderError } from '@/lib/video/errors';
import { aiVideosOf, layout, mediaOf, sequenceOf } from '@/lib/video/timeline';
import { fetchEditMedia, makeVariantVideo } from '../video/makeVideo';
import { mediaUrls } from '../video/useMediaUrls';
import { VideoEditor } from '../video/VideoEditor';
import { useToast } from '../ui/Toast';
import styles from './videos.module.css';

/** Room under Storage's 50 MB a clip: a file never comes out exactly the size it was aimed at. */
const AIM_BYTES = 45 * 1024 * 1024;
const MAX_CLIP_BYTES = 50 * 1024 * 1024;
/**
 * A download is made in the browser's memory before it is saved, so a long
 * one is made smaller: past twenty minutes, 1280 on its long side and aimed
 * at about a gigabyte, and an hour at most.
 */
const DOWNLOAD_MAX_SECONDS = 3600;
const LONG_DOWNLOAD_SECONDS = 20 * 60;
const DOWNLOAD_AIM_BYTES = 1024 * 1024 * 1024;

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'video';

/**
 * The whole long video, edited: cut down, with AI videos inserted at a point
 * or over a stretch of the talk, in the same editor the ads use. Only the
 * edit is kept (save_long_video_edit); the file stays on this computer. From
 * the edit, the finished video is made here: downloaded, or uploaded as a
 * clip that starts a run, once every AI video in it is made.
 */
export function WholeVideoCard({
  video,
  file,
  url,
  brand,
  platforms,
  goal,
}: {
  video: LongVideoWithTranscript;
  /** The video, picked on this computer; null until it is. */
  file: File | null;
  url: string | null;
  brand: { name: string; website: string };
  platforms: Platform[];
  goal: Goal;
}) {
  const toast = useToast();
  const [edit, setEdit] = useState<VideoEdit | null>(video.edit);
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const clip: Clip = { path: '', name: video.file.name, duration: video.file.duration, width: video.file.width, height: video.file.height, size: video.file.size, transcript: video.transcript, ...(edit ? { edit } : {}) };
  const shown = edit ?? defaultEdit(video.file.duration);
  const seconds = editedSeconds(shown);
  const aiCount = aiVideosOf(shown).length;
  const tooLong = seconds > MAX_CLIP_SECONDS + 0.5;

  /** Keeps the edit; why not when it cannot be kept, which the editor shows while it stays open with the work. */
  async function save(next: VideoEdit | null): Promise<string | null> {
    const saved = await saveLongVideoEditAction(video.id, next);
    if (!saved.ok) return saved.error;
    setError(null);
    setEdit(next);
    return null;
  }

  /** The edited video made on this computer: at full size to download, or under 50 MB to start a run. */
  async function make(forRun: boolean): Promise<{ blob: Blob; extension: string; width: number; height: number } | null> {
    if (!file) {
      setError('Pick the video first: the edited video is made from it on this computer.');
      return null;
    }
    const ids = aiVideosOf(shown);
    if (ids.length > 0) {
      const known = await editAiVideosAction(ids);
      if (!known.ok) {
        setError(known.error);
        return null;
      }
      const notReady = ids.filter((id) => known.value.find((v) => v.id === id)?.status !== 'ready');
      if (notReady.length > 0) {
        setError(notReady.length === 1 ? 'An AI video in the edit is not made yet: open the edit to see where it stands.' : `${notReady.length} AI videos in the edit are not made yet: open the edit to see where they stand.`);
        return null;
      }
    }
    setWorking('Fetching the AI videos and files…');
    const links = await mediaUrls(mediaOf(shown).map((m) => m.path));
    const media = await fetchEditMedia(shown, (path) => links[path] ?? null);
    const long = !forRun && seconds > LONG_DOWNLOAD_SECONDS;
    const size = frameSize(shown, video.file, forRun || long ? 1280 : 1920);
    const { bitrateToFit } = await import('@/lib/video/render');
    let bitrate = forRun ? bitrateToFit(size, 30, seconds, AIM_BYTES, true) : long ? bitrateToFit(size, 30, seconds, DOWNLOAD_AIM_BYTES, true) : undefined;
    const once = () =>
      makeVariantVideo({ clip: file, media, edit: shown, words: '', brand, size, ...(bitrate ? { bitrate } : {}), onProgress: (share) => setWorking(`Making the video… ${Math.round(share * 100)}%`) });
    let made = await once();
    if (forRun && bitrate && made.blob.size > MAX_CLIP_BYTES) {
      bitrate = Math.round(bitrate * 0.75 * (AIM_BYTES / made.blob.size));
      made = await once();
    }
    if (forRun && made.blob.size > MAX_CLIP_BYTES) throw new RenderError('Even made smaller, the edited video is over 50 MB. Cut it shorter.');
    return { blob: made.blob, extension: made.target.extension, ...size };
  }

  async function download() {
    setError(null);
    if (seconds > DOWNLOAD_MAX_SECONDS + 0.5) return setError(`Downloads are made on this computer, up to an hour: cut the edit to ${length(DOWNLOAD_MAX_SECONDS)} or less to download it. It is ${length(seconds)}.`);
    try {
      const made = await make(false);
      if (!made) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(made.blob);
      link.download = `qgr-${slug(video.title)}-edited.${made.extension}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
      toast(`Downloaded: ${length(seconds)}, ${(made.blob.size / 1024 / 1024).toFixed(1)} MB`);
    } catch (err) {
      setError(err instanceof RenderError ? err.message : 'The video could not be made in this browser.');
    } finally {
      setWorking(null);
    }
  }

  async function makeRun() {
    setError(null);
    if (tooLong) return setError(`Cut the edit to ${length(MAX_CLIP_SECONDS)} or less to make ads from it: it is ${length(seconds)}.`);
    if (platforms.length === 0) return setError('Pick at least one platform, under Make ads.');
    try {
      const made = await make(true);
      if (!made) return;
      setWorking('Uploading 0%');
      const { uploadClip } = await import('@/lib/video/upload');
      const up = await uploadClip(made.blob, (share) => setWorking(`Uploading ${Math.round(share * 100)}%`));
      setWorking('Starting the run');
      const transcript = transcriptThroughEdit(video.transcript, layout(sequenceOf(shown)));
      const said = transcript.map((l) => l.text).join(' ');
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: {
            kind: 'custom',
            type: 'video',
            clip: { path: up.path, name: `${video.title} (edited).${made.extension}`, duration: seconds, width: made.width, height: made.height, size: made.blob.size, transcript },
            notes: `${upperFirst(aboutVideo(video))}, edited down to ${length(seconds)}${aiCount > 0 ? `, with ${aiCount} AI video${aiCount === 1 ? '' : 's'} in it` : ''}. What is said: ${said}`.slice(0, 20_000),
          },
          platforms,
          goal,
          title: `${video.title}, edited`.slice(0, 80),
          ...(video.guidance ? { guidance: video.guidance } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) throw new RenderError(body?.error ?? 'The run could not be started.');
      setRunId(body.id);
      toast('Run started from the edited video');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The run could not be started.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="card card-pad" aria-labelledby="whole-title">
      <div className={styles.momentsHead}>
        <h2 id="whole-title" className="card-title">
          <Film size={16} aria-hidden /> The whole video, edited
        </h2>
        {edit && (
          <button type="button" className="btn btn-quiet btn-sm" disabled={working !== null} onClick={() => window.confirm('Go back to the video as it is? The edit is taken away; AI videos stay in the library.') && void save(null).then((why) => why && setError(why))}>
            <RotateCcw size={15} aria-hidden />
            As it is
          </button>
        )}
      </div>
      <p className="muted small">
        {edit
          ? `${length(seconds)} of ${clock(video.file.duration)} kept · ${sequenceOf(shown).length} piece${sequenceOf(shown).length === 1 ? '' : 's'}${aiCount > 0 ? ` · ${aiCount} AI video${aiCount === 1 ? '' : 's'}` : ''}${(shown.cutaways?.length ?? 0) > 0 ? ` (${shown.cutaways?.length} over the video)` : ''}`
          : 'Cut it down and put AI videos in at any point: inserted (what follows plays later) or over the video while the talk goes on. Only the edit is kept here; the file stays on this computer.'}
      </p>
      {tooLong && edit && <p className="muted small">Ads are made from up to {length(MAX_CLIP_SECONDS)}: cut it further to make ads from it. It can be downloaded up to an hour long.</p>}
      <div className={styles.momentActions}>
        <button type="button" className="btn btn-primary btn-sm" disabled={!url || working !== null} onClick={() => setEditing(true)}>
          <Scissors size={15} aria-hidden />
          {edit ? 'Edit again' : 'Edit the whole video'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!file || !edit || working !== null} onClick={() => void download()}>
          <Download size={15} aria-hidden />
          Download it
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!file || !edit || working !== null || tooLong} onClick={() => void makeRun()}>
          <Sparkles size={15} aria-hidden />
          Make ads from it
        </button>
      </div>
      {!url && <p className="muted small">Pick the file above first: it is edited on this computer.</p>}
      {working && (
        <p className="small" aria-live="polite">
          {working}
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {runId && (
        <p className="small">
          Started:{' '}
          <Link href={`/runs/${runId}`} className="link">
            the run from the edited video
          </Link>
        </p>
      )}
      {editing && url && (
        <VideoEditor
          clip={clip}
          url={url}
          brand={brand}
          setTitle={video.title}
          longVideoId={video.id}
          purpose={{
            title: 'Edit the whole video',
            about: `${video.file.name} · cut it down and put AI videos in; only the edit is kept, the file stays on this computer`,
            apply: 'Save the edit',
            applied: 'Edit saved',
          }}
          onClose={() => setEditing(false)}
          onApply={save}
        />
      )}
    </section>
  );
}
