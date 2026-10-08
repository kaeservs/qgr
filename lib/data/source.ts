// What a data source gives the pages. Two implement it: `live.ts` (Supabase,
// read as the signed-in teammate) and `sample.ts` (the sample data). Pages go
// through `lib/data.ts`, which picks one, and never know which it was.

import { STAGE_INFO } from '../pipeline';
import type { NewRunInput } from '../run-input';
import type { AdSet, Agent, BrandProfile, Competitor, Notice, PageRead, PageSummary, Platform, PlatformCopy, Run, RunStatus, SearchItem, Strategy, User } from '../types';
import type { VideoEdit } from '../video/edit';

export type RunWithStatus = Run & { status: RunStatus };

/** What a change did. `sample` is true when nothing was stored: the sample data keeps no changes. */
export type Saved<T = null> = { ok: true; value: T; sample: boolean } | { ok: false; error: string; status: number };

/** A person's edit to one variant: the words on its image and its copy per platform. */
export interface VariantEdit {
  creativeText: string;
  copy: Partial<Record<Platform, PlatformCopy>>;
}

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
  getSearchIndex(): Promise<SearchItem[]>;
  getBrandProfile(): Promise<BrandProfile>;

  /** Records a run, with what was read from its link, and hands it to the agents. */
  createRun(input: NewRunInput, page: PageRead | null): Promise<Saved<{ id: string }>>;
  /** Saves an edit and returns the guardrail flags for the new words. */
  saveVariant(variantId: string, edit: VariantEdit): Promise<Saved<{ warnings: string[] }>>;
  approveVariant(variantId: string): Promise<Saved>;
  saveBrandProfile(profile: BrandProfile): Promise<Saved>;

  /** Saves how a variant uses its run's clip; null puts back the whole clip as it is. */
  saveVideoEdit(variantId: string, edit: VideoEdit | null): Promise<Saved>;
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
}

/** The app's own pages, for search. */
export const PAGES: SearchItem[] = [
  { label: 'Home', sub: 'Start a run', href: '/', kind: 'page' },
  { label: 'Runs', sub: 'Every run and where it is', href: '/runs', kind: 'page' },
  { label: 'Competitors', sub: STAGE_INFO.tracker.name, href: '/competitors', kind: 'page' },
  { label: 'Strategy', sub: STAGE_INFO.strategist.name, href: '/strategy', kind: 'page' },
  { label: 'Content', sub: STAGE_INFO.content.name, href: '/content', kind: 'page' },
  { label: 'Settings', sub: 'Brand profile and connections', href: '/settings', kind: 'page' },
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
