import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// The agents' switches and the scan schedule: which agent starts by itself,
// which waits for a person, and when tracked competitors are scanned.

let t: TestDatabase;
let member = '';
let outsider = '';

const EXCERPT = 'Plain words about EB-5 for families planning a move to the United States.';
const STRATEGY = {
  title: 'Switch check',
  positioning: 'Plain advice',
  audiences: ['Families'],
  angles: ['One', 'Two', 'Three'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })),
  channels: [{ platform: 'meta', share: 100, role: 'r', format: 'f' }],
  guardrails: ['g'],
};

const settings = (s: { strategist?: boolean; content?: boolean; every?: string; day?: number; hour?: number; zone?: string }) =>
  t.asUser(member, () =>
    t.db.query(`select public.update_agent_settings($1, $2, $3, $4, $5, $6)`, [s.strategist ?? true, s.content ?? true, s.every ?? 'off', s.day ?? 1, s.hour ?? 9, s.zone ?? 'America/New_York']),
  );
const service = <T>(sql: string, params: unknown[] = []) => t.asService(() => t.value<T>(sql, params));
const stage = (runId: string, name: string) => t.value<string>(`select status || case when waiting_since is null then '' else ' (waiting)' end from public.run_stages where run_id = $1 and stage = $2`, [runId, name]);
const events = (runId: string) => t.db.query<{ text: string }>(`select text from public.run_events where run_id = $1 order by id`, [runId]).then((r) => r.rows.map((e) => e.text));

async function customRun(): Promise<string> {
  return t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'Switch check', array['meta'], 'consultations', p_excerpt => $1)`, [EXCERPT]));
}

async function strategize(runId: string) {
  await service(`select public.agent_begin($1, 'strategist')`, [runId]);
  await service(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify(STRATEGY)]);
}

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

beforeEach(async () => {
  await settings({});
});

describe('the switches', () => {
  it('lets the next agent start by itself while its switch is on', async () => {
    const runId = await customRun();
    await strategize(runId);
    expect(await service<boolean>(`select public.pipeline_next($1, 'content')`, [runId])).toBe(true);
    expect(await stage(runId, 'content')).toBe('queued');
  });

  it('holds the next agent for a person while its switch is off, until they give the go-ahead', async () => {
    await settings({ content: false });
    const runId = await customRun();
    await strategize(runId);
    expect(await service<boolean>(`select public.pipeline_next($1, 'content')`, [runId])).toBe(false);
    expect(await stage(runId, 'content')).toBe('queued (waiting)');
    // Asked again (say n8n retried), it neither starts nor says so twice.
    expect(await service<boolean>(`select public.pipeline_next($1, 'content')`, [runId])).toBe(false);
    await expect(service(`select public.agent_begin($1, 'content')`, [runId])).rejects.toThrow(/Content Agent waits for a person/);

    expect(await t.asUser(member, () => t.value<string>(`select public.continue_run($1)`, [runId]))).toBe('content');
    expect(await stage(runId, 'content')).toBe('queued');
    await service(`select public.agent_begin($1, 'content')`, [runId]);
    expect((await events(runId)).filter((e) => /waits|Go-ahead/.test(e))).toEqual([
      'The Content Agent waits for your go-ahead: it does not write ads by itself',
      'Go-ahead given for the Content Agent',
    ]);
  });

  it('holds the strategist after a scan, but never the agent a person started', async () => {
    await settings({ strategist: false });
    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('competitor', 'website', 'horizon.example', array['meta'], 'consultations', p_url => 'https://horizon.example')`));
    // A person started this run: its first agent, the tracker, is not asked about.
    await service(`select public.agent_begin($1, 'tracker')`, [runId]);
    await service(
      `select public.agent_finish_tracker($1, $2::jsonb)`,
      [runId, JSON.stringify({ competitor: { name: 'Horizon', domain: 'horizon.example' }, data_source: 'placeholder', active_ads: 3, platforms: ['meta'], summary: 's', insights: ['i'], angles: [], hooks: [{ text: 'h', platform: 'meta', format: 'image', days_running: 3, variations: 1 }] })],
    );
    expect(await service<boolean>(`select public.pipeline_next($1, 'strategist')`, [runId])).toBe(false);
    expect(await events(runId)).toContain('The Ad Strategist waits for you: it does not start by itself after a scan');
  });

  it('runs a failed agent again where it stopped', async () => {
    const runId = await customRun();
    await service(`select public.agent_begin($1, 'strategist')`, [runId]);
    await expect(t.asUser(member, () => t.db.query(`select public.continue_run($1)`, [runId]))).rejects.toThrow(/already working/);
    await service(`select public.agent_fail($1, 'strategist', 'Claude ran out of room.')`, [runId]);
    expect(await t.asUser(member, () => t.value<string>(`select public.continue_run($1)`, [runId]))).toBe('strategist');
    expect(await events(runId)).toContain('Trying the Ad Strategist again');
    // Still failed until the agent picks it up; n8n could not be reached, so the run says so.
    await t.asUser(member, () => t.db.query(`select public.report_continue_failure($1, 'strategist', 'n8n did not answer.')`, [runId]));
    expect(await t.value<string>(`select error from public.run_stages where run_id = $1 and stage = 'strategist'`, [runId])).toBe('n8n did not answer.');
    await strategize(runId);
    expect(await stage(runId, 'strategist')).toBe('done');
  });

  it('puts a go-ahead that could not reach n8n back on hold', async () => {
    await settings({ content: false });
    const runId = await customRun();
    await strategize(runId);
    await service(`select public.pipeline_next($1, 'content')`, [runId]);
    await t.asUser(member, () => t.db.query(`select public.continue_run($1)`, [runId]));
    await t.asUser(member, () => t.db.query(`select public.report_continue_failure($1, 'content', 'n8n did not answer.')`, [runId]));
    expect(await stage(runId, 'content')).toBe('queued (waiting)');
    expect(await events(runId)).toContain('Could not start the Content Agent: n8n did not answer.');
  });

  it('tells a person when nothing waits, and keeps the switches for the team', async () => {
    const runId = await customRun();
    await expect(t.asUser(member, () => t.db.query(`select public.continue_run($1)`, [runId]))).rejects.toThrow(/Nothing on this run is waiting/);
    await t.asUser(outsider, async () => {
      await expect(t.db.query(`select public.continue_run($1)`, [runId])).rejects.toThrow(/Only the QGR team/);
      await expect(t.db.query(`select public.update_agent_settings(true, true, 'off', 1, 9, 'UTC')`)).rejects.toThrow(/Only the QGR team/);
      await expect(t.db.query(`select public.pipeline_next($1, 'content')`, [runId])).rejects.toThrow(/permission denied/);
    });
    await expect(settings({ zone: 'Mars/Olympus_Mons' })).rejects.toThrow(/Unknown time zone/);
    await expect(settings({ every: 'hour' })).rejects.toThrow(/every day, every week/);
  });
});

describe('where the tracker reads ads', () => {
  it('reads sample ads until the team switches to Apify, and tells the tracker alone', async () => {
    const competitorRun = () => t.asUser(member, () => t.value<string>(`select public.create_run('competitor', 'website', 'horizonvisa.example', array['meta'], 'consultations', p_url => 'https://horizonvisa.example/')`));
    const first = await competitorRun();
    expect(await service<{ ads_source: string }>(`select public.agent_begin($1, 'tracker')`, [first])).toMatchObject({ ads_source: 'sample' });

    await t.asUser(member, () => t.db.query(`select public.set_ads_source('apify')`));
    const second = await competitorRun();
    expect(await service<{ ads_source: string }>(`select public.agent_begin($1, 'tracker')`, [second])).toMatchObject({ ads_source: 'apify' });
    // Only the tracker reads ads: the other agents are not told.
    const custom = await customRun();
    expect(await service<Record<string, unknown>>(`select public.agent_begin($1, 'strategist')`, [custom])).toMatchObject({ ads_source: null });

    await expect(t.asUser(member, () => t.db.query(`select public.set_ads_source('scraped')`))).rejects.toThrow(/sample ads or Apify's/);
    await t.asUser(outsider, async () => {
      await expect(t.db.query(`select public.set_ads_source('sample')`)).rejects.toThrow(/Only the QGR team/);
    });
    await t.asUser(member, () => t.db.query(`select public.set_ads_source('sample')`));
    expect(await t.value<string>(`select ads_source from public.team_settings where id = 1`)).toBe('sample');
  });
});

describe('the scan schedule', () => {
  const slot = (every: string, at: string, day = 1, hour = 9, zone = 'America/New_York') =>
    t.value<string>(`select to_char(public.scan_slot($1, $2, $3, $4, $5::timestamptz) at time zone 'UTC', 'YYYY-MM-DD HH24:MI')`, [every, day, hour, zone, at]);

  it('falls due at the team’s wall time, across daylight saving', async () => {
    // Weekly on Monday at 9:00 in New York: 13:00 UTC in summer time, 14:00 in winter.
    expect(await slot('week', '2026-10-14T12:00:00Z')).toBe('2026-10-12 13:00');
    expect(await slot('week', '2026-10-12T12:59:00Z')).toBe('2026-10-05 13:00');
    expect(await slot('week', '2026-11-03T00:00:00Z')).toBe('2026-11-02 14:00');
    expect(await slot('week', '2026-10-17T00:00:00Z', 5, 18)).toBe('2026-10-16 22:00');
    expect(await slot('day', '2026-10-14T12:00:00Z', 1, 9, 'Asia/Kolkata')).toBe('2026-10-14 03:30');
    expect(await slot('day', '2026-10-14T03:00:00Z', 1, 9, 'Asia/Kolkata')).toBe('2026-10-13 03:30');
    expect(await t.value<string | null>(`select public.scan_slot('off', 1, 9, 'UTC', now())`)).toBeNull();
  });

  it('scans each tracked competitor with a website once a slot falls due, with the website as last read', async () => {
    const page = { ok: true, url: 'https://atlas.example/', title: 'Atlas Residency', siteName: 'Atlas', description: null, type: 'website', text: 'EB-5 for families', words: 3, readAt: '2026-10-07T09:00:00.000Z' };
    // Only the competitors made here count: earlier tests' are set aside.
    await t.db.query(`update public.competitors set tracked = false`);
    await t.db.query(`insert into public.competitors (id, name, domain) values ('00000000-0000-4000-8000-0000000000a1', 'Atlas Residency', 'atlas.example'), ('00000000-0000-4000-8000-0000000000a2', 'Dropped Co', 'dropped.example'), ('00000000-0000-4000-8000-0000000000a3', 'Uploads Only', null)`);
    await t.db.query(`update public.competitors set tracked = false where id = '00000000-0000-4000-8000-0000000000a2'`);
    const earlier = await service<string>(`select public.start_run('competitor', 'website', 'atlas.example', array['meta','linkedin'], 'webinar', p_url => 'https://atlas.example', p_page => $1::jsonb)`, [JSON.stringify(page)]);
    await t.db.query(`update public.runs set competitor_id = '00000000-0000-4000-8000-0000000000a1' where id = $1`, [earlier]);

    // Off: nothing, however long since.
    expect(await service<unknown[]>('select public.start_due_scans()')).toEqual([]);

    await settings({ every: 'day', hour: 0, zone: 'UTC' });
    // Just set: today's slot is before the schedule existed, so nothing is due yet.
    expect(await service<unknown[]>('select public.start_due_scans()')).toEqual([]);
    // As if it had been set two days ago.
    await t.db.query(`update public.team_settings set scan_changed_at = now() - interval '2 days'`);
    const started = await service<{ run_id: string; competitor: string }[]>('select public.start_due_scans()');
    expect(started.map((s) => s.competitor)).toEqual(['Atlas Residency']);

    const run = await t.value<{ title: string; url: string; platforms: string[]; goal: string; page_title: string; created_by: string | null }>(
      `select json_build_object('title', title, 'url', url, 'platforms', platforms, 'goal', goal, 'page_title', page ->> 'title', 'created_by', created_by) from public.runs where id = $1`,
      [started[0]!.run_id],
    );
    expect(run).toEqual({ title: 'Atlas Residency · scheduled scan', url: 'https://atlas.example', platforms: ['meta', 'linkedin'], goal: 'webinar', page_title: 'Atlas Residency', created_by: null });
    expect(await events(started[0]!.run_id)).toEqual(['Run started', 'Scheduled scan, with their website as the app last read it (7 Oct 2026)']);
    expect(await stage(started[0]!.run_id, 'tracker')).toBe('queued');

    // The same slot never scans twice.
    expect(await service<unknown[]>('select public.start_due_scans()')).toEqual([]);
  });

  it('says when the next scan is, to the team only', async () => {
    await settings({ every: 'week', day: 3, hour: 10 });
    const next = await t.asUser(member, () => t.value<string>(`select public.next_scan_at()::text`));
    expect(Date.parse(next)).toBeGreaterThan(Date.now());
    expect(await t.value<string>(`select to_char($1::timestamptz at time zone 'America/New_York', 'ID HH24:MI')`, [next])).toBe('3 10:00');
    expect(await t.asUser(outsider, () => t.value<string | null>(`select public.next_scan_at()`))).toBeNull();
    await settings({ every: 'off' });
    expect(await t.asUser(member, () => t.value<string | null>(`select public.next_scan_at()`))).toBeNull();
  });

  it('lets the team stop scanning one competitor', async () => {
    const id = await t.value<string>(`insert into public.competitors (name, domain) values ('Kept', 'kept.example') returning id`);
    await t.asUser(member, () => t.db.query(`select public.set_competitor_tracked($1, false)`, [id]));
    expect(await t.value<boolean>('select tracked from public.competitors where id = $1', [id])).toBe(false);
    await t.asUser(outsider, () => expect(t.db.query(`select public.set_competitor_tracked($1, true)`, [id])).rejects.toThrow(/Only the QGR team/));
  });
});
