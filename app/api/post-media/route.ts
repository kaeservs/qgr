import { NextResponse } from 'next/server';
import { createPostUpload, deletePostMedia } from '@/lib/data';
import { POST_MEDIA_TYPES } from '@/lib/data/source';
import type { PostMediaExtension } from '@/lib/data/source';
import { MAX_CLIP_BYTES } from '@/lib/run-input';
import { POST_MEDIA_PATH } from '@/lib/post-input';
import { checkTeam } from '@/lib/session';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Hands the browser a link to upload the file a post goes out with: the
 * picture or the MP4 it made from an approved variant. Like a clip, it goes
 * straight to Storage (bucket post-media), into the teammate's own folder.
 */
export async function POST(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: 'Say what is being uploaded.' }, { status: 400 });
  const extension = (Object.keys(POST_MEDIA_TYPES) as PostMediaExtension[]).find((ext) => POST_MEDIA_TYPES[ext] === body.type);
  if (!extension) return NextResponse.json({ error: 'A post goes out with a JPEG or an MP4.' }, { status: 400 });
  const { size } = body;
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) return NextResponse.json({ error: 'The file’s size is not readable.' }, { status: 400 });
  if (size > MAX_CLIP_BYTES) return NextResponse.json({ error: 'The file is over 50 MB.' }, { status: 413 });

  const ticket = await createPostUpload(extension);
  if (!ticket.ok) return NextResponse.json({ error: ticket.error }, { status: ticket.status });
  return NextResponse.json({ path: ticket.value.path, url: ticket.value.url, sample: ticket.sample }, { status: 201 });
}

/** Removes a file made for a post that was never sent. Storage refuses one a post waits on. */
export async function DELETE(request: Request) {
  const team = await checkTeam();
  if (!team.ok) return NextResponse.json({ error: team.error }, { status: team.status });
  const body: unknown = await request.json().catch(() => null);
  const path = isRecord(body) ? body.path : null;
  if (typeof path !== 'string' || !POST_MEDIA_PATH.test(path)) return NextResponse.json({ error: 'That is not a post file uploaded here.' }, { status: 400 });
  const removed = await deletePostMedia(path);
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status });
  return new NextResponse(null, { status: 204 });
}
