import 'server-only';
import type { PostgrestError } from '@supabase/supabase-js';
import { cache } from 'react';
import { copyPlatforms, guardrailWarnings } from '../guardrails';
import { startPipeline } from '../pipeline-start';
import { getViewer } from '../session';
import { pipelineConfig } from '../supabase/config';
import type { Json } from '../supabase/database.types';
import { getSupabase } from '../supabase/server';
import type { Supabase } from '../supabase/server';
import { toAdSet, toAgents, toBrandProfile, toCompetitor, toCreateRunArgs, toNotices, toRun, toStrategy, toUser } from './map';
import type { RunRow } from './map';
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
  'id, title, kind, input, url, competitor_name, files, excerpt, platforms, goal, summary, competitor_id, created_at, approved_at, page_ok:page->ok, page_url:page->>url, page_title:page->>title, page_words:page->words, page_error:page->>error, media_path, media, run_stages!run_stages_run_id_fkey(stage, status, summary, error, finished_at), strategies!strategies_run_id_fkey(id, strategy_angles!strategy_angles_strategy_id_fkey(id)), ad_sets!ad_sets_run_id_fkey(id, ad_variants!ad_variants_ad_set_id_fkey(id)), competitor_reports!competitor_reports_run_id_fkey(id, hooks!hooks_report_id_fkey(id))';
const RUN_WITH_EVENTS = `${RUN}, run_events!run_events_run_id_fkey(at, text)` as const;
const COMPETITOR =
  'id, name, domain, competitor_reports!competitor_reports_competitor_id_fkey(id, data_source, active_ads, platforms, insights, angles, created_at, hooks!hooks_report_id_fkey(id, rank, text, platform, format, days_running, variations), competitor_ads!competitor_ads_report_id_fkey(id, platform, format, text, days_running))';
const STRATEGY =
  'id, run_id, competitor_id, title, source_label, goal, positioning, audiences, channels, guardrails, created_at, approved_at, strategy_angles!strategy_angles_strategy_id_fkey(id, position, name, why, hook, based_on_hook), ad_sets!ad_sets_strategy_id_fkey(id)';
const AD_SET =
  'id, run_id, strategy_id, title, created_at, ad_variants!ad_variants_ad_set_id_fkey(id, label, angle, creative_text, creative_style, image_url, copy, warnings, approved_at, video_edit), runs!ad_sets_run_id_fkey(media_path, media)';
/** Uploaded clips. Private: people play them through links the server signs as them. */
const MEDIA_BUCKET = 'run-media';
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
    const [c, s, a] = await Promise.all([competitors(), strategies(), adSets()]);
    return toAgents(c.length, s.length, a.filter((set) => set.status === 'review'));
  },
  // Nothing schedules scans yet: a scan happens when someone starts a run.
  getNextScan: async () => null,
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
