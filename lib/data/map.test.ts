import { describe, expect, it } from 'vitest';
import { defaultEdit } from '../video/edit';
import { clipOf, copyOf, one, sourceOf, toActivity, toAdSet, toAgents, toAiVideo, toVideoBudget, toBrandExample, toBrandMemory, toCompetitor, toCreateRunArgs, toLead, toLeadSettings, toNotices, toPost, toRun, toStrategy, toUser } from './map';
import type { ActivityRows, AdSetRow, AiVideoRow, BrandRow, CompetitorRow, LeadRow, PostRow, RunRow, SettingsRow, StageRow, StrategyRow } from './map';
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
  guidance: null,
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
    expect(run).not.toHaveProperty('guidance');
  });

  it('carries the team’s direction for the agents', () => {
    expect(toRun(runRow({ guidance: 'Lead with the family angle.' })).guidance).toBe('Lead with the family angle.');
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
  const before = { headline: null, cta: null, angle: null, screenshot_path: null, position: null, days_known: true };
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
          { id: 'h2', rank: 2, text: 'Second', platform: 'meta', format: 'image', days_running: 0, variations: 1, days_known: false },
          { id: 'h1', rank: 1, text: 'First', platform: 'meta', format: 'video', days_running: 63, variations: 5, days_known: true },
          { id: 'h3', rank: 3, text: 'Elsewhere', platform: 'tiktok', format: 'video', days_running: 9, variations: 1, days_known: true },
        ],
        // A report from before the tracker kept every ad: no order, no headline, no screenshot.
        competitor_ads: [
          { ...before, id: 'a1', platform: 'meta', format: 'image', text: 'Short', days_running: 5, ad_url: 'https://www.facebook.com/ads/library/?id=1111111111' },
          { ...before, id: 'a2', platform: 'linkedin', format: 'document', text: 'Long', days_running: 40, ad_url: null },
          { ...before, id: 'a3', platform: 'meta', format: 'video', text: 'Odd link', days_running: 2, ad_url: 'https://scam.example/ads/library/?id=1' },
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
      ['Odd link', 'plum'],
    ]);
    // An ad is linked to its page in Meta's Ad Library, and to nothing else.
    expect(c?.examples.map((a) => a.url ?? null)).toEqual([null, 'https://www.facebook.com/ads/library/?id=1111111111', null]);
  });

  it('keeps the tracker’s order, what it read of each ad, and a signed link to its screenshot', () => {
    const report = row.competitor_reports[0]!;
    const shot = 'shots/b263a35f-fb56-49bf-a032-59be7540d321/0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a09.png';
    const c = toCompetitor(
      {
        ...row,
        competitor_reports: [
          {
            ...report,
            data_source: 'upload',
            competitor_ads: [
              { ...before, id: 'b2', platform: 'meta', format: 'image', text: 'Second', days_running: 0, ad_url: null, position: 1, days_known: false, screenshot_path: shot },
              { ...before, id: 'b1', platform: 'meta', format: 'video', text: 'First', days_running: 30, ad_url: null, position: 0, headline: 'Plan now', cta: 'Learn more', angle: 'Family & education' },
            ],
          },
        ],
      },
      (path) => (path === shot ? 'https://signed.example/shot' : undefined),
    );
    expect(c?.reportId).toBe('rep-1');
    expect(c?.dataSource).toBe('upload');
    expect(c?.examples).toEqual([
      { id: 'b1', platform: 'meta', format: 'video', text: 'First', daysRunning: 30, tone: 'slate', headline: 'Plan now', cta: 'Learn more', angle: 'Family & education' },
      { id: 'b2', platform: 'meta', format: 'image', text: 'Second', daysRunning: null, tone: 'teal', screenshot: 'https://signed.example/shot' },
    ]);
    // A hook whose days are not known says nothing in their place.
    expect(c?.hooks.map((h) => h.daysRunning)).toEqual([63, null]);
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
    posts: {},
    warnings: [],
    approved_at: null,
    video_edit: null,
    ...extra,
  });

  it('carries a variant’s posts in full, and none when it has none', () => {
    const set = toAdSet({
      id: 'set-1',
      run_id: 'run-1',
      strategy_id: 'strat-1',
      title: 'Q4',
      created_at: '2026-10-07T10:00:00Z',
      ad_variants: [variant('A', { posts: { facebook: 'The full post.', instagram: '  ', tiktok: 'No.', linkedin: 3 } }), variant('B')],
      runs: null,
    });
    expect(set.variants[0]?.posts).toEqual({ facebook: 'The full post.' });
    expect(set.variants[1]).not.toHaveProperty('posts');
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

  it('keeps the pictures made for a variant, newest first, leaving out those past the eight kept', () => {
    const folder = 'pictures/0d6c5a1e-9b8f-4c3d-a2e1-f0e9d8c7b6a5';
    const shown = `${folder}/11111111-1a3f-4b5c-8d6e-9f0a1b2c3d4e.jpg`;
    const older = `${folder}/22222222-1a3f-4b5c-8d6e-9f0a1b2c3d4e.jpg`;
    const gone = `${folder}/33333333-1a3f-4b5c-8d6e-9f0a1b2c3d4e.jpg`;
    const signed = (p: string) => (p === gone ? undefined : `https://storage.example/signed/${p.slice(-8)}`);
    const set = toAdSet(
      {
        id: 'set-1',
        run_id: 'run-1',
        strategy_id: 'strat-1',
        title: 'Q4',
        created_at: '2026-10-07T10:00:00Z',
        ad_variants: [
          variant('A', {
            picture_path: shown,
            variant_pictures: [
              { id: 'p-older', path: older, prompt: null, created_at: '2026-10-07T11:00:00Z', removed_at: null },
              { id: 'p-gone', path: gone, prompt: 'Gone', created_at: '2026-10-07T10:00:00Z', removed_at: '2026-10-08T10:00:00Z' },
              { id: 'p-shown', path: shown, prompt: 'A harbour at dawn', created_at: '2026-10-07T12:00:00Z', removed_at: null },
            ],
          }),
          variant('B', { variant_pictures: [] }),
          variant('C'),
        ],
        runs: null,
      },
      signed,
    );
    expect(set.variants[0]?.pictures).toEqual([
      { id: 'p-shown', url: `https://storage.example/signed/${shown.slice(-8)}`, prompt: 'A harbour at dawn', shown: true, createdAt: '2026-10-07T12:00:00Z' },
      { id: 'p-older', url: `https://storage.example/signed/${older.slice(-8)}`, shown: false, createdAt: '2026-10-07T11:00:00Z' },
    ]);
    expect(set.variants[1]).not.toHaveProperty('pictures');
    expect(set.variants[2]).not.toHaveProperty('pictures');
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
  it('starts every ad without its own edit from the edit made as the clip was uploaded', () => {
    const own = JSON.parse(JSON.stringify({ ...defaultEdit(12), aspect: '1:1' })) as { [key: string]: Json };
    const upload = JSON.parse(JSON.stringify({ ...defaultEdit(12), aspect: '9:16', keep: [{ start: 2, end: 8 }] })) as { [key: string]: Json };
    const set = toAdSet({
      id: 'set-1',
      run_id: 'run-1',
      strategy_id: 'strat-1',
      title: 'Clip',
      created_at: '2026-10-07T10:00:00Z',
      ad_variants: [variant('A', { video_edit: own }), variant('B'), variant('C')],
      runs: { media_path: CLIP_PATH_OK, media: { name: 'clip.mp4', duration: 12, width: 1280, height: 720, size: 1000, edit: upload } },
    });
    expect(set.clip?.edit).toMatchObject({ aspect: '9:16', keep: [{ start: 2, end: 8 }] });
    expect(set.variants.map((v) => v.videoEdit?.aspect)).toEqual(['1:1', '9:16', '9:16']);
    // An edit that no longer reads is left out, and the ads start from the whole clip.
    expect(clipOf(CLIP_PATH_OK, { name: 'clip.mp4', duration: 12, width: 1, height: 1, size: 1, edit: { keep: [] } })).not.toHaveProperty('edit');
  });

  it('reads a picture ad’s design, leaving out a plain or unreadable one, and any on a clip’s ads', () => {
    const design = { logo: false, texts: [{ id: 't1', text: 'Book a free consultation', look: 'banner' }], spots: { square: { words: { x: 0.5, y: 0.3, scale: 1.4 }, t1: { x: 0.5, y: 0.9 }, gone: { x: 0, y: 0 } } } };
    const row = (ad_variants: AdSetRow['ad_variants'], runs: AdSetRow['runs'] = null) => toAdSet({ id: 's', run_id: 'r', strategy_id: 't', title: 'T', created_at: '2026-10-07T10:00:00Z', ad_variants, runs });
    const set = row([variant('A', { design }), variant('B', { design: { logo: true, texts: [], spots: {} } }), variant('C', { design: { logo: 'yes' } }), variant('D')]);
    expect(set.variants[0]?.design).toEqual({ logo: false, texts: [{ id: 't1', text: 'Book a free consultation', look: 'banner' }], spots: { square: { words: { x: 0.5, y: 0.3, scale: 1.4 }, t1: { x: 0.5, y: 0.9, scale: 1 } } } });
    for (const v of set.variants.slice(1)) expect(v).not.toHaveProperty('design');
    const clip = row([variant('A', { design })], { media_path: CLIP_PATH_OK, media: { name: 'clip.mp4', duration: 12, width: 1280, height: 720, size: 1000 } });
    expect(clip.variants[0]).not.toHaveProperty('design');
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
  const settings = { timeZone: 'America/New_York', strategistAuto: false, contentAuto: true, picturesAuto: false, adsSource: 'sample' as const, pictureModel: 'stand-in' as const, cloudflareAccount: '', scanEvery: 'week' as const, scanDay: 1, scanHour: 9 };

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
    expect(toUser({ id: 'u', email: 'alex.morgan@example.com', name: 'Alex Morgan', photoPath: null, role: 'owner' })).toEqual({ name: 'Alex Morgan', firstName: 'Alex', role: 'Owner', initials: 'AM' });
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

  it('sends the edit made as the clip was uploaded with the clip', () => {
    const edit = { ...defaultEdit(42.5), aspect: '9:16' as const };
    const clip = { path: CLIP_PATH_OK, name: 'explainer.mp4', duration: 42.5, width: 1920, height: 1080, size: 31_000_000, edit };
    expect(toCreateRunArgs({ source: { kind: 'custom', type: 'video', clip, notes: 'Four steps of EB-5, in plain words.' }, platforms: ['meta'], goal: 'consultations' })).toMatchObject({
      p_media: { name: 'explainer.mp4', edit: { aspect: '9:16' } },
    });
  });
});

describe('toActivity', () => {
  const now = '2026-10-09T12:00:00Z';
  const ago = (minutes: number) => new Date(Date.parse(now) - minutes * 60_000).toISOString();
  const post = (title: string, label: string, scheduledFor: string) => ({ scheduled_for: scheduledFor, ad_variants: { label, ad_sets: { title } } });
  const rows = (r: Partial<ActivityRows>): ActivityRows => ({ stages: [], places: [], pictures: [], ...r });

  it('lists the agents at work, newest first, and leaves out one past its time', () => {
    const items = toActivity(
      rows({
        stages: [
          { run_id: 'r1', stage: 'strategist', started_at: ago(2), runs: { title: 'Q4 push' } },
          { run_id: 'r2', stage: 'tracker', started_at: ago(1), runs: [{ title: 'horizonvisa.example' }] },
          // Running for hours: stuck, not at work.
          { run_id: 'r3', stage: 'content', started_at: ago(180), runs: { title: 'Old test' } },
          { run_id: 'r4', stage: 'unknown', started_at: ago(1), runs: { title: 'Odd' } },
        ],
      }),
      now,
    );
    expect(items).toEqual([
      { id: 'run-r2', kind: 'run', label: 'Competitor Tracker', subject: 'horizonvisa.example', href: '/runs/r2', since: ago(1), stage: 'tracker' },
      { id: 'run-r1', kind: 'run', label: 'Ad Strategist', subject: 'Q4 push', href: '/runs/r1', since: ago(2), stage: 'strategist' },
    ]);
  });

  it('shows a post going out once, naming its places, and only while it is due', () => {
    const items = toActivity(
      rows({
        places: [
          { post_id: 'p1', place: 'linkedin', status: 'posting', claimed_at: ago(1), posts: post('Q4 push', 'A', ago(2)) },
          { post_id: 'p1', place: 'facebook', status: 'scheduled', claimed_at: null, posts: post('Q4 push', 'A', ago(2)) },
          // Due an hour ago and never taken (n8n is off): not at work.
          { post_id: 'p2', place: 'facebook', status: 'scheduled', claimed_at: null, posts: post('Webinar', 'B', ago(60)) },
          // Not due yet.
          { post_id: 'p3', place: 'instagram', status: 'scheduled', claimed_at: null, posts: post('Webinar', 'C', new Date(Date.parse(now) + 3_600_000).toISOString()) },
        ],
      }),
      now,
    );
    expect(items).toEqual([{ id: 'post-p1', kind: 'post', label: 'Sending to Facebook, LinkedIn', subject: 'Q4 push, variant A', href: '/posts#post-p1', since: ago(2) }]);
  });

  it('shows a picture being made for ten minutes at most', () => {
    const items = toActivity(
      rows({
        pictures: [
          { id: 'v1', label: 'B', ad_set_id: 's1', picture_requested_at: ago(3), ad_sets: { title: 'Q4 push' } },
          { id: 'v2', label: 'C', ad_set_id: 's1', picture_requested_at: ago(11), ad_sets: { title: 'Q4 push' } },
        ],
      }),
      now,
    );
    expect(items).toEqual([{ id: 'picture-v1', kind: 'picture', label: 'Making a picture', subject: 'Q4 push, variant B', href: '/content/s1', since: ago(3) }]);
  });

  it('shows a video being made for half an hour at most', () => {
    const items = toActivity(
      rows({
        videos: [
          { id: 'a1', prompt: 'A slow aerial over a sunlit American suburb at golden hour, calm and warm', asked_at: ago(4) },
          { id: 'a2', prompt: 'A family on a porch, evening light', asked_at: ago(31) },
        ],
      }),
      now,
    );
    expect(items).toEqual([{ id: 'video-a1', kind: 'video', label: 'Making a video', subject: 'A slow aerial over a sunlit American suburb…', href: '/videos?view=ai', since: ago(4) }]);
  });

  it('says nothing when nothing is at work', () => {
    expect(toActivity(rows({}), now)).toEqual([]);
  });
});

describe('brand memory', () => {
  const row: BrandRow = {
    id: 1,
    company: 'Quantum Global Residency',
    website: 'quantumglobalresidency.com',
    offer: 'EB-5 guidance',
    audience: 'Families',
    voice: ['Calm'],
    guardrails: [],
    page_name: 'Quantum Global',
    x_handle: '@quantumglobal',
    updated_at: '2026-10-13T10:00:00Z',
    topics: ['EB-5 basics'],
    post_formats: { instagram: 'Hashtags last.', tiktok: 'No.', linkedin: '  ' },
    picture_style: null,
  };

  it('reads the topics, the format notes for known places, and an empty picture style', () => {
    expect(toBrandMemory(row)).toEqual({ topics: ['EB-5 basics'], postFormats: { instagram: 'Hashtags last.' }, pictureStyle: '' });
  });

  it('reads a post that works, and leaves out one from nowhere', () => {
    const example = { id: 'e-1', place: 'linkedin', text: 'A post.', note: null, source: 'marked', post_id: 'p-1', created_at: '2026-10-13T10:00:00Z' };
    expect(toBrandExample(example)).toEqual({ id: 'e-1', place: 'linkedin', text: 'A post.', source: 'marked', postId: 'p-1', createdAt: '2026-10-13T10:00:00Z' });
    expect(toBrandExample({ ...example, place: 'tiktok' })).toBeNull();
  });

  it('marks the places of a post kept in brand memory', () => {
    const post: PostRow = {
      id: 'p-1',
      variant_id: 'v-1',
      scheduled_for: '2026-10-13T10:00:00Z',
      created_at: '2026-10-13T09:00:00Z',
      thumbnail: null,
      post_targets: (['facebook', 'linkedin'] as const).map((place) => ({
        place,
        text: 'Words',
        media_kind: null,
        status: 'posted',
        posted_at: '2026-10-13T10:00:05Z',
        remote_url: null,
        stand_in: false,
        error: null,
        reach: null,
        views: null,
        reactions: null,
        comments: null,
        shares: null,
        clicks: null,
        results_at: null,
        results_error: null,
      })),
      ad_variants: { label: 'A', angle: 'One', ad_set_id: 's-1', ad_sets: { title: 'Q4' } },
      brand_examples: [
        { place: 'linkedin', removed_at: null },
        { place: 'facebook', removed_at: '2026-10-13T11:00:00Z' },
      ],
    };
    expect(toPost(post)?.targets.map((t) => [t.place, t.remembered ?? false])).toEqual([
      ['facebook', false],
      ['linkedin', true],
    ]);
  });
});

describe('leads', () => {
  const row = (extra: Partial<LeadRow> = {}): LeadRow => ({
    id: 'lead-1',
    zoho_id: '5725767000000412001',
    name: 'Asha Rao',
    zoho_status: 'Not Contacted',
    zoho_source: 'Facebook',
    platform: 'instagram',
    campaign: { utm: { source: 'instagram', campaign: 'qgr-1a2b3c4d', content: 'b-instagram', nonsense: 3 }, name: 'EB-5 webinar', ad_name: 'Family' },
    answers: [{ field: 'Investment budget', value: '$800,000 to $1M' }, { field: '', value: 'dropped' }, 'not an answer'],
    place: 'instagram',
    created_in_zoho: '2026-10-19T09:30:00+00:00',
    verdict: 'qualified',
    reasons: [{ text: 'Can invest the minimum.', field: 'Investment budget', quote: '$800,000 to $1M' }, { text: '' }],
    judged_at: '2026-10-19T09:35:00+00:00',
    judged_criteria_at: '2026-09-20T08:00:00.123456+00:00',
    judge_status: 'done',
    judge_error: null,
    person_verdict: null,
    person_note: null,
    person_at: null,
    runs: { id: 'run-1', title: 'From H-1B to EB-5' },
    ad_variants: { id: 'v-1', label: 'B', angle: 'The 60-day question', ad_set_id: 'set-1' },
    ...extra,
  });
  const settings = { zoho: { region: 'eu' as const, org: 'org20123456' }, criteriaAt: '2026-09-20T08:00:00.123456+00:00' };

  it('reads a lead as the page shows it, with where it came from and Claude’s quoted reasons', () => {
    expect(toLead(row(), settings)).toEqual({
      id: 'lead-1',
      name: 'Asha Rao',
      createdAt: '2026-10-19T09:30:00+00:00',
      platform: 'instagram',
      zohoStatus: 'Not Contacted',
      zohoSource: 'Facebook',
      zohoUrl: 'https://crm.zoho.eu/crm/org20123456/tab/Leads/5725767000000412001',
      campaign: { name: 'EB-5 webinar', adName: 'Family', utm: { source: 'instagram', campaign: 'qgr-1a2b3c4d', content: 'b-instagram' } },
      from: { runId: 'run-1', runTitle: 'From H-1B to EB-5', adSetId: 'set-1', variantId: 'v-1', angle: 'The 60-day question', label: 'B', place: 'instagram' },
      answers: [{ field: 'Investment budget', value: '$800,000 to $1M' }],
      ai: { verdict: 'qualified', reasons: [{ text: 'Can invest the minimum.', field: 'Investment budget', quote: '$800,000 to $1M' }], at: '2026-10-19T09:35:00+00:00', olderCriteria: false },
      judging: 'done',
    });
  });

  it('marks a verdict on older criteria, keeps a person’s, and says why judging failed', () => {
    expect(toLead(row({ judged_criteria_at: '2026-09-01T00:00:00+00:00' }), settings).ai?.olderCriteria).toBe(true);
    const set = toLead(row({ person_verdict: 'not_qualified', person_note: 'A loan.', person_at: '2026-10-20T00:00:00+00:00' }), settings);
    expect(set.person).toEqual({ verdict: 'not_qualified', note: 'A loan.', at: '2026-10-20T00:00:00+00:00' });
    const failed = toLead(row({ verdict: null, judged_at: null, judge_status: 'failed', judge_error: 'Claude declined.', runs: null, ad_variants: null }), { zoho: null, criteriaAt: settings.criteriaAt });
    expect(failed).toMatchObject({ judging: 'failed', judgeError: 'Claude declined.' });
    expect(failed).not.toHaveProperty('ai');
    expect(failed).not.toHaveProperty('from');
    expect(failed).not.toHaveProperty('zohoUrl');
    expect(toLead(row({ judge_status: 'queued', verdict: null, judged_at: null }), settings).judging).toBe('waiting');
  });

  it('reads how leads come in and are judged', () => {
    const settingsRow = {
      lead_criteria: 'A qualified lead can invest.',
      lead_criteria_at: '2026-09-20T08:00:00+00:00',
      leads_source: 'zoho',
      zoho_region: 'com.au',
      zoho_org: null,
      leads_synced_at: '2026-10-19T08:30:00+00:00',
      leads_checked_at: '2026-10-19T08:45:00+00:00',
      leads_sync_error: null,
      post_link: 'https://qgr.example/call',
    } as unknown as SettingsRow;
    expect(toLeadSettings(settingsRow)).toEqual({
      criteria: 'A qualified lead can invest.',
      criteriaAt: '2026-09-20T08:00:00+00:00',
      source: 'zoho',
      zoho: { region: 'com.au', org: null },
      syncedAt: '2026-10-19T08:30:00+00:00',
      checkedAt: '2026-10-19T08:45:00+00:00',
      syncError: null,
      postLink: 'https://qgr.example/call',
    });
  });
});

describe('AI video', () => {
  const row = (extra: Partial<AiVideoRow> = {}): AiVideoRow => ({
    id: 'a1',
    prompt: 'A slow aerial over a sunlit American suburb at golden hour, calm and warm',
    model: 'seedance_2_0_mini',
    seconds: 4,
    aspect: '9:16',
    quality: '480p',
    sound: false,
    picture_path: null,
    credits: '2.00',
    status: 'ready',
    error: null,
    asked_at: '2026-10-20T15:00:00Z',
    ...extra,
  });

  it('reads credits sent as text and shows the file only once it is ready', () => {
    expect(toAiVideo(row(), { video: 'https://signed.example/v.mp4' })).toMatchObject({ credits: 2, status: 'ready', url: 'https://signed.example/v.mp4', picture: null });
    expect(toAiVideo(row({ status: 'making' }), { video: 'https://signed.example/v.mp4' })).not.toHaveProperty('url');
  });

  it('keeps the first picture, its link when signed, and why a video failed', () => {
    const picture = 'refs/b263a35f-fb56-49bf-a032-59be7540d321/0d3b9e6a-1c2f-4b8e-9a7d-5e4f3c2b1a09.png';
    expect(toAiVideo(row({ status: 'failed', picture_path: picture, error: 'Higgsfield refused the prompt.' }), { picture: 'https://signed.example/p.png' })).toMatchObject({
      status: 'failed',
      picture: { path: picture, url: 'https://signed.example/p.png' },
      error: 'Higgsfield refused the prompt.',
    });
  });

  it('drops a row it has no shape for', () => {
    expect(toAiVideo(row({ model: 'veo_9' }))).toBeNull();
    expect(toAiVideo(row({ status: 'lost' }))).toBeNull();
  });

  it('reads the budget, with nothing spent and off when the answer is odd', () => {
    expect(toVideoBudget({ live: true, cap: 100, spent: '7.50' })).toEqual({ live: true, cap: 100, spent: 7.5 });
    expect(toVideoBudget(null)).toEqual({ live: false, cap: 0, spent: 0 });
  });
});
