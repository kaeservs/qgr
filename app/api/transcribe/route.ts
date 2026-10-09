import { NextResponse } from 'next/server';
import { transcribeClip } from '@/lib/data';
import { CLIP_PATH } from '@/lib/run-input';
import { checkTeam } from '@/lib/session';

/** Deepgram takes a few seconds a minute of speech; a ten-minute clip fits well inside this. */
export const maxDuration = 60;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * What is said in an uploaded clip, line by line in the clip's seconds. The
 * team reads it over before the run starts; the lines also become captions
 * in the video editor. The clip goes to Deepgram through a link signed for a
 * few minutes; nothing is kept but the words.
 */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  const path = isRecord(body) ? body.path : null;
  if (typeof path !== 'string' || !CLIP_PATH.test(path)) return NextResponse.json({ error: 'That is not a clip uploaded here.' }, { status: 400 });
  const result = await transcribeClip(path);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ lines: result.value.lines });
}
