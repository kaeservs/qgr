import { describe, expect, it } from 'vitest';
import { copyOf, one, sourceOf, toAdSet, toAgents, toCompetitor, toCreateRunArgs, toNotices, toRun, toStrategy, toUser } from './map';
import type { AdSetRow, CompetitorRow, RunRow, StageRow, StrategyRow } from './map';

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
    image_url: null,
    copy: { meta: { text: 't', headline: 'h', description: 'd', cta: 'Book now' }, x: { text: 't', headline: 'h' } },
    warnings: [],
    approved_at: null,
    ...extra,
  });

  it('sorts the variants and reads approval from any of them', () => {
    const set = toAdSet({ id: 'set-1', run_id: 'run-1', strategy_id: 'strat-1', title: 'Q4', created_at: '2026-10-07T10:00:00Z', ad_variants: [variant('C'), variant('A', { warnings: ['meta text says "guarantee"'] }), variant('B')] });
    expect(set.variants.map((v) => v.label)).toEqual(['A', 'B', 'C']);
    expect(set.status).toBe('review');
    expect(set.variants[0]?.warnings).toEqual(['meta text says "guarantee"']);
    expect(set.variants[0]?.copy).toEqual({ meta: { text: 't', headline: 'h', description: 'd', cta: 'Book now' }, x: { text: 't', headline: 'h' } });

    const approved = toAdSet({ id: 'set-1', run_id: 'run-1', strategy_id: 'strat-1', title: 'Q4', created_at: '2026-10-07T10:00:00Z', ad_variants: [variant('A'), variant('B', { approved_at: '2026-10-07T11:00:00Z', image_url: 'https://cdn.example/b.png' })] });
    expect(approved.status).toBe('approved');
    expect(approved.variants[1]).toMatchObject({ approved: true, imageUrl: 'https://cdn.example/b.png' });
  });
});

describe('copyOf', () => {
  it('keeps text fields of known platforms only', () => {
    expect(copyOf({ meta: { text: 't', headline: 'h', cta: 3 }, linkedin: { text: 't' }, tiktok: { text: 't', headline: 'h' } })).toEqual({ meta: { text: 't', headline: 'h' } });
    expect(copyOf('nonsense')).toEqual({});
  });
});

describe('toAgents and toUser', () => {
  it('counts from the data, and offers no switch the pipeline cannot honour', () => {
    const agents = toAgents(1, 2, []);
    expect(agents.map((a) => a.stat)).toEqual(['1 competitor tracked', '2 strategies', '0 sets to review']);
    expect(agents.every((a) => !a.switchable)).toBe(true);
    expect(agents[2]?.action).toEqual({ label: 'View ads', href: '/content' });
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
});
