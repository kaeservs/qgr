'use client';

import { useEffect, useState } from 'react';

/**
 * Small frames across a clip, for the timeline. Made by Mediabunny, loaded
 * the first time one is needed; none when the browser can't decode the clip.
 */
export function useFilmstrip(source: Blob | string | null, duration: number): string[] {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    if (!source || duration <= 0) return;
    const controller = new AbortController();
    let made: string[] = [];
    void import('@/lib/video/render')
      .then(({ filmstrip }) => filmstrip(source, duration, 12, 72, controller.signal))
      .then((urls) => {
        made = urls;
        if (controller.signal.aborted) urls.forEach((u) => URL.revokeObjectURL(u));
        else setFrames(urls);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [source, duration]);
  return frames;
}
