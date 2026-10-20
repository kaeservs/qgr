import { NextResponse } from 'next/server';
import { createVideoPictureUpload, deleteVideoPicture } from '@/lib/data';
import { SHOT_TYPES } from '@/lib/data/source';
import type { ShotExtension } from '@/lib/data/source';
import { MAX_PICTURE_BYTES, PICTURE_PATH } from '@/lib/ai-video';
import { checkTeam } from '@/lib/session';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Hands the browser a link to upload an AI video's first picture: a fresh
 * path in the teammate's own folder of video-refs, signed as them. It goes
 * straight to Storage; n8n signs it again for Higgsfield when the video is sent.
 */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: 'Say what is being uploaded.' }, { status: 400 });
  const extension = (Object.keys(SHOT_TYPES) as ShotExtension[]).find((ext) => SHOT_TYPES[ext] === body.type);
  if (!extension) return NextResponse.json({ error: 'Add a PNG, JPEG or WebP picture.' }, { status: 400 });
  const { size } = body;
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) return NextResponse.json({ error: 'The picture’s size is not readable.' }, { status: 400 });
  if (size > MAX_PICTURE_BYTES) return NextResponse.json({ error: 'That picture is over 10 MB.' }, { status: 413 });

  const ticket = await createVideoPictureUpload(extension);
  if (!ticket.ok) return NextResponse.json({ error: ticket.error }, { status: ticket.status });
  return NextResponse.json({ path: ticket.value.path, url: ticket.value.url, sample: ticket.sample }, { status: 201 });
}

/** Removes a first picture taken away before its video was asked for. Storage refuses one a video uses, or someone else's. */
export async function DELETE(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  const path = isRecord(body) ? body.path : null;
  if (typeof path !== 'string' || !PICTURE_PATH.test(path)) return NextResponse.json({ error: 'That is not a picture uploaded here.' }, { status: 400 });
  const removed = await deleteVideoPicture(path);
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status });
  return new NextResponse(null, { status: 204 });
}
