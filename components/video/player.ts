'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { keptSeconds, partIndexAt } from '@/lib/video/edit';
import type { Part } from '@/lib/video/edit';

/** Where playback is: the clip's second on screen, and how far into the end card (null while the clip shows). */
export interface Moment {
  clipTime: number;
  tailTime: number | null;
}

/** A tiny store for the moment, so only what shows the time re-renders sixty times a second. */
export interface Clock {
  get(): Moment;
  set(moment: Moment): void;
  subscribe(listener: () => void): () => void;
}

function createClock(): Clock {
  let moment: Moment = { clipTime: 0, tailTime: null };
  const listeners = new Set<() => void>();
  return {
    get: () => moment,
    set(next) {
      if (next.clipTime === moment.clipTime && next.tailTime === moment.tailTime) return;
      moment = next;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const useMoment = (clock: Clock): Moment => useSyncExternalStore(clock.subscribe, clock.get, clock.get);

/** A frame early: playback is checked once a frame, and a jump should land before a cut shows. */
const SLACK = 0.04;

export interface Player {
  playing: boolean;
  clock: Clock;
  play(): Promise<void>;
  pause(): void;
  toggle(): void;
  /** Shows the clip at a second, paused. */
  seek(clipTime: number): void;
  /** Shows a moment, paused: a second of the clip, or a moment on the end card. */
  showAt(moment: Moment): void;
}

/**
 * Plays a <video> as its cut: reaching the end of a kept part jumps to the
 * next, and after the last it runs `tail` seconds of end card (the video
 * paused) before stopping. Playing from inside a cut stretch plays it, so a
 * person can see what they cut before deciding. `onFrame` is called on every
 * frame shown, for drawing a canvas from the video.
 */
export function usePlayer(ref: RefObject<HTMLVideoElement | null>, keep: readonly Part[], tail = 0, onFrame?: (moment: Moment) => void): Player {
  const clock = useMemo(createClock, []);
  const [playing, setPlaying] = useState(false);
  const live = useRef({ keep, tail, onFrame });
  const raf = useRef(0);
  const tailStart = useRef<number | null>(null);
  const inside = useRef(false);

  useEffect(() => {
    live.current = { keep, tail, onFrame };
  });

  const show = useCallback(
    (moment: Moment) => {
      clock.set(moment);
      live.current.onFrame?.(moment);
    },
    [clock],
  );

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    tailStart.current = null;
    ref.current?.pause();
    setPlaying(false);
  }, [ref]);

  const tick = useCallback(() => {
    const video = ref.current;
    if (!video) return;
    const { keep: parts, tail: tailSeconds } = live.current;
    const last = parts[parts.length - 1];

    const endOfParts = () => {
      video.pause();
      if (tailSeconds > 0 && last) {
        tailStart.current = performance.now();
        show({ clipTime: last.end, tailTime: 0 });
        raf.current = requestAnimationFrame(tick);
      } else {
        show({ clipTime: video.currentTime, tailTime: null });
        setPlaying(false);
      }
    };

    if (tailStart.current !== null) {
      const elapsed = (performance.now() - tailStart.current) / 1000;
      if (elapsed >= tailSeconds) {
        tailStart.current = null;
        show({ clipTime: last?.end ?? video.currentTime, tailTime: tailSeconds });
        setPlaying(false);
        return;
      }
      show({ clipTime: last?.end ?? video.currentTime, tailTime: elapsed });
      raf.current = requestAnimationFrame(tick);
      return;
    }

    const t = video.currentTime;
    const i = partIndexAt(parts, t);
    const part = parts[i];
    if (part) {
      const next = parts[i + 1];
      if (t >= part.end - SLACK) {
        if (!next) return endOfParts();
        // Parts that touch play straight on; a gap between them is jumped.
        if (next.start - part.end > 0.05) video.currentTime = next.start;
      }
    } else if (inside.current) {
      // Playback slipped out of a part into a cut: carry on at the next part.
      const next = parts.find((p) => p.start >= t - 0.001);
      if (!next) return endOfParts();
      video.currentTime = next.start;
    }
    inside.current = part !== undefined;
    if (video.ended) return endOfParts();
    show({ clipTime: video.currentTime, tailTime: null });
    raf.current = requestAnimationFrame(tick);
  }, [ref, show]);

  const play = useCallback(async () => {
    const video = ref.current;
    if (!video) return;
    const { keep: parts } = live.current;
    const first = parts[0];
    const last = parts[parts.length - 1];
    // From the end, or from the end card, play starts at the top again.
    if (clock.get().tailTime !== null || (last && video.currentTime >= last.end - SLACK)) video.currentTime = first?.start ?? 0;
    tailStart.current = null;
    inside.current = partIndexAt(parts, video.currentTime) !== -1;
    try {
      await video.play();
    } catch {
      return;
    }
    setPlaying(true);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  }, [clock, ref, tick]);

  const showAt = useCallback(
    (moment: Moment) => {
      const video = ref.current;
      cancelAnimationFrame(raf.current);
      tailStart.current = null;
      if (video) {
        video.pause();
        if (Math.abs(video.currentTime - moment.clipTime) > 0.001) video.currentTime = moment.clipTime;
      }
      setPlaying(false);
      show(moment);
    },
    [ref, show],
  );
  const seek = useCallback((clipTime: number) => showAt({ clipTime, tailTime: null }), [showAt]);

  // A paused video still moves when it loads or is sought: show where it is.
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const sync = () => {
      if (tailStart.current === null && video.paused) show({ clipTime: video.currentTime, tailTime: clock.get().tailTime });
    };
    video.addEventListener('seeked', sync);
    video.addEventListener('loadeddata', sync);
    return () => {
      video.removeEventListener('seeked', sync);
      video.removeEventListener('loadeddata', sync);
    };
  }, [clock, ref, show]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return {
    playing,
    clock,
    play,
    pause: stop,
    toggle: () => (playing ? stop() : void play()),
    seek,
    showAt,
  };
}

/** The edited video's second at a moment, or null when the clip is shown inside a cut. */
export function editedAt(keep: readonly Part[], moment: Moment): number | null {
  if (moment.tailTime !== null) return keptSeconds(keep) + moment.tailTime;
  let offset = 0;
  for (const part of keep) {
    if (moment.clipTime >= part.start && moment.clipTime <= part.end) return offset + (moment.clipTime - part.start);
    offset += part.end - part.start;
  }
  return null;
}

/**
 * An undo history for one value. `set` records a step; `preview` changes the
 * value while something is dragged, and `settle` ends the drag as one step
 * from where it started (or records a step of its own when nothing was being
 * dragged, as for a key press). Values are plain data, compared as JSON.
 */
export function useUndoable<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[], dragFrom: null as T | null });
  const same = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
  const step = (s: typeof state, from: T, next: T) => (same(from, next) ? { ...s, present: from, dragFrom: null } : { past: [...s.past, from].slice(-100), present: next, future: [], dragFrom: null });
  return {
    value: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set: (next: T) => setState((s) => step(s, s.dragFrom ?? s.present, next)),
    preview: (next: T) => setState((s) => ({ ...s, present: next, dragFrom: s.dragFrom ?? s.present })),
    settle: (next: T) => setState((s) => step(s, s.dragFrom ?? s.present, next)),
    undo: () =>
      setState((s) => {
        const last = s.past[s.past.length - 1];
        return last === undefined ? s : { past: s.past.slice(0, -1), present: last, future: [s.dragFrom ?? s.present, ...s.future], dragFrom: null };
      }),
    redo: () =>
      setState((s) => {
        const next = s.future[0];
        return next === undefined ? s : { past: [...s.past, s.dragFrom ?? s.present], present: next, future: s.future.slice(1), dragFrom: null };
      }),
    reset: (next: T) => setState({ past: [], present: next, future: [], dragFrom: null }),
  };
}
