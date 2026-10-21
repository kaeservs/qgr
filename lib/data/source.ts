// What a data source gives the pages. Two implement it: `live.ts` (Supabase,
// read as the signed-in teammate) and `sample.ts` (the sample data). Pages go
// through `lib/data.ts`, which picks one, and never know which it was.

import { STAGE_INFO } from '../pipeline';
import type { NewLongVideo } from '../long-video';
import type { NewAdsRun, NewRunInput } from '../run-input';
import type {
  ActivityItem,
  AdSet,
  Agent,
  AgentSettings,
  AiVideo,
  BrandExample,
  BrandMemory,
  BrandProfile,
  Competitor,
  ExamplePlace,
  Lead,
  LeadSettings,
  LongVideo,
  LongVideoWithTranscript,
  Notice,
  PageRead,
  PageSummary,
  PictureQuality,
  Place,
  Platform,
  PlatformCopy,
  Post,
  PostPages,
  Run,
  RunPicks,
  RunStatus,
  SearchItem,
  StageKey,
  Strategy,
  TeamSettings,
  User,
  VideoBudget,
  ZohoRegion,
} from '../types';
import type { VideoEdit } from '../video/edit';
import type { VideoRequest } from '../ai-video';
import type { VideoPromptRequest } from '../video-prompt';
import type { CreativeDesign } from '../creative/design';

export type RunWithStatus = Run & { status: RunStatus };

/** What a change did. `sample` is true when nothing was stored: the sample data keeps no changes. */
export type Saved<T = null> = { ok: true; value: T; sample: boolean } | { ok: false; error: string; status: number };

/** A person's edit to one variant: the words on its image, its ad copy per platform and its posts per place. */
export interface VariantEdit {
  creativeText: string;
  copy: Partial<Record<Platform, PlatformCopy>>;
  /** A place left out goes out with its ad copy. */
  posts: Partial<Record<Place, string>>;
}

/** A post that works, pasted by the team. */
export interface NewBrandExample {
  place: ExamplePlace;
  text: string;
  note?: string;
}

/** One place a new post goes, with the file the browser made for it there, if any. */
export interface NewPostTarget {
  place: Place;
  media: { path: string; kind: 'image' | 'video' } | null;
  /** Ends the words with the team's link, tagged with this run, variant and place (not on Instagram). */
  link?: boolean;
}

/** An approved variant to post now (`at` null) or at a wall time in the team's zone (`YYYY-MM-DD HH:MM`). */
export interface NewPost {
  variantId: string;
  targets: NewPostTarget[];
  at: string | null;
  /** A small JPEG of what goes out, as a data URL. */
  thumbnail: string | null;
}

/** The kinds of file a post goes out with (bucket post-media). */
export const POST_MEDIA_TYPES = { jpg: 'image/jpeg', mp4: 'video/mp4' } as const;
export type PostMediaExtension = keyof typeof POST_MEDIA_TYPES;

/** The kinds of file the video editor adds to an edit (bucket edit-media): other videos, pictures and music. */
export const EDIT_MEDIA_TYPES = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
} as const;
export type EditMediaExtension = keyof typeof EDIT_MEDIA_TYPES;

/** The kinds of picture Storage keeps screenshots of competitors' ads as (bucket competitor-shots). */
export const SHOT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
export type ShotExtension = keyof typeof SHOT_TYPES;

/** What Higgsfield prices a video by: everything asked but the prompt's words and which picture. */
export type VideoPriceRequest = Omit<VideoRequest, 'picture'> & { picture: boolean };

/** The kinds of file Storage keeps clips as (bucket run-media). */
export const CLIP_TYPES = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' } as const;
export type ClipExtension = keyof typeof CLIP_TYPES;

export interface DataSource {
  getNow(): Promise<string>;
  getCurrentUser(): Promise<User>;
  getRuns(): Promise<RunWithStatus[]>;
  getRun(id: string): Promise<RunWithStatus | null>;
  getCompetitors(): Promise<Competitor[]>;
  getCompetitor(id: string): Promise<Competitor | null>;
  getStrategies(): Promise<Strategy[]>;
  getStrategy(id: string): Promise<Strategy | null>;
  /** The strategy built from this competitor's most recent report, if there is one. */
  getStrategyForCompetitor(competitorId: string): Promise<Strategy | null>;
  getAdSets(): Promise<AdSet[]>;
  getAdSet(id: string): Promise<AdSet | null>;
  getAgents(): Promise<Agent[]>;
  /** The tracker's next scheduled scan; null while nothing is scheduled. */
  getNextScan(): Promise<string | null>;
  getNotices(): Promise<Notice[]>;
  /** What the agents and n8n are doing right now: runs an agent is on, posts going out, pictures being made. */
  getActivity(): Promise<ActivityItem[]>;
  getSearchIndex(): Promise<SearchItem[]>;
  getBrandProfile(): Promise<BrandProfile>;
  /** What the team posts about, how it formats posts, how its pictures look; and the posts that work, newest first. */
  getBrandMemory(): Promise<{ memory: BrandMemory; examples: BrandExample[] }>;

  /** Records a run, with what was read from its link, and hands it to the agents. */
  createRun(input: NewRunInput, page: PageRead | null): Promise<Saved<{ id: string }>>;
  /** Records a run built on a few of a report's ads and hands it to the strategist: the report is already there. */
  startRunFromAds(input: NewAdsRun): Promise<Saved<{ id: string }>>;
  /** Where the browser uploads a screenshot of a competitor's ad: a fresh path in the teammate's own folder and a signed link. */
  createShotUpload(extension: ShotExtension): Promise<Saved<{ path: string; url: string | null }>>;
  /** Removes a screenshot taken away before its run started. Storage refuses one a run uses. */
  deleteShot(path: string): Promise<Saved>;
  /** Where the browser uploads a reference picture for Higgsfield: a fresh path in the teammate's own folder of run-refs. */
  createReferenceUpload(extension: ShotExtension): Promise<Saved<{ path: string; url: string | null }>>;
  /** Removes a reference picture taken away before its run started. Storage refuses one a run uses. */
  deleteReference(path: string): Promise<Saved>;
  /** Saves an edit and returns the guardrail flags for the new words. */
  saveVariant(variantId: string, edit: VariantEdit): Promise<Saved<{ warnings: string[] }>>;
  approveVariant(variantId: string): Promise<Saved>;
  saveBrandProfile(profile: BrandProfile): Promise<Saved>;
  saveBrandMemory(memory: BrandMemory): Promise<Saved>;
  addBrandExample(example: NewBrandExample): Promise<Saved<{ id: string }>>;
  /** Takes a post out of brand memory: the agents no longer read it. */
  removeBrandExample(id: string): Promise<Saved>;
  /** "This worked" on a post that went out: its words for that place become a post that works. */
  rememberPost(postId: string, place: Place, note?: string): Promise<Saved>;

  /** Saves a picture ad's own layout; null puts back the style's. */
  saveDesign(variantId: string, design: CreativeDesign | null): Promise<Saved>;
  /** Saves how a variant uses its run's clip; null puts back the whole clip as it is. */
  saveVideoEdit(variantId: string, edit: VideoEdit | null): Promise<Saved>;
  /** Long videos, newest first, without their transcripts. */
  getLongVideos(): Promise<LongVideo[]>;
  /** One long video with its transcript, to pick and cut its moments. */
  getLongVideo(id: string): Promise<LongVideoWithTranscript | null>;
  /** Keeps a long video's transcript and asks the Moments agent for its moments. */
  createLongVideo(input: NewLongVideo): Promise<Saved<{ id: string }>>;
  askMomentsAgain(id: string): Promise<Saved>;
  removeLongVideo(id: string): Promise<Saved>;
  /** Keeps the team's edit of the whole long video; null takes it back to the video as it is. */
  saveLongVideoEdit(id: string, edit: VideoEdit | null): Promise<Saved>;
  /** A run started from a clip cut from these lines: kept on its moment, or on a moment of the team's own. */
  recordMomentRun(id: string, first: number, last: number, title: string, runId: string): Promise<Saved>;
  /** AI videos, newest first, with links to play the ready ones; those taken out of the library are left out. */
  getAiVideos(): Promise<AiVideo[]>;
  getAiVideo(id: string): Promise<AiVideo | null>;
  /** The AI videos an edit uses, by id, as they stand now (being made, ready with a link, or not made). */
  getAiVideosById(ids: string[]): Promise<AiVideo[]>;
  /** Claude's draft of an AI video's prompt from what is said around a point: nothing is made or spent on Higgsfield. */
  writeVideoPrompt(request: VideoPromptRequest): Promise<Saved<{ prompt: string; why: string }>>;
  /** AI video's switch and this month's credits against the team's limit. */
  getVideoBudget(): Promise<VideoBudget>;
  /** Higgsfield's price for a request (nothing is made), and the credits left on the team's plan. */
  priceVideo(request: VideoPriceRequest): Promise<Saved<{ credits: number; balance: number | null }>>;
  /** What one Higgsfield picture costs at a quality, and the credits left on the plan: nothing is made. */
  pricePicture(quality: PictureQuality): Promise<Saved<{ credits: number; balance: number | null }>>;
  /** Asks for a video, at Higgsfield's price: n8n sends it once. While AI video is off, the stand-in makes nothing. */
  askForVideo(request: VideoRequest, credits: number | null): Promise<Saved<{ id: string }>>;
  /** Takes a video out of the library; one not yet sent is stopped. */
  removeAiVideo(id: string): Promise<Saved>;
  /** Where the browser uploads a video's first picture: the teammate's own folder of video-refs. */
  createVideoPictureUpload(extension: ShotExtension): Promise<Saved<{ path: string; url: string | null }>>;
  /** Removes a first picture taken away before its video was asked for. */
  deleteVideoPicture(path: string): Promise<Saved>;
  /** Making AI videos for real, and the month's limit in credits. */
  setVideoSettings(live: boolean, cap: number): Promise<Saved>;
  /** A link the browser can play a clip from, for a while. Null when there is none to give. */
  getClipUrl(path: string): Promise<string | null>;
  /**
   * Where the browser uploads a clip: a fresh path in the teammate's own
   * folder and a link signed for it. The sample data stores nothing, so its
   * link is null.
   */
  createClipUpload(extension: ClipExtension): Promise<Saved<{ path: string; url: string | null }>>;
  /** Removes an uploaded clip that no run uses: one cut again or taken away before the run started. */
  deleteClipUpload(path: string): Promise<Saved>;

  getTeamSettings(): Promise<TeamSettings>;
  saveAgentSettings(settings: AgentSettings): Promise<Saved>;
  savePostPages(pages: PostPages): Promise<Saved>;
  /** Whether a place's posts go out for real; on needs its Page set. */
  setPostForReal(place: Place, on: boolean): Promise<Saved>;
  setCompetitorTracked(competitorId: string, tracked: boolean): Promise<Saved>;
  /** Starts the agent a run waits on (its switch is off) or one that failed, and hands it to n8n. */
  continueRun(runId: string): Promise<Saved<{ stage: StageKey }>>;
  /** Starts a waiting Ad Strategist on the report's ads picked, in the order picked; none is all of them. */
  continueWithAds(runId: string, adIds: string[]): Promise<Saved<{ stage: StageKey }>>;
  /** Starts a waiting Content Agent on the strategy's angles picked; none is all of them. */
  continueWithAngles(runId: string, angleIds: string[]): Promise<Saved<{ stage: StageKey }>>;
  /** What a person picks from while the run waits: its own report's ads and its strategy's angles. */
  getRunPicks(runId: string): Promise<RunPicks>;

  /** The leads of the last 180 days, newest first, and how leads come in and are judged. */
  getLeads(): Promise<{ leads: Lead[]; settings: LeadSettings }>;
  /** What makes a lead qualified, in the team's words. */
  saveLeadCriteria(criteria: string): Promise<Saved>;
  /** Where leads come from: off, or Zoho in its region (n8n holds the login). */
  setLeadsSource(source: 'off' | 'zoho', zoho: { region: ZohoRegion; org: string | null } | null): Promise<Saved>;
  /** A person's verdict on a lead, with why; null takes it back. */
  setLeadVerdict(leadId: string, verdict: 'qualified' | 'not_qualified' | null, note: string | null): Promise<Saved>;
  /** Judges one lead again, or every lead judged on older criteria; says how many. */
  judgeLeadsAgain(leadId: string | null): Promise<Saved<{ count: number }>>;
  /** Asks n8n to read Zoho and judge what waits now, rather than in its next fifteen minutes. */
  readLeadsNow(): Promise<Saved>;
  /** Where posts send people, tagged per post; null for no link. */
  savePostLink(link: string | null): Promise<Saved>;

  /** Every post, newest first. */
  getPosts(): Promise<Post[]>;
  /** Records a post of an approved variant; one to send now is handed to the publisher at once. */
  schedulePost(post: NewPost): Promise<Saved<{ id: string }>>;
  cancelPost(postId: string): Promise<Saved>;
  /** Asks the image model for a picture for a variant, from the prompt given (kept as its prompt); n8n's "QGR · Pictures" makes it. */
  askForPicture(variantId: string, prompt: string): Promise<Saved>;
  /** Shows one of the pictures made for a variant before, stopping one being made. */
  usePicture(variantId: string, pictureId: string): Promise<Saved>;
  /** Stops a picture being made; the variant keeps what it shows. */
  stopPicture(variantId: string): Promise<Saved>;
  /** Goes back to the drawn design, stopping any picture being made. The pictures stay to choose again. */
  removePicture(variantId: string): Promise<Saved>;
  /** Moves a post none of whose places has started going out: to a wall time in the team's zone, or now (null). Returns the new time. */
  reschedulePost(postId: string, at: string | null): Promise<Saved<{ at: string }>>;
  retryPost(postId: string, place: Place): Promise<Saved>;
  /** Where the browser uploads a post's file: a fresh path in the teammate's own folder and a signed link. */
  createPostUpload(extension: PostMediaExtension): Promise<Saved<{ path: string; url: string | null }>>;
  /** Removes a post file nothing waits on: one made for a post that was never sent. */
  deletePostMedia(path: string): Promise<Saved>;
  /**
   * Where the browser uploads a file added to a video edit: a fresh path in the
   * teammate's own folder and a signed link. The sample data keeps the file in
   * the tab, so its path is `local:` and its link null.
   */
  createEditMediaUpload(extension: EditMediaExtension): Promise<Saved<{ path: string; url: string | null }>>;
  /** Removes a file added to an edit that no saved edit uses. */
  deleteEditMedia(path: string): Promise<Saved>;
  /** Links the browser can read files added to edits from, for a while, by path: AI videos ('ai:<id>') once they are made. */
  signEditMedia(paths: string[]): Promise<Record<string, string>>;
}

/** The app's own pages, for search. */
export const PAGES: SearchItem[] = [
  { label: 'Home', sub: 'Start a run', href: '/', kind: 'page' },
  { label: 'Runs', sub: 'Every run and where it is', href: '/runs', kind: 'page' },
  { label: 'Competitors', sub: STAGE_INFO.tracker.name, href: '/competitors', kind: 'page' },
  { label: 'Strategy', sub: STAGE_INFO.strategist.name, href: '/strategy', kind: 'page' },
  { label: 'Content', sub: STAGE_INFO.content.name, href: '/content', kind: 'page' },
  { label: 'Posts', sub: 'Scheduled and sent posts', href: '/posts', kind: 'page' },
  { label: 'Leads', sub: 'Who answered, which ad brought them, who qualifies', href: '/leads', kind: 'page' },
  { label: 'Brand memory', sub: 'Voice, rules, formats and posts that work', href: '/brand', kind: 'page' },
  { label: 'Settings', sub: 'Agents, Pages and connections', href: '/settings', kind: 'page' },
];

export function searchIndex(competitors: Competitor[], strategies: Strategy[], adSets: AdSet[], runs: Run[]): SearchItem[] {
  return [
    ...competitors.map((c): SearchItem => ({ label: c.name, sub: c.domain ?? 'Competitor', href: `/competitors/${c.id}`, kind: 'competitor' })),
    ...strategies.map((s): SearchItem => ({ label: s.title, sub: 'Strategy', href: `/strategy/${s.id}`, kind: 'strategy' })),
    ...adSets.map((a): SearchItem => ({ label: a.title, sub: 'Ads', href: `/content/${a.id}`, kind: 'content' })),
    ...runs.map((r): SearchItem => ({ label: r.title, sub: 'Run', href: `/runs/${r.id}`, kind: 'run' })),
    ...PAGES,
  ];
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

/** The part of a page read the dashboard shows. */
export const summarizePage = (page: PageRead): PageSummary =>
  page.ok ? { ok: true, url: page.url, title: page.title, words: page.words } : { ok: false, url: page.url, error: page.error };
