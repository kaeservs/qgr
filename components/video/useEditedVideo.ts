'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { drawFrame, loadFrameFonts, loadMark } from '@/lib/video/draw';
import { clipTimeAt, keptSeconds } from '@/lib/video/edit';
import type { Size, VideoEdit } from '@/lib/video/edit';
import { playableUrl } from './media';
import { editedAt, usePlayer } from './player';
import type { Moment } from './player';

let mark: Promise<HTMLImageElement | null> | null = null;
let fonts: Promise<void> | null = null;

/** The mark and the fonts, loaded once for every preview on the page. */
function useFrameAssets(): { mark: HTMLImageElement | null; ready: boolean } {
  const [state, setState] = useState<{ mark: HTMLImageElement | null; ready: boolean }>({ mark: null, ready: false });
  useEffect(() => {
    let live = true;
    mark ??= loadMark();
    fonts ??= loadFrameFonts();
    void Promise.all([mark, fonts]).then(([image]) => live && setState({ mark: image, ready: true }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** The moment the cover shows: a frame of the clip, or the end card when the cover is on it. */
export function coverMoment(edit: VideoEdit): Moment {
  const t = clipTimeAt(edit.keep, edit.cover);
  const last = edit.keep[edit.keep.length - 1];
  if (t !== null || !last) return { clipTime: t ?? 0, tailTime: null };
  return { clipTime: last.end, tailTime: Math.max(0, edit.cover - keptSeconds(edit.keep)) };
}

export interface FrameWords {
  words: string;
  brand: { name: string; website: string };
}

/**
 * A canvas that shows a clip as an edit makes it, drawn by drawFrame from a
 * <video> that plays the cut: the same drawing the export does, so what is
 * seen here is what is downloaded. Redraws whenever the edit or the words
 * change while it is paused.
 */
export function useEditedVideo(canvas: RefObject<HTMLCanvasElement | null>, video: RefObject<HTMLVideoElement | null>, url: string | null, edit: VideoEdit, size: Size, words: FrameWords) {
  const assets = useFrameAssets();
  const [src, setSrc] = useState<string | null>(null);
  const live = useRef({ edit, size, words, assets });
  useEffect(() => {
    live.current = { edit, size, words, assets };
  });
  useEffect(() => setSrc(url ? playableUrl(url) : null), [url]);

  const draw = useCallback(
    (moment: Moment) => {
      const ctx = canvas.current?.getContext('2d');
      if (!ctx) return;
      const v = video.current;
      const { edit: e, size: s, words: w, assets: a } = live.current;
      const picture = v && v.videoWidth > 0 && v.readyState >= 2 ? { image: v, width: v.videoWidth, height: v.videoHeight } : null;
      drawFrame(ctx, s, picture, {
        edit: e,
        words: w.words,
        brand: { ...w.brand, mark: a.mark },
        time: editedAt(e.keep, moment) ?? 0,
        clipTime: moment.tailTime !== null ? null : moment.clipTime,
      });
    },
    [canvas, video],
  );

  const player = usePlayer(video, edit.keep, edit.endCard?.seconds ?? 0, draw);

  // The sound plays as the export will have it.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.volume = edit.volume;
    v.muted = edit.volume === 0;
  }, [edit.volume, video]);

  // Paused, the frame is redrawn after any change to what is drawn on it.
  useEffect(() => {
    if (!player.playing) draw(player.clock.get());
  });

  return { player, draw, src, ready: assets.ready };
}
