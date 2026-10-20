// The sample data, behind the same interface as Supabase. Used when Supabase is
// not configured, so the dashboard runs with no setup. It keeps no changes:
// edits and approvals report `sample: true`, and new runs last until the
// server restarts. Nothing is uploaded: a clip is cut in the browser, then
// left there, and only the sample run's own clip can be played.

import { hostOf } from '../format';
import { momentOf, sampleMoments } from '../long-video';
import { copyPlatforms, guardrailWarnings } from '../guardrails';
import * as mock from '../mock-data';
import { initialStages, runStatus, STAGE_INFO, STAGE_ORDER } from '../pipeline';
import { PLATFORM_LABEL, postText } from '../platforms';
import { runTitle } from '../run-input';
import type { NewRunInput } from '../run-input';
import { nextScanAt, zonedToUtc } from '../schedule';
import { PLACE_LABEL } from '../post-input';
import { taggedLink } from '../leads';
import type { ActivityItem, BrandExample, BrandMemory, BrandProfile, Competitor, Lead, LeadSettings, LongVideoWithTranscript, Post, Run, TeamSettings, VideoBudget } from '../types';
import { length } from '../video/edit';
import { toAgents } from './map';
import { searchIndex, summarizePage } from './source';
import type { DataSource, RunWithStatus } from './source';

// Runs, posts and settings changed in this process, kept on globalThis so the
// API routes and the pages share them (Next bundles them separately). They
// reset on restart.
const store = globalThis as typeof globalThis & {
  __qgrRuns?: Run[];
  __qgrPosts?: Post[];
  __qgrSettings?: TeamSettings;
  __qgrUntracked?: Set<string>;
  __qgrMemory?: BrandMemory;
  __qgrExamples?: BrandExample[];
  __qgrLongVideos?: LongVideoWithTranscript[];
  __qgrLeads?: Lead[];
  __qgrLeadSettings?: LeadSettings;
  __qgrVideoBudget?: VideoBudget;
};
const runList = (): Run[] => (store.__qgrRuns ??= structuredClone(mock.runs));
const leadList = (): Lead[] => (store.__qgrLeads ??= mock.leads());
const leadSettings = (): LeadSettings => (store.__qgrLeadSettings ??= structuredClone(mock.leadSettings));
/** AI video's switch and limit, as changed this session; the sample spends nothing. */
const videoBudget = (): VideoBudget => (store.__qgrVideoBudget ??= { live: false, cap: 100, spent: 0 });
const postList = (): Post[] => (store.__qgrPosts ??= structuredClone(mock.posts));
const settings = (): TeamSettings => (store.__qgrSettings ??= structuredClone(mock.settings));
const untracked = (): Set<string> => (store.__qgrUntracked ??= new Set(mock.competitors.filter((c) => !c.tracked).map((c) => c.id)));
const memory = (): BrandMemory => (store.__qgrMemory ??= structuredClone(mock.brandMemory));
const examples = (): BrandExample[] => (store.__qgrExamples ??= structuredClone(mock.brandExamples));
const longVideos = (): LongVideoWithTranscript[] => (store.__qgrLongVideos ??= [mock.sampleLongVideo()]);
const competitorList = (): Competitor[] => mock.competitors.map((c) => ({ ...c, tracked: !untracked().has(c.id) }));

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
    if (source.input === 'upload') return `Run started from ${source.files.length} screenshot${source.files.length === 1 ? '' : 's'} of their ads: sample data keeps no uploads`;
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
  // The sample's moment: its runs an agent is on, and any post going out.
  getActivity: async () => {
    const items: ActivityItem[] = [];
    for (const run of runList()) {
      const stage = STAGE_ORDER.find((key) => run.stages[key].status === 'running');
      if (stage) items.push({ id: `run-${run.id}`, kind: 'run', label: STAGE_INFO[stage].name, subject: run.title, href: `/runs/${run.id}`, since: run.activity.at(-1)?.at ?? run.createdAt, stage });
    }
    for (const post of postList()) {
      const places = post.targets.filter((t) => t.status === 'posting').map((t) => PLACE_LABEL[t.place]);
      if (places.length > 0) items.push({ id: `post-${post.id}`, kind: 'post', label: `Sending to ${places.join(', ')}`, subject: `${post.adSetTitle}, variant ${post.variantLabel}`, href: `/posts#post-${post.id}`, since: post.scheduledFor });
    }
    return items.sort((a, b) => b.since.localeCompare(a.since));
  },
  getSearchIndex: async () => searchIndex(mock.competitors, mock.strategies, mock.adSets, runList()),
  getBrandProfile: async () => brand,
  getBrandMemory: async () => ({ memory: memory(), examples: [...examples()].sort(byNewest) }),

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
      ...(input.guidance ? { guidance: input.guidance } : {}),
    });
    return { ok: true, value: { id: `r-${next}` }, sample: true };
  },
  startRunFromAds: async (input) => {
    const competitor = competitorList().find((c) => c.reportId === input.reportId);
    if (!competitor) return { ok: false, status: 400, error: 'That report is not there any more.' };
    const chosen = competitor.examples.filter((a) => input.adIds.includes(a.id));
    if (chosen.length !== input.adIds.length) return { ok: false, status: 400, error: 'Choose ads from this report.' };
    const now = new Date().toISOString();
    const list = runList();
    const next = Math.max(...list.map((r) => Number(r.id.slice(2)) || 0)) + 1;
    const ads = `${chosen.length} ad${chosen.length === 1 ? '' : 's'}`;
    list.push({
      id: `r-${next}`,
      title: input.title ?? `${competitor.name} · ${chosen.length} chosen ad${chosen.length === 1 ? '' : 's'}`,
      source: competitor.domain ? { kind: 'competitor', input: 'website', url: `https://${competitor.domain}/` } : { kind: 'competitor', input: 'upload', name: competitor.name, files: [] },
      platforms: input.platforms,
      goal: input.goal,
      createdAt: now,
      stages: { tracker: { status: 'skipped' }, strategist: { status: 'queued' }, content: { status: 'queued' } },
      output: { competitorId: competitor.id },
      counts: {},
      chosenAds: chosen.length,
      activity: [
        { at: now, text: 'Run started' },
        { at: now, text: `Competitor Tracker skipped: built on ${ads} chosen from the report on ${competitor.name}` },
        { at: now, text: 'Sample data: the agents don’t run here' },
      ],
      ...(input.guidance ? { guidance: input.guidance } : {}),
    });
    return { ok: true, value: { id: `r-${next}` }, sample: true };
  },
  createShotUpload: async (extension) => ({ ok: true, value: { path: `shots/00000000-0000-4000-8000-000000000000/${crypto.randomUUID()}.${extension}`, url: null }, sample: true }),
  deleteShot: async () => ({ ok: true, value: null, sample: true }),
  saveVariant: async (_id, edit) => ({ ok: true, value: { warnings: guardrailWarnings(edit.creativeText, edit.copy, copyPlatforms(edit.copy), edit.posts) }, sample: true }),
  approveVariant: async () => ({ ok: true, value: null, sample: true }),
  saveBrandProfile: async () => ({ ok: true, value: null, sample: true }),
  // Brand memory changes last this session, so the page shows what was saved.
  saveBrandMemory: async (next) => {
    store.__qgrMemory = next;
    return { ok: true, value: null, sample: true };
  },
  addBrandExample: async (example) => {
    const id = `e-${crypto.randomUUID().slice(0, 8)}`;
    examples().push({ id, ...example, source: 'pasted', createdAt: new Date().toISOString() });
    return { ok: true, value: { id }, sample: true };
  },
  removeBrandExample: async (id) => {
    const list = examples();
    const at = list.findIndex((e) => e.id === id);
    if (at === -1) return { ok: false, status: 404, error: 'That post is not in brand memory.' };
    list.splice(at, 1);
    return { ok: true, value: null, sample: true };
  },
  rememberPost: async (postId, place, note) => {
    const target = postList().find((p) => p.id === postId)?.targets.find((t) => t.place === place);
    if (!target || target.status !== 'posted') return { ok: false, status: 400, error: 'Only a post that went out can be kept as one that works.' };
    if (examples().some((e) => e.postId === postId && e.place === place)) return { ok: false, status: 400, error: 'That post is already in brand memory.' };
    examples().push({ id: `e-${crypto.randomUUID().slice(0, 8)}`, place, text: target.text, ...(note ? { note } : {}), source: 'marked', postId, createdAt: new Date().toISOString() });
    return { ok: true, value: null, sample: true };
  },
  saveVideoEdit: async () => ({ ok: true, value: null, sample: true }),
  saveDesign: async () => ({ ok: true, value: null, sample: true }),
  getLongVideos: async () => longVideos().map(({ transcript: _transcript, ...video }) => video),
  getLongVideo: async (id) => longVideos().find((v) => v.id === id) ?? null,
  // No agent runs on the sample data: its moments are picked by their place in the video, and say so.
  createLongVideo: async (input) => {
    const id = `lv-${crypto.randomUUID().slice(0, 8)}`;
    longVideos().unshift({
      id,
      title: input.title,
      file: input.file,
      guidance: input.guidance ?? null,
      status: 'done',
      error: null,
      moments: sampleMoments(input.transcript),
      lines: input.transcript.length,
      createdAt: new Date().toISOString(),
      sample: true,
      transcript: input.transcript,
    });
    return { ok: true, value: { id }, sample: true };
  },
  askMomentsAgain: async (id) => {
    const video = longVideos().find((v) => v.id === id);
    if (!video) return { ok: false, status: 404, error: 'That long video is gone.' };
    video.moments = [...sampleMoments(video.transcript).filter((m) => !video.moments.some((k) => k.first === m.first && k.last === m.last)), ...video.moments.filter((m) => m.source === 'team' || m.runIds.length > 0)];
    return { ok: true, value: null, sample: true };
  },
  removeLongVideo: async (id) => {
    store.__qgrLongVideos = longVideos().filter((v) => v.id !== id);
    return { ok: true, value: null, sample: true };
  },
  recordMomentRun: async (id, first, last, title, runId) => {
    const video = longVideos().find((v) => v.id === id);
    if (!video) return { ok: false, status: 404, error: 'That long video is gone.' };
    const known = video.moments.find((m) => m.first === first && m.last === last);
    if (known) known.runIds.push(runId);
    else {
      const m = momentOf(video.transcript, first, last, { title });
      if (!m) return { ok: false, status: 400, error: 'The moment is not inside the transcript.' };
      video.moments.push({ ...m, runIds: [runId] });
    }
    return { ok: true, value: null, sample: true };
  },
  getAiVideos: async () => [mock.SAMPLE_AI_VIDEO],
  getAiVideo: async (id) => (id === mock.SAMPLE_AI_VIDEO.id ? mock.SAMPLE_AI_VIDEO : null),
  getVideoBudget: async () => ({ ...videoBudget() }),
  // No Higgsfield to ask: nothing is priced, nothing is made, nothing is spent.
  priceVideo: async () => ({ ok: false, status: 503, error: 'The sample data has no Higgsfield to price it: prices show once the dashboard is connected.' }),
  askForVideo: async () => ({ ok: false, status: 503, error: 'Sample data makes no videos: there is no Higgsfield to ask.' }),
  removeAiVideo: async () => ({ ok: true, value: null, sample: true }),
  createVideoPictureUpload: async (extension) => ({ ok: true, value: { path: `refs/00000000-0000-4000-8000-000000000000/${crypto.randomUUID()}.${extension}`, url: null }, sample: true }),
  deleteVideoPicture: async () => ({ ok: true, value: null, sample: true }),
  setVideoSettings: async (live, cap) => {
    store.__qgrVideoBudget = { ...videoBudget(), live, cap };
    return { ok: true, value: null, sample: true };
  },
  getClipUrl: async (path) => (path === mock.SAMPLE_CLIP.path ? mock.SAMPLE_CLIP_URL : null),
  createClipUpload: async (extension) => ({ ok: true, value: { path: `${SAMPLE_UPLOADS}/${crypto.randomUUID()}.${extension}`, url: null }, sample: true }),
  deleteClipUpload: async () => ({ ok: true, value: null, sample: true }),

  // Where posts send people is kept with the leads' settings, as in team_settings.
  getTeamSettings: async () => ({ ...settings(), postLink: leadSettings().postLink }),
  saveAgentSettings: async (next) => {
    store.__qgrSettings = { ...settings(), ...next };
    return { ok: true, value: null, sample: true };
  },
  savePostPages: async (pages) => {
    // As the database does: a place whose Page is taken away stops posting for real.
    const was = settings().postForReal;
    store.__qgrSettings = { ...settings(), pages, postForReal: { facebook: was.facebook && !!pages.facebook, instagram: was.instagram && !!pages.instagram, linkedin: was.linkedin && !!pages.linkedin } };
    return { ok: true, value: null, sample: true };
  },
  setPostForReal: async (place, on) => {
    if (on && !settings().pages[place]) return { ok: false, status: 400, error: `Set the ${place === 'instagram' ? 'Instagram account' : `${PLACE_LABEL[place]} Page`} under Where posts go first.` };
    store.__qgrSettings = { ...settings(), postForReal: { ...settings().postForReal, [place]: on } };
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

  getLeads: async () => ({ leads: structuredClone(leadList()), settings: leadSettings() }),
  saveLeadCriteria: async (criteria) => {
    const was = leadSettings();
    store.__qgrLeadSettings = { ...was, criteria, criteriaAt: criteria === was.criteria ? was.criteriaAt : new Date().toISOString() };
    if (criteria !== was.criteria) for (const l of leadList()) if (l.ai) l.ai.olderCriteria = true;
    return { ok: true, value: null, sample: true };
  },
  setLeadsSource: async () => ({ ok: false, status: 400, error: 'The sample data is not connected to Zoho. Set Supabase up, then connect Zoho.' }),
  setLeadVerdict: async (leadId, verdict, note) => {
    const lead = leadList().find((l) => l.id === leadId);
    if (!lead) return { ok: false, status: 404, error: 'That lead is gone.' };
    if (verdict) lead.person = { verdict, ...(note ? { note } : {}), at: new Date().toISOString() };
    else delete lead.person;
    return { ok: true, value: null, sample: true };
  },
  // No model judges the sample's leads: nothing is asked, and the page says so.
  judgeLeadsAgain: async () => ({ ok: false, status: 400, error: 'No model judges the sample’s leads: connect Supabase and n8n to judge real ones.' }),
  readLeadsNow: async () => ({ ok: false, status: 400, error: 'The sample data is not connected to Zoho.' }),
  savePostLink: async (link) => {
    store.__qgrLeadSettings = { ...leadSettings(), postLink: link };
    return { ok: true, value: null, sample: true };
  },
  getPosts: async () =>
    [...postList()]
      .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))
      .map((p) => ({ ...p, targets: p.targets.map((t) => (examples().some((e) => e.postId === p.id && e.place === t.place) ? { ...t, remembered: true } : t)) })),
  schedulePost: async (post) => {
    const set = mock.adSets.find((a) => a.variants.some((v) => v.id === post.variantId));
    const variant = set?.variants.find((v) => v.id === post.variantId);
    if (!set || !variant) return { ok: false, status: 404, error: 'Sample posts can be made from the sample’s own ads only.' };
    // As the database does: a post that asks for the link needs one to be set.
    const link = leadSettings().postLink;
    if (post.targets.some((t) => t.link) && !link) return { ok: false, status: 400, error: 'Say where posts send people first (Leads, Setup).' };
    const now = new Date().toISOString();
    const id = `p-${crypto.randomUUID().slice(0, 8)}`;
    postList().push({
      id,
      variantId: variant.id,
      variantLabel: variant.label,
      adSetId: set.id,
      adSetTitle: set.title,
      angle: variant.angle,
      scheduledFor: post.at ? zonedToUtc(post.at, settings().timeZone) : now,
      createdAt: now,
      ...(post.thumbnail ? { thumbnail: post.thumbnail } : {}),
      targets: post.targets.map((t) => ({
        place: t.place,
        text: t.link && link ? `${postText(variant, t.place)}\n\n${taggedLink(link, set.runId, variant.label, t.place)}` : postText(variant, t.place),
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
  // Sample data has no image model to ask, and keeps no pictures.
  askForPicture: async () => ({ ok: false, status: 503, error: 'Sample data makes no pictures: there is no image model to ask.' }),
  usePicture: async () => ({ ok: true, value: null, sample: true }),
  stopPicture: async () => ({ ok: true, value: null, sample: true }),
  removePicture: async () => ({ ok: true, value: null, sample: true }),
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
  // The sample data stores nothing: a file added to an edit stays in the tab (lib/video/local-files.ts).
  createEditMediaUpload: async () => ({ ok: true, value: { path: `local:${crypto.randomUUID()}`, url: null }, sample: true }),
  deleteEditMedia: async () => ({ ok: true, value: null, sample: true }),
  signEditMedia: async () => ({}),
  createPostUpload: async (extension) => ({ ok: true, value: { path: `posts/00000000-0000-4000-8000-000000000000/${crypto.randomUUID()}.${extension}`, url: null }, sample: true }),
  deletePostMedia: async () => ({ ok: true, value: null, sample: true }),
};
