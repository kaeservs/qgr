// The dashboard's domain model. The sample data (`mock-data.ts`) and the
// Supabase source (`data/live.ts`) both produce these shapes, so pages never
// know which one they are reading.

import type { VideoEdit } from './video/edit';

export const PLATFORMS = ['meta', 'linkedin', 'x'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const GOALS = ['consultations', 'webinar', 'awareness', 'guide'] as const;
export type Goal = (typeof GOALS)[number];

/** The three agents, in the order a run passes through them. */
export type StageKey = 'tracker' | 'strategist' | 'content';
/** `waiting`: queued, but its agent waits for a person because its switch is off. */
export type StageStatus = 'skipped' | 'queued' | 'waiting' | 'running' | 'done' | 'failed';
export type RunStatus = 'queued' | 'running' | 'waiting' | 'review' | 'approved' | 'failed';

export const CUSTOM_SOURCES = ['podcast', 'blog', 'video', 'text'] as const;
export type CustomSourceType = (typeof CUSTOM_SOURCES)[number];

/**
 * A video a run starts from, cut in the browser and uploaded to Storage
 * (bucket run-media) before the run exists. `path` is where it is kept.
 */
export interface Clip {
  path: string;
  /** The file's name, as the person picked it. */
  name: string;
  /** Seconds. */
  duration: number;
  width: number;
  height: number;
  /** Bytes. */
  size: number;
  /** What is said in it, line by line, when it was transcribed: in the clip's own seconds. */
  transcript?: TranscriptLine[];
}

/** One line said in a clip. Seconds are the clip's own, so a line stays with its words whatever is cut. */
export interface TranscriptLine {
  start: number;
  end: number;
  text: string;
}

/**
 * What a run starts from. A competitor run starts at the Competitor Tracker;
 * a custom run (podcast, blog, video, text) has no competitor to track and
 * starts at the Ad Strategist. A video is a link, or a clip with the team's
 * notes on what is said in it: the agents cannot watch it.
 */
export type RunSource =
  | { kind: 'competitor'; input: 'website' | 'ad_link'; url: string }
  | { kind: 'competitor'; input: 'upload'; name: string; files: string[] }
  | { kind: 'custom'; type: Exclude<CustomSourceType, 'text'>; url: string }
  | { kind: 'custom'; type: 'video'; clip: Clip; notes: string }
  | { kind: 'custom'; type: 'text'; excerpt: string };

/**
 * What the reader got from a link, read when the run starts and stored with it.
 * The agents read this text; they never fetch a link themselves.
 */
export type PageRead =
  | {
      ok: true;
      /** Where the page ended up, after redirects. */
      url: string;
      title: string | null;
      siteName: string | null;
      description: string | null;
      type: 'article' | 'video' | 'podcast' | 'website';
      text: string;
      words: number;
      readAt: string;
    }
  | { ok: false; url: string; error: string; readAt: string };

/** What a run's page shows of the link it read: never the text itself. */
export type PageSummary = { ok: true; url: string; title: string | null; words: number } | { ok: false; url: string; error: string };

export interface Stage {
  status: StageStatus;
  /** One line on what the agent produced. */
  summary?: string;
  error?: string;
}

export interface RunEvent {
  at: string;
  text: string;
}

export interface Run {
  id: string;
  title: string;
  source: RunSource;
  platforms: Platform[];
  goal: Goal;
  createdAt: string;
  approvedAt?: string;
  /** The run's headline finding, one line. */
  summary?: string;
  stages: Record<StageKey, Stage>;
  output: { competitorId?: string; strategyId?: string; adSetId?: string };
  counts: { hooks?: number; angles?: number; variants?: number };
  activity: RunEvent[];
  /** What was read from the run's link when it started. */
  page?: PageSummary;
}

export type AdFormat = 'video' | 'image' | 'carousel' | 'document' | 'text';
export type CreativeStyle = 'arcs' | 'split' | 'spotlight';

export interface Hook {
  id: string;
  text: string;
  platform: Platform;
  format: AdFormat;
  /** How long the ad has kept running: advertisers stop paying for ads that do not work. */
  daysRunning: number;
  variations: number;
}

export interface AngleShare {
  label: string;
  ads: number;
}

/** A competitor's ad as the tracker saw it. Drawn in neutral tones so it is never mistaken for one of ours. */
export interface AdExample {
  id: string;
  platform: Platform;
  format: AdFormat;
  text: string;
  daysRunning: number;
  tone: 'slate' | 'teal' | 'plum' | 'sand';
}

/** Where a report's ads came from. 'placeholder' means sample ads: Apify is not connected yet. */
export type AdSource = 'apify' | 'placeholder' | 'upload';

export interface Competitor {
  id: string;
  name: string;
  /** Scanned on the team's schedule. Off for a competitor the team no longer follows. */
  tracked: boolean;
  /** Absent for a competitor known only from uploaded ads. */
  domain?: string;
  /** Where the latest report's ads came from. */
  dataSource?: AdSource;
  platforms: Platform[];
  activeAds: number;
  lastScanAt: string;
  insights: string[];
  hooks: Hook[];
  angles: AngleShare[];
  examples: AdExample[];
}

export interface StrategyAngle {
  id: string;
  name: string;
  why: string;
  hook: string;
  /** The competitor hook this angle answers, when it came from a competitor run. */
  basedOn?: { competitorId: string; hook: string };
}

export interface ChannelPlan {
  platform: Platform;
  /** Share of budget, in percent. */
  share: number;
  role: string;
  format: string;
}

export interface Strategy {
  id: string;
  title: string;
  createdAt: string;
  status: 'draft' | 'approved';
  runId: string;
  competitorIds: string[];
  /** For a custom run: what it was made from. */
  sourceLabel?: string;
  goal: Goal;
  audiences: string[];
  positioning: string;
  angles: StrategyAngle[];
  channels: ChannelPlan[];
  guardrails: string[];
  adSetId?: string;
}

export interface PlatformCopy {
  text: string;
  headline: string;
  description?: string;
  cta?: string;
}

export interface Variant {
  id: string;
  label: 'A' | 'B' | 'C';
  angle: string;
  creative: { text: string; style: CreativeStyle };
  /** Copy for each platform the run asked for. */
  copy: Partial<Record<Platform, PlatformCopy>>;
  approved?: boolean;
  /** Phrases flagged against the guardrails, for a person to judge before approving. */
  warnings?: string[];
  /** The generated image, once an image model is connected. Until then the branded design is drawn. */
  imageUrl?: string;
  /** How this variant uses its run's clip, when the run started from one. Absent: the whole clip as it is. */
  videoEdit?: VideoEdit;
}

export interface AdSet {
  id: string;
  title: string;
  createdAt: string;
  runId: string;
  strategyId: string;
  status: 'generating' | 'review' | 'approved';
  variants: Variant[];
  /** The clip the run started from: each variant is a video made from it. */
  clip?: Clip;
}

export interface Agent {
  key: StageKey;
  auto: boolean;
  /** Whether the dashboard can switch auto-run. Off until the pipeline can act on the switch. */
  switchable: boolean;
  /** Shown under the name while auto-run is on. */
  autoLabel: string;
  /** Shown while it is off. */
  manualLabel: string;
  stat: string;
  href: string;
  action: { label: string; href: string };
}

export interface User {
  name: string;
  firstName: string;
  role: string;
  initials: string;
}

/** What every agent reads before it writes. */
export interface BrandProfile {
  company: string;
  website: string;
  offer: string;
  audience: string;
  voice: string[];
  guardrails: string[];
  pageName: string;
  xHandle: string;
}

export interface Notice {
  id: string;
  text: string;
  at: string;
  href: string;
  tone: 'review' | 'done' | 'failed';
}

export interface SearchItem {
  label: string;
  sub: string;
  href: string;
  kind: 'competitor' | 'run' | 'strategy' | 'content' | 'page';
}

/** Where a post goes. Facebook and Instagram take a variant's Meta copy, LinkedIn its LinkedIn copy. */
export const PLACES = ['facebook', 'instagram', 'linkedin'] as const;
export type Place = (typeof PLACES)[number];

/**
 * scheduled → posting → posted; failed when nothing went out (a person can
 * try again); unknown when it may have gone out, so it is never sent again by
 * itself; cancelled by a person.
 */
export type PostStatus = 'scheduled' | 'posting' | 'posted' | 'failed' | 'unknown' | 'cancelled';

/** How a post did on one platform, as the platform counts it. Null: the platform does not report that number for this post. */
export interface PostResults {
  reach: number | null;
  views: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  /** When the numbers were read. */
  at: string;
}

export interface PostTarget {
  place: Place;
  /** Exactly what goes out: the approved copy, copied when the post was made. */
  text: string;
  media: 'image' | 'video' | null;
  status: PostStatus;
  postedAt?: string;
  /** The live post, when the platform gave a link. */
  url?: string;
  /** Went through a stand-in for the platform: nothing was really posted. */
  standIn: boolean;
  error?: string;
  /** Read from the platform after it went out; only real posts have them. */
  results?: PostResults;
  /** Why the last read of the results failed; the numbers before it stay. */
  resultsError?: string;
}

export interface Post {
  id: string;
  variantId: string;
  variantLabel: Variant['label'];
  adSetId: string;
  adSetTitle: string;
  /** The angle the variant was written to, which results are added up by. */
  angle: string;
  scheduledFor: string;
  createdAt: string;
  /** A small JPEG of what goes out, as a data URL. */
  thumbnail?: string;
  targets: PostTarget[];
}

export type ScanEvery = 'off' | 'day' | 'week';

/** What the team sets on Settings: its time zone, the agents' switches, the scan schedule. */
export interface AgentSettings {
  timeZone: string;
  strategistAuto: boolean;
  contentAuto: boolean;
  scanEvery: ScanEvery;
  /** ISO weekday, Monday = 1. */
  scanDay: number;
  scanHour: number;
}

/** The Pages posts go to. The keys that post live in n8n, never in the dashboard. */
export interface PostPages {
  facebook: { id: string; name: string } | null;
  instagram: { id: string; username: string } | null;
  linkedin: { id: string; name: string } | null;
}

export interface TeamSettings extends AgentSettings {
  pages: PostPages;
}
