import { NextResponse } from 'next/server';
import { createLongVideo } from '@/lib/data';
import { parseLongVideo } from '@/lib/long-video';
import { checkTeam } from '@/lib/session';

/**
 * Keeps a long video's transcript and asks for its moments. A route rather
 * than a server action: three hours of transcript is past an action's 1 MB.
 * The video itself never comes here: it was heard in the browser.
 */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const parsed = parseLongVideo(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const saved = await createLongVideo(parsed.value);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ id: saved.value.id, sample: saved.sample }, { status: 201 });
}
