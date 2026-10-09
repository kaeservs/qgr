// The video file of one variant: its clip, cut and drawn as its edit says, by
// the same drawFrame the studio's preview uses. The studio's export downloads
// it; a post uploads it. Mediabunny loads only when a file is made.

import { drawFrame, loadFrameFonts, loadMark } from '@/lib/video/draw';
import type { Size, VideoEdit } from '@/lib/video/edit';
import { RenderError } from '@/lib/video/errors';
import type { Target } from '@/lib/video/render';

export interface VideoJob {
  /** The clip, downloaded whole (see downloadClip). */
  clip: Blob;
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

/** The whole clip, once: reading a signed link in ranges needs headers Storage may not show the page. */
export async function downloadClip(url: string, signal?: AbortSignal): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url, signal ? { signal } : {});
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new RenderError('The clip could not be downloaded. Check the connection and try again.');
  }
  if (!res.ok) throw new RenderError('The clip could not be downloaded. Reload the page to try again.');
  return res.blob();
}

export async function makeVariantVideo(job: VideoJob): Promise<{ blob: Blob; target: Target }> {
  const [mark] = await Promise.all([loadMark(), loadFrameFonts()]);
  const brand = { ...job.brand, mark };
  const { render, videoBitrate } = await import('@/lib/video/render');
  let shown = -1;
  return render({
    source: job.clip,
    keep: job.edit.keep,
    tail: job.edit.endCard?.seconds ?? 0,
    size: job.size,
    bitrate: videoBitrate(job.size, 30),
    volume: job.edit.volume,
    draw: (ctx, picture, time, clipTime) => {
      drawFrame(ctx, job.size, picture, { edit: job.edit, words: job.words, brand, time, clipTime });
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
