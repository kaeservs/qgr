import '@fontsource-variable/lexend';
import '@fontsource-variable/oswald';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { getCurrentUser, getNotices, getNow, getSearchIndex } from '@/lib/data';

export const metadata: Metadata = {
  title: { default: 'Quantum Global · Marketing', template: '%s · Quantum Global' },
  description: 'Track competitors, plan ad strategy and write ads for Quantum Global Residency.',
  robots: { index: false, follow: false },
};

// Every page shows live data (runs move while you look), so nothing is
// prerendered at build time.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  themeColor: '#1c1b9d',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [user, searchIndex, notices, now] = await Promise.all([getCurrentUser(), getSearchIndex(), getNotices(), getNow()]);
  return (
    <html lang="en">
      <body>
        <AppShell user={user} searchIndex={searchIndex} notices={notices} now={now}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
