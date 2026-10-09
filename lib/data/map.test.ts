import { describe, expect, it } from 'vitest';
import { defaultEdit } from '../video/edit';
import { clipOf, copyOf, one, sourceOf, toAdSet, toAgents, toCompetitor, toCreateRunArgs, toNotices, toRun, toStrategy, toUser } from './map';
import type { AdSetRow, CompetitorRow, RunRow, StageRow, StrategyRow } from './map';
import type { Json } from '../supabase/database.types';

const CLIP_PATH_OK = 'uploads/b263a35f-fb56-49bf-a032-59be7540d321/0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a09.mp4';

// Rows shaped as PostgREST returns them for the queries in live.ts.

const stage = (name: string, status: string, extra: Partial<StageRow> = {}): StageRow => ({ stage: name, status, summary: null, error: null, finished_at: null, ...extra });

const runRow = (extra: Partial<RunRow> = {}): RunRow => ({
  id: 'run-1',
  title: 'horizonvisa.example',
  kind: 'competitor',
  input: 'website',
  url: 'https://horizonvisa.example/',
  competitor_name: null,
  files: null,
  excerpt: null,
  platforms: ['meta', 'x'],
  goal: 'consultations',
  summary: null,
  competitor_id: null,
  created_at: '2026-10-07T10:00:00Z',
  approved_at: null,
  page_ok: null,
  page_url: null,
  page_title: null,
  page_words: null,
  page_error: null,
  media_path: null,
  media: null,
  run_stages: [stage('tracker', 'queued'), stage('strategist', 'queued'), stage('content', 'queued')],
  strategies: null,
  ad_sets: null,
  competitor_reports: null,
  ...extra,
});

describe('one', () => {
  it('reads a one-to-one embed as an object, an array or nothing', () => {
    expect(one({ id: 'a' })).toEqual({ id: 'a' });
    expect(one([{ id: 'a' }])).toEqual({ id: 'a' });
    expect(one([])).toBeNull();
    expect(one(null)).toBeNull();
  });
});

describe('toRun', () => {
  it('reads a queued competitor run', () => {
    const run = toRun(runRow());
    expect(run).toMatchObject({ id: 'run-1', status: 'queued', platforms: ['meta', 'x'], source: { kind: 'competitor', input: 'website', url: 'https://horizonvisa.example/' }, output: {}, counts: {}, activity: [] });
    expect(run).not.toHaveProperty('summary');
  });

  it('reads a finished run: its outputs, counts and events in order', () => {
    const run = toRun(
      runRow({
        competitor_id: 'comp-1',
        summary: 'Urgency runs their longest ads.',
        run_stages: [stage('content', 'done', { summary: 'Wrote 3 ad variants.' }), stage('tracker', 'done'), stage('strategist', 'done')],
        strategies: { id: 'strat-1', strategy_angles: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
        ad_sets: [{ id: 'set-1', ad_variants: [{ id: '1' }, { id: '2' }, { id: '3' }] }],
        competitor_reports: { id: 'rep-1', hooks: [{ id: 'h1' }, { id: 'h2' }] },
        run_events: [
          { at: '2026-10-07T10:02:00Z', text: 'Ready for review' },
          { at: '2026-10-07T10:00:00Z', text: 'Run started' },
        ],
      }),
    );
    expect(run.status).toBe('review');
    expect(run.stages.content).toEqual({ status: 'done', summary: 'Wrote 3 ad variants.' });
    expect(run.output).toEqual({ competitorId: 'comp-1', strategyId: 'strat-1', adSetId: 'set-1' });
    expect(run.counts).toEqual({ hooks: 2, angles: 3, variants: 3 });
    expect(run.activity.map((e) => e.text)).toEqual(['Run started', 'Ready for review']);
    expect(toRun(runRow({ approved_at: '2026-10-07T11:00:00Z', run_stages: [stage('tracker', 'done'), stage('strategist', 'done'), stage('content', 'done')] })).status).toBe('approved');
  });

  it('shows what was read from the link, or why not', () => {
    expect(toRun(runRow({ page_ok: true, page_url: 'https://horizonvisa.example/', page_title: 'Horizon', page_words: 640 })).page).toEqual({ ok: true, url: 'https://horizonvisa.example/', title: 'Horizon', words: 640 });
    expect(toRun(runRow({ page_ok: false, page_url: 'https://atlas.example/', page_error: 'The site turned the reader away (403).' })).page).toEqual({ ok: false, url: 'https://atlas.example/', error: 'The site turned the reader away (403).' });
    expect(toRun(runRow())).not.toHaveProperty('page');
  });

  it('shows a failure with its reason', () => {
    const run = toRun(runRow({ run_stages: [stage('tracker', 'failed', { error: 'n8n answered 503.' }), stage('strategist', 'queued'), stage('content', 'queued')] }));
    expect(run.status).toBe('failed');
    expect(run.stages.tracker).toEqual({ status: 'failed', error: 'n8n answered 503.' });
  });
});

describe('sourceOf', () => {
  it('reads every kind of start', () => {
    expect(sourceOf({ ...runRow(), input: 'upload', url: null, competitor_name: 'Atlas', files: ['a.png'] })).toEqual({ kind: 'competitor', input: 'upload', name: 'Atlas', files: ['a.png'] });
    expect(sourceOf({ ...runRow(), input: 'ad_link' })).toMatchObject({ kind: 'competitor', input: 'ad_link' });
    expect(sourceOf({ ...runRow(), kind: 'custom', input: 'text', url: null, excerpt: 'Plain words.' })).toEqual({ kind: 'custom', type: 'text', excerpt: 'Plain words.' });
    expect(sourceOf({ ...runRow(), kind: 'custom', input: 'podcast', url: 'https://pod.example/1' })).toEqual({ kind: 'custom', type: 'podcast', url: 'https://pod.example/1' });
  });
});

describe('toNotices', () => {
  it('says the latest thing that happened to each run, newest first', () => {
    const notices = toNotices([
      runRow({ id: 'r-fail', title: 'Failed one', run_stages: [stage('tracker', 'failed', { finished_at: '2026-10-07T09:00:00Z' })] }),
      runRow({ id: 'r-review', title: 'Ready one', ad_sets: { id: 's-1', ad_variants: [] }, run_stages: [stage('tracker', 'done'), stage('strategist', 'done'), stage('content', 'done', { finished_at: '2026-10-07T10:00:00Z' })] }),
      runRow({ id: 'r-scan', title: 'Scanned one', competitor_id: 'c-1', run_stages: [stage('tracker', 'done', { finished_at: '2026-10-07T08:00:00Z' }), stage('strategist', 'running')] }),
      runRow({ id: 'r-quiet' }),
    ]);
    expect(notices.map((n) => [n.tone, n.text, n.href])).toEqual([
      ['review', 'Ads ready for review: Ready one', '/content/s-1'],
      ['failed', 'Competitor Tracker stopped: Failed one', '/runs/r-fail'],
      ['done', 'Report ready: Scanned one', '/competitors/c-1'],
    ]);
  });
});

describe('toCompetitor', () => {
  const row: CompetitorRow = {
    id: 'comp-1',
    name: 'Horizon Visa Partners',
    domain: 'horizonvisa.example',
    competitor_reports: [
      {
        id: 'rep-1',
        data_source: 'placeholder',
        active_ads: 10,
        platforms: ['linkedin', 'meta', 'tiktok'],
        insights: ['Urgency runs longest.'],
        angles: [{ label: 'Timeline & urgency', ads: 4 }, { label: 7 }, 'junk'],
        created_at: '2026-10-07T10:00:00Z',
        hooks: [
          { id: 'h2', rank: 2, text: 'Second', platform: 'meta', format: 'image', days_running: 20, variations: 1 },
          { id: 'h1', rank: 1, text: 'First', platform: 'meta', format: 'video', days_running: 63, variations: 5 },
          { id: 'h3', rank: 3, text: 'Elsewhere', platform: 'tiktok', format: 'video', days_running: 9, variations: 1 },
        ],
        competitor_ads: [
          { id: 'a1', platform: 'meta', format: 'image', text: 'Short', days_running: 5 },
          { id: 'a2', platform: 'linkedin', format: 'document', text: 'Long', days_running: 40 },
        ],
      },
    ],
  };

  it('reads the latest report, keeping what the dashboard can show', () => {
    const c = toCompetitor(row);
    expect(c).toMatchObject({ id: 'comp-1', domain: 'horizonvisa.example', dataSource: 'placeholder', platforms: ['meta', 'linkedin'], activeAds: 10, lastScanAt: '2026-10-07T10:00:00Z' });
    expect(c?.hooks.map((h) => h.text)).toEqual(['First', 'Second']);
    expect(c?.angles).toEqual([{ label: 'Timeline & urgency', ads: 4 }]);
    expect(c?.examples.map((a) => [a.text, a.tone])).toEqual([
      ['Long', 'slate'],
      ['Short', 'teal'],
    ]);
  });

  it('leaves out a competitor with no report, and a domain it does not have', () => {
    expect(toCompetitor({ ...row, competitor_reports: [] })).toBeNull();
    expect(toCompetitor({ ...row, domain: null })).not.toHaveProperty('domain');
  });
});

describe('toStrategy', () => {
  const row: StrategyRow = {
    id: 'strat-1',
    run_id: 'run-1',
    competitor_id: 'comp-1',
    title: 'Q4 push',
    source_label: null,
    goal: 'webinar',
    positioning: 'Plain advice',
    audiences: ['Families'],
    channels: [{ platform: 'meta', share: 70, role: 'Reach', format: 'Video' }, { platform: 'x', share: 30, role: 'Talk', format: 'Text' }, { platform: 'myspace', share: 5 }],
    guardrails: ['Never promise an outcome'],
    created_at: '2026-10-07T10:00:00Z',
    approved_at: null,
    strategy_angles: [
      { id: 'b', position: 1, name: 'Second', why: 'w', hook: 'h', based_on_hook: null },
      { id: 'a', position: 0, name: 'First', why: 'w', hook: 'h', based_on_hook: 'Their hook' },
    ],
    ad_sets: [{ id: 'set-1' }],
  };

  it('orders the angles and ties each to the hook it answers', () => {
    const s = toStrategy(row);
    expect(s).toMatchObject({ status: 'draft', goal: 'webinar', competitorIds: ['comp-1'], adSetId: 'set-1' });
    expect(s.angles.map((a) => a.name)).toEqual(['First', 'Second']);
    expect(s.angles[0]?.basedOn).toEqual({ competitorId: 'comp-1', hook: 'Their hook' });
    expect(s.angles[1]).not.toHaveProperty('basedOn');
    expect(s.channels.map((c) => c.platform)).toEqual(['meta', 'x']);
    expect(toStrategy({ ...row, approved_at: '2026-10-07T12:00:00Z' }).status).toBe('approved');
  });
});

describe('toAdSet', () => {
  const variant = (label: string, extra: Partial<AdSetRow['ad_variants'][number]> = {}): AdSetRow['ad_variants'][number] => ({
    id: `v-${label}`,
    label,
    angle: `Angle ${label}`,
    creative_text: 'Plan with care',
    creative_style: 'arcs',
    image_prompt: 'A calm skyline at dusk, no words',
    picture_path: null,
    picture_status: 'none',
    picture_error: null,
    picture_requested_at: null,
    copy: { meta: { text: 't', headline: 'h', description: 'd', cta: 'Book now' }, x: { text: 't', headline: 'h' } },
    warnings: [],
    approved_at: null,
    video_edit: null,
    ...extra,
  });

  it('sorts the variants and reads approval from any of them', () => {
    const set = toAdSet({ id: 'set-1', run_id: 'run-1', strategy_id: 'strat-1', title: 'Q4', created_at: '2026-10-07T10:00:00Z', ad_variants: [variant('C'), variant('A', { warnings: ['meta text says "guarantee"'] }), variant('B')], runs: { media_path: null, media: null } });
    expect(set.variants.map((v) => v.label)).toEqual(['A', 'B', 'C']);
    expect(set.status).toBe('review');
    expect(set.variants[0]?.warnings).toEqual(['meta text says "guarantee"']);
    expect(set.variants[0]?.copy).toEqual({ meta: { text: 't', headline: 'h', description: 'd', cta: 'Book now' }, x: { text: 't', headline: 'h' } });

    const approved = toAdSet({ id: 'set-1', run_id: 'run-1', strategy_id: 'strat-1', title: 'Q4', created_at: '2026-10-07T10:00:00Z', ad_variants: [variant('A'), variant('B', { approved_at: '2026-10-07T11:00:00Z' })], runs: null });
    expect(approved.status).toBe('approved');
    expect(approved.variants[1]).toMatchObject({ approved: true });
    expect(approved).not.toHaveProperty('clip');
  });

  it('shows a picture through the link it is given, and what is pending', () => {
    const path = 'pictures/0d6c5a1e-9b8f-4c3d-a2e1-f0e9d8c7b6a5/7c2b9e4d-1a3f-4b5c-8d6e-9f0a1b2c3d4e.png';
    const signed = (p: string) => (p === path ? 'https://storage.example/signed/b.png?token=t' : undefined);
    const set = toAdSet(
      {
        id: 'set-1',
        run_id: 'run-1',
        strategy_id: 'strat-1',
        title: 'Q4',
        created_at: '2026-10-07T10:00:00Z',
        ad_variants: [
          variant('A', { picture_status: 'making', picture_requested_at: '2026-10-07T11:00:00Z' }),
          variant('B', { picture_path: path }),
          variant('C', { image_prompt: '', picture_status: 'failed', picture_error: 'The image model refused the prompt (400).' }),
        ],
        runs: null,
      },
      signed,
    );
    expect(set.variants[0]).toMatchObject({ picturePrompt: 'A calm skyline at dusk, no words', picture: { status: 'making', askedAt: '2026-10-07T11:00:00Z' } });
    expect(set.variants[0]).not.toHaveProperty('imageUrl');
    expect(set.variants[1]).toMatchObject({ imageUrl: 'https://storage.example/signed/b.png?token=t' });
    expect(set.variants[1]).not.toHaveProperty('picture');
    expect(set.variants[2]).toMatchObject({ picture: { status: 'failed', note: 'The image model refused the prompt (400).' } });
    expect(set.variants[2]).not.toHaveProperty('picturePrompt');
    // Without a link, the picture is not shown: the design is drawn.
    expect(toAdSet({ id: 's', run_id: 'r', strategy_id: 't', title: 'T', created_at: '2026-10-07T10:00:00Z', ad_variants: [variant('B', { picture_path: path })], runs: null }).variants[0]).not.toHaveProperty('imageUrl');
  });

  it('reads the run’s clip and each variant’s edit of it, dropping an edit that no longer fits', () => {
    // As the database returns it: plain JSON.
    const edit = JSON.parse(JSON.stringify({ ...defaultEdit(12), aspect: '9:16', keep: [{ start: 1, end: 6 }] })) as { [key: string]: Json };
    const set = toAdSet({
      id: 'set-1',
      run_id: 'run-1',
      strategy_id: 'strat-1',
      title: 'Clip',
      created_at: '2026-10-07T10:00:00Z',
      ad_variants: [variant('A', { video_edit: edit }), variant('B', { video_edit: { ...edit, keep: [{ start: 0, end: 90 }] } }), variant('C')],
      runs: { media_path: CLIP_PATH_OK, media: { name: 'clip.mp4', duration: 12, width: 1280, height: 720, size: 1000 } },
    });
    expect(set.clip).toEqual({ path: CLIP_PATH_OK, name: 'clip.mp4', duration: 12, width: 1280, height: 720, size: 1000 });
    expect(set.variants[0]?.videoEdit).toMatchObject({ aspect: '9:16', keep: [{ start: 1, end: 6 }] });
    expect(set.variants[1]).not.toHaveProperty('videoEdit');
    expect(set.variants[2]).not.toHaveProperty('videoEdit');
  });
});

describe('clips', () => {
  it('reads a clip run, and falls back to a link when the clip is missing or malformed', () => {
    const media = { name: 'explainer.mp4', duration: 42.5, width: 1920, height: 1080, size: 31_000_000 };
    expect(sourceOf(runRow({ kind: 'custom', input: 'video', url: null, excerpt: 'What is said in it.', media_path: CLIP_PATH_OK, media }))).toEqual({
      kind: 'custom',
      type: 'video',
      clip: { path: CLIP_PATH_OK, ...media },
      notes: 'What is said in it.',
    });
    expect(clipOf('uploads/../../secrets.mp4', media)).toBeNull();
    expect(clipOf(CLIP_PATH_OK, { duration: 'long' })).toBeNull();
    expect(sourceOf(runRow({ kind: 'custom', input: 'video', url: 'https://youtube.example/watch', media_path: null, media: null }))).toEqual({ kind: 'custom', type: 'video', url: 'https://youtube.example/watch' });
  });
});

describe('copyOf', () => {
  it('keeps text fields of known platforms only', () => {
    expect(copyOf({ meta: { text: 't', headline: 'h', cta: 3 }, linkedin: { text: 't' }, tiktok: { text: 't', headline: 'h' } })).toEqual({ meta: { text: 't', headline: 'h' } });
    expect(copyOf('nonsense')).toEqual({});
  });
});

describe('toAgents and toUser', () => {
  const settings = { timeZone: 'America/New_York', strategistAuto: false, contentAuto: true, picturesAuto: false, scanEvery: 'week' as const, scanDay: 1, scanHour: 9 };

  it('counts from the data, and shows each agent’s switch as the team set it', () => {
    const agents = toAgents(settings, { competitors: 1, strategies: 2 }, []);
    expect(agents.map((a) => a.stat)).toEqual(['1 competitor tracked', '2 strategies', '0 sets to review']);
    expect(agents.map((a) => [a.key, a.auto, a.auto ? a.autoLabel : a.manualLabel])).toEqual([
      ['tracker', true, 'Scans every Monday, 09:00'],
      ['strategist', false, 'Waits for you after a scan'],
      ['content', true, 'Writes ads from every strategy'],
    ]);
    expect(agents.every((a) => a.switchable)).toBe(true);
    expect(agents[2]?.action).toEqual({ label: 'View ads', href: '/content' });
  });

  it('says when the tracker would scan if it were switched on', () => {
    const [tracker] = toAgents({ ...settings, scanEvery: 'off', scanDay: 3 }, { competitors: 0, strategies: 0 }, []);
    expect(tracker).toMatchObject({ auto: false, manualLabel: 'Scans when you ask', autoLabel: 'Scans every Wednesday, 09:00' });
  });

  it('names the signed-in teammate', () => {
    expect(toUser({ id: 'u', email: 'alex.morgan@example.com', name: 'Alex Morgan', role: 'owner' })).toEqual({ name: 'Alex Morgan', firstName: 'Alex', role: 'Owner', initials: 'AM' });
  });
});

describe('toCreateRunArgs', () => {
  it('passes the page that was read', () => {
    const page = { ok: true as const, url: 'https://horizonvisa.example/', title: 'Horizon', siteName: null, description: null, type: 'website' as const, text: 'Words.', words: 1, readAt: '2026-10-08T09:00:00Z' };
    expect(toCreateRunArgs({ source: { kind: 'competitor', input: 'website', url: 'https://horizonvisa.example/' }, platforms: ['meta'], goal: 'consultations' }, page)).toMatchObject({ p_page: page });
  });

  it('sends only the arguments a run of that kind has', () => {
    expect(toCreateRunArgs({ source: { kind: 'competitor', input: 'website', url: 'https://horizonvisa.example/' }, platforms: ['meta'], goal: 'consultations' })).toEqual({
      p_kind: 'competitor',
      p_input: 'website',
      p_url: 'https://horizonvisa.example/',
      p_title: 'horizonvisa.example',
      p_platforms: ['meta'],
      p_goal: 'consultations',
    });
    expect(toCreateRunArgs({ source: { kind: 'custom', type: 'text', excerpt: 'Plain words about EB-5 for families planning a move.' }, platforms: ['x'], goal: 'guide', title: 'Pasted' })).toEqual({
      p_kind: 'custom',
      p_input: 'text',
      p_excerpt: 'Plain words about EB-5 for families planning a move.',
      p_title: 'Pasted',
      p_platforms: ['x'],
      p_goal: 'guide',
    });
    expect(toCreateRunArgs({ source: { kind: 'competitor', input: 'upload', name: 'Atlas', files: ['a.png'] }, platforms: ['meta'], goal: 'webinar' })).toMatchObject({ p_input: 'upload', p_competitor_name: 'Atlas', p_files: ['a.png'] });
  });

  it('sends a clip as its path and what is known of it, with the notes as the excerpt', () => {
    const clip = { path: CLIP_PATH_OK, name: 'explainer.mp4', duration: 42.5, width: 1920, height: 1080, size: 31_000_000 };
    expect(toCreateRunArgs({ source: { kind: 'custom', type: 'video', clip, notes: 'Four steps of EB-5, in plain words.' }, platforms: ['meta'], goal: 'consultations' })).toEqual({
      p_kind: 'custom',
      p_input: 'video',
      p_excerpt: 'Four steps of EB-5, in plain words.',
      p_media_path: CLIP_PATH_OK,
      p_media: { name: 'explainer.mp4', duration: 42.5, width: 1920, height: 1080, size: 31_000_000 },
      p_title: 'Video · explainer',
      p_platforms: ['meta'],
      p_goal: 'consultations',
    });
  });
});
