import { NextResponse } from 'next/server';
import { createClipUpload, deleteClipUpload } from '@/lib/data';
import { CLIP_TYPES } from '@/lib/data/source';
import type { ClipExtension } from '@/lib/data/source';
import { CLIP_PATH, MAX_CLIP_BYTES } from '@/lib/run-input';
import { checkTeam } from '@/lib/session';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Hands the browser a link to upload one clip to: a fresh path in the
 * teammate's own folder, signed as them. The clip goes straight to Storage,
 * because a 50 MB file cannot pass through the app's server (a Vercel function
 * takes 4.5 MB a request). The link is good for that one path for two hours
 * and carries no key; the bucket refuses anything over 50 MB or not a video.
 */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: 'Say what is being uploaded.' }, { status: 400 });
  const extension = (Object.keys(CLIP_TYPES) as ClipExtension[]).find((ext) => CLIP_TYPES[ext] === body.type);
  if (!extension) return NextResponse.json({ error: 'Upload an MP4, MOV or WebM video.' }, { status: 400 });
  const { size } = body;
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) return NextResponse.json({ error: 'The clip’s size is not readable.' }, { status: 400 });
  if (size > MAX_CLIP_BYTES) return NextResponse.json({ error: 'The clip is over 50 MB. Cut it shorter.' }, { status: 413 });

  const ticket = await createClipUpload(extension);
  if (!ticket.ok) return NextResponse.json({ error: ticket.error }, { status: ticket.status });
  return NextResponse.json({ path: ticket.value.path, url: ticket.value.url, sample: ticket.sample }, { status: 201 });
}

/** Removes a clip that was cut again or taken away before its run started. Storage refuses one a run uses. */
export async function DELETE(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  const path = isRecord(body) ? body.path : null;
  if (typeof path !== 'string' || !CLIP_PATH.test(path)) return NextResponse.json({ error: 'That is not a clip uploaded here.' }, { status: 400 });
  const removed = await deleteClipUpload(path);
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status });
  return new NextResponse(null, { status: 204 });
}
