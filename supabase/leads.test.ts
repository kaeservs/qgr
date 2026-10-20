import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// Leads: read from Zoho by n8n, tied to the QGR post they came from by its
// tagged link, judged by Claude on quotes from what the lead said, and set by
// a person where Claude got it wrong. Who may do which, and what each keeps.

let t: TestDatabase;
let member = '';
let outsider = '';

const STRATEGY = {
  title: 'Leads check',
  positioning: 'Plain advice',
  audiences: ['Families'],
  angles: ['One', 'Two', 'Three'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })),
  channels: [{ platform: 'meta', share: 100, role: 'r', format: 'f' }],
  guardrails: ['g'],
};
const copy = { meta: { text: 'Plan your EB-5 path with people who show their working.', headline: 'EB-5, mapped out' } };

async function finishedRun(): Promise<string> {
  const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'Leads check', array['meta'], 'consultations', p_excerpt => $1)`, ['Plain words about EB-5 for families planning a move to the United States.']));
  const variants = ['A', 'B', 'C'].map((label, i) => ({ label, angle: STRATEGY.angles[i]!.name, creative_text: 'Plan with care', creative_style: 'arcs', image_prompt: 'A calm skyline', copy, warnings: [] }));
  await t.asService(async () => {
    await t.db.query(`select public.agent_begin($1, 'strategist')`, [runId]);
    await t.db.query(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify(STRATEGY)]);
    await t.db.query(`select public.agent_begin($1, 'content')`, [runId]);
    await t.db.query(`select public.agent_finish_content($1, $2::jsonb)`, [runId, JSON.stringify({ title: 'Leads check', variants })]);
  });
  return runId;
}

let seq = 1000;
const lead = (extra: Record<string, unknown> = {}) => ({
  zoho_id: String(++seq),
  name: 'Asha Rao',
  status: 'Not Contacted',
  source: 'Facebook',
  platform: 'facebook',
  campaign: { utm: { source: 'facebook', campaign: 'qgr-x' } },
  answers: [
    { field: 'Investment budget', value: 'About $900,000 from the sale of our business' },
    { field: 'When', value: 'Within six months' },
  ],
  created: '2026-10-18T09:00:00+00:00',
  modified: '2026-10-18T09:00:00+00:00',
  ...extra,
});

const record = (leads: unknown[], newest: string | null = null) =>
  t.asService(() => t.value<number>(`select public.leads_record($1::jsonb, $2::timestamptz)`, [JSON.stringify(leads), newest]));
const row = (zohoId: string) =>
  t.value<Record<string, unknown>>(`select to_jsonb(l) from public.leads l where zoho_id = $1`, [zohoId]);
const takeDue = (limit = 10) => t.asService(() => t.value<Record<string, unknown>[]>(`select public.leads_take_due($1)`, [limit]));
const judged = (id: string, verdict: string, reasons: unknown) =>
  t.asService(() => t.db.query(`select public.lead_judged($1, $2, $3::jsonb, $4::jsonb)`, [id, verdict, JSON.stringify(reasons), JSON.stringify({ model: 'claude-haiku-5-5', input_tokens: 900, output_tokens: 120 })]));

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('who reads and changes leads', () => {
  it('shows a stranger no lead, and keeps the n8n functions for n8n', async () => {
    await record([lead()]);
    await t.asUser(outsider, async () => {
      expect(await t.value<number>('select count(*)::int from public.leads')).toBe(0);
      await expect(t.db.query(`select public.update_lead_criteria('A qualified lead can invest.')`)).rejects.toThrow(/Only the QGR team/);
      await expect(t.db.query(`select public.set_lead_verdict(gen_random_uuid(), 'qualified')`)).rejects.toThrow(/Only the QGR team/);
    });
    await t.asUser(member, async () => {
      expect(await t.value<number>('select count(*)::int from public.leads')).toBeGreaterThan(0);
      await expect(t.db.query(`select public.leads_record('[]'::jsonb, null)`)).rejects.toThrow(/permission denied/);
      await expect(t.db.query('select public.leads_take_due(1)')).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`update public.leads set verdict = 'qualified'`)).rejects.toThrow(/permission denied/);
    });
  });
});

describe('reading Zoho', () => {
  it('is off until the team names its Zoho, then reads from the last 90 days, then from the newest change', async () => {
    const plan = () => t.asService(() => t.value<{ on: boolean; api: string | null; since: string }>('select public.leads_sync_plan()'));
    expect(await plan()).toMatchObject({ on: false, api: null });
    await t.asUser(member, async () => {
      await expect(t.db.query(`select public.set_leads_source('zoho')`)).rejects.toThrow(/address of your Zoho CRM/);
      await expect(t.db.query(`select public.set_leads_source('zoho', 'eu', 'workspace')`)).rejects.toThrow(/organisation/);
      await t.db.query(`select public.set_leads_source('zoho', 'eu', 'org20123456')`);
    });
    const first = await plan();
    expect(first).toMatchObject({ on: true, api: 'https://www.zohoapis.eu' });
    expect(Date.now() - Date.parse(first.since)).toBeGreaterThan(89 * 86_400_000);

    await t.asService(() => t.db.query(`select public.leads_sync_fail('Zoho answered 401: the login has expired.')`));
    expect(await t.value<string>('select leads_sync_error from public.team_settings')).toMatch(/401/);
    await record([], '2026-10-19T08:30:00+00:00');
    expect(await plan()).toMatchObject({ since: '2026-10-19T08:30:00+00:00' });
    expect(await t.value<string | null>('select leads_sync_error from public.team_settings')).toBeNull();
    // An older read never moves the cursor back.
    await record([], '2026-10-01T00:00:00+00:00');
    expect(await plan()).toMatchObject({ since: '2026-10-19T08:30:00+00:00' });

    await t.asUser(member, () => t.db.query(`select public.set_leads_source('off')`));
    expect(await plan()).toMatchObject({ on: false });
    expect(await t.value<string>('select zoho_org from public.team_settings')).toBe('org20123456');
  });

  it('ties a lead to the QGR run and variant its link names, and to nothing it does not', async () => {
    const runId = await finishedRun();
    const code = runId.slice(0, 8);
    const tied = lead({ run_code: code, label: 'B', place: 'instagram', platform: 'instagram' });
    const loose = lead({ run_code: 'ffffffff', label: 'B', place: 'instagram' });
    await record([tied, loose]);
    const variantB = await t.value<string>(`select v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 and v.label = 'B'`, [runId]);
    expect(await row(tied.zoho_id)).toMatchObject({ run_id: runId, variant_id: variantB, place: 'instagram', platform: 'instagram', judge_status: 'queued' });
    expect(await row(loose.zoho_id)).toMatchObject({ run_id: null, variant_id: null, place: null });
  });

  it('judges a lead again only when what it said changed, and keeps a person’s verdict', async () => {
    const l = lead();
    await record([l]);
    const id = (await row(l.zoho_id)).id as string;
    await t.db.query(`update public.leads set judge_status = 'done', verdict = 'qualified', person_verdict = 'not_qualified' where id = $1`, [id]);
    await record([{ ...l, status: 'Contacted' }]);
    expect(await row(l.zoho_id)).toMatchObject({ judge_status: 'done', zoho_status: 'Contacted' });
    await record([{ ...l, answers: [...l.answers, { field: 'Country', value: 'India' }] }]);
    expect(await row(l.zoho_id)).toMatchObject({ judge_status: 'queued', person_verdict: 'not_qualified' });
  });

  it('refuses a lead without a Zoho id, and names one that has no name', async () => {
    await expect(record([{ ...lead(), zoho_id: 'abc' }])).rejects.toThrow(/no Zoho id/);
    const nameless = lead({ name: ' ' });
    await record([nameless]);
    expect((await row(nameless.zoho_id)).name).toBe(`Lead ${nameless.zoho_id.slice(-4)}`);
  });
});

describe('judging a lead', () => {
  it('hands over what the lead said, never its name, with the team’s criteria and examples', async () => {
    await t.db.query(`update public.leads set judge_status = 'done'`);
    const l = lead();
    await record([l]);
    const due = await takeDue();
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ answers: l.answers, platform: 'facebook', source: 'Facebook', examples: [] });
    expect(String(due[0]!.criteria)).toMatch(/US\$800,000/);
    expect(JSON.stringify(due[0])).not.toContain('Asha');
    // Claimed: a second look takes nothing.
    expect(await takeDue()).toEqual([]);
  });

  it('keeps a verdict only on quotes from the lead, and a can’t-tell may say what is missing', async () => {
    await t.db.query(`update public.leads set judge_status = 'done'`);
    const l = lead();
    await record([l]);
    const [due] = await takeDue();
    const id = due!.lead_id as string;
    await expect(judged(id, 'qualified', [{ text: 'Can invest.', field: 'Investment budget', quote: 'two million dollars' }])).rejects.toThrow(/did not say/);
    await expect(judged(id, 'qualified', [{ text: 'Can invest.', field: null, quote: null }])).rejects.toThrow(/must quote/);
    await expect(judged(id, 'maybe', [{ text: 'Hm.', field: null, quote: null }])).rejects.toThrow(/verdict is/);
    await judged(id, 'qualified', [{ text: 'Can invest enough.', field: 'Investment budget', quote: 'about $900,000' }, { text: 'Soon.', field: 'When', quote: 'Within six months' }]);
    expect(await row(l.zoho_id)).toMatchObject({ verdict: 'qualified', judge_status: 'done' });
    // A refused verdict is undone whole; the one kept records what it cost.
    expect(await t.value<number>('select count(*)::int from public.lead_usage where lead_id = $1', [id])).toBe(1);

    const unclear = lead();
    await record([unclear]);
    const [next] = await takeDue();
    await judged(next!.lead_id as string, 'unclear', [{ text: 'Says nothing of a budget.', field: null, quote: null }]);
    expect(await row(unclear.zoho_id)).toMatchObject({ verdict: 'unclear' });
  });

  it('records why a lead could not be judged, and gives up after three lost claims', async () => {
    await t.db.query(`update public.leads set judge_status = 'done'`);
    const l = lead();
    await record([l]);
    const [due] = await takeDue();
    await t.asService(() => t.db.query(`select public.lead_judge_fail($1, 'Claude declined.', null)`, [due!.lead_id]));
    expect(await row(l.zoho_id)).toMatchObject({ judge_status: 'failed', judge_error: 'Claude declined.' });

    const lost = lead();
    await record([lost]);
    await t.db.query(`update public.leads set judge_status = 'working', judge_attempts = 3, judge_claimed_at = now() - interval '11 minutes' where zoho_id = $1`, [lost.zoho_id]);
    expect(await takeDue()).toEqual([]);
    expect(await row(lost.zoho_id)).toMatchObject({ judge_status: 'failed', judge_error: 'The lead could not be judged after three tries.' });
  });
});

describe('the link a post sends people to', () => {
  it('is tagged with the run, the variant and the place, by the database, where the post asks for it', async () => {
    const runId = await finishedRun();
    const variantA = await t.value<string>(`select v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 and v.label = 'A'`, [runId]);
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [variantA]));
    const schedule = (targets: unknown) => t.asUser(member, () => t.value<string>(`select public.schedule_post($1, $2::jsonb)`, [variantA, JSON.stringify(targets)]));
    await expect(schedule([{ place: 'facebook', media_path: null, media_kind: null, link: true }])).rejects.toThrow(/Say where posts send people first/);

    await t.asUser(member, async () => {
      await expect(t.db.query(`select public.set_post_link('http://qgr.example/call')`)).rejects.toThrow(/https:\/\//);
      await expect(t.db.query(`select public.set_post_link('https://qgr.example/call#book')`)).rejects.toThrow(/no # part/);
      await t.db.query(`select public.set_post_link('https://qgr.example/call?from=social')`);
    });
    const post = await schedule([{ place: 'facebook', media_path: null, media_kind: null, link: true }]);
    const text = (id: string) => t.value<string>(`select text from public.post_targets where post_id = $1`, [id]);
    expect(await text(post)).toBe(`${copy.meta.text}\n\nhttps://qgr.example/call?from=social&utm_source=facebook&utm_medium=social&utm_campaign=qgr-${runId.slice(0, 8)}&utm_content=a-facebook`);
    // A post that did not ask carries the words alone.
    const variantB = await t.value<string>(`select v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 and v.label = 'B'`, [runId]);
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [variantB]));
    const plain = await t.asUser(member, () => t.value<string>(`select public.schedule_post($1, $2::jsonb)`, [variantB, JSON.stringify([{ place: 'facebook', media_path: null, media_kind: null }])]));
    expect(await text(plain)).toBe(copy.meta.text);
    await t.asUser(member, () => t.db.query(`select public.set_post_link(null)`));
    expect(await t.value<string | null>('select post_link from public.team_settings')).toBeNull();
  });
});

describe('the team’s verdicts and criteria', () => {
  it('sets a verdict with its reason, which later judgements read as an example', async () => {
    await t.db.query(`update public.leads set judge_status = 'done', person_verdict = null, person_note = null`);
    const l = lead();
    await record([l]);
    const id = (await row(l.zoho_id)).id as string;
    await t.asUser(member, async () => {
      await expect(t.db.query(`select public.set_lead_verdict($1, 'unclear')`, [id])).rejects.toThrow(/qualified or not qualified/);
      await t.db.query(`select public.set_lead_verdict($1, 'not_qualified', 'Funds are a loan, which EB-5 does not take as is.')`, [id]);
    });
    expect(await row(l.zoho_id)).toMatchObject({ person_verdict: 'not_qualified', person_by: member });
    const another = lead();
    await record([another]);
    await t.db.query(`update public.leads set judge_status = 'done' where id = $1`, [id]);
    const [due] = await takeDue();
    expect(due!.examples).toEqual([{ answers: l.answers, verdict: 'not_qualified', why: 'Funds are a loan, which EB-5 does not take as is.' }]);
    // Taken back: Claude's counts again, and the example goes.
    await t.asUser(member, () => t.db.query(`select public.set_lead_verdict($1, null)`, [id]));
    expect(await row(l.zoho_id)).toMatchObject({ person_verdict: null, person_note: null, person_by: null });
  });

  it('marks verdicts judged on older criteria, and judges them again when asked', async () => {
    await t.db.query(`update public.leads set judge_status = 'done', judged_criteria_at = (select lead_criteria_at from public.team_settings)`);
    await t.asUser(member, async () => {
      await expect(t.db.query(`select public.update_lead_criteria('Too short')`)).rejects.toThrow(/20 to 4,000/);
      await t.db.query(`select public.update_lead_criteria('A qualified lead says they can invest US$800,000 within a year.')`);
    });
    const count = await t.asUser(member, () => t.value<number>('select public.judge_leads_again()'));
    expect(count).toBe(await t.value<number>(`select count(*)::int from public.leads where created_in_zoho > now() - interval '90 days'`));
    expect(await t.value<number>(`select count(*)::int from public.leads where judge_status <> 'queued'`)).toBe(0);
    // Saving the same words again is not a change.
    const at = await t.value<string>('select lead_criteria_at::text from public.team_settings');
    await t.asUser(member, () => t.db.query(`select public.update_lead_criteria('A qualified lead says they can invest US$800,000 within a year.')`));
    expect(await t.value<string>('select lead_criteria_at::text from public.team_settings')).toBe(at);
  });
});
