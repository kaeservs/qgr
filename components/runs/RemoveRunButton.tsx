'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { removeRunAction } from '@/app/(app)/runs/actions';
import { useToast } from '../ui/Toast';

/**
 * Deletes a run once the person confirms: the question says what goes with
 * it and every post of it still to go out (cancelled) or already out (it stays
 * on the platform). The database refuses while an agent works on it.
 */
export function RemoveRunButton({ runId, question, disabled = false }: { runId: string; question: string; disabled?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-quiet btn-sm"
      disabled={busy || disabled}
      aria-busy={busy}
      title={disabled ? 'An agent is working on this run: wait for it to finish' : undefined}
      onClick={async () => {
        if (!window.confirm(question)) return;
        setBusy(true);
        const result = await removeRunAction(runId);
        setBusy(false);
        if (!result.ok) return toast(result.error, 'info');
        toast(result.sample ? 'Run deleted for this session' : 'Run deleted');
        router.push('/runs');
      }}
    >
      <Trash2 size={15} aria-hidden />
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}
