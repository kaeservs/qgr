import { NextResponse } from 'next/server';
import { getActivity, getNow } from '@/lib/data';
import { checkTeam } from '@/lib/session';

/**
 * What the agents and n8n are doing right now, for the top bar's Working
 * list, which asks every few seconds. Read as the signed-in teammate, like
 * every page; never kept in a cache.
 */
export async function GET() {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const [items, now] = await Promise.all([getActivity(), getNow()]);
  return NextResponse.json({ items, now }, { headers: { 'Cache-Control': 'no-store' } });
}
