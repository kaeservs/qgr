'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setTrackedAction } from '@/app/(app)/competitors/actions';
import { Toggle } from '../ui/Toggle';
import { useToast } from '../ui/Toast';
import styles from './competitors.module.css';

/** Whether this competitor is scanned on the team's schedule. Only a competitor with a website can be. */
export function TrackedSwitch({ competitorId, name, tracked }: { competitorId: string; name: string; tracked: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [on, setOn] = useState(tracked);
  const [busy, setBusy] = useState(false);
  return (
    <span className={styles.tracked}>
      <Toggle
        checked={on}
        label={`Scan ${name} on schedule`}
        busy={busy}
        onChange={async (next) => {
          if (busy) return;
          setOn(next);
          setBusy(true);
          const saved = await setTrackedAction(competitorId, next);
          setBusy(false);
          if (!saved.ok) {
            setOn(!next);
            return toast(saved.error, 'info');
          }
          const what = next ? `${name} is scanned on schedule` : `${name} is left out of scheduled scans`;
          toast(saved.sample ? `${what}, for this session` : what, 'info');
          router.refresh();
        }}
      />
      <span className="small">Scan on schedule</span>
    </span>
  );
}
