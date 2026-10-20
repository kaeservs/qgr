'use client';

import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { RunMediaInput } from '@/lib/run-media';
import type { Goal, Platform, RunSource } from '@/lib/types';
import { useToast } from '../ui/Toast';

/**
 * Starts a fresh run with the same input, direction, picking and media, its
 * link read again. The failed run stays, with its error, as the record. Trying
 * a failed agent again in place (GoAheadButton) keeps what the run already
 * has; this starts over.
 */
export function RetryButton({
  source,
  platforms,
  goal,
  title,
  guidance,
  pickFirst = false,
  media,
}: {
  source: RunSource;
  platforms: Platform[];
  goal: Goal;
  title: string;
  guidance?: string;
  pickFirst?: boolean;
  /** What the ads were made of, with the same references; a video is priced again. */
  media?: RunMediaInput | undefined;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-quiet btn-sm"
      disabled={busy}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, platforms, goal, title, ...(guidance ? { guidance } : {}), ...(pickFirst ? { pickFirst: true } : {}), ...(media ? { media } : {}) }) });
        const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
        if (res.ok && body?.id) {
          toast('Run started again');
          router.push(`/runs/${body.id}`);
        } else {
          toast(body?.error ?? 'The run could not be restarted.', 'info');
          setBusy(false);
        }
      }}
    >
      <RotateCcw size={16} aria-hidden />
      {busy ? 'Starting…' : 'Start over'}
    </button>
  );
}
