import '@fontsource-variable/lexend';
import '@fontsource-variable/oswald';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Quantum Global · Marketing', template: '%s · Quantum Global' },
  description: 'Track competitors, plan ad strategy and write ads for Quantum Global Residency.',
  robots: { index: false, follow: false },
};

// Every page shows live data (runs move while you look) or depends on who is
// signed in, so nothing is prerendered at build time.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  themeColor: '#1c1b9d',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
