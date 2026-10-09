// Turns rows as Supabase returns them into the dashboard's shapes
// (lib/types.ts). Pure, so it is tested with fixtures (map.test.ts). Anything
// the database could hold that the dashboard has no shape for (an unknown
// platform, a malformed JSON column) is dropped here rather than crashing a page.

import { runStatus, STAGE_INFO, STAGE_ORDER } from '../pipeline';
import { CLIP_PATH, runTitle } from '../run-input';
import type { NewRunInput } from '../run-input';
import type { TeamRole, Viewer } from '../session';
import type { Database, Json } from '../supabase/database.types';
import { GOALS, PLACES, PLATFORMS } from '../types';
import { PLACE_LABEL } from '../post-input';
import type {
  ActivityItem,
  AdExample,
  AdFormat,
  AdSet,
  AdSource,
  AdsSetting,
  Agent,
  AgentSettings,
  AngleShare,
  BrandProfile,
  ChannelPlan,
  Clip,
  Competitor,
  CreativeStyle,
  Goal,
  Hook,
  Notice,
  PageRead,
  PageSummary,
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
} from '../types';
import { parseVideoEdit } from '../video/edit';
import { scanLabel } from '../schedule';
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
    hooks: { id: string; rank: number; text: string; platform: string; format: string; days_running: number; variations: number }[];
    competitor_ads: { id: string; platform: string; format: string; text: string; days_running: number; ad_url: string | null }[];
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
    warnings: string[];
    approved_at: string | null;
    video_edit: Json | null;
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
}

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
  return {
    path,
    name: typeof media.name === 'string' && media.name ? media.name : 'Uploaded clip',
    duration: media.duration,
    width: count(media.width),
    height: count(media.height),
    size: count(media.size),
    ...(transcript.length > 0 ? { transcript } : {}),
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

export function toCompetitor(row: CompetitorRow): Competitor | null {
  const report = [...row.competitor_reports].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!report) return null;
  const hooks = [...report.hooks]
    .sort((a, b) => a.rank - b.rank)
    .flatMap((h): Hook[] =>
      isOneOf(PLATFORMS, h.platform) ? [{ id: h.id, text: h.text, platform: h.platform, format: formatOf(h.format), daysRunning: h.days_running, variations: h.variations }] : [],
    );
  const examples = [...report.competitor_ads]
    .sort((a, b) => b.days_running - a.days_running)
    .flatMap((a, i): AdExample[] =>
      isOneOf(PLATFORMS, a.platform)
        ? [
            {
              id: a.id,
              platform: a.platform,
              format: formatOf(a.format),
              text: a.text,
              daysRunning: a.days_running,
              tone: TONES[i % TONES.length] ?? 'slate',
              ...(a.ad_url && LIBRARY_AD.test(a.ad_url) ? { url: a.ad_url } : {}),
            },
          ]
        : [],
    );
  return {
    id: row.id,
    name: row.name,
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
      const imageUrl = v.picture_path ? pictureUrl(v.picture_path) : undefined;
      const picture = pictureOf(v);
      return [
        {
          id: v.id,
          label: v.label,
          angle: v.angle,
          creative: { text: v.creative_text, style: isOneOf(STYLES, v.creative_style) ? v.creative_style : 'arcs' },
          copy: copyOf(v.copy),
          ...(v.approved_at ? { approved: true } : {}),
          warnings: v.warnings,
          ...(imageUrl ? { imageUrl } : {}),
          ...(v.image_prompt?.trim() ? { picturePrompt: v.image_prompt.trim() } : {}),
          ...(picture ? { picture } : {}),
          ...(edit?.ok ? { videoEdit: edit.value } : {}),
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
    scanEvery: isOneOf(SCAN_EVERY, row.scan_every) ? row.scan_every : 'off',
    scanDay: row.scan_day,
    scanHour: row.scan_hour,
    pages: {
      facebook: row.facebook_page_id ? { id: row.facebook_page_id, name: row.facebook_page_name ?? '' } : null,
      instagram: row.instagram_account_id ? { id: row.instagram_account_id, username: row.instagram_username ?? '' } : null,
      linkedin: row.linkedin_org_id ? { id: row.linkedin_org_id, name: row.linkedin_page_name ?? '' } : null,
    },
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
    const { path, name, duration, width, height, size, transcript } = source.clip;
    const media = { name, duration, width, height, size, ...(transcript ? { transcript: transcript.map((l) => ({ start: l.start, end: l.end, text: l.text })) } : {}) };
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
} as const;

/** What is at work now, newest first: one line for each run an agent is on, each post going out and each picture being made. */
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

  return items.sort((a, b) => b.since.localeCompare(a.since));
}
