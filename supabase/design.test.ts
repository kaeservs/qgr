import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// A picture ad's own layout: saved by the team as they move things, held to
// the words' rules (a change takes the approval back; nothing changes while a
// post waits), and checked for its shape again here.

let t: TestDatabase;
let member = '';
let outsider = '';

const STRATEGY = {
  title: 'Design check',
  positioning: 'Plain advice',
  audiences: ['Families'],
  angles: ['One', 'Two', 'Three'].map((name) => ({ name, why: 'w', hook: 'h', based_on_hook: null })),
  channels: [{ platform: 'meta', share: 100, role: 'r', format: 'f' }],
  guardrails: ['g'],
};
const copy = { meta: { text: 'Plan your EB-5 path with people who show their working.', headline: 'EB-5, mapped out' } };
const DESIGN = { logo: true, texts: [{ id: 't1', text: 'Free consultation', look: 'banner' }], spots: { square: { words: { x: 0.5, y: 0.3, scale: 1.2 }, t1: { x: 0.5, y: 0.85, scale: 1 } } } };

async function variant(): Promise<{ runId: string; id: string }> {
  const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom', 'text', 'Design check', array['meta'], 'consultations', p_excerpt => $1)`, ['Plain words about EB-5 for families planning a move to the United States.']));
  const variants = ['A', 'B', 'C'].map((label, i) => ({ label, angle: STRATEGY.angles[i]!.name, creative_text: 'Plan with care', creative_style: 'arcs', image_prompt: 'A calm skyline', copy, warnings: [] }));
  await t.asService(async () => {
    await t.db.query(`select public.agent_begin($1, 'strategist')`, [runId]);
    await t.db.query(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify(STRATEGY)]);
    await t.db.query(`select public.agent_begin($1, 'content')`, [runId]);
    await t.db.query(`select public.agent_finish_content($1, $2::jsonb)`, [runId, JSON.stringify({ title: 'Design check', variants })]);
  });
  const id = await t.value<string>(`select v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 and v.label = 'A'`, [runId]);
  return { runId, id };
}

const save = (id: string, design: unknown, user = member) => t.asUser(user, () => t.db.query(`select public.save_variant_design($1, $2::jsonb)`, [id, design === null ? null : JSON.stringify(design)]));
const state = (id: string) => t.value<{ design: unknown; approved: boolean }>(`select to_jsonb(x) from (select design, approved_at is not null as approved from public.ad_variants where id = $1) x`, [id]);
const events = (runId: string) => t.db.query<{ text: string }>(`select text from public.run_events where run_id = $1 order by id`, [runId]).then((r) => r.rows.map((e) => e.text));

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('a picture’s own layout', () => {
  it('is saved by the team only, and takes an approval back', async () => {
    const { runId, id } = await variant();
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [id]));
    await expect(save(id, DESIGN, outsider)).rejects.toThrow(/Only the QGR team/);
    await save(id, DESIGN);
    expect(await state(id)).toEqual({ design: DESIGN, approved: false });
    expect(await events(runId)).toContain('Variant A design changed: it needs approving again');
    // The same layout again changes nothing; putting the style's back is a change.
    await save(id, DESIGN);
    expect((await events(runId)).filter((e) => e.startsWith('Variant A design'))).toHaveLength(1);
    await save(id, null);
    expect(await state(id)).toEqual({ design: null, approved: false });
    expect(await events(runId)).toContain('Variant A design put back');
  });

  it('refuses a layout that is not one', async () => {
    const { id } = await variant();
    await expect(save(id, [])).rejects.toThrow(/not readable/);
    await expect(save(id, { texts: [] })).rejects.toThrow(/whether the logo shows/);
    await expect(save(id, { logo: true, texts: Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, text: 'a' })) })).rejects.toThrow(/Up to 6 texts/);
    await expect(save(id, { logo: true, texts: [{ id: 't1', text: ' ' }] })).rejects.toThrow(/1 to 120 characters/);
    await expect(save(id, { logo: true, texts: [], spots: [] })).rejects.toThrow(/layout is not readable/);
    await expect(save(id, { logo: true, texts: [], font: 'comic' })).rejects.toThrow(/fonts offered/);
    await expect(save(id, { logo: true, texts: [], color: 'red' })).rejects.toThrow(/colour for the words/);
  });

  it('keeps the words’ font and colour', async () => {
    const { id } = await variant();
    const design = { logo: true, font: 'playfair', color: '#efb74a', texts: [], spots: {} };
    await save(id, design);
    expect(await state(id)).toEqual({ design, approved: false });
  });

  it('waits while a post of the ad waits to go out', async () => {
    const { id } = await variant();
    await t.asUser(member, () => t.db.query(`select public.approve_variant($1)`, [id]));
    await t.asUser(member, () => t.db.query(`select public.schedule_post($1, $2::jsonb)`, [id, JSON.stringify([{ place: 'facebook', media_path: null, media_kind: null }])]));
    await expect(save(id, DESIGN)).rejects.toThrow(/waiting to post/);
  });
});
