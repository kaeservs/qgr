// The sample data, behind the same interface as Supabase. Used when Supabase is
// not configured, so the dashboard runs with no setup. It keeps no changes:
// edits and approvals report `sample: true`, and new runs last until the
// server restarts.

import { hostOf } from '../format';
import { copyPlatforms, guardrailWarnings } from '../guardrails';
import * as mock from '../mock-data';
import { initialStages, runStatus } from '../pipeline';
import { PLATFORM_LABEL } from '../platforms';
import { runTitle } from '../run-input';
import type { NewRunInput } from '../run-input';
import type { BrandProfile, Run } from '../types';
import { searchIndex, summarizePage } from './source';
import type { DataSource, RunWithStatus } from './source';

// Runs created in this process, kept on globalThis so the API route and the
// pages share one list (Next bundles them separately). It resets on restart.
const store = globalThis as typeof globalThis & { __qgrRuns?: Run[] };
const runList = (): Run[] => (store.__qgrRuns ??= [...mock.runs]);

const byNewest = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);
const withStatus = (run: Run): RunWithStatus => ({ ...run, status: runStatus(run) });

const brand: BrandProfile = {
  company: 'Quantum Global Residency',
  website: 'quantumglobalresidency.com',
  offer: 'EB-5 investor visa guidance with independent due diligence on every project, from first call to green card.',
  audience: 'Indian professionals and families planning a move to the U.S., many on H-1B visas.',
  voice: ['Calm', 'Expert', 'Plain English'],
  guardrails: mock.strategies.find((s) => s.id === 's-q4')?.guardrails ?? [],
  pageName: 'Quantum Global',
  xHandle: '@quantumglobal',
};

function startedFrom(input: NewRunInput): string {
  const { source } = input;
  if (source.kind === 'competitor') {
    if (source.input === 'upload') return `Run started from ${source.files.length} uploaded ad${source.files.length === 1 ? '' : 's'}`;
    return source.input === 'website' ? `Run started from ${hostOf(source.url)}` : 'Run started from an ad link';
  }
  return `Run started from ${{ podcast: 'a podcast episode', blog: 'a blog post', video: 'a video', text: 'pasted text' }[source.type]}`;
}

export const sampleData: DataSource = {
  getNow: async () => mock.NOW,
  getCurrentUser: async () => mock.user,
  getRuns: async () => runList().map(withStatus).sort(byNewest),
  getRun: async (id) => {
    const run = runList().find((r) => r.id === id);
    return run ? withStatus(run) : null;
  },
  getCompetitors: async () => [...mock.competitors].sort((a, b) => b.lastScanAt.localeCompare(a.lastScanAt)),
  getCompetitor: async (id) => mock.competitors.find((c) => c.id === id) ?? null,
  getStrategies: async () => [...mock.strategies].sort(byNewest),
  getStrategy: async (id) => mock.strategies.find((s) => s.id === id) ?? null,
  getStrategyForCompetitor: async (competitorId) => [...mock.strategies].sort(byNewest).find((s) => s.competitorIds.includes(competitorId)) ?? null,
  getAdSets: async () => [...mock.adSets].sort(byNewest),
  getAdSet: async (id) => mock.adSets.find((a) => a.id === id) ?? null,
  getAgents: async () => mock.agents,
  getNextScan: async () => mock.NEXT_SCAN,
  getNotices: async () => mock.notices,
  getSearchIndex: async () => searchIndex(mock.competitors, mock.strategies, mock.adSets, runList()),
  getBrandProfile: async () => brand,

  createRun: async (input, page) => {
    const now = new Date().toISOString();
    const list = runList();
    const next = Math.max(...list.map((r) => Number(r.id.slice(2)) || 0)) + 1;
    const platforms = input.platforms.map((p) => PLATFORM_LABEL[p]).join(', ');
    list.push({
      id: `r-${next}`,
      title: runTitle(input),
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
        ...(page ? [{ at: now, text: page.ok ? `Read ${page.title ?? hostOf(page.url)}: ${page.words} words` : `Could not read ${hostOf(page.url)}: ${page.error}` }] : []),
        { at: now, text: `Queued for ${platforms}` },
      ],
      ...(page ? { page: summarizePage(page) } : {}),
    });
    return { ok: true, value: { id: `r-${next}` }, sample: true };
  },
  saveVariant: async (_id, edit) => ({ ok: true, value: { warnings: guardrailWarnings(edit.creativeText, edit.copy, copyPlatforms(edit.copy)) }, sample: true }),
  approveVariant: async () => ({ ok: true, value: null, sample: true }),
  saveBrandProfile: async () => ({ ok: true, value: null, sample: true }),
};
