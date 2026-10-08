'use client';

import { CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { hostOf } from '@/lib/format';
import styles from './home.module.css';

export type LinkCheck =
  | { state: 'idle' }
  | { state: 'checking'; url: string }
  | { state: 'ok'; url: string; title: string | null; words: number }
  | { state: 'failed'; url: string; error: string }
  | { state: 'ad-library'; url: string };

type Answer = { ok: true; title: string | null; words: number } | { ok: false; error: string };

/**
 * Reads a pasted link shortly after typing stops, the same way the run will,
 * so a link the agents cannot read shows up before the run starts. Ad library
 * links are not read: that is Apify's job, once it is connected.
 */
export function useLinkCheck(url: string | null, adLibrary: boolean): LinkCheck {
  const [check, setCheck] = useState<LinkCheck>({ state: 'idle' });
  const answers = useRef(new Map<string, Answer>());

  useEffect(() => {
    if (!url) return setCheck({ state: 'idle' });
    if (adLibrary) return setCheck({ state: 'ad-library', url });
    const known = answers.current.get(url);
    if (known) return setCheck(known.ok ? { state: 'ok', url, title: known.title, words: known.words } : { state: 'failed', url, error: known.error });

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCheck({ state: 'checking', url });
      try {
        const res = await fetch('/api/link-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => null)) as (Answer & { error?: string }) | null;
        // A refusal of the request itself (signed out, bad link) is not news about the page.
        if (!res.ok || !body) return setCheck({ state: 'idle' });
        answers.current.set(url, body);
        setCheck(body.ok ? { state: 'ok', url, title: body.title, words: body.words } : { state: 'failed', url, error: body.error });
      } catch {
        if (!controller.signal.aborted) setCheck({ state: 'idle' });
      }
    }, 800);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, adLibrary]);

  return check;
}

/** One line under the link field. `needsText` is a custom run, which has nothing to go on without the page. */
export function LinkStatus({ check, needsText, onPasteText }: { check: LinkCheck; needsText: boolean; onPasteText?: () => void }) {
  if (check.state === 'idle') return null;
  return (
    <p className={cx(styles.linkStatus, check.state === 'failed' && (needsText ? styles.linkBad : styles.linkWarn), check.state === 'ok' && styles.linkOk)} aria-live="polite">
      {check.state === 'checking' && (
        <>
          <LoaderCircle size={15} className="spin" aria-hidden />
          <span>Reading the page…</span>
        </>
      )}
      {check.state === 'ok' && (
        <>
          <CircleCheck size={15} aria-hidden />
          <span>
            <strong>{check.title ?? hostOf(check.url)}</strong>
            {check.words > 0 && ` · ${check.words.toLocaleString('en-GB')} words to read`}
          </span>
        </>
      )}
      {check.state === 'failed' && (
        <>
          <TriangleAlert size={15} aria-hidden />
          <span>
            {check.error}{' '}
            {needsText ? (
              onPasteText && (
                <button type="button" className={styles.linkAction} onClick={onPasteText}>
                  Paste the text instead
                </button>
              )
            ) : (
              'The tracker will work from their ads alone.'
            )}
          </span>
        </>
      )}
      {check.state === 'ad-library' && (
        <>
          <Info size={15} aria-hidden />
          <span>Ad library links need Apify, which isn’t connected yet. This run will use sample ads.</span>
        </>
      )}
    </p>
  );
}
