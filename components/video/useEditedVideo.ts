'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { drawTimelineFrame } from '@/lib/video/compose';
import type { Picture } from '@/lib/video/draw';
import { loadFrameFonts, loadMark } from '@/lib/video/draw';
import { editedSeconds } from '@/lib/video/edit';
import type { Size, VideoEdit } from '@/lib/video/edit';
import { cutawayAt, frameAt, layout, mediaOf, musicGainAt, musicSourceAt, pieceGainAt, sequenceOf } from '@/lib/video/timeline';
import type { Cutaway, Placed, Showing } from '@/lib/video/timeline';
import type { Hit } from '@/lib/spot';
import { playableUrl } from './media';
import { useMediaUrls } from './useMediaUrls';

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

/** The edited video's second on screen, in a tiny store: only what shows the time re-renders sixty times a second. */
export interface TimeClock {
  get(): number;
  set(t: number): void;
  subscribe(listener: () => void): () => void;
}

function createClock(start: number): TimeClock {
  let time = start;
  const listeners = new Set<() => void>();
  return {
    get: () => time,
    set(next) {
      if (next === time) return;
      time = next;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const useTime = (clock: TimeClock): number => useSyncExternalStore(clock.subscribe, clock.get, clock.get);

export interface FrameWords {
  words: string;
  brand: { name: string; website: string };
}

export interface TimelinePlayer {
  playing: boolean;
  clock: TimeClock;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Shows the edited video's second `t`, paused. */
  seek(t: number): void;
}

/** A clip piece plays on one of two elements per file, alternating, so the next piece is ready on the other while this one plays. */
const elementKey = (s: Placed) => `${s.segment.kind === 'clip' ? (s.segment.media?.path ?? 'clip') : ''}#${s.index % 2}`;
/** A cutaway plays on an element of its own, always silent: the sequence's sound goes on under it. */
const cutawayKey = (c: Cutaway) => `cut:${c.id}`;
/** Further than this from where it should be, a playing video is put right. */
const DRIFT = 0.25;

/**
 * Plays an edit's timeline on a canvas: each clip piece from a hidden <video>
 * of its file (the run's clip, or another video added to the edit), pictures
 * from images, title cards drawn, all through drawTimelineFrame, the same
 * drawing the export does. The clock is the edited video's own: it runs on
 * while the pieces' videos follow it, and holds while one is still loading.
 * Clip sound plays from its video, faded as the export fades it; the music
 * from an <audio>, faded and ducked the same way. A cutaway plays silent over
 * its stretch; an AI video in `waiting` (not made yet) shows as on its way and
 * never holds the clock.
 */
export function useEditedVideo(
  canvas: RefObject<HTMLCanvasElement | null>,
  host: RefObject<HTMLElement | null>,
  url: string | null,
  edit: VideoEdit,
  size: Size,
  words: FrameWords,
  waiting?: ReadonlySet<string>,
): {
  player: TimelinePlayer;
  ready: boolean;
  total: number;
  placed: Placed[];
  /** Files the edit uses that can't be shown here (none of them yet signed or still in this tab). */
  missing: number;
  /** Where the words, the logo and the texts showing were drawn, in the canvas's pixels; empty while it plays. */
  hits: Hit[];
} {
  const assets = useFrameAssets();
  const sequence = useMemo(() => sequenceOf(edit), [edit]);
  const placed = useMemo(() => layout(sequence), [sequence]);
  const total = editedSeconds(edit);
  const media = useMemo(() => mediaOf(edit), [edit]);
  const urls = useMediaUrls(useMemo(() => media.map((m) => m.path), [media]));
  const clipSrc = useMemo(() => (url ? playableUrl(url) : null), [url]);
  // The clock starts on the cover, once.
  const [clock] = useState(() => createClock(edit.cover));
  const [playing, setPlaying] = useState(false);

  const videos = useRef(new Map<string, HTMLVideoElement>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const music = useRef<HTMLAudioElement | null>(null);
  const raf = useRef(0);
  const run = useRef<{ from: number; at: number } | null>(null);
  const live = useRef({ edit, placed, total, size, words, assets, urls, clipSrc, waiting });
  useEffect(() => {
    live.current = { edit, placed, total, size, words, assets, urls, clipSrc, waiting };
  });

  const srcOf = useCallback((path: string | null): string | null => (path === null ? live.current.clipSrc : (live.current.urls[path] ?? null)), []);

  const redrawSoon = useRef<() => void>(() => undefined);

  const video = useCallback(
    (key: string, src: string | null): HTMLVideoElement | null => {
      if (!src) return null;
      let v = videos.current.get(key);
      if (!v) {
        v = document.createElement('video');
        v.preload = 'auto';
        v.playsInline = true;
        v.tabIndex = -1;
        v.setAttribute('aria-hidden', 'true');
        v.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
        v.addEventListener('seeked', () => redrawSoon.current());
        v.addEventListener('loadeddata', () => redrawSoon.current());
        host.current?.append(v);
        videos.current.set(key, v);
      }
      if (v.dataset.src !== src) {
        v.dataset.src = src;
        v.src = src;
      }
      return v;
    },
    [host],
  );

  const image = useCallback((path: string): HTMLImageElement | null => {
    const src = srcOf(path);
    if (!src) return null;
    let img = images.current.get(path);
    if (!img || img.dataset.src !== src) {
      img = new Image();
      img.dataset.src = src;
      img.decoding = 'async';
      img.onload = () => redrawSoon.current();
      img.src = src;
      images.current.set(path, img);
    }
    return img;
  }, [srcOf]);

  const pictureOf = useCallback(
    (s: Showing): Picture | null => {
      const seg = s.placed.segment;
      if (seg.kind === 'clip') {
        const v = videos.current.get(elementKey(s.placed));
        return v && v.readyState >= 2 && v.videoWidth > 0 ? { image: v, width: v.videoWidth, height: v.videoHeight } : null;
      }
      if (seg.kind === 'image') {
        const img = image(seg.media.path);
        return img?.complete && img.naturalWidth > 0 ? { image: img, width: img.naturalWidth, height: img.naturalHeight } : null;
      }
      return null;
    },
    [image],
  );

  const cutawayOf = useCallback((c: Cutaway): Picture | null => {
    const v = videos.current.get(cutawayKey(c));
    return v && v.readyState >= 2 && v.videoWidth > 0 ? { image: v, width: v.videoWidth, height: v.videoHeight } : null;
  }, []);

  // Where the words, the logo and the texts were drawn, for the editor's handles: kept only while paused.
  const [hits, setHits] = useState<Hit[]>([]);
  const lastHits = useRef('');
  const draw = useCallback(
    (t: number) => {
      const ctx = canvas.current?.getContext('2d');
      if (!ctx) return;
      const { edit: e, placed: p, total: all, size: s, words: w, assets: a, waiting: later } = live.current;
      const drawn = drawTimelineFrame(ctx, s, { edit: e, placed: p, total: all, words: w.words, brand: { ...w.brand, mark: a.mark }, time: t, ...(later ? { waiting: later } : {}) }, pictureOf, cutawayOf);
      const key = run.current ? '' : JSON.stringify(drawn);
      if (key !== lastHits.current) {
        lastHits.current = key;
        setHits(run.current ? [] : drawn);
      }
    },
    [canvas, pictureOf, cutawayOf],
  );

  /** Puts every element where the timeline says at `t`: the pieces on screen at their seconds and volumes, the next one ready, the music. Returns whether one on screen is still loading. */
  const sync = useCallback(
    (t: number, moving: boolean): boolean => {
      const { edit: e, placed: p, total: all } = live.current;
      const f = frameAt(p, t);
      const used = new Set<string>();
      let waiting = false;
      for (const s of [f.current, f.previous]) {
        if (!s || s.placed.segment.kind !== 'clip' || s.source === null) continue;
        const seg = s.placed.segment;
        const key = elementKey(s.placed);
        const v = video(key, srcOf(seg.media?.path ?? null));
        if (!v) continue;
        used.add(key);
        v.playbackRate = seg.speed;
        const gain = Math.min(1, pieceGainAt(p, s.placed.index, t, e.volume));
        v.muted = gain === 0;
        v.volume = gain;
        if (v.readyState < 2) waiting = true;
        if (moving) {
          if (Math.abs(v.currentTime - s.source) > DRIFT * seg.speed) v.currentTime = s.source;
          if (v.paused) void v.play().catch(() => undefined);
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - s.source) > 0.02) v.currentTime = s.source;
        }
      }
      // The next clip piece waits on its own element at its first frame, so the cut to it is clean.
      const next = f.current ? p[f.current.placed.index + 1] : undefined;
      if (next && next.segment.kind === 'clip' && next.at - t < 2) {
        const key = elementKey(next);
        const v = used.has(key) ? null : video(key, srcOf(next.segment.media?.path ?? null));
        if (v) {
          used.add(key);
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - next.segment.start) > 0.05) v.currentTime = next.segment.start;
        }
      }
      // A cutaway over this second plays silent on its own element; the next one waits at its first frame.
      const over = cutawayAt(e.cutaways, t);
      if (over) {
        const key = cutawayKey(over.cutaway);
        const v = video(key, srcOf(over.cutaway.media.path));
        if (v) {
          used.add(key);
          v.muted = true;
          if (v.readyState < 2) waiting = true;
          if (moving) {
            if (Math.abs(v.currentTime - over.source) > DRIFT) v.currentTime = over.source;
            if (v.paused) void v.play().catch(() => undefined);
          } else {
            if (!v.paused) v.pause();
            if (Math.abs(v.currentTime - over.source) > 0.02) v.currentTime = over.source;
          }
        }
      }
      const coming = (e.cutaways ?? []).find((c) => c.at > t && c.at - t < 2);
      if (coming && !used.has(cutawayKey(coming))) {
        const v = video(cutawayKey(coming), srcOf(coming.media.path));
        if (v) {
          used.add(cutawayKey(coming));
          v.muted = true;
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - coming.start) > 0.05) v.currentTime = coming.start;
        }
      }
      for (const [key, v] of videos.current) if (!used.has(key) && !v.paused) v.pause();

      const m = e.music;
      const src = m ? srcOf(m.media.path) : null;
      if (m && src) {
        if (!music.current) {
          music.current = new Audio();
          music.current.preload = 'auto';
        }
        const a = music.current;
        if (a.dataset.src !== src) {
          a.dataset.src = src;
          a.src = src;
        }
        a.volume = Math.min(1, musicGainAt(m, p, t, all, e.volume));
        const at = musicSourceAt(m, t);
        if (moving && t < all) {
          if (Math.abs(a.currentTime - at) > DRIFT) a.currentTime = at;
          if (a.paused) void a.play().catch(() => undefined);
        } else {
          if (!a.paused) a.pause();
          if (Math.abs(a.currentTime - at) > 0.05) a.currentTime = at;
        }
      } else music.current?.pause();
      return waiting;
    },
    [srcOf, video],
  );

  const show = useCallback(
    (t: number) => {
      clock.set(t);
      draw(t);
    },
    [clock, draw],
  );

  const pause = useCallback(() => {
    cancelAnimationFrame(raf.current);
    run.current = null;
    setPlaying(false);
    sync(clock.get(), false);
    draw(clock.get());
  }, [clock, draw, sync]);

  const tick = useCallback(() => {
    const r = run.current;
    if (!r) return;
    const all = live.current.total;
    let t = r.at + (performance.now() - r.from) / 1000;
    if (t >= all) {
      run.current = null;
      setPlaying(false);
      show(all);
      sync(all, false);
      return;
    }
    // A piece still loading holds the clock where it is.
    if (sync(t, true)) {
      t = clock.get();
      run.current = { from: performance.now(), at: t };
    }
    show(t);
    raf.current = requestAnimationFrame(tick);
  }, [clock, show, sync]);

  const play = useCallback(() => {
    let t = clock.get();
    if (t >= live.current.total - 0.05) t = 0;
    clock.set(t);
    run.current = { from: performance.now(), at: t };
    setPlaying(true);
    sync(t, true);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  }, [clock, sync, tick]);

  const seek = useCallback(
    (t: number) => {
      cancelAnimationFrame(raf.current);
      run.current = null;
      setPlaying(false);
      const at = Math.min(Math.max(0, t), live.current.total);
      sync(at, false);
      show(at);
    },
    [show, sync],
  );

  useEffect(() => {
    redrawSoon.current = () => {
      if (!run.current) draw(clock.get());
    };
  }, [clock, draw]);

  // Paused, the frame follows any change to the edit, the words or the files' links.
  useEffect(() => {
    if (run.current) return;
    const t = Math.min(clock.get(), total);
    sync(t, false);
    show(t);
  });

  useEffect(() => {
    const all = videos.current;
    return () => {
      cancelAnimationFrame(raf.current);
      for (const v of all.values()) {
        v.pause();
        v.removeAttribute('src');
        v.load();
        v.remove();
      }
      all.clear();
      music.current?.pause();
    };
  }, []);

  const missing = media.filter((m) => !urls[m.path]).length;
  return {
    player: { playing, clock, play, pause, toggle: () => (run.current ? pause() : play()), seek },
    ready: assets.ready,
    total,
    placed,
    missing,
    hits,
  };
}
