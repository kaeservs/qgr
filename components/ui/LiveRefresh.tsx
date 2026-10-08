'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-reads the page from the server every few seconds while `active`, so a run
 * moving through the agents shows each step as it lands. Only while the tab is
 * visible; nothing at all when inactive.
 */
export function LiveRefresh({ active, every = 5000 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, every);
    return () => clearInterval(id);
  }, [active, every, router]);
  return null;
}
