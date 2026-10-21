// The dashboard's domain model. The sample data (`mock-data.ts`) and the
// Supabase source (`data/live.ts`) both produce these shapes, so pages never
// know which one they are reading.

import type { CreativeDesign } from './creative/design';
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
  /**
   * The edit made as the clip was uploaded, before the run: where every ad
   * made from it starts. An ad's own edit, made in the studio, takes its place.
   */
  edit?: VideoEdit;
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
  /** The team's direction for the agents, given when the run started. */
  guidance?: string;
  /** A run built on a few of a report's ads, chosen by a person: how many. It starts at the strategist. */
  chosenAds?: number;
  /** The run waits after each agent for the team to pick the ads and the angles the next one works from. */
  pickFirst?: boolean;
  /** What the team picked inside the run: how many of its report's ads, and of its strategy's angles. */
  picked?: { ads?: number; angles?: number };
  /** What its ads are made of, as asked at Start run. Absent on a run nobody asked: the team's picture switch decides. */
  media?: RunMedia;
}

/** What a run's ads are made of: the drawn design, an AI picture for each, or an AI video for each (lib/run-media.ts). */
export const RUN_MEDIA = ['design', 'pictures', 'video'] as const;
export type RunMediaKind = (typeof RUN_MEDIA)[number];

/** The video each ad of a video run gets from Higgsfield (Seedance 2.0 Mini, silent). */
export interface RunVideo {
  seconds: number;
  quality: '480p' | '720p';
  aspect: '9:16' | '1:1' | '16:9';
}

/** A picture the team gave Higgsfield to keep to: a place, a product, a look. */
export interface RunReference {
  path: string;
  /** What it shows, in the team's words; the Content Agent names it by its number. */
  note?: string;
  /** waiting: not in Higgsfield yet; ready: Higgsfield has it; failed: it could not be taken, and why. */
  status: 'waiting' | 'ready' | 'failed';
  error?: string;
  /** A link the viewer may open, on the run page. */
  url?: string;
}

export interface RunMedia {
  kind: RunMediaKind;
  /** A video run's settings, and Higgsfield's price for one video when the run started (none on the sample data). */
  video?: RunVideo & { credits: number | null };
  references: RunReference[];
}

/** What a person picks from while a run waits: its report's ads for the strategist, its strategy's angles for the Content Agent. */
export interface RunPicks {
  ads: AdExample[];
  angles: StrategyAngle[];
}

export type AdFormat = 'video' | 'image' | 'carousel' | 'document' | 'text';
export type CreativeStyle = 'arcs' | 'split' | 'spotlight';

export interface Hook {
  id: string;
  text: string;
  platform: Platform;
  format: AdFormat;
  /**
   * How long the ad has kept running: advertisers stop paying for ads that do
   * not work. Null when it is not known: a screenshot rarely shows it.
   */
  daysRunning: number | null;
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
  /** Null when it is not known: a screenshot rarely shows when an ad started. */
  daysRunning: number | null;
  tone: 'slate' | 'teal' | 'plum' | 'sand';
  headline?: string;
  cta?: string;
  /** The angle the tracker gave it. */
  angle?: string;
  /** The ad in Meta's Ad Library, when Apify read it there. Sample ads have none. */
  url?: string;
  /** A link to the screenshot it was read from, signed for the viewer. */
  screenshot?: string;
}

/** Where a report's ads came from. 'placeholder' means sample ads, read while the team's ads source is 'sample'. */
export type AdSource = 'apify' | 'placeholder' | 'upload';

/** Where the Competitor Tracker reads a competitor's ads: sample ads, or their real ones in Meta's Ad Library through Apify. */
export type AdsSetting = 'sample' | 'apify';

/**
 * What makes the ads' pictures: the stand-in, which makes none, Cloudflare
 * Workers AI's FLUX.1 schnell (free each day), or Higgsfield's GPT Image 2.5
 * on the team's plan (credits, against the monthly Higgsfield limit).
 */
export const PICTURE_MODELS = ['stand-in', 'cloudflare', 'higgsfield'] as const;
export type PictureModel = (typeof PICTURE_MODELS)[number];
/** How carefully Higgsfield draws a picture: low is the cheapest. */
export const PICTURE_QUALITIES = ['low', 'medium', 'high'] as const;
export type PictureQuality = (typeof PICTURE_QUALITIES)[number];

export interface Competitor {
  id: string;
  name: string;
  /** The latest report, whose ads a person can choose a run from. */
  reportId: string;
  /** Scanned on the team's schedule. Off for a competitor the team no longer follows. */
  tracked: boolean;
  /** Absent for a competitor known only from screenshots of their ads or a library link. */
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
  /**
   * The same idea written in full as a post for each place: a Facebook post,
   * an Instagram caption with its hashtags, a LinkedIn post. A place without
   * one goes out with its ad copy.
   */
  posts?: Partial<Record<Place, string>>;
  approved?: boolean;
  /** Phrases flagged against the guardrails, for a person to judge before approving. */
  warnings?: string[];
  /** The picture an image model made for it, shown under its words. Without one the branded design is drawn. */
  imageUrl?: string;
  /** What the image model is asked to draw. A video ad has none: its clip is the picture. */
  picturePrompt?: string;
  /** A picture asked for and not made yet, or the last ask that failed; and why, or that nothing was made. */
  picture?: VariantPicture;
  /** The pictures made for it, newest first, kept to choose from again (eight at most). Read in the studio only. */
  pictures?: PictureChoice[];
  /** How this variant uses its run's clip, when the run started from one. Absent: the whole clip as it is. */
  videoEdit?: VideoEdit;
  /** A picture ad's own layout: where its words and logo sit, and the texts added. Absent: the style's layout. */
  design?: CreativeDesign;
  /** On a run that asked for AI video: the video Higgsfield makes for this ad. Once made, it is the ad's clip. */
  aiVideo?: VariantVideo;
}

/** An ad's own AI video, asked as the ad was saved (ai_videos.variant_id). */
export interface VariantVideo {
  id: string;
  status: AiVideo['status'];
  seconds: number;
  aspect: RunVideo['aspect'];
  quality: string;
  /** Where the made file is kept (ai-videos), and a link to play it. */
  path?: string;
  url?: string;
  error?: string;
}

export interface VariantPicture {
  /** making: asked for, waiting for the image model; failed: the last ask failed; none: nothing pending. */
  status: 'none' | 'making' | 'failed';
  /** Why it failed, or what became of the last ask (nothing made by the stand-in; kept while the variant waits to post). */
  note?: string;
  askedAt?: string;
}

/** A picture an image model made for a variant, kept to choose again. */
export interface PictureChoice {
  id: string;
  /** A link the viewer may open: absent when it could not be signed. */
  url?: string;
  /** What the image model was asked to draw. */
  prompt?: string;
  /** The variant shows this one. */
  shown: boolean;
  createdAt: string;
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
  /** A link to their profile photo, signed for an hour; none shows their initials. */
  photoUrl?: string;
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

/** Where a post that works was seen: the three places posts go, and X. */
export const EXAMPLE_PLACES = ['facebook', 'instagram', 'linkedin', 'x'] as const;
export type ExamplePlace = (typeof EXAMPLE_PLACES)[number];

/**
 * What every agent reads beside the brand profile: what the team usually
 * posts about, how it formats a post on each platform, and how its pictures look.
 */
export interface BrandMemory {
  topics: string[];
  postFormats: Partial<Record<ExamplePlace, string>>;
  pictureStyle: string;
}

/** A post that works: pasted by the team, or marked "This worked" on one that went out. */
export interface BrandExample {
  id: string;
  place: ExamplePlace;
  text: string;
  /** Why it worked, in the team's words. */
  note?: string;
  source: 'pasted' | 'marked';
  /** The post it came from, when it was marked on one. */
  postId?: string;
  createdAt: string;
}

/** Something the agents or n8n are doing right now, for the Working list in the top bar. */
export interface ActivityItem {
  id: string;
  kind: 'run' | 'post' | 'picture' | 'video';
  /** What is happening: "Ad Strategist", "Sending to Facebook, Instagram", "Making a picture", "Making a video". */
  label: string;
  /** What it is happening to: a run's title, or an ad set and its variant. */
  subject: string;
  href: string;
  /** When it started. */
  since: string;
  /** The agent at work, on a run. */
  stage?: StageKey;
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
  /** Kept in brand memory as a post that works. */
  remembered?: boolean;
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
  /** Every new ad asks the image model for a picture as it is written. */
  picturesAuto: boolean;
  /** Where the Competitor Tracker reads competitors' ads. */
  adsSource: AdsSetting;
  /** What makes the ads' pictures. */
  pictureModel: PictureModel;
  /** The Cloudflare account Workers AI runs on: 32 characters, or empty. Its token is in n8n. */
  cloudflareAccount: string;
  /** How carefully Higgsfield draws, when it makes the pictures. */
  picturesQuality: PictureQuality;
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
  /** Which places' posts go out for real (n8n's real steps, with its credentials); the others go through a stand-in. */
  postForReal: Record<Place, boolean>;
  /** Where posts send people (Leads, Setup); a post that asks for it ends with it, tagged. */
  postLink: string | null;
}

/**
 * A video asked of Higgsfield from a prompt, kept to start a run from
 * (lib/ai-video.ts). n8n sends it once and checks its job until it is made.
 */
export interface AiVideo {
  id: string;
  title: string;
  prompt: string;
  model: 'seedance_2_0_mini' | 'kling3_0' | 'seedance_2_5';
  seconds: number;
  aspect: '9:16' | '1:1' | '16:9';
  /** The model's own quality setting (480p, 720p, std, pro…). */
  quality: string;
  sound: boolean;
  /** Its first frame, when it was asked from a picture. */
  picture: { path: string; url?: string } | null;
  /** Higgsfield's price, in credits; 0 for the stand-in. */
  credits: number;
  /**
   * asked: waiting to be sent; making: Higgsfield is on it; ready: kept here;
   * failed: not made; unknown: it may have been made, so a person checks
   * Higgsfield before asking again; stand_in: AI video was off, nothing made.
   */
  status: 'asked' | 'making' | 'ready' | 'failed' | 'unknown' | 'stand_in';
  /** A link the browser can play it from; set once it is ready. */
  url?: string;
  error?: string;
  createdAt: string;
  /** The sample data's stand-in, which no model made. */
  sample?: boolean;
}

/**
 * AI video's switch and this month's Higgsfield credits, against the team's
 * one limit: spent is videos and pictures together, pictures their share.
 */
export interface VideoBudget {
  live: boolean;
  cap: number;
  spent: number;
  pictures: number;
}

/**
 * A moment of a long video worth an ad, by its transcript lines (first and
 * last, both included); its times are those lines'. The Moments agent picks
 * them, or the team does; each run cut from one is kept on it.
 */
export interface Moment {
  first: number;
  last: number;
  start: number;
  end: number;
  title: string;
  why: string | null;
  hook: string | null;
  /** Guardrail flags on the hook, never fixed silently. */
  warnings: string[];
  source: 'agent' | 'team';
  runIds: string[];
}

/** What a long video's file was, to know it again when it is picked again. Never uploaded. */
export interface LongVideoFile {
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
}

/** A long recording heard in the browser; only its transcript is kept. */
export interface LongVideo {
  id: string;
  title: string;
  /** What the video is about, written by the team; the agents read it too. */
  description: string | null;
  file: LongVideoFile;
  guidance: string | null;
  /** Waiting for the Moments agent, being looked at, done, or failed (with why). */
  status: 'waiting' | 'working' | 'done' | 'failed';
  error: string | null;
  moments: Moment[];
  lines: number;
  createdAt: string;
  /** The sample data's, whose moments no agent picked. */
  sample?: boolean;
  /** The sample data's example, which has no file anywhere to pick. */
  example?: boolean;
}

export interface LongVideoWithTranscript extends LongVideo {
  transcript: TranscriptLine[];
  /** The team's edit of the whole video, cut down and with AI videos put in; null while it is the video as it is. */
  edit: VideoEdit | null;
}

// ---------------------------------------------------------------- leads

/** Where a lead came from: meta is a Meta lead form that does not say which; other, not known. */
export const LEAD_PLATFORMS = ['facebook', 'instagram', 'meta', 'linkedin', 'x', 'website', 'other'] as const;
export type LeadPlatform = (typeof LEAD_PLATFORMS)[number];

export type LeadVerdict = 'qualified' | 'not_qualified' | 'unclear';

/** One reason for a verdict; a qualified or not-qualified one quotes what the lead said. */
export interface LeadReason {
  text: string;
  field: string | null;
  quote: string | null;
}

/** What a lead carries about the ad it answered: a lead form's campaign and ad, and its link's tags. */
export interface LeadCampaign {
  id?: string;
  name?: string;
  adId?: string;
  adName?: string;
  adset?: string;
  form?: string;
  utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
}

/**
 * Someone who answered QGR's ads or posts, as Zoho holds them, without their
 * contact details (those stay in Zoho, a link away).
 */
export interface Lead {
  id: string;
  name: string;
  createdAt: string;
  platform: LeadPlatform;
  /** The sales team's Lead Status and Lead Source in Zoho. */
  zohoStatus?: string;
  zohoSource?: string;
  /** The lead in Zoho, where its email and phone are. */
  zohoUrl?: string;
  campaign: LeadCampaign;
  /** The QGR post it came from, by its tagged link or its ad's name. */
  from?: { runId: string; runTitle: string; adSetId?: string; variantId?: string; label?: Variant['label']; angle?: string; place?: Place | 'x' };
  /** What the lead said and what Zoho knows of them, field by field. */
  answers: { field: string; value: string }[];
  /** Claude's verdict, once judged; olderCriteria when the team's criteria changed since. */
  ai?: { verdict: LeadVerdict; reasons: LeadReason[]; at: string; olderCriteria: boolean };
  judging: 'waiting' | 'working' | 'failed' | 'done';
  judgeError?: string;
  /** A person's verdict, which counts over Claude's. */
  person?: { verdict: Exclude<LeadVerdict, 'unclear'>; note?: string; at: string };
}

export const ZOHO_REGIONS = ['com', 'eu', 'in', 'com.au', 'jp', 'ca', 'sa', 'com.cn'] as const;
export type ZohoRegion = (typeof ZOHO_REGIONS)[number];

/** How leads come in and are judged (team_settings). */
export interface LeadSettings {
  /** What makes a lead qualified, in the team's words: Claude judges against it. */
  criteria: string;
  criteriaAt: string;
  source: 'off' | 'zoho';
  zoho: { region: ZohoRegion; org: string | null } | null;
  /** The newest change read from Zoho; when it was last asked; why the last read failed. */
  syncedAt: string | null;
  checkedAt: string | null;
  syncError: string | null;
  /** Where posts send people, tagged per post; null for no link. */
  postLink: string | null;
}
