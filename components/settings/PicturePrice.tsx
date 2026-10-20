'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pricePictureAction } from '@/app/(app)/settings/actions';
import { formatCredits } from '@/lib/ai-video';
import { cx } from '@/lib/cx';
import type { PictureQuality } from '@/lib/types';
import styles from './settings.module.css';

type Price = { state: 'asking' } | { state: 'ready'; credits: number; balance: number | null } | { state: 'failed'; error: string };

/**
 * What one Higgsfield picture costs at a quality, asked of Higgsfield through
 * n8n (get_cost: nothing is made), with the credits left on the plan. A price
 * is only shown for the quality it was asked for. With `perRun`, it also says
 * what a run's three ads cost when every new ad asks for a picture.
 */
export function PicturePrice({ quality, perRun = false, className }: { quality: PictureQuality; perRun?: boolean; className?: string }) {
  const [quote, setQuote] = useState<{ quality: PictureQuality; price: Price } | null>(null);
  const [retry, setRetry] = useState(0);
  const price: Price = quote?.quality === quality ? quote.price : { state: 'asking' };

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuote({ quality, price: { state: 'asking' } });
      void pricePictureAction(quality).then((answer) =>
        setQuote((q) =>
          q && q.quality !== quality ? q : { quality, price: answer.ok ? { state: 'ready', credits: answer.value.credits, balance: answer.value.balance } : { state: 'failed', error: answer.error } },
        ),
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [quality, retry]);

  if (price.state === 'asking') {
    return (
      <span className={cx('muted small', styles.price, className)} role="status">
        <LoaderCircle size={13} className="spin" aria-hidden />
        Asking Higgsfield’s price…
      </span>
    );
  }
  if (price.state === 'failed') {
    return (
      <span className={cx('small', styles.price, className)} role="status">
        <span className="muted">No price yet: {price.error}</span>
        <button
          type="button"
          className="link small"
          onClick={() => {
            setQuote({ quality, price: { state: 'asking' } });
            setRetry((n) => n + 1);
          }}
        >
          Ask again
        </button>
      </span>
    );
  }
  return (
    <span className={cx('small', styles.price, className)} role="status">
      <strong>{formatCredits(price.credits)} a picture</strong>
      <span className="muted">
        {perRun ? ` · ${formatCredits(price.credits * 3)} a run when every new ad asks for one` : ''}
        {price.balance !== null ? ` · ${formatCredits(price.balance)} left on the Higgsfield plan` : ''}
      </span>
    </span>
  );
}
