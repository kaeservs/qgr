'use client';

import { useEffect, useMemo, useState } from 'react';
import { localFile } from '@/lib/video/local-files';

// Links to the files video edits use: signed by the server for a few hours
// (/api/edit-media/links), or, on the sample data, this tab's own object URLs
// of the files picked. Kept for the page, so three variants and an editor ask
// once.

const signed = new Map<string, { url: string; until: number }>();
const local = new Map<string, string>();
/** Links are signed for six hours; one with less than an hour left is asked for again. */
const FRESH = 60 * 60 * 1000;
const LIFE = 6 * 60 * 60 * 1000;

/** A link for `path` already known here, or null. */
export function knownUrl(path: string): string | null {
  if (path.startsWith('local:')) {
    const cached = local.get(path);
    if (cached) return cached;
    const file = localFile(path.slice('local:'.length));
    if (!file) return null;
    const url = URL.createObjectURL(file);
    local.set(path, url);
    return url;
  }
  const hit = signed.get(path);
  return hit && hit.until - Date.now() > FRESH ? hit.url : null;
}

/** Links for every path, asking the server for those not known here. Paths it cannot sign are left out. */
export async function mediaUrls(paths: readonly string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ask: string[] = [];
  for (const p of new Set(paths)) {
    const url = knownUrl(p);
    if (url) out[p] = url;
    else if (!p.startsWith('local:')) ask.push(p);
  }
  if (ask.length > 0) {
    const res = await fetch('/api/edit-media/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: ask }) }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { urls?: Record<string, string> } | null) : null;
    for (const [p, url] of Object.entries(body?.urls ?? {})) {
      signed.set(p, { url, until: Date.now() + LIFE });
      out[p] = url;
    }
  }
  return out;
}

/** The links for `paths`, filled in as they arrive. */
export function useMediaUrls(paths: readonly string[]): Record<string, string> {
  const key = useMemo(() => [...new Set(paths)].sort().join('\n'), [paths]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) return;
    let live = true;
    void mediaUrls(key.split('\n')).then((found) => live && setUrls((was) => ({ ...was, ...found })));
    return () => {
      live = false;
    };
  }, [key]);
  return urls;
}
