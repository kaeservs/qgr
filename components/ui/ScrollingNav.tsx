'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * A row of links that scrolls sideways where it does not fit (a phone): the
 * current one, marked aria-current, is brought into view, so the page you are
 * on is never hidden past the edge.
 */
export function ScrollingNav({ label, current, className, children }: { label: string; current: string; className?: string | undefined; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const link = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
    const offset = link.getBoundingClientRect().left - nav.getBoundingClientRect().left;
    nav.scrollLeft += offset - (nav.clientWidth - link.offsetWidth) / 2;
  }, [current]);
  return (
    <nav ref={ref} className={className} aria-label={label}>
      {children}
    </nav>
  );
}
