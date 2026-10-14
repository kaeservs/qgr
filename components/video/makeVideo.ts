// The video file of one variant: its timeline (the run's clip cut, other
// videos, pictures, title cards, texts and music), drawn by the same
// drawTimelineFrame the studio's preview uses. The studio's export downloads
// it; a post uploads it. Mediabunny loads only when a file is made.

import { drawTimelineFrame } from '@/lib/video/compose';
import { loadFrameFonts, loadMark } from '@/lib/video/draw';
import { editedSeconds } from '@/lib/video/edit';
import type { Size, VideoEdit } from '@/lib/video/edit';
import { RenderError } from '@/lib/video/errors';
import type { Target } from '@/lib/video/render';
import { layout, mediaOf, sequenceOf } from '@/lib/video/timeline';

export interface VideoJob {
  /** The clip, downloaded whole (see downloadClip). */
  clip: Blob;
  /** Every other file the edit uses, by path (fetchEditMedia). */
  media?: ReadonlyMap<string, Blob>;
  edit: VideoEdit;
  /** The variant's words over the video. */
  words: string;
  brand: { name: string; website: string };
  size: Size;
  /** From 0 to 1, a new value only for a new whole percent. */
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
  requireMp4?: boolean;
  /** Sees each frame once it is drawn, at the edited video's second it shows. */
  onFrame?: (canvas: HTMLCanvasElement, time: number) => void;
}

const downloadFailed = (what: string) => new RenderError(`${what} could not be downloaded. Check the connection and try again.`);

/** The whole clip, once: reading a signed link in ranges needs headers Storage may not show the page. */
export async function downloadClip(url: string, signal?: AbortSignal, what = 'The clip'): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url, signal ? { signal } : {});
  } catch (err) {
    if (signal?.aborted) throw err;
    throw downloadFailed(what);
  }
  if (!res.ok) throw new RenderError(`${what} could not be downloaded. Reload the page to try again.`);
  return res.blob();
}

/** Every file an edit uses besides the clip, downloaded from the links `urlOf` gives (signed, or this tab's own for the sample data). */
export async function fetchEditMedia(edit: VideoEdit, urlOf: (path: string) => string | null, signal?: AbortSignal): Promise<Map<string, Blob>> {
  const files = new Map<string, Blob>();
  await Promise.all(
    mediaOf(edit).map(async (m) => {
      const url = urlOf(m.path);
      if (!url) throw new RenderError(`${m.name} can’t be found. Add it to the video again.`);
      files.set(m.path, await downloadClip(url, signal, m.name));
    }),
  );
  return files;
}

export async function makeVariantVideo(job: VideoJob): Promise<{ blob: Blob; target: Target }> {
  const [mark] = await Promise.all([loadMark(), loadFrameFonts()]);
  const brand = { ...job.brand, mark };
  const { renderTimeline, videoBitrate } = await import('@/lib/video/render');
  const placed = layout(sequenceOf(job.edit));
  const total = editedSeconds(job.edit);
  let shown = -1;
  return renderTimeline({
    clip: job.clip,
    media: job.media ?? new Map(),
    edit: job.edit,
    size: job.size,
    bitrate: videoBitrate(job.size, 30),
    draw: (ctx, time, pictureOf) => {
      drawTimelineFrame(ctx, job.size, { edit: job.edit, placed, total, words: job.words, brand, time }, pictureOf);
      job.onFrame?.(ctx.canvas, time);
    },
    // Every frame reports; the caller hears only of a new whole percent.
    onProgress: (share) => {
      const pct = Math.floor(share * 100);
      if (pct === shown) return;
      shown = pct;
      job.onProgress?.(share);
    },
    ...(job.signal ? { signal: job.signal } : {}),
    ...(job.requireMp4 ? { requireMp4: true } : {}),
  });
}
