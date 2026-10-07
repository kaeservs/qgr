// The one place pages get data from. Today it reads the mock data; when
// Supabase is connected, these functions query it instead and nothing that
// calls them changes. Every function is async for that reason.

import * as mock from './mock-data';
import { hostOf } from './format';
import { initialStages, runStatus, STAGE_INFO } from './pipeline';
import { PLATFORM_LABEL } from './platforms';
import type { NewRunInput } from './run-input';
import type { AdSet, Agent, Competitor, Notice, Run, RunStatus, SearchItem, Strategy, User } from './types';

// Runs created in this process, kept on globalThis so the API route and the
// pages share one list (Next bundles them separately). It resets on restart:
// it is a stand-in for the `runs` table, not a store.
const store = globalThis as typeof globalThis & { __qgrRuns?: Run[] };
const runList = (): Run[] => (store.__qgrRuns ??= [...mock.runs]);

const byNewest = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);

export type RunWithStatus = Run & { status: RunStatus };
const withStatus = (run: Run): RunWithStatus => ({ ...run, status: runStatus(run) });

export async function getNow(): Promise<string> {
  return mock.NOW;
}

export async function getCurrentUser(): Promise<User> {
  return mock.user;
}

export async function getRuns(): Promise<RunWithStatus[]> {
  return runList().map(withStatus).sort(byNewest);
}

export async function getRun(id: string): Promise<RunWithStatus | null> {
  const run = runList().find((r) => r.id === id);
  return run ? withStatus(run) : null;
}

export async function getCompetitors(): Promise<Competitor[]> {
  return [...mock.competitors].sort((a, b) => b.lastScanAt.localeCompare(a.lastScanAt));
}

export async function getCompetitor(id: string): Promise<Competitor | null> {
  return mock.competitors.find((c) => c.id === id) ?? null;
}

export async function getStrategies(): Promise<Strategy[]> {
  return [...mock.strategies].sort(byNewest);
}

export async function getStrategy(id: string): Promise<Strategy | null> {
  return mock.strategies.find((s) => s.id === id) ?? null;
}

/** The strategy built from this competitor's most recent report, if there is one. */
export async function getStrategyForCompetitor(competitorId: string): Promise<Strategy | null> {
  return [...mock.strategies].sort(byNewest).find((s) => s.competitorIds.includes(competitorId)) ?? null;
}

export async function getAdSets(): Promise<AdSet[]> {
  return [...mock.adSets].sort(byNewest);
}

export async function getAdSet(id: string): Promise<AdSet | null> {
  return mock.adSets.find((a) => a.id === id) ?? null;
}

export async function getAgents(): Promise<Agent[]> {
  return mock.agents;
}

export async function getNextScan(): Promise<string> {
  return mock.NEXT_SCAN;
}

export async function getNotices(): Promise<Notice[]> {
  return mock.notices;
}

export async function getSearchIndex(): Promise<SearchItem[]> {
  const pages: SearchItem[] = [
    { label: 'Home', sub: 'Start a run', href: '/', kind: 'page' },
    { label: 'Runs', sub: 'Every run and where it is', href: '/runs', kind: 'page' },
    { label: 'Competitors', sub: STAGE_INFO.tracker.name, href: '/competitors', kind: 'page' },
    { label: 'Strategy', sub: STAGE_INFO.strategist.name, href: '/strategy', kind: 'page' },
    { label: 'Content', sub: STAGE_INFO.content.name, href: '/content', kind: 'page' },
    { label: 'Settings', sub: 'Brand profile and connections', href: '/settings', kind: 'page' },
  ];
  return [
    ...mock.competitors.map((c): SearchItem => ({ label: c.name, sub: c.domain, href: `/competitors/${c.id}`, kind: 'competitor' })),
    ...mock.strategies.map((s): SearchItem => ({ label: s.title, sub: 'Strategy', href: `/strategy/${s.id}`, kind: 'strategy' })),
    ...mock.adSets.map((a): SearchItem => ({ label: a.title, sub: 'Ads', href: `/content/${a.id}`, kind: 'content' })),
    ...runList().map((r): SearchItem => ({ label: r.title, sub: 'Run', href: `/runs/${r.id}`, kind: 'run' })),
    ...pages,
  ];
}

function titleFor(input: NewRunInput): string {
  if (input.title) return input.title;
  const { source } = input;
  if (source.kind === 'competitor') {
    if (source.input === 'upload') return source.name;
    return source.input === 'website' ? hostOf(source.url) : `Ad link · ${hostOf(source.url)}`;
  }
  if (source.type === 'text') return `Text: ${source.excerpt.slice(0, 40).trimEnd()}…`;
  const kind = { podcast: 'Podcast', blog: 'Blog post', video: 'Video' }[source.type];
  return `${kind} · ${hostOf(source.url)}`;
}

function startedFrom(input: NewRunInput): string {
  const { source } = input;
  if (source.kind === 'competitor') {
    if (source.input === 'upload') return `Run started from ${source.files.length} uploaded ad${source.files.length === 1 ? '' : 's'}`;
    return source.input === 'website' ? `Run started from ${hostOf(source.url)}` : 'Run started from an ad link';
  }
  return `Run started from ${{ podcast: 'a podcast episode', blog: 'a blog post', video: 'a video', text: 'pasted text' }[source.type]}`;
}

/**
 * Queues a run. With the backend this inserts the `runs` row and calls the n8n
 * webhook that starts the first agent; here it only records the run.
 */
export async function createRun(input: NewRunInput): Promise<Run> {
  const now = new Date().toISOString();
  const list = runList();
  const next = Math.max(...list.map((r) => Number(r.id.slice(2)) || 0)) + 1;
  const platforms = input.platforms.map((p) => PLATFORM_LABEL[p]).join(', ');
  const run: Run = {
    id: `r-${next}`,
    title: titleFor(input),
    source: input.source,
    platforms: input.platforms,
    goal: input.goal,
    createdAt: now,
    stages: initialStages(input.source),
    output: {},
    counts: {},
    activity: [
      { at: now, text: startedFrom(input) },
      ...(input.source.kind === 'custom' ? [{ at: now, text: 'Competitor Tracker skipped: custom runs start at the strategy' }] : []),
      { at: now, text: `Queued for ${platforms}` },
    ],
  };
  list.push(run);
  return run;
}
