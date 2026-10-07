import { Compass } from 'lucide-react';
import Link from 'next/link';

/** An address that matches no page. Pages inside the dashboard use app/(app)/not-found.tsx, with the shell. */
export default function NotFound() {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card empty" style={{ padding: '64px 24px', maxWidth: 480, width: '100%' }}>
        <Compass size={32} aria-hidden />
        <h1 className="display h2" style={{ color: 'var(--text)' }}>
          This page isn’t here
        </h1>
        <p>It may have been moved, or the link is wrong.</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 8 }}>
          Back to Home
        </Link>
      </div>
    </main>
  );
}
