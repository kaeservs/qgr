import { NextResponse } from 'next/server';
import { signEditMedia } from '@/lib/data';
import { MEDIA_PATH, MAX_SEGMENTS } from '@/lib/video/timeline';
import { checkTeam } from '@/lib/session';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Links to read the files video edits use, signed as the teammate for a few hours: what the studio plays and exports them from. */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  const paths = isRecord(body) && Array.isArray(body.paths) ? body.paths : null;
  // A studio shows three variants, each with up to 40 pieces and its music.
  if (!paths || paths.length > MAX_SEGMENTS * 4 || !paths.every((p): p is string => typeof p === 'string' && MEDIA_PATH.test(p) && !p.startsWith('local:'))) {
    return NextResponse.json({ error: 'Those are not files added here.' }, { status: 400 });
  }
  return NextResponse.json({ urls: await signEditMedia(paths) });
}
