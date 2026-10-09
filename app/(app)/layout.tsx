import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { getActivity, getCurrentUser, getNotices, getNow, getSearchIndex, usingSampleData } from '@/lib/data';
import { getViewer } from '@/lib/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const sample = usingSampleData();
  if (!sample) {
    // proxy.ts has already sent anyone signed out to /sign-in; this catches an
    // account that can sign in but is not on the team.
    const viewer = await getViewer();
    if (!viewer) redirect('/sign-in');
    if (!viewer.role) redirect('/no-access');
  }
  const [user, searchIndex, notices, activity, now] = await Promise.all([getCurrentUser(), getSearchIndex(), getNotices(), getActivity(), getNow()]);
  return (
    <AppShell user={user} searchIndex={searchIndex} notices={notices} activity={activity} now={now} sample={sample}>
      {children}
    </AppShell>
  );
}
