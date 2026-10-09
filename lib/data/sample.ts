// The sample data, behind the same interface as Supabase. Used when Supabase is
// not configured, so the dashboard runs with no setup. It keeps no changes:
// edits and approvals report `sample: true`, and new runs last until the
// server restarts. Nothing is uploaded: a clip is cut in the browser, then
// left there, and only the sample run's own clip can be played.

import { hostOf } from '../format';
import { copyPlatforms, guardrailWarnings } from '../guardrails';
import * as mock from '../mock-data';
import { initialStages, runStatus, STAGE_INFO, STAGE_ORDER } from '../pipeline';
import { PLATFORM_LABEL } from '../platforms';
import { runTitle } from '../run-input';
import type { NewRunInput } from '../run-input';
import { nextScanAt, zonedToUtc } from '../schedule';
import type { BrandProfile, Competitor, Place, Post, Run, TeamSettings } from '../types';
import { length } from '../video/edit';
import { toAgents } from './map';
import { searchIndex, summarizePage } from './source';
import type { DataSource, RunWithStatus } from './source';

// Runs, posts and settings changed in this process, kept on globalThis so the
// API routes and the pages share them (Next bundles them separately). They
// reset on restart.
const store = globalThis as typeof globalThis & { __qgrRuns?: Run[]; __qgrPosts?: Post[]; __qgrSettings?: TeamSettings; __qgrUntracked?: Set<string> };
const runList = (): Run[] => (store.__qgrRuns ??= structuredClone(mock.runs));
const postList = (): Post[] => (store.__qgrPosts ??= structuredClone(mock.posts));
const settings = (): TeamSettings => (store.__qgrSettings ??= structuredClone(mock.settings));
const untracked = (): Set<string> => (store.__qgrUntracked ??= new Set(mock.competitors.filter((c) => !c.tracked).map((c) => c.id)));
const competitorList = (): Competitor[] => mock.competitors.map((c) => ({ ...c, tracked: !untracked().has(c.id) }));

/** The sample's posts go through the publisher's stand-ins: nothing is posted anywhere. */
const PLACE_PLATFORM = { facebook: 'meta', instagram: 'meta', linkedin: 'linkedin' } as const satisfies Record<Place, 'meta' | 'linkedin'>;

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

/** The sample user's uploads folder: the shape of a real one, holding nothing. */
const SAMPLE_UPLOADS = 'uploads/00000000-0000-4000-8000-000000000000';

export const sampleData: DataSource = {
  getNow: async () => mock.NOW,
  getCurrentUser: async () => mock.user,
  getRuns: async () => runList().map(withStatus).sort(byNewest),
  getRun: async (id) => {
    const run = runList().find((r) => r.id === id);
    return run ? withStatus(run) : null;
  },
  getCompetitors: async () => competitorList().sort((a, b) => b.lastScanAt.localeCompare(a.lastScanAt)),
  getCompetitor: async (id) => competitorList().find((c) => c.id === id) ?? null,
  getStrategies: async () => [...mock.strategies].sort(byNewest),
  getStrategy: async (id) => mock.strategies.find((s) => s.id === id) ?? null,
  getStrategyForCompetitor: async (competitorId) => [...mock.strategies].sort(byNewest).find((s) => s.competitorIds.includes(competitorId)) ?? null,
  getAdSets: async () => [...mock.adSets].sort(byNewest),
  getAdSet: async (id) => mock.adSets.find((a) => a.id === id) ?? null,
  getAgents: async () =>
    toAgents(settings(), { competitors: competitorList().filter((c) => c.tracked).length, strategies: mock.strategies.length }, mock.adSets.filter((a) => a.status === 'review')),
  getNextScan: async () => nextScanAt(settings(), mock.NOW),
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
        ...('clip' in input.source ? [{ at: now, text: `Clip cut to ${length(input.source.clip.duration)}: sample data keeps no uploads` }] : []),
        { at: now, text: `Queued for ${platforms}` },
      ],
      ...(page ? { page: summarizePage(page) } : {}),
    });
    return { ok: true, value: { id: `r-${next}` }, sample: true };
  },
  saveVariant: async (_id, edit) => ({ ok: true, value: { warnings: guardrailWarnings(edit.creativeText, edit.copy, copyPlatforms(edit.copy)) }, sample: true }),
  approveVariant: async () => ({ ok: true, value: null, sample: true }),
  saveBrandProfile: async () => ({ ok: true, value: null, sample: true }),
  saveVideoEdit: async () => ({ ok: true, value: null, sample: true }),
  getClipUrl: async (path) => (path === mock.SAMPLE_CLIP.path ? mock.SAMPLE_CLIP_URL : null),
  createClipUpload: async (extension) => ({ ok: true, value: { path: `${SAMPLE_UPLOADS}/${crypto.randomUUID()}.${extension}`, url: null }, sample: true }),
  deleteClipUpload: async () => ({ ok: true, value: null, sample: true }),
  transcribeClip: async () => ({ ok: false, status: 503, error: 'Sample data keeps no uploads, so there is no clip to transcribe. Type what is said.' }),

  getTeamSettings: async () => settings(),
  saveAgentSettings: async (next) => {
    store.__qgrSettings = { ...settings(), ...next };
    return { ok: true, value: null, sample: true };
  },
  savePostPages: async (pages) => {
    store.__qgrSettings = { ...settings(), pages };
    return { ok: true, value: null, sample: true };
  },
  setCompetitorTracked: async (id, tracked) => {
    if (tracked) untracked().delete(id);
    else untracked().add(id);
    return { ok: true, value: null, sample: true };
  },
  continueRun: async (runId) => {
    const run = runList().find((r) => r.id === runId);
    const stage = run && STAGE_ORDER.find((key) => run.stages[key].status === 'waiting' || run.stages[key].status === 'failed');
    if (!run || !stage) return { ok: false, status: 400, error: 'Nothing on this run is waiting for you.' };
    const was = run.stages[stage].status;
    run.stages[stage] = { status: 'queued' };
    const now = new Date().toISOString();
    run.activity.push({ at: now, text: was === 'failed' ? `Trying the ${STAGE_INFO[stage].name} again` : `Go-ahead given for the ${STAGE_INFO[stage].name}` });
    run.activity.push({ at: now, text: 'Sample data: the agents don’t run here' });
    return { ok: true, value: { stage }, sample: true };
  },

  getPosts: async () => [...postList()].sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor)),
  schedulePost: async (post) => {
    const set = mock.adSets.find((a) => a.variants.some((v) => v.id === post.variantId));
    const variant = set?.variants.find((v) => v.id === post.variantId);
    if (!set || !variant) return { ok: false, status: 404, error: 'Sample posts can be made from the sample’s own ads only.' };
    const now = new Date().toISOString();
    const id = `p-${crypto.randomUUID().slice(0, 8)}`;
    postList().push({
      id,
      variantId: variant.id,
      variantLabel: variant.label,
      adSetId: set.id,
      adSetTitle: set.title,
      scheduledFor: post.at ? zonedToUtc(post.at, settings().timeZone) : now,
      createdAt: now,
      ...(post.thumbnail ? { thumbnail: post.thumbnail } : {}),
      targets: post.targets.map((t) => ({
        place: t.place,
        text: variant.copy[PLACE_PLATFORM[t.place]]?.text ?? '',
        media: t.media?.kind ?? null,
        // Sent now, it goes straight through the stand-in.
        ...(post.at ? { status: 'scheduled' as const } : { status: 'posted' as const, postedAt: now }),
        standIn: !post.at,
      })),
    });
    return { ok: true, value: { id }, sample: true };
  },
  cancelPost: async (postId) => {
    const post = postList().find((p) => p.id === postId);
    const open = post?.targets.filter((t) => t.status === 'scheduled' || t.status === 'failed' || t.status === 'unknown') ?? [];
    if (open.length === 0) return { ok: false, status: 400, error: 'Nothing on this post is waiting to go out.' };
    for (const t of open) t.status = 'cancelled';
    return { ok: true, value: null, sample: true };
  },
  reschedulePost: async (postId, at) => {
    const post = postList().find((p) => p.id === postId);
    if (!post) return { ok: false, status: 404, error: 'That post no longer exists.' };
    if (post.targets.some((t) => t.status !== 'scheduled')) return { ok: false, status: 400, error: 'Only a post that has not started going out can be moved.' };
    const now = new Date().toISOString();
    post.scheduledFor = at ? zonedToUtc(at, settings().timeZone) : now;
    // Sent now, it goes straight through the stand-in.
    if (!at) for (const t of post.targets) Object.assign(t, { status: 'posted', postedAt: now, standIn: true });
    return { ok: true, value: { at: post.scheduledFor }, sample: true };
  },
  retryPost: async (postId, place) => {
    const target = postList()
      .find((p) => p.id === postId)
      ?.targets.find((t) => t.place === place && (t.status === 'failed' || t.status === 'unknown'));
    if (!target) return { ok: false, status: 400, error: 'That post is not waiting to be tried again.' };
    Object.assign(target, { status: 'posted', postedAt: new Date().toISOString(), standIn: true });
    delete target.error;
    return { ok: true, value: null, sample: true };
  },
  createPostUpload: async (extension) => ({ ok: true, value: { path: `posts/00000000-0000-4000-8000-000000000000/${crypto.randomUUID()}.${extension}`, url: null }, sample: true }),
  deletePostMedia: async () => ({ ok: true, value: null, sample: true }),
};
