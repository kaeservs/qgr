import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// A competitor from screenshots of their ads, and a run built on a few of a
// report's ads chosen by a person.

let t: TestDatabase;
let member = '';
let outsider = '';

const service = <T>(sql: string, params: unknown[] = []) => t.asService(() => t.value<T>(sql, params));
const stage = (runId: string, name: string) => t.value<string>(`select status from public.run_stages where run_id = $1 and stage = $2`, [runId, name]);
const events = (runId: string) => t.db.query<{ text: string }>(`select text from public.run_events where run_id = $1 order by id`, [runId]).then((r) => r.rows.map((e) => e.text));
const shot = (who: string, n: number) => `shots/${who}/0b6f7a4e-1f2a-4c3b-9d8e-7f6a5b4c3d${String(n).padStart(2, '0')}.png`;
const upload = (who: string, path: string) => t.asUser(who, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('competitor-shots', $1)`, [path]));
const fromShots = (who: string, files: string[]) =>
  t.asUser(who, () => t.value<string>(`select public.create_run('competitor', 'upload', 'Horizon · 2 screenshots', array['meta'], 'consultations', p_competitor_name => 'Horizon Visa', p_files => $1)`, [files]));

const ad = (n: number, extra: Record<string, unknown> = {}) => ({
  platform: 'meta', format: 'image', text: `Ad ${n} says something.`, days_running: 0, days_known: false,
  headline: `Headline ${n}`, cta: 'Learn more', page_name: 'Horizon Visa', angle: 'Family & education', ...extra,
});
const report = (ads: unknown[], source = 'upload') => ({
  competitor: { name: 'Horizon Visa', domain: null },
  data_source: source,
  active_ads: ads.length,
  platforms: ['meta'],
  summary: 'They lead with families.',
  insights: ['Three of four ads lead with children.'],
  angles: [{ label: 'Family & education', ads: ads.length }],
  hooks: [{ text: 'Ad 1 says something.', platform: 'meta', format: 'image', days_running: 0, days_known: false, variations: 2 }],
  ads,
});

async function tracked(files: string[], ads: unknown[]) {
  const runId = await fromShots(member, files);
  await service(`select public.agent_begin($1, 'tracker')`, [runId]);
  const reportId = await service<string>(`select public.agent_finish_tracker($1, $2::jsonb)`, [runId, JSON.stringify(report(ads))]);
  return { runId, reportId };
}

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('screenshots of their ads', () => {
  it('lets a member upload only into their own folder, and a stranger not at all', async () => {
    await upload(member, shot(member, 1));
    await expect(upload(member, shot(outsider, 1))).rejects.toThrow(/row-level security/);
    await expect(upload(member, `elsewhere/${member}/x.png`)).rejects.toThrow(/row-level security/);
    await expect(upload(outsider, shot(outsider, 2))).rejects.toThrow(/row-level security/);
    await t.asUser(outsider, async () => {
      expect(await t.value<number>(`select count(*)::int from storage.objects where bucket_id = 'competitor-shots'`)).toBe(0);
    });
  });

  it('starts a run only from screenshots that finished uploading here', async () => {
    await upload(member, shot(member, 2));
    await expect(fromShots(member, [shot(member, 2), shot(member, 3)])).rejects.toThrow(/not finished uploading/);
    await expect(fromShots(member, ['https://example.com/x.png'])).rejects.toThrow(/not one uploaded here/);
    await expect(fromShots(member, [shot(member, 2), shot(member, 2)])).rejects.toThrow(/listed twice/);
    await expect(fromShots(outsider, [shot(member, 2)])).rejects.toThrow(/Only the QGR team/);

    const runId = await fromShots(member, [shot(member, 1), shot(member, 2)]);
    expect(await events(runId)).toContain('2 screenshots of their ads');
    expect(await stage(runId, 'tracker')).toBe('queued');
  });

  it('keeps every ad read from them, with its screenshot, and days running only where shown', async () => {
    const files = [shot(member, 4), shot(member, 5)];
    for (const f of files) await upload(member, f);
    const { runId, reportId } = await tracked(files, [
      ad(1, { screenshot_path: files[0] }),
      ad(2, { screenshot_path: files[1], days_running: 40, days_known: true }),
    ]);
    const ads = await t.db.query<{ text: string; position: number; screenshot_path: string; days_known: boolean; headline: string }>(
      `select text, position, screenshot_path, days_known, headline from public.competitor_ads where report_id = $1 order by position`, [reportId]);
    expect(ads.rows).toEqual([
      { text: 'Ad 1 says something.', position: 0, screenshot_path: files[0], days_known: false, headline: 'Headline 1' },
      { text: 'Ad 2 says something.', position: 1, screenshot_path: files[1], days_known: true, headline: 'Headline 2' },
    ]);
    expect(await t.value<string>(`select summary from public.run_stages where run_id = $1 and stage = 'tracker'`, [runId]))
      .toBe('Read 2 items from 2 screenshots and found 1 hook.');

    // The strategist reads an unknown days running as nothing, not as zero.
    const begun = await service<{ report: { data_source: string; hooks: { days_running: number | null }[] }; chosen_ads: unknown }>(
      `select public.agent_begin($1, 'strategist')`, [runId]);
    expect(begun.report.data_source).toBe('upload');
    expect(begun.report.hooks[0]?.days_running).toBeNull();
    expect(begun.chosen_ads).toBeNull();
  });

  it('refuses an ad that names a screenshot from another run', async () => {
    const files = [shot(member, 6)];
    await upload(member, files[0]!);
    await expect(tracked(files, [ad(1, { screenshot_path: shot(member, 1) })])).rejects.toThrow(/not this run's/);
  });

  it('lets the uploader take back a screenshot no run uses, and keeps the ones runs use', async () => {
    const unused = shot(member, 9);
    await upload(member, unused);
    const remove = (who: string, path: string) =>
      t.asUser(who, () => t.value<number>(`with gone as (delete from storage.objects where bucket_id = 'competitor-shots' and name = $1 returning 1) select count(*)::int from gone`, [path]));
    expect(await remove(outsider, unused)).toBe(0);
    expect(await remove(member, shot(member, 1))).toBe(0);
    expect(await remove(member, unused)).toBe(1);
  });
});

describe('a run from chosen ads', () => {
  it('starts at the strategist with the report it came from and the ads in the order chosen', async () => {
    const files = [shot(member, 10)];
    await upload(member, files[0]!);
    const { reportId } = await tracked(files, [ad(1), ad(2, { days_running: 12, days_known: true }), ad(3)]);
    const ids = await t.db.query<{ id: string }>(`select id from public.competitor_ads where report_id = $1 order by position`, [reportId]).then((r) => r.rows.map((x) => x.id));

    const runId = await t.asUser(member, () =>
      t.value<string>(`select public.start_run_from_ads($1, $2, array['meta', 'linkedin'], 'webinar')`, [reportId, [ids[2], ids[1]]]));
    const run = await t.db.query<{ title: string; kind: string; input: string; source_report_id: string; files: string[]; created_by: string }>(
      `select title, kind, input, source_report_id, files, created_by from public.runs where id = $1`, [runId]);
    expect(run.rows[0]).toEqual({ title: 'Horizon Visa · 2 chosen ads', kind: 'competitor', input: 'upload', source_report_id: reportId, files, created_by: member });
    expect(await stage(runId, 'tracker')).toBe('skipped');
    expect(await events(runId)).toContain('Competitor Tracker skipped: built on 2 ads chosen from the report on Horizon Visa');

    const begun = await service<{ report: { summary: string }; chosen_ads: { text: string; days_running: number | null; angle: string }[] }>(
      `select public.agent_begin($1, 'strategist')`, [runId]);
    expect(begun.report.summary).toBe('They lead with families.');
    expect(begun.chosen_ads.map((a) => [a.text, a.days_running, a.angle])).toEqual([
      ['Ad 3 says something.', null, 'Family & education'],
      ['Ad 2 says something.', 12, 'Family & education'],
    ]);
    await service(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify({
      title: 'Chosen', positioning: 'p', audiences: ['a'],
      angles: ['One', 'Two', 'Three'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })),
      channels: [{ platform: 'meta', share: 100, role: 'r', format: 'f' }], guardrails: [],
    })]);
    const content = await service<{ chosen_ads: unknown[]; report: unknown }>(`select public.agent_begin($1, 'content')`, [runId]);
    expect(content.chosen_ads).toHaveLength(2);
    expect(content.report).not.toBeNull();
  });

  it('takes only between 1 and 20 of that report’s own ads, and only from the team', async () => {
    const files = [shot(member, 11)];
    await upload(member, files[0]!);
    const { reportId } = await tracked(files, [ad(1)]);
    const other = await tracked([shot(member, 11)], [ad(1)]);
    const id = await t.value<string>(`select id from public.competitor_ads where report_id = $1`, [reportId]);
    const otherId = await t.value<string>(`select id from public.competitor_ads where report_id = $1`, [other.reportId]);
    const start = (who: string, ids: string[]) =>
      t.asUser(who, () => t.value<string>(`select public.start_run_from_ads($1, $2, array['meta'], 'consultations')`, [reportId, ids]));

    await expect(start(member, [])).rejects.toThrow(/between 1 and 20/);
    await expect(start(member, [otherId])).rejects.toThrow(/from this report/);
    await expect(start(member, [id, id])).rejects.toThrow(/from this report/);
    await expect(start(outsider, [id])).rejects.toThrow(/Only the QGR team/);
    expect(await start(member, [id])).toMatch(/^[0-9a-f-]{36}$/);
  });
});
