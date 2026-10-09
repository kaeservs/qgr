import 'server-only';
import type { PostgrestError } from '@supabase/supabase-js';
import { cache } from 'react';
import { copyPlatforms, guardrailWarnings } from '../guardrails';
import { STAGE_ORDER } from '../pipeline';
import { pingPublisher, startPipeline } from '../pipeline-start';
import { getViewer } from '../session';
import { pipelineConfig, publisherConfig } from '../supabase/config';
import type { Json } from '../supabase/database.types';
import { getSupabase } from '../supabase/server';
import type { Supabase } from '../supabase/server';
import { transcribe, transcriptionKey } from '../transcribe';
import { toAdSet, toAgents, toBrandProfile, toCompetitor, toCreateRunArgs, toNotices, toPost, toRun, toStrategy, toTeamSettings, toUser } from './map';
import type { PostRow, RunRow } from './map';
import { searchIndex } from './source';
import type { DataSource, Saved } from './source';

// Supabase, read and written as the signed-in teammate with the publishable
// key. Row level security decides what comes back; every change goes through
// a database function that checks the team and the input
// (supabase/migrations/*_team_access.sql). Each embed names its foreign key:
// several tables link runs, strategies and competitors in more than one way,
// and an unnamed embed would be ambiguous.

// The page's text stays in the database for the agents: lists read only what the dashboard shows of it.
const RUN =
  'id, title, kind, input, url, competitor_name, files, excerpt, platforms, goal, summary, competitor_id, created_at, approved_at, page_ok:page->ok, page_url:page->>url, page_title:page->>title, page_words:page->words, page_error:page->>error, media_path, media, run_stages!run_stages_run_id_fkey(stage, status, summary, error, finished_at, waiting_since), strategies!strategies_run_id_fkey(id, strategy_angles!strategy_angles_strategy_id_fkey(id)), ad_sets!ad_sets_run_id_fkey(id, ad_variants!ad_variants_ad_set_id_fkey(id)), competitor_reports!competitor_reports_run_id_fkey(id, hooks!hooks_report_id_fkey(id))';
const RUN_WITH_EVENTS = `${RUN}, run_events!run_events_run_id_fkey(at, text)` as const;
const COMPETITOR =
  'id, name, domain, tracked, competitor_reports!competitor_reports_competitor_id_fkey(id, data_source, active_ads, platforms, insights, angles, created_at, hooks!hooks_report_id_fkey(id, rank, text, platform, format, days_running, variations), competitor_ads!competitor_ads_report_id_fkey(id, platform, format, text, days_running))';
const STRATEGY =
  'id, run_id, competitor_id, title, source_label, goal, positioning, audiences, channels, guardrails, created_at, approved_at, strategy_angles!strategy_angles_strategy_id_fkey(id, position, name, why, hook, based_on_hook), ad_sets!ad_sets_strategy_id_fkey(id)';
const AD_SET =
  'id, run_id, strategy_id, title, created_at, ad_variants!ad_variants_ad_set_id_fkey(id, label, angle, creative_text, creative_style, image_url, copy, warnings, approved_at, video_edit), runs!ad_sets_run_id_fkey(media_path, media)';
const POST =
  'id, variant_id, scheduled_for, created_at, thumbnail, post_targets!post_targets_post_id_fkey(place, text, media_kind, status, posted_at, remote_url, stand_in, error), ad_variants!posts_variant_id_fkey(label, ad_set_id, ad_sets!ad_variants_ad_set_id_fkey(title))';
/** Uploaded clips. Private: people play them through links the server signs as them. */
const MEDIA_BUCKET = 'run-media';
/** The files posts go out with, made in the browser. Removed once every place has its post. */
const POST_BUCKET = 'post-media';
/** Long enough for Deepgram to fetch a clip, no longer. */
const TRANSCRIBE_SECONDS = 15 * 60;
/** Long enough for a working session in the studio; a reload signs a fresh one. */
const PLAY_SECONDS = 6 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT = 200;

async function db(): Promise<Supabase> {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

/** A read that failed is a page that cannot render: app/(app)/error.tsx shows it. */
function readFailed(what: string, error: PostgrestError): never {
  console.error(`Reading ${what} failed`, error);
  throw new Error(`Reading ${what} failed`);
}

/** A write the database refused, in words the person can act on. */
function refused(error: PostgrestError, fallback: string): Saved<never> {
  if (error.code === '42501') return { ok: false, status: 403, error: 'Only the QGR team can do this.' };
  // The functions raise readable messages for input they refuse.
  if (error.code === 'P0001') return { ok: false, status: 400, error: error.message };
  console.error(fallback, error);
  return { ok: false, status: 500, error: fallback };
}

// One query per list per request (React's cache): the layout and the page share them.

const runRows = cache(async (): Promise<RunRow[]> => {
  const { data, error } = await (await db()).from('runs').select(RUN).order('created_at', { ascending: false }).limit(RECENT);
  if (error) readFailed('runs', error);
  return data;
});

const competitors = cache(async () => {
  const { data, error } = await (await db())
    .from('competitors')
    .select(COMPETITOR)
    .order('created_at', { referencedTable: 'competitor_reports', ascending: false })
    .limit(1, { referencedTable: 'competitor_reports' });
  if (error) readFailed('competitors', error);
  return data
    .map(toCompetitor)
    .filter((c) => c !== null)
    .sort((a, b) => b.lastScanAt.localeCompare(a.lastScanAt));
});

const strategies = cache(async () => {
  const { data, error } = await (await db()).from('strategies').select(STRATEGY).order('created_at', { ascending: false });
  if (error) readFailed('strategies', error);
  return data.map(toStrategy);
});

const adSets = cache(async () => {
  const { data, error } = await (await db()).from('ad_sets').select(AD_SET).order('created_at', { ascending: false });
  if (error) readFailed('ad sets', error);
  return data.map(toAdSet);
});

// A page and its title both ask for the run; one query serves them.
const runById = cache(async (id: string) => {
  if (!UUID.test(id)) return null;
  const { data, error } = await (await db()).from('runs').select(RUN_WITH_EVENTS).eq('id', id).maybeSingle();
  if (error) readFailed('the run', error);
  return data ? toRun(data) : null;
});

const teamSettings = cache(async () => {
  const { data, error } = await (await db()).from('team_settings').select('*').eq('id', 1).maybeSingle();
  if (error) readFailed('the team settings', error);
  if (!data) throw new Error('The team settings are missing');
  return toTeamSettings(data);
});

const posts = cache(async () => {
  const { data, error } = await (await db()).from('posts').select(POST).order('scheduled_for', { ascending: false }).limit(RECENT);
  if (error) readFailed('posts', error);
  return (data as PostRow[]).map(toPost).filter((p) => p !== null);
});

const brandProfile = cache(async () => {
  const { data, error } = await (await db()).from('brand_profile').select('*').eq('id', 1).maybeSingle();
  if (error) readFailed('the brand profile', error);
  if (!data) throw new Error('The brand profile is missing');
  return toBrandProfile(data);
});

export const liveData: DataSource = {
  getNow: async () => new Date().toISOString(),
  getCurrentUser: async () => {
    const viewer = await getViewer();
    return viewer ? toUser(viewer) : { name: 'Signed out', firstName: 'there', role: '', initials: '?' };
  },
  getRuns: async () => (await runRows()).map(toRun),
  getRun: (id) => runById(id),
  getCompetitors: () => competitors(),
  getCompetitor: async (id) => (await competitors()).find((c) => c.id === id) ?? null,
  getStrategies: () => strategies(),
  getStrategy: async (id) => (await strategies()).find((s) => s.id === id) ?? null,
  getStrategyForCompetitor: async (competitorId) => (await strategies()).find((s) => s.competitorIds.includes(competitorId)) ?? null,
  getAdSets: () => adSets(),
  getAdSet: async (id) => (await adSets()).find((a) => a.id === id) ?? null,
  getAgents: async () => {
    const [settings, c, s, a] = await Promise.all([teamSettings(), competitors(), strategies(), adSets()]);
    return toAgents(settings, { competitors: c.filter((x) => x.tracked).length, strategies: s.length }, a.filter((set) => set.status === 'review'));
  },
  getNextScan: async () => {
    const { data, error } = await (await db()).rpc('next_scan_at');
    if (error) readFailed('the next scan', error);
    return data ?? null;
  },
  getNotices: async () => toNotices(await runRows()),
  getSearchIndex: async () => {
    const [c, s, a, r] = await Promise.all([competitors(), strategies(), adSets(), runRows()]);
    return searchIndex(c, s, a, r.map(toRun));
  },
  getBrandProfile: () => brandProfile(),

  createRun: async (input, page) => {
    // Without n8n a run would wait forever, so it is not recorded at all.
    const pipeline = pipelineConfig();
    if (!pipeline) return { ok: false, status: 503, error: 'The agents aren’t connected yet, so runs can’t start.' };
    const supabase = await db();
    const { data: id, error } = await supabase.rpc('create_run', toCreateRunArgs(input, page));
    if (error) return refused(error, 'The run could not be saved.');
    const started = await startPipeline(pipeline, id, input.source.kind === 'custom' ? 'strategist' : 'tracker');
    if (!started.ok) {
      // The run shows why it stopped, with a retry, instead of waiting forever.
      const { error: reportError } = await supabase.rpc('report_start_failure', { p_run_id: id, p_error: started.error });
      if (reportError) console.error('Recording that the run could not start failed', reportError);
    }
    return { ok: true, value: { id }, sample: false };
  },

  saveVariant: async (variantId, edit) => {
    const platforms = copyPlatforms(edit.copy);
    const copy: { [platform: string]: Json } = {};
    for (const p of platforms) {
      const c = edit.copy[p];
      if (!c) continue;
      copy[p] = {
        text: c.text,
        headline: c.headline,
        ...(c.description !== undefined ? { description: c.description } : {}),
        ...(c.cta !== undefined ? { cta: c.cta } : {}),
      };
    }
    const warnings = guardrailWarnings(edit.creativeText, edit.copy, platforms);
    const { error } = await (await db()).rpc('save_variant', { p_variant_id: variantId, p_creative_text: edit.creativeText, p_copy: copy, p_warnings: warnings });
    if (error) return refused(error, 'Your changes could not be saved.');
    return { ok: true, value: { warnings }, sample: false };
  },

  saveVideoEdit: async (variantId, edit) => {
    const { error } = await (await db()).rpc('save_video_edit', { p_variant_id: variantId, p_edit: edit as unknown as Json });
    if (error) return refused(error, 'The video edit could not be saved.');
    return { ok: true, value: null, sample: false };
  },

  getClipUrl: async (path) => {
    const { data, error } = await (await db()).storage.from(MEDIA_BUCKET).createSignedUrl(path, PLAY_SECONDS);
    if (error) {
      console.error('Signing a clip link failed', error);
      return null;
    }
    return data.signedUrl;
  },

  createClipUpload: async (extension) => {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, status: 401, error: 'Sign in again to upload.' };
    const path = `uploads/${viewer.id}/${crypto.randomUUID()}.${extension}`;
    // Signed as the teammate: Storage checks they may write into this folder before it signs.
    const { data, error } = await (await db()).storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
    if (error) {
      console.error('Signing an upload link failed', error);
      return { ok: false, status: 500, error: 'The upload could not be started.' };
    }
    return { ok: true, value: { path, url: data.signedUrl }, sample: false };
  },

  deleteClipUpload: async (path) => {
    // Storage refuses (by its policy) a clip that is not the caller's or that a run uses.
    const { data, error } = await (await db()).storage.from(MEDIA_BUCKET).remove([path]);
    if (error) {
      console.error('Removing an unused clip failed', error);
      return { ok: false, status: 500, error: 'The clip could not be removed.' };
    }
    return data.length > 0 ? { ok: true, value: null, sample: false } : { ok: false, status: 404, error: 'That clip is in use or already gone.' };
  },

  transcribeClip: async (path) => {
    const key = transcriptionKey();
    if (!key) return { ok: false, status: 503, error: 'Transcripts aren’t connected yet (DEEPGRAM_API_KEY), so type what is said.' };
    const { data, error } = await (await db()).storage.from(MEDIA_BUCKET).createSignedUrl(path, TRANSCRIBE_SECONDS);
    if (error) {
      console.error('Signing a clip link for its transcript failed', error);
      return { ok: false, status: 404, error: 'That clip can’t be found.' };
    }
    const result = await transcribe(data.signedUrl, key);
    return result.ok ? { ok: true, value: { lines: result.lines }, sample: false } : result;
  },

  getTeamSettings: () => teamSettings(),

  saveAgentSettings: async (settings) => {
    const { error } = await (await db()).rpc('update_agent_settings', {
      p_strategist_auto: settings.strategistAuto,
      p_content_auto: settings.contentAuto,
      p_scan_every: settings.scanEvery,
      p_scan_day: settings.scanDay,
      p_scan_hour: settings.scanHour,
      p_time_zone: settings.timeZone,
    });
    if (error) return refused(error, 'The agents’ settings could not be saved.');
    return { ok: true, value: null, sample: false };
  },

  savePostPages: async (pages) => {
    // An empty value clears a Page: update_publishing_settings takes '' for none.
    const { error } = await (await db()).rpc('update_publishing_settings', {
      p_facebook_page_id: pages.facebook?.id ?? '',
      p_facebook_page_name: pages.facebook?.name ?? '',
      p_instagram_account_id: pages.instagram?.id ?? '',
      p_instagram_username: pages.instagram?.username ?? '',
      p_linkedin_org_id: pages.linkedin?.id ?? '',
      p_linkedin_page_name: pages.linkedin?.name ?? '',
    });
    if (error) return refused(error, 'The Pages could not be saved.');
    return { ok: true, value: null, sample: false };
  },

  setCompetitorTracked: async (competitorId, tracked) => {
    const { error } = await (await db()).rpc('set_competitor_tracked', { p_competitor_id: competitorId, p_tracked: tracked });
    if (error) return refused(error, 'The competitor could not be changed.');
    return { ok: true, value: null, sample: false };
  },

  continueRun: async (runId) => {
    const pipeline = pipelineConfig();
    if (!pipeline) return { ok: false, status: 503, error: 'The agents aren’t connected yet, so nothing can start.' };
    const supabase = await db();
    const { data, error } = await supabase.rpc('continue_run', { p_run_id: runId });
    if (error) return refused(error, 'The agent could not be started.');
    const stage = STAGE_ORDER.find((s) => s === data);
    if (!stage) return { ok: false, status: 500, error: 'The agent could not be started.' };
    const started = await startPipeline(pipeline, runId, stage);
    if (!started.ok) {
      const { error: reportError } = await supabase.rpc('report_continue_failure', { p_run_id: runId, p_stage: stage, p_error: started.error });
      if (reportError) console.error('Recording that the agent could not start failed', reportError);
      return { ok: false, status: 502, error: started.error };
    }
    return { ok: true, value: { stage }, sample: false };
  },

  getPosts: () => posts(),

  schedulePost: async (post) => {
    const { data: id, error } = await (await db()).rpc('schedule_post', {
      p_variant_id: post.variantId,
      p_targets: post.targets.map((t) => ({ place: t.place, ...(t.media ? { media_path: t.media.path, media_kind: t.media.kind } : {}) })),
      ...(post.at ? { p_local_time: post.at } : {}),
      ...(post.thumbnail ? { p_thumbnail: post.thumbnail } : {}),
    });
    if (error) return refused(error, 'The post could not be saved.');
    // A post for now goes at once; a scheduled one waits for the publisher's minute.
    const publisher = publisherConfig();
    if (!post.at && publisher) await pingPublisher(publisher);
    return { ok: true, value: { id }, sample: false };
  },

  cancelPost: async (postId) => {
    const supabase = await db();
    const { data: freed, error } = await supabase.rpc('cancel_post', { p_post_id: postId });
    if (error) return refused(error, 'The post could not be cancelled.');
    if (freed.length > 0) {
      const { error: removeError } = await supabase.storage.from(POST_BUCKET).remove(freed);
      if (removeError) console.error('Removing a cancelled post’s files failed', removeError);
    }
    return { ok: true, value: null, sample: false };
  },

  reschedulePost: async (postId, at) => {
    const { data, error } = await (await db()).rpc('reschedule_post', { p_post_id: postId, ...(at ? { p_local_time: at } : {}) });
    if (error) return refused(error, 'The post could not be moved.');
    const publisher = publisherConfig();
    if (!at && publisher) await pingPublisher(publisher);
    return { ok: true, value: { at: data }, sample: false };
  },

  retryPost: async (postId, place) => {
    const { error } = await (await db()).rpc('retry_post', { p_post_id: postId, p_place: place });
    if (error) return refused(error, 'The post could not be tried again.');
    const publisher = publisherConfig();
    if (publisher) await pingPublisher(publisher);
    return { ok: true, value: null, sample: false };
  },

  createPostUpload: async (extension) => {
    const viewer = await getViewer();
    if (!viewer) return { ok: false, status: 401, error: 'Sign in again to post.' };
    const path = `posts/${viewer.id}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await (await db()).storage.from(POST_BUCKET).createSignedUploadUrl(path);
    if (error) {
      console.error('Signing a post upload link failed', error);
      return { ok: false, status: 500, error: 'The post’s file could not be uploaded.' };
    }
    return { ok: true, value: { path, url: data.signedUrl }, sample: false };
  },

  deletePostMedia: async (path) => {
    // Storage refuses (by its policy) a file a post still waits on.
    const { data, error } = await (await db()).storage.from(POST_BUCKET).remove([path]);
    if (error) {
      console.error('Removing a post file failed', error);
      return { ok: false, status: 500, error: 'The file could not be removed.' };
    }
    return data.length > 0 ? { ok: true, value: null, sample: false } : { ok: false, status: 404, error: 'That file is in use or already gone.' };
  },

  approveVariant: async (variantId) => {
    const { error } = await (await db()).rpc('approve_variant', { p_variant_id: variantId });
    if (error) return refused(error, 'The approval could not be saved.');
    return { ok: true, value: null, sample: false };
  },

  saveBrandProfile: async (profile) => {
    const { error } = await (await db()).rpc('update_brand_profile', {
      p_company: profile.company,
      p_website: profile.website,
      p_offer: profile.offer,
      p_audience: profile.audience,
      p_voice: profile.voice,
      p_guardrails: profile.guardrails,
      p_page_name: profile.pageName,
      p_x_handle: profile.xHandle,
    });
    if (error) return refused(error, 'The brand profile could not be saved.');
    return { ok: true, value: null, sample: false };
  },
};
