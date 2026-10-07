// The dashboard's domain model. The sample data (`mock-data.ts`) and the
// Supabase source (`data/live.ts`) both produce these shapes, so pages never
// know which one they are reading.

export const PLATFORMS = ['meta', 'linkedin', 'x'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const GOALS = ['consultations', 'webinar', 'awareness', 'guide'] as const;
export type Goal = (typeof GOALS)[number];

/** The three agents, in the order a run passes through them. */
export type StageKey = 'tracker' | 'strategist' | 'content';
export type StageStatus = 'skipped' | 'queued' | 'running' | 'done' | 'failed';
export type RunStatus = 'queued' | 'running' | 'review' | 'approved' | 'failed';

export const CUSTOM_SOURCES = ['podcast', 'blog', 'video', 'text'] as const;
export type CustomSourceType = (typeof CUSTOM_SOURCES)[number];

/**
 * What a run starts from. A competitor run starts at the Competitor Tracker;
 * a custom run (podcast, blog, video, text) has no competitor to track and
 * starts at the Ad Strategist.
 */
export type RunSource =
  | { kind: 'competitor'; input: 'website' | 'ad_link'; url: string }
  | { kind: 'competitor'; input: 'upload'; name: string; files: string[] }
  | { kind: 'custom'; type: Exclude<CustomSourceType, 'text'>; url: string }
  | { kind: 'custom'; type: 'text'; excerpt: string };

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
}

export interface AdSet {
  id: string;
  title: string;
  createdAt: string;
  runId: string;
  strategyId: string;
  status: 'generating' | 'review' | 'approved';
  variants: Variant[];
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
