// Turns rows as Supabase returns them into the dashboard's shapes
// (lib/types.ts). Pure, so it is tested with fixtures (map.test.ts). Anything
// the database could hold that the dashboard has no shape for (an unknown
// platform, a malformed JSON column) is dropped here rather than crashing a page.

import { videoTitle } from '../ai-video';
import { runStatus, STAGE_INFO, STAGE_ORDER } from '../pipeline';
import { CLIP_PATH, runTitle } from '../run-input';
import type { NewLongVideo } from '../long-video';
import type { NewRunInput } from '../run-input';
import type { TeamRole, Viewer } from '../session';
import type { Database, Json } from '../supabase/database.types';
import { EXAMPLE_PLACES, GOALS, PICTURE_MODELS, PICTURE_QUALITIES, PLACES, PLATFORMS } from '../types';
import { PLACE_LABEL } from '../post-input';
import type {
  ActivityItem,
  AdExample,
  AdFormat,
  AdSet,
  AiVideo,
  AdSource,
  AdsSetting,
  Agent,
  AgentSettings,
  AngleShare,
  BrandExample,
  BrandMemory,
  BrandProfile,
  ChannelPlan,
  Clip,
  Competitor,
  CreativeStyle,
  Goal,
  Hook,
  Lead,
  LeadCampaign,
  LeadReason,
  LeadSettings,
  LongVideo,
  LongVideoWithTranscript,
  Moment,
  Notice,
  PageRead,
  PageSummary,
  PictureChoice,
  Place,
  Platform,
  PlatformCopy,
  Post,
  PostStatus,
  PostTarget,
  RunSource,
  ScanEvery,
  Stage,
  StageKey,
  StageStatus,
  Strategy,
  TeamSettings,
  TranscriptLine,
  User,
  Variant,
  VariantPicture,
  VideoBudget,
} from '../types';
import { parseVideoEdit } from '../video/edit';
import { parseDesign } from '../creative/design';
import { scanLabel } from '../schedule';
import { isLeadPlatform, isZohoRegion, zohoLeadUrl } from '../leads';
import { initialsOf } from './source';
import type { RunWithStatus } from './source';

// ---------------------------------------------------------------- rows

/** A one-to-one embed. PostgREST returns an object or null; an array is tolerated too. */
export type One<T> = T | T[] | null;
export const one = <T>(value: One<T> | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

export interface StageRow {
  stage: string;
  status: string;
  summary: string | null;
  error: string | null;
  finished_at: string | null;
  /** Set while the agent waits for a person: its switch is off. */
  waiting_since?: string | null;
}

export interface RunRow {
  id: string;
  title: string;
  kind: string;
  input: string;
  url: string | null;
  competitor_name: string | null;
  files: string[] | null;
  excerpt: string | null;
  platforms: string[];
  goal: string;
  summary: string | null;
  competitor_id: string | null;
  created_at: string;
  approved_at: string | null;
  /** Read from runs.page by JSON path, so the page's text is never fetched for a list. */
  page_ok: Json | null;
  page_url: string | null;
  page_title: string | null;
  page_words: Json | null;
  page_error: string | null;
  media_path: string | null;
  media: Json | null;
  guidance: string | null;
  /** Set on a run built on a few of a report's ads, chosen by a person. */
  chosen_ad_ids?: string[] | null;
  run_stages: StageRow[];
  strategies: One<{ id: string; strategy_angles: { id: string }[] }>;
  ad_sets: One<{ id: string; ad_variants: { id: string }[] }>;
  competitor_reports: One<{ id: string; hooks: { id: string }[] }>;
  run_events?: { at: string; text: string }[];
}

export interface CompetitorRow {
  id: string;
  name: string;
  domain: string | null;
  tracked?: boolean;
  competitor_reports: {
    id: string;
    data_source: string;
    active_ads: number;
    platforms: string[];
    insights: string[];
    angles: Json;
    created_at: string;
    hooks: { id: string; rank: number; text: string; platform: string; format: string; days_running: number; variations: number; days_known: boolean }[];
    competitor_ads: {
      id: string;
      platform: string;
      format: string;
      text: string;
      days_running: number;
      ad_url: string | null;
      headline: string | null;
      cta: string | null;
      angle: string | null;
      screenshot_path: string | null;
      /** The tracker's order; null on reports from before it kept every ad. */
      position: number | null;
      days_known: boolean;
    }[];
  }[];
}

export interface StrategyRow {
  id: string;
  run_id: string;
  competitor_id: string | null;
  title: string;
  source_label: string | null;
  goal: string;
  positioning: string;
  audiences: string[];
  channels: Json;
  guardrails: string[];
  created_at: string;
  approved_at: string | null;
  strategy_angles: { id: string; position: number; name: string; why: string; hook: string; based_on_hook: string | null }[];
  ad_sets: { id: string }[];
}

export interface AdSetRow {
  id: string;
  run_id: string;
  strategy_id: string;
  title: string;
  created_at: string;
  ad_variants: {
    id: string;
    label: string;
    angle: string;
    creative_text: string;
    creative_style: string;
    image_prompt: string | null;
    picture_path: string | null;
    picture_status: string;
    picture_error: string | null;
    picture_requested_at: string | null;
    copy: Json;
    posts: Json;
    warnings: string[];
    approved_at: string | null;
    video_edit: Json | null;
    design?: Json | null;
    /** Read for the studio only: the pictures made for it, marked once past the eight kept. */
    variant_pictures?: { id: string; path: string; prompt: string | null; created_at: string; removed_at: string | null }[];
  }[];
  runs: One<{ media_path: string | null; media: Json | null }>;
}

export type BrandRow = Database['public']['Tables']['brand_profile']['Row'];
export type SettingsRow = Database['public']['Tables']['team_settings']['Row'];

export interface PostRow {
  id: string;
  variant_id: string;
  scheduled_for: string;
  created_at: string;
  thumbnail: string | null;
  post_targets: {
    place: string;
    text: string;
    media_kind: string | null;
    status: string;
    posted_at: string | null;
    remote_url: string | null;
    stand_in: boolean;
    error: string | null;
    reach: number | null;
    views: number | null;
    reactions: number | null;
    comments: number | null;
    shares: number | null;
    clicks: number | null;
    results_at: string | null;
    results_error: string | null;
  }[];
  ad_variants: One<{ label: string; angle: string; ad_set_id: string; ad_sets: One<{ title: string }> }>;
  /** The places of this post kept in brand memory as posts that work. */
  brand_examples?: { place: string; removed_at: string | null }[];
}

export type BrandExampleRow = Pick<Database['public']['Tables']['brand_examples']['Row'], 'id' | 'place' | 'text' | 'note' | 'source' | 'post_id' | 'created_at'>;

// ---------------------------------------------------------------- values

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);
const isRecord = (value: unknown): value is { [key: string]: Json | undefined } => typeof value === 'object' && value !== null && !Array.isArray(value);

const FORMATS: readonly AdFormat[] = ['video', 'image', 'carousel', 'document', 'text'];
const STATUSES: readonly StageStatus[] = ['skipped', 'queued', 'running', 'done', 'failed'];
const POST_STATUSES: readonly PostStatus[] = ['scheduled', 'posting', 'posted', 'failed', 'unknown', 'cancelled'];
const STYLES: readonly CreativeStyle[] = ['arcs', 'split', 'spotlight'];
const SOURCES: readonly AdSource[] = ['apify', 'placeholder', 'upload'];
const TONES: readonly AdExample['tone'][] = ['slate', 'teal', 'plum', 'sand'];
/** An ad's own page in Meta's Ad Library, the only link a competitor's ad is shown with. */
const LIBRARY_AD = /^https:\/\/www\.facebook\.com\/ads\/library\/\?id=\d{1,25}$/;
const ADS_SETTINGS: readonly AdsSetting[] = ['sample', 'apify'];

const platformsOf = (list: readonly string[] | null): Platform[] => PLATFORMS.filter((p) => (list ?? []).includes(p));
const goalOf = (value: string): Goal => (isOneOf(GOALS, value) ? value : 'consultations');
const formatOf = (value: string): AdFormat => (isOneOf(FORMATS, value) ? value : 'image');

function anglesOf(json: Json): AngleShare[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((a) => (isRecord(a) && typeof a.label === 'string' && typeof a.ads === 'number' ? [{ label: a.label, ads: a.ads }] : []));
}

function channelsOf(json: Json): ChannelPlan[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((c) =>
    isRecord(c) && isOneOf(PLATFORMS, c.platform) && typeof c.share === 'number'
      ? [{ platform: c.platform, share: c.share, role: typeof c.role === 'string' ? c.role : '', format: typeof c.format === 'string' ? c.format : '' }]
      : [],
  );
}

/** A variant's posts keyed by place; anything that is not words is left out. */
export function postsOf(json: Json): Partial<Record<Place, string>> {
  const posts: Partial<Record<Place, string>> = {};
  if (!isRecord(json)) return posts;
  for (const place of PLACES) {
    const text = json[place];
    if (typeof text === 'string' && text.trim()) posts[place] = text;
  }
  return posts;
}

/** Copy keyed by platform; any field that is not text is left out. */
export function copyOf(json: Json): Partial<Record<Platform, PlatformCopy>> {
  const copy: Partial<Record<Platform, PlatformCopy>> = {};
  if (!isRecord(json)) return copy;
  for (const p of PLATFORMS) {
    const c = json[p];
    if (!isRecord(c) || typeof c.text !== 'string' || typeof c.headline !== 'string') continue;
    copy[p] = {
      text: c.text,
      headline: c.headline,
      ...(typeof c.description === 'string' ? { description: c.description } : {}),
      ...(typeof c.cta === 'string' ? { cta: c.cta } : {}),
    };
  }
  return copy;
}

// ---------------------------------------------------------------- runs

/** A run's clip from runs.media_path and runs.media; null when either is missing or malformed. */
export function clipOf(path: string | null, media: Json | null): Clip | null {
  if (!path || !CLIP_PATH.test(path) || !isRecord(media) || typeof media.duration !== 'number' || media.duration <= 0) return null;
  const count = (v: Json | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  const transcript = transcriptOf(media.transcript);
  // An edit made as the clip was uploaded; one that no longer reads is dropped, and the ads start from the whole clip.
  const parsed = media.edit !== undefined && media.edit !== null ? parseVideoEdit(media.edit, media.duration) : null;
  return {
    path,
    name: typeof media.name === 'string' && media.name ? media.name : 'Uploaded clip',
    duration: media.duration,
    width: count(media.width),
    height: count(media.height),
    size: count(media.size),
    ...(transcript.length > 0 ? { transcript } : {}),
    ...(parsed?.ok ? { edit: parsed.value } : {}),
  };
}

/** Lines of a stored transcript; a malformed line is left out. */
export function transcriptOf(json: Json | undefined): TranscriptLine[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((l) =>
    isRecord(l) && typeof l.start === 'number' && typeof l.end === 'number' && typeof l.text === 'string' && l.end > l.start && l.text.trim()
      ? [{ start: l.start, end: l.end, text: l.text }]
      : [],
  );
}

export function sourceOf(row: Pick<RunRow, 'kind' | 'input' | 'url' | 'competitor_name' | 'files' | 'excerpt' | 'title' | 'media_path' | 'media'>): RunSource {
  if (row.kind === 'competitor') {
    if (row.input === 'upload') return { kind: 'competitor', input: 'upload', name: row.competitor_name ?? row.title, files: row.files ?? [] };
    return { kind: 'competitor', input: row.input === 'ad_link' ? 'ad_link' : 'website', url: row.url ?? '' };
  }
  if (row.input === 'text') return { kind: 'custom', type: 'text', excerpt: row.excerpt ?? '' };
  const clip = row.input === 'video' ? clipOf(row.media_path, row.media) : null;
  if (clip) return { kind: 'custom', type: 'video', clip, notes: row.excerpt ?? '' };
  const type = row.input === 'podcast' || row.input === 'video' ? row.input : 'blog';
  return { kind: 'custom', type, url: row.url ?? '' };
}

function stagesOf(rows: StageRow[]): Record<StageKey, Stage> {
  const stage = (key: StageKey): Stage => {
    const row = rows.find((s) => s.stage === key);
    const status: StageStatus = row && isOneOf(STATUSES, row.status) ? row.status : 'queued';
    return {
      status: status === 'queued' && row?.waiting_since ? 'waiting' : status,
      ...(row?.summary ? { summary: row.summary } : {}),
      ...(row?.error ? { error: row.error } : {}),
    };
  };
  return { tracker: stage('tracker'), strategist: stage('strategist'), content: stage('content') };
}

export function toRun(row: RunRow): RunWithStatus {
  const strategy = one(row.strategies);
  const adSet = one(row.ad_sets);
  const report = one(row.competitor_reports);
  const stages = stagesOf(row.run_stages);
  const run = {
    id: row.id,
    title: row.title,
    source: sourceOf(row),
    platforms: platformsOf(row.platforms),
    goal: goalOf(row.goal),
    createdAt: row.created_at,
    ...(row.approved_at ? { approvedAt: row.approved_at } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
    stages,
    output: {
      ...(row.competitor_id ? { competitorId: row.competitor_id } : {}),
      ...(strategy ? { strategyId: strategy.id } : {}),
      ...(adSet ? { adSetId: adSet.id } : {}),
    },
    counts: {
      ...(report ? { hooks: report.hooks.length } : {}),
      ...(strategy ? { angles: strategy.strategy_angles.length } : {}),
      ...(adSet ? { variants: adSet.ad_variants.length } : {}),
    },
    activity: [...(row.run_events ?? [])].sort((a, b) => a.at.localeCompare(b.at)).map((e) => ({ at: e.at, text: e.text })),
    ...(pageOf(row) ? { page: pageOf(row) as PageSummary } : {}),
    ...(row.guidance ? { guidance: row.guidance } : {}),
    ...(row.chosen_ad_ids && row.chosen_ad_ids.length > 0 ? { chosenAds: row.chosen_ad_ids.length } : {}),
  };
  return { ...run, status: runStatus(run) };
}

function pageOf(row: Pick<RunRow, 'page_ok' | 'page_url' | 'page_title' | 'page_words' | 'page_error'>): PageSummary | null {
  if (row.page_ok === null || row.page_url === null) return null;
  if (row.page_ok === true) return { ok: true, url: row.page_url, title: row.page_title, words: typeof row.page_words === 'number' ? row.page_words : 0 };
  return { ok: false, url: row.page_url, error: row.page_error ?? 'The page could not be read.' };
}

/** One update per run, the latest thing that happened to it, newest first. */
export function toNotices(rows: RunRow[], limit = 6): Notice[] {
  const notices = rows.flatMap((row): Notice[] => {
    const stage = (key: StageKey) => row.run_stages.find((s) => s.stage === key);
    const failed = STAGE_ORDER.find((key) => stage(key)?.status === 'failed');
    const adSet = one(row.ad_sets);
    const waiting = STAGE_ORDER.find((key) => stage(key)?.status === 'queued' && stage(key)?.waiting_since);
    if (failed) {
      return [{ id: `${row.id}-failed`, text: `${STAGE_INFO[failed].name} stopped: ${row.title}`, at: stage(failed)?.finished_at ?? row.created_at, href: `/runs/${row.id}`, tone: 'failed' }];
    }
    if (waiting) {
      return [{ id: `${row.id}-waiting`, text: `${STAGE_INFO[waiting].name} waits for you: ${row.title}`, at: stage(waiting)?.waiting_since ?? row.created_at, href: `/runs/${row.id}`, tone: 'review' }];
    }
    if (adSet && row.approved_at) {
      return [{ id: `${row.id}-approved`, text: `Approved: ${row.title}`, at: row.approved_at, href: `/content/${adSet.id}`, tone: 'done' }];
    }
    if (adSet) {
      return [{ id: `${row.id}-review`, text: `Ads ready for review: ${row.title}`, at: stage('content')?.finished_at ?? row.created_at, href: `/content/${adSet.id}`, tone: 'review' }];
    }
    const tracker = stage('tracker');
    if (tracker?.status === 'done' && row.competitor_id) {
      return [{ id: `${row.id}-report`, text: `Report ready: ${row.title}`, at: tracker.finished_at ?? row.created_at, href: `/competitors/${row.competitor_id}`, tone: 'done' }];
    }
    return [];
  });
  return notices.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// ---------------------------------------------------------------- reports, strategies, ads

/**
 * The competitor and their latest report. A screenshot is shown through a link
 * signed for the viewer (`shotUrl`); lists sign none.
 */
export function toCompetitor(row: CompetitorRow, shotUrl: (path: string) => string | undefined = () => undefined): Competitor | null {
  const report = [...row.competitor_reports].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!report) return null;
  const hooks = [...report.hooks]
    .sort((a, b) => a.rank - b.rank)
    .flatMap((h): Hook[] =>
      isOneOf(PLATFORMS, h.platform)
        ? [{ id: h.id, text: h.text, platform: h.platform, format: formatOf(h.format), daysRunning: h.days_known ? h.days_running : null, variations: h.variations }]
        : [],
    );
  // In the tracker's order (longest-running first); reports from before it kept every ad, by days.
  const examples = [...report.competitor_ads]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || b.days_running - a.days_running)
    .flatMap((a, i): AdExample[] => {
      if (!isOneOf(PLATFORMS, a.platform)) return [];
      const shot = a.screenshot_path ? shotUrl(a.screenshot_path) : undefined;
      return [
        {
          id: a.id,
          platform: a.platform,
          format: formatOf(a.format),
          text: a.text,
          daysRunning: a.days_known ? a.days_running : null,
          tone: TONES[i % TONES.length] ?? 'slate',
          ...(a.headline ? { headline: a.headline } : {}),
          ...(a.cta ? { cta: a.cta } : {}),
          ...(a.angle ? { angle: a.angle } : {}),
          ...(a.ad_url && LIBRARY_AD.test(a.ad_url) ? { url: a.ad_url } : {}),
          ...(shot ? { screenshot: shot } : {}),
        },
      ];
    });
  return {
    id: row.id,
    name: row.name,
    reportId: report.id,
    tracked: row.tracked ?? true,
    ...(row.domain ? { domain: row.domain } : {}),
    ...(isOneOf(SOURCES, report.data_source) ? { dataSource: report.data_source } : {}),
    platforms: platformsOf(report.platforms),
    activeAds: report.active_ads,
    lastScanAt: report.created_at,
    insights: report.insights,
    hooks,
    angles: anglesOf(report.angles),
    examples,
  };
}

export function toStrategy(row: StrategyRow): Strategy {
  const adSet = row.ad_sets[0];
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    status: row.approved_at ? 'approved' : 'draft',
    runId: row.run_id,
    competitorIds: row.competitor_id ? [row.competitor_id] : [],
    ...(row.source_label ? { sourceLabel: row.source_label } : {}),
    goal: goalOf(row.goal),
    audiences: row.audiences,
    positioning: row.positioning,
    angles: [...row.strategy_angles]
      .sort((a, b) => a.position - b.position)
      .map((a) => ({
        id: a.id,
        name: a.name,
        why: a.why,
        hook: a.hook,
        ...(a.based_on_hook && row.competitor_id ? { basedOn: { competitorId: row.competitor_id, hook: a.based_on_hook } } : {}),
      })),
    channels: channelsOf(row.channels),
    guardrails: row.guardrails,
    ...(adSet ? { adSetId: adSet.id } : {}),
  };
}

/** A variant's picture progress: absent when nothing is pending and nothing needs saying. */
function pictureOf(v: AdSetRow['ad_variants'][number]): VariantPicture | null {
  const status = v.picture_status === 'making' || v.picture_status === 'failed' ? v.picture_status : 'none';
  if (status === 'none' && !v.picture_error) return null;
  return { status, ...(v.picture_error ? { note: v.picture_error } : {}), ...(status === 'making' && v.picture_requested_at ? { askedAt: v.picture_requested_at } : {}) };
}

/** The pictures kept for a variant to choose again, newest first. */
function picturesOf(v: AdSetRow['ad_variants'][number], pictureUrl: (path: string) => string | undefined): PictureChoice[] {
  return (v.variant_pictures ?? [])
    .filter((p) => p.removed_at === null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .map((p) => {
      const url = pictureUrl(p.path);
      return { id: p.id, ...(url ? { url } : {}), ...(p.prompt ? { prompt: p.prompt } : {}), shown: p.path === v.picture_path, createdAt: p.created_at };
    });
}

/**
 * An ad set as the studio shows it. `pictureUrl` turns a picture's path in
 * Storage into a link the viewer may open; the bucket is private.
 */
export function toAdSet(row: AdSetRow, pictureUrl: (path: string) => string | undefined = () => undefined): AdSet {
  const run = one(row.runs);
  const clip = run ? clipOf(run.media_path, run.media) : null;
  const variants = [...row.ad_variants]
    .sort((a, b) => a.label.localeCompare(b.label))
    .flatMap((v): Variant[] => {
      if (v.label !== 'A' && v.label !== 'B' && v.label !== 'C') return [];
      // An edit that no longer fits the clip is dropped: the variant shows the whole clip again.
      const edit = clip && v.video_edit !== null ? parseVideoEdit(v.video_edit, clip.duration) : null;
      // A layout that no longer reads is dropped: the picture goes back to the style's.
      const design = !clip && v.design ? parseDesign(v.design) : null;
      const imageUrl = v.picture_path ? pictureUrl(v.picture_path) : undefined;
      const picture = pictureOf(v);
      const pictures = picturesOf(v, pictureUrl);
      return [
        {
          id: v.id,
          label: v.label,
          angle: v.angle,
          creative: { text: v.creative_text, style: isOneOf(STYLES, v.creative_style) ? v.creative_style : 'arcs' },
          copy: copyOf(v.copy),
          ...(Object.keys(postsOf(v.posts)).length > 0 ? { posts: postsOf(v.posts) } : {}),
          ...(v.approved_at ? { approved: true } : {}),
          warnings: v.warnings,
          ...(imageUrl ? { imageUrl } : {}),
          ...(v.image_prompt?.trim() ? { picturePrompt: v.image_prompt.trim() } : {}),
          ...(picture ? { picture } : {}),
          ...(pictures.length > 0 ? { pictures } : {}),
          // Without its own edit, an ad starts from the one made as the clip was uploaded.
          ...(edit?.ok ? { videoEdit: edit.value } : clip?.edit ? { videoEdit: clip.edit } : {}),
          ...(design?.ok && design.value ? { design: design.value } : {}),
        },
      ];
    });
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    runId: row.run_id,
    strategyId: row.strategy_id,
    status: variants.some((v) => v.approved) ? 'approved' : 'review',
    variants,
    ...(clip ? { clip } : {}),
  };
}

// ---------------------------------------------------------------- the rest

export const toBrandProfile = (row: BrandRow): BrandProfile => ({
  company: row.company,
  website: row.website,
  offer: row.offer,
  audience: row.audience,
  voice: row.voice,
  guardrails: row.guardrails,
  pageName: row.page_name,
  xHandle: row.x_handle,
});

/** What the agents read beside the profile. A picture style left empty is an empty string. */
export function toBrandMemory(row: BrandRow): BrandMemory {
  const formats: BrandMemory['postFormats'] = {};
  if (isRecord(row.post_formats)) {
    for (const place of EXAMPLE_PLACES) {
      const note = row.post_formats[place];
      if (typeof note === 'string' && note.trim()) formats[place] = note;
    }
  }
  return { topics: row.topics, postFormats: formats, pictureStyle: row.picture_style ?? '' };
}

export function toBrandExample(row: BrandExampleRow): BrandExample | null {
  if (!isOneOf(EXAMPLE_PLACES, row.place) || (row.source !== 'pasted' && row.source !== 'marked')) return null;
  return {
    id: row.id,
    place: row.place,
    text: row.text,
    ...(row.note ? { note: row.note } : {}),
    source: row.source,
    ...(row.post_id ? { postId: row.post_id } : {}),
    createdAt: row.created_at,
  };
}

const ROLE_LABEL: Record<TeamRole, string> = { owner: 'Owner', member: 'Team member' };

export function toUser(viewer: Viewer): User {
  return {
    name: viewer.name,
    firstName: viewer.name.split(/\s+/)[0] ?? viewer.name,
    role: viewer.role ? ROLE_LABEL[viewer.role] : 'Not on the team',
    initials: initialsOf(viewer.name),
  };
}

/**
 * The agent cards, from what is in the database and the team's switches. The
 * tracker's switch is the scan schedule; the strategist's and the content
 * agent's say whether each starts by itself after the agent before it.
 */
export function toAgents(settings: AgentSettings, counts: { competitors: number; strategies: number }, toReview: AdSet[], switchable = true): Agent[] {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const first = toReview[0];
  return [
    {
      key: 'tracker',
      auto: settings.scanEvery !== 'off',
      switchable,
      autoLabel: scanLabel(settings.scanEvery === 'off' ? { ...settings, scanEvery: 'week' } : settings) ?? '',
      manualLabel: 'Scans when you ask',
      stat: `${plural(counts.competitors, 'competitor', 'competitors')} tracked`,
      href: '/competitors',
      action: { label: 'New scan', href: '/runs/new' },
    },
    {
      key: 'strategist',
      auto: settings.strategistAuto,
      switchable,
      autoLabel: 'Runs after every scan',
      manualLabel: 'Waits for you after a scan',
      stat: plural(counts.strategies, 'strategy', 'strategies'),
      href: '/strategy',
      action: { label: 'Custom run', href: '/runs/new?type=custom' },
    },
    {
      key: 'content',
      auto: settings.contentAuto,
      switchable,
      autoLabel: 'Writes ads from every strategy',
      manualLabel: 'Waits for your go-ahead',
      stat: `${plural(toReview.length, 'set', 'sets')} to review`,
      href: '/content',
      action: first ? { label: 'Review', href: `/content/${first.id}` } : { label: 'View ads', href: '/content' },
    },
  ];
}

const SCAN_EVERY: readonly ScanEvery[] = ['off', 'day', 'week'];

export function toTeamSettings(row: SettingsRow): TeamSettings {
  return {
    timeZone: row.time_zone,
    strategistAuto: row.strategist_auto,
    contentAuto: row.content_auto,
    picturesAuto: row.pictures_auto,
    adsSource: isOneOf(ADS_SETTINGS, row.ads_source) ? row.ads_source : 'sample',
    pictureModel: isOneOf(PICTURE_MODELS, row.pictures_model) ? row.pictures_model : 'stand-in',
    cloudflareAccount: row.cloudflare_account ?? '',
    picturesQuality: isOneOf(PICTURE_QUALITIES, row.pictures_quality) ? row.pictures_quality : 'low',
    scanEvery: isOneOf(SCAN_EVERY, row.scan_every) ? row.scan_every : 'off',
    scanDay: row.scan_day,
    scanHour: row.scan_hour,
    pages: {
      facebook: row.facebook_page_id ? { id: row.facebook_page_id, name: row.facebook_page_name ?? '' } : null,
      instagram: row.instagram_account_id ? { id: row.instagram_account_id, username: row.instagram_username ?? '' } : null,
      linkedin: row.linkedin_org_id ? { id: row.linkedin_org_id, name: row.linkedin_page_name ?? '' } : null,
    },
    postForReal: { facebook: row.facebook_live, instagram: row.instagram_live, linkedin: row.linkedin_live },
    postLink: row.post_link,
  };
}

export function toPost(row: PostRow): Post | null {
  const variant = one(row.ad_variants);
  if (!variant || (variant.label !== 'A' && variant.label !== 'B' && variant.label !== 'C')) return null;
  const order = (p: string) => (PLACES as readonly string[]).indexOf(p);
  const targets = [...row.post_targets]
    .sort((a, b) => order(a.place) - order(b.place))
    .flatMap((t): PostTarget[] =>
      isOneOf(PLACES, t.place) && isOneOf(POST_STATUSES, t.status)
        ? [
            {
              place: t.place,
              text: t.text,
              media: t.media_kind === 'image' || t.media_kind === 'video' ? t.media_kind : null,
              status: t.status,
              ...(t.posted_at ? { postedAt: t.posted_at } : {}),
              ...(t.remote_url ? { url: t.remote_url } : {}),
              standIn: t.stand_in,
              ...(t.error ? { error: t.error } : {}),
              ...(t.results_at && [t.reach, t.views, t.reactions, t.comments, t.shares, t.clicks].some((n) => n !== null)
                ? { results: { reach: t.reach, views: t.views, reactions: t.reactions, comments: t.comments, shares: t.shares, clicks: t.clicks, at: t.results_at } }
                : {}),
              ...(t.results_error ? { resultsError: t.results_error } : {}),
              ...(row.brand_examples?.some((e) => e.place === t.place && e.removed_at === null) ? { remembered: true } : {}),
            },
          ]
        : [],
    );
  return {
    id: row.id,
    variantId: row.variant_id,
    variantLabel: variant.label,
    adSetId: variant.ad_set_id,
    adSetTitle: one(variant.ad_sets)?.title ?? 'Ads',
    angle: variant.angle,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
    ...(row.thumbnail ? { thumbnail: row.thumbnail } : {}),
    targets,
  };
}

/** A validated new run as create_run's arguments. Absent SQL defaults are omitted, never sent as null. */
export function toCreateRunArgs(input: NewRunInput, page: PageRead | null = null): Database['public']['Functions']['create_run']['Args'] {
  const { source } = input;
  const base = { p_title: runTitle(input), p_platforms: input.platforms, p_goal: input.goal, ...(page ? { p_page: page as unknown as Json } : {}) };
  if (source.kind === 'competitor') {
    if (source.input === 'upload') return { ...base, p_kind: 'competitor', p_input: 'upload', p_competitor_name: source.name, p_files: source.files };
    return { ...base, p_kind: 'competitor', p_input: source.input, p_url: source.url };
  }
  if (source.type === 'text') return { ...base, p_kind: 'custom', p_input: 'text', p_excerpt: source.excerpt };
  if ('clip' in source) {
    const { path, name, duration, width, height, size, transcript, edit } = source.clip;
    const media = {
      name,
      duration,
      width,
      height,
      size,
      ...(transcript ? { transcript: transcript.map((l) => ({ start: l.start, end: l.end, text: l.text })) } : {}),
      ...(edit ? { edit: edit as unknown as Json } : {}),
    };
    return { ...base, p_kind: 'custom', p_input: 'video', p_excerpt: source.notes, p_media_path: path, p_media: media };
  }
  return { ...base, p_kind: 'custom', p_input: source.type, p_url: source.url };
}

// ---------------------------------------------------------------- what is at work now

/** What the agents and n8n are doing, as read for the top bar's Working list. */
export interface ActivityRows {
  /** Stages an agent is running. */
  stages: { run_id: string; stage: string; started_at: string | null; runs: One<{ title: string }> }[];
  /** Places being sent, or waiting to be. */
  places: {
    post_id: string;
    place: string;
    status: string;
    claimed_at: string | null;
    posts: One<{ scheduled_for: string; ad_variants: One<{ label: string; ad_sets: One<{ title: string }> }> }>;
  }[];
  /** Ads waiting for a picture. */
  pictures: { id: string; label: string; ad_set_id: string; picture_requested_at: string | null; ad_sets: One<{ title: string }> }[];
  /** AI videos waiting to be sent, or being made by Higgsfield. */
  videos?: { id: string; prompt: string; asked_at: string }[];
}

/**
 * How long each kind of work takes at most. Past it, the work is not at work
 * but stuck, and the page it belongs to says so: the run's stage, a post to
 * check on the Page, Ask again on a picture.
 */
export const WORKING_MINUTES = {
  /** An agent's turn: its longest call to Claude, or to Apify, with time to spare. */
  agent: 30,
  /** A post going out: the publisher marks a place still sending after 15 minutes as unknown. */
  sending: 15,
  /** A picture: the studio offers to ask again after 10 minutes. */
  picture: 10,
  /** An AI video: Higgsfield takes a few minutes; past half an hour the page says what became of it. */
  video: 30,
} as const;

/** What is at work now, newest first: one line for each run an agent is on, each post going out, each picture and each AI video being made. */
export function toActivity(rows: ActivityRows, now: string): ActivityItem[] {
  const at = Date.parse(now);
  const recent = (iso: string | null | undefined, minutes: number): iso is string => !!iso && at - Date.parse(iso) <= minutes * 60_000;
  const items: ActivityItem[] = [];

  for (const s of rows.stages) {
    if (!isOneOf(STAGE_ORDER, s.stage) || !recent(s.started_at, WORKING_MINUTES.agent)) continue;
    items.push({ id: `run-${s.run_id}`, kind: 'run', label: STAGE_INFO[s.stage].name, subject: one(s.runs)?.title ?? 'A run', href: `/runs/${s.run_id}`, since: s.started_at, stage: s.stage });
  }

  // A post's places go out together: one line for the post, naming them all.
  const sending = new Map<string, { places: Place[]; since: string; subject: string }>();
  for (const t of rows.places) {
    const post = one(t.posts);
    if (!post || !isOneOf(PLACES, t.place)) continue;
    // Claimed by the publisher, or due and about to be.
    const since = t.status === 'posting' ? (t.claimed_at ?? post.scheduled_for) : t.status === 'scheduled' && Date.parse(post.scheduled_for) <= at ? post.scheduled_for : null;
    if (!recent(since, WORKING_MINUTES.sending)) continue;
    const variant = one(post.ad_variants);
    const entry = sending.get(t.post_id) ?? { places: [], since, subject: `${one(variant?.ad_sets)?.title ?? 'An ad'}, variant ${variant?.label ?? '?'}` };
    entry.places.push(t.place);
    if (since < entry.since) entry.since = since;
    sending.set(t.post_id, entry);
  }
  for (const [postId, post] of sending) {
    const places = PLACES.filter((p) => post.places.includes(p)).map((p) => PLACE_LABEL[p]);
    items.push({ id: `post-${postId}`, kind: 'post', label: `Sending to ${places.join(', ')}`, subject: post.subject, href: `/posts#post-${postId}`, since: post.since });
  }

  for (const v of rows.pictures) {
    if (!recent(v.picture_requested_at, WORKING_MINUTES.picture)) continue;
    items.push({ id: `picture-${v.id}`, kind: 'picture', label: 'Making a picture', subject: `${one(v.ad_sets)?.title ?? 'An ad'}, variant ${v.label}`, href: `/content/${v.ad_set_id}`, since: v.picture_requested_at });
  }

  for (const v of rows.videos ?? []) {
    if (!recent(v.asked_at, WORKING_MINUTES.video)) continue;
    items.push({ id: `video-${v.id}`, kind: 'video', label: 'Making a video', subject: videoTitle(v.prompt), href: '/videos?view=ai', since: v.asked_at });
  }

  return items.sort((a, b) => b.since.localeCompare(a.since));
}

// ---------------------------------------------------------------- long videos

export interface LongVideoRow {
  id: string;
  title: string;
  file: Json;
  guidance: string | null;
  status: string;
  error: string | null;
  moments: Json;
  created_at: string;
  transcript?: Json;
  lines?: number | null;
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function toMoment(raw: unknown): Moment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.first !== 'number' || typeof m.last !== 'number') return null;
  return {
    first: m.first,
    last: m.last,
    start: num(m.start),
    end: num(m.end),
    title: str(m.title) ?? 'A moment',
    why: str(m.why),
    hook: str(m.hook),
    warnings: Array.isArray(m.warnings) ? m.warnings.filter((w): w is string => typeof w === 'string') : [],
    source: m.source === 'team' ? 'team' : 'agent',
    runIds: Array.isArray(m.run_ids) ? m.run_ids.filter((r): r is string => typeof r === 'string') : [],
  };
}

function toLines(raw: unknown): TranscriptLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((l): TranscriptLine[] => {
    if (!l || typeof l !== 'object') return [];
    const line = l as Record<string, unknown>;
    return typeof line.start === 'number' && typeof line.end === 'number' && typeof line.text === 'string' ? [{ start: line.start, end: line.end, text: line.text }] : [];
  });
}

const LONG_STATUS: Record<string, LongVideo['status']> = { queued: 'waiting', working: 'working', done: 'done', failed: 'failed' };

/** A long video as the pages show it; with its transcript when the row has one. */
export function toLongVideo(row: LongVideoRow): LongVideoWithTranscript {
  const f = row.file && typeof row.file === 'object' && !Array.isArray(row.file) ? (row.file as Record<string, unknown>) : {};
  const transcript = toLines(row.transcript);
  return {
    id: row.id,
    title: row.title,
    file: { name: str(f.name) ?? 'video', size: num(f.size), duration: num(f.duration), width: num(f.width), height: num(f.height) },
    guidance: row.guidance,
    status: LONG_STATUS[row.status] ?? 'waiting',
    error: row.error,
    moments: (Array.isArray(row.moments) ? row.moments : []).map(toMoment).filter((m): m is Moment => m !== null),
    lines: row.lines ?? transcript.length,
    createdAt: row.created_at,
    transcript,
  };
}

/** The arguments create_long_video takes: the guidance only when there is one. */
export const toCreateLongVideoArgs = (input: NewLongVideo) => ({
  p_title: input.title,
  p_file: input.file as unknown as Json,
  p_transcript: input.transcript as unknown as Json,
  ...(input.guidance ? { p_guidance: input.guidance } : {}),
});

// ---------------------------------------------------------------- leads

export type LeadRow = Pick<
  Database['public']['Tables']['leads']['Row'],
  | 'id'
  | 'zoho_id'
  | 'name'
  | 'zoho_status'
  | 'zoho_source'
  | 'platform'
  | 'campaign'
  | 'answers'
  | 'place'
  | 'created_in_zoho'
  | 'verdict'
  | 'reasons'
  | 'judged_at'
  | 'judged_criteria_at'
  | 'judge_status'
  | 'judge_error'
  | 'person_verdict'
  | 'person_note'
  | 'person_at'
> & {
  runs?: One<{ id: string; title: string }> | null;
  ad_variants?: One<{ id: string; label: string; angle: string; ad_set_id: string }> | null;
};

const text = (v: Json | undefined, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

function toLeadCampaign(raw: Json): LeadCampaign {
  if (!isRecord(raw)) return {};
  const utmRaw = isRecord(raw.utm) ? raw.utm : {};
  const utm: NonNullable<LeadCampaign['utm']> = {};
  for (const key of ['source', 'medium', 'campaign', 'content', 'term'] as const) {
    const v = text(utmRaw[key], 120);
    if (v) utm[key] = v;
  }
  const out: LeadCampaign = {};
  for (const [key, from] of [['id', 'id'], ['name', 'name'], ['adId', 'ad_id'], ['adName', 'ad_name'], ['adset', 'adset'], ['form', 'form']] as const) {
    const v = text(raw[from], 160);
    if (v) out[key] = v;
  }
  return Object.keys(utm).length > 0 ? { ...out, utm } : out;
}

function toLeadReasons(raw: Json): LeadReason[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r): LeadReason[] => {
    if (!isRecord(r)) return [];
    const reason = text(r.text, 300);
    return reason ? [{ text: reason, field: text(r.field, 80) ?? null, quote: text(r.quote, 300) ?? null }] : [];
  });
}

/** A lead as the dashboard shows it. A verdict judged before the criteria last changed says so. */
export function toLead(row: LeadRow, settings: Pick<LeadSettings, 'zoho' | 'criteriaAt'>): Lead {
  const run = one(row.runs);
  const variant = one(row.ad_variants);
  const label = variant && (variant.label === 'A' || variant.label === 'B' || variant.label === 'C') ? variant.label : undefined;
  const place = row.place === 'x' || isOneOf(PLACES, row.place) ? row.place : undefined;
  const answers = Array.isArray(row.answers)
    ? row.answers.flatMap((a) => {
        if (!isRecord(a)) return [];
        const field = text(a.field, 80);
        const value = text(a.value, 500);
        return field && value ? [{ field, value }] : [];
      })
    : [];
  const verdict = row.verdict === 'qualified' || row.verdict === 'not_qualified' || row.verdict === 'unclear' ? row.verdict : null;
  const judging = row.judge_status === 'done' || row.judge_status === 'failed' || row.judge_status === 'working' ? row.judge_status : 'waiting';
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_in_zoho,
    platform: isLeadPlatform(row.platform) ? row.platform : 'other',
    ...(row.zoho_status ? { zohoStatus: row.zoho_status } : {}),
    ...(row.zoho_source ? { zohoSource: row.zoho_source } : {}),
    ...(settings.zoho ? { zohoUrl: zohoLeadUrl(settings.zoho, row.zoho_id) } : {}),
    campaign: toLeadCampaign(row.campaign),
    ...(run
      ? {
          from: {
            runId: run.id,
            runTitle: run.title,
            ...(variant ? { adSetId: variant.ad_set_id, variantId: variant.id, angle: variant.angle } : {}),
            ...(label ? { label } : {}),
            ...(place ? { place } : {}),
          },
        }
      : {}),
    answers,
    ...(verdict && row.judged_at
      ? { ai: { verdict, reasons: toLeadReasons(row.reasons), at: row.judged_at, olderCriteria: !row.judged_criteria_at || Date.parse(row.judged_criteria_at) < Date.parse(settings.criteriaAt) } }
      : {}),
    judging,
    ...(judging === 'failed' && row.judge_error ? { judgeError: row.judge_error } : {}),
    ...(row.person_verdict === 'qualified' || row.person_verdict === 'not_qualified'
      ? { person: { verdict: row.person_verdict, ...(row.person_note ? { note: row.person_note } : {}), at: row.person_at ?? row.created_in_zoho } }
      : {}),
  };
}

export function toLeadSettings(row: SettingsRow): LeadSettings {
  return {
    criteria: row.lead_criteria,
    criteriaAt: row.lead_criteria_at,
    source: row.leads_source === 'zoho' ? 'zoho' : 'off',
    zoho: isZohoRegion(row.zoho_region) ? { region: row.zoho_region, org: row.zoho_org } : null,
    syncedAt: row.leads_synced_at,
    checkedAt: row.leads_checked_at,
    syncError: row.leads_sync_error,
    postLink: row.post_link,
  };
}

// ---------------------------------------------------------------- AI video

export interface AiVideoRow {
  id: string;
  prompt: string;
  model: string;
  seconds: number;
  aspect: string;
  quality: string;
  sound: boolean;
  picture_path: string | null;
  credits: number | string;
  status: string;
  error: string | null;
  asked_at: string;
}

const VIDEO_MODEL_KEYS = ['seedance_2_0_mini', 'kling3_0', 'seedance_2_5'] as const;
const VIDEO_STATUSES = ['asked', 'making', 'ready', 'failed', 'unknown', 'stand_in'] as const;
const VIDEO_ASPECT_KEYS = ['9:16', '1:1', '16:9'] as const;

/**
 * A video as the library shows it, with the links the server signed for its
 * file and its first picture. A row the dashboard has no shape for (a model
 * no longer offered) is dropped.
 */
export function toAiVideo(row: AiVideoRow, links: { video?: string | null; picture?: string | null } = {}): AiVideo | null {
  if (!isOneOf(VIDEO_MODEL_KEYS, row.model) || !isOneOf(VIDEO_STATUSES, row.status) || !isOneOf(VIDEO_ASPECT_KEYS, row.aspect)) return null;
  const credits = typeof row.credits === 'number' ? row.credits : Number.parseFloat(row.credits);
  return {
    id: row.id,
    title: videoTitle(row.prompt),
    prompt: row.prompt,
    model: row.model,
    seconds: row.seconds,
    aspect: row.aspect,
    quality: row.quality,
    sound: row.sound,
    picture: row.picture_path ? { path: row.picture_path, ...(links.picture ? { url: links.picture } : {}) } : null,
    credits: Number.isFinite(credits) ? credits : 0,
    status: row.status,
    ...(row.status === 'ready' && links.video ? { url: links.video } : {}),
    ...(row.error ? { error: row.error } : {}),
    createdAt: row.asked_at,
  };
}

/** AI video's switch and this month's credits, as video_budget() answers. */
export function toVideoBudget(json: Json): VideoBudget {
  const r = isRecord(json) ? json : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(Number.parseFloat(v)) ? Number.parseFloat(v) : 0);
  return { live: r.live === true, cap: num(r.cap), spent: num(r.spent), pictures: num(r.pictures) };
}
