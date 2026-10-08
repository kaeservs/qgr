import { Compass } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="page">
      <div className="card empty" style={{ padding: '64px 24px' }}>
        <Compass size={32} aria-hidden />
        <h1 className="display h2" style={{ color: 'var(--text)' }}>
          This page isn’t here
        </h1>
        <p>It may have been moved, or the link is wrong.</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 8 }}>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
