'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';

/** A page whose data could not be read. The details are in the server's log, never on screen. */
export default function PageError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="page">
      <div className="card empty" style={{ padding: '64px 24px' }}>
        <TriangleAlert size={32} aria-hidden />
        <h1 className="display h2" style={{ color: 'var(--text)' }}>
          This page couldn’t load
        </h1>
        <p>The data didn’t arrive. Try again in a moment.</p>
        <button type="button" className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => retry()}>
          <RotateCcw size={16} aria-hidden />
          Try again
        </button>
      </div>
    </div>
  );
}
