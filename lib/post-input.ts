// What the posting dialog, the agents' switches and the Pages form may send.
// Server actions are public endpoints, so their input is checked here first;
// the database functions (schedule_post, update_agent_settings,
// update_publishing_settings) check again, which is the check that counts.

import type { NewPost, NewPostTarget } from './data/source';
import { isRecordId } from './edit-input';
import type { ParseResult } from './run-input';
import { isTimeZone, localTime } from './schedule';
import { PLACES } from './types';
import type { AgentSettings, Place, PostPages, ScanEvery } from './types';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** Where a post's file is kept: the uploader's own folder in bucket post-media. */
export const POST_MEDIA_PATH = new RegExp(`^posts/${UUID}/${UUID}\\.(jpg|mp4)$`);
/** A small JPEG of what goes out, as a data URL; the database holds it to 60,000 characters. */
export const MAX_THUMBNAIL = 60_000;

export const PLACE_LABEL: Record<Place, string> = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };

export function parseNewPost(raw: unknown): ParseResult<NewPost> {
  if (!isRecord(raw)) return { ok: false, error: 'Nothing to post.' };
  if (!isRecordId(raw.variantId)) return { ok: false, error: 'That variant no longer exists.' };
  if (!Array.isArray(raw.targets) || raw.targets.length === 0) return { ok: false, error: 'Pick where to post.' };
  if (raw.targets.length > PLACES.length) return { ok: false, error: 'Pick up to three places.' };

  const targets: NewPostTarget[] = [];
  for (const t of raw.targets) {
    if (!isRecord(t) || !PLACES.includes(t.place as Place)) return { ok: false, error: 'Posts go to Facebook, Instagram or LinkedIn.' };
    const place = t.place as Place;
    if (targets.some((x) => x.place === place)) return { ok: false, error: `${PLACE_LABEL[place]} is listed twice.` };
    let media: NewPostTarget['media'] = null;
    if (t.media !== null && t.media !== undefined) {
      if (!isRecord(t.media) || typeof t.media.path !== 'string' || !POST_MEDIA_PATH.test(t.media.path)) return { ok: false, error: `The file for ${PLACE_LABEL[place]} was not uploaded here.` };
      const kind = t.media.path.endsWith('.jpg') ? 'image' : 'video';
      if (t.media.kind !== kind) return { ok: false, error: `The file for ${PLACE_LABEL[place]} is not the kind it says.` };
      media = { path: t.media.path, kind };
    }
    if (place === 'instagram' && !media) return { ok: false, error: 'Instagram needs a picture or a video.' };
    targets.push({ place, media });
  }

  let at: string | null = null;
  if (raw.at !== null && raw.at !== undefined) {
    const [date = '', time = ''] = typeof raw.at === 'string' ? raw.at.split(' ') : [];
    at = localTime(date, time);
    if (!at) return { ok: false, error: 'Pick a date and a time.' };
  }

  let thumbnail: string | null = null;
  if (raw.thumbnail !== null && raw.thumbnail !== undefined) {
    if (typeof raw.thumbnail !== 'string' || !raw.thumbnail.startsWith('data:image/jpeg;base64,') || raw.thumbnail.length > MAX_THUMBNAIL) {
      return { ok: false, error: 'The picture of the post is too big.' };
    }
    thumbnail = raw.thumbnail;
  }
  return { ok: true, value: { variantId: raw.variantId, targets, at, thumbnail } };
}

const SCAN_EVERY: readonly ScanEvery[] = ['off', 'day', 'week'];
const isWhole = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

export function parseAgentSettings(raw: unknown): ParseResult<AgentSettings> {
  if (!isRecord(raw)) return { ok: false, error: 'Nothing to save.' };
  if (typeof raw.strategistAuto !== 'boolean' || typeof raw.contentAuto !== 'boolean') return { ok: false, error: 'Say which agents start by themselves.' };
  if (typeof raw.picturesAuto !== 'boolean') return { ok: false, error: 'Say whether new ads get pictures.' };
  if (!SCAN_EVERY.includes(raw.scanEvery as ScanEvery)) return { ok: false, error: 'Scans run every day, every week, or only when you ask.' };
  if (!isWhole(raw.scanDay, 1, 7) || !isWhole(raw.scanHour, 0, 23)) return { ok: false, error: 'Pick a day and an hour for scans.' };
  const timeZone = text(raw.timeZone);
  if (!timeZone || !isTimeZone(timeZone)) return { ok: false, error: 'Pick a time zone.' };
  return {
    ok: true,
    value: { strategistAuto: raw.strategistAuto, contentAuto: raw.contentAuto, picturesAuto: raw.picturesAuto, scanEvery: raw.scanEvery as ScanEvery, scanDay: raw.scanDay, scanHour: raw.scanHour, timeZone },
  };
}

/** A Page's numeric id, as Meta and LinkedIn show it. */
const PAGE_ID = /^[0-9]{5,25}$/;
const LINKEDIN_ID = /^[0-9]{1,20}$/;
const INSTAGRAM_NAME = /^[A-Za-z0-9._]{1,30}$/;
const NAME_LIMIT = 120;

export function parsePostPages(raw: unknown): ParseResult<PostPages> {
  if (!isRecord(raw)) return { ok: false, error: 'Nothing to save.' };
  const page = (value: unknown, idRule: RegExp, label: string, nameKey: 'name' | 'username', nameRule?: RegExp): ParseResult<{ id: string; name: string } | null> => {
    if (value === null || value === undefined) return { ok: true, value: null };
    if (!isRecord(value)) return { ok: false, error: `The ${label} details are not readable.` };
    const id = text(value.id);
    const name = text(value[nameKey]).replace(/^@/, '');
    if (!id && !name) return { ok: true, value: null };
    if (!idRule.test(id)) return { ok: false, error: `The ${label} id is the number in its settings, digits only.` };
    if (!name || name.length > NAME_LIMIT || (nameRule && !nameRule.test(name))) return { ok: false, error: `Name the ${label} as it shows on the platform.` };
    return { ok: true, value: { id, name } };
  };
  const facebook = page(raw.facebook, PAGE_ID, 'Facebook Page', 'name');
  if (!facebook.ok) return facebook;
  const instagram = page(raw.instagram, PAGE_ID, 'Instagram account', 'username', INSTAGRAM_NAME);
  if (!instagram.ok) return instagram;
  const linkedin = page(raw.linkedin, LINKEDIN_ID, 'LinkedIn Page', 'name');
  if (!linkedin.ok) return linkedin;
  return {
    ok: true,
    value: {
      facebook: facebook.value,
      instagram: instagram.value ? { id: instagram.value.id, username: instagram.value.name } : null,
      linkedin: linkedin.value,
    },
  };
}
