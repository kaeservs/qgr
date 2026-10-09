'use client';

import { Play, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { continueRunAction } from '@/app/(app)/runs/actions';
import { STAGE_INFO } from '@/lib/pipeline';
import { useToast } from '../ui/Toast';

/**
 * Starts the agent a run waits on (its switch is off), or runs a failed one
 * again where it stopped: what the agents before it made is kept.
 */
export function GoAheadButton({ runId, label, again = false }: { runId: string; label: string; again?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      disabled={busy}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        const result = await continueRunAction(runId);
        setBusy(false);
        if (!result.ok) return toast(result.error, 'info');
        const name = STAGE_INFO[result.value.stage].name;
        toast(result.sample ? `${name} started, for this session: sample data doesn’t run the agents` : `${name} started`);
        router.refresh();
      }}
    >
      {again ? <RotateCcw size={15} aria-hidden /> : <Play size={15} aria-hidden />}
      {busy ? 'Starting…' : label}
    </button>
  );
}
