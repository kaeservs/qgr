import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// Who can read and change what, run against every migration in a local
// Postgres. These are the checks that keep a stranger with an account out.

let t: TestDatabase;
let member = '';
let teammate = '';
let outsider = '';

const EXCERPT = 'Plain words about EB-5 for families planning a move to the United States.';
const STRATEGY = {
  title: 'Access check',
  summary: 'One line',
  positioning: 'Plain advice',
  audiences: ['Families'],
  angles: [
    { name: 'One', why: 'w', hook: 'h', based_on_hook: null },
    { name: 'Two', why: 'w', hook: 'h', based_on_hook: null },
    { name: 'Three', why: 'w', hook: 'h', based_on_hook: null },
  ],
  channels: [
    { platform: 'meta', share: 60, role: 'r', format: 'f' },
    { platform: 'x', share: 40, role: 'r', format: 'f' },
  ],
  guardrails: ['g'],
  source_label: 'Text · Access check',
};
const copy = { meta: { text: 't', headline: 'h', description: 'd', cta: 'Learn more' }, x: { text: 't', headline: 'h' } };
const variants = ['A', 'B', 'C'].map((label, i) => ({ label, angle: STRATEGY.angles[i]!.name, creative_text: 'Plan with care', creative_style: ['arcs', 'split', 'spotlight'][i], image_prompt: '', copy, warnings: [] }));

/** A custom run taken through both agents, as the service role, returning the run and its variant B. */
async function finishedRun(args: { mediaPath?: string } = {}): Promise<{ runId: string; variantId: string }> {
  const runId = await t.asUser(member, () =>
    args.mediaPath
      ? t.value<string>(`select public.create_run('custom', 'video', 'Clip run', array['meta','x'], 'consultations', p_excerpt => $1, p_media_path => $2, p_media => '{"duration": 42.5, "width": 1920, "height": 1080}'::jsonb)`, [EXCERPT, args.mediaPath])
      : t.value<string>(`select public.create_run('custom', 'text', 'Access check', array['meta','x'], 'consultations', p_excerpt => $1)`, [EXCERPT]),
  );
  await t.asService(async () => {
    await t.db.query(`select public.agent_begin($1, 'strategist')`, [runId]);
    await t.db.query(`select public.agent_finish_strategist($1, $2::jsonb)`, [runId, JSON.stringify(STRATEGY)]);
    await t.db.query(`select public.agent_begin($1, 'content')`, [runId]);
    await t.db.query(`select public.agent_finish_content($1, $2::jsonb)`, [runId, JSON.stringify({ title: 'Access check', variants })]);
  });
  const variantId = await t.value<string>(`select v.id from public.ad_variants v join public.ad_sets s on s.id = v.ad_set_id where s.run_id = $1 and v.label = 'B'`, [runId]);
  return { runId, variantId };
}

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  teammate = await t.addUser('teammate@qgr.example', 'member');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('reading', () => {
  it('lets nobody read anything without signing in', async () => {
    await t.db.exec('set role anon');
    try {
      await expect(t.db.query('select count(*) from public.runs')).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`select count(*) from storage.objects where bucket_id = 'run-media'`)).resolves.toMatchObject({ rows: [{ count: 0 }] });
    } finally {
      await t.db.exec('reset role');
    }
  });

  it('shows a signed-in stranger nothing at all', async () => {
    await finishedRun();
    await t.asUser(outsider, async () => {
      for (const table of ['runs', 'brand_profile', 'strategies', 'ad_variants', 'team_members', 'run_events']) {
        expect(await t.value<number>(`select count(*)::int from public.${table}`), table).toBe(0);
      }
    });
  });

  it('shows a team member everything the dashboard needs', async () => {
    await t.asUser(member, async () => {
      expect(await t.value<number>('select count(*)::int from public.brand_profile')).toBe(1);
      expect(await t.value<number>('select count(*)::int from public.runs')).toBeGreaterThan(0);
      expect(await t.value<number>('select count(*)::int from public.ad_variants')).toBeGreaterThan(0);
    });
  });

  it('keeps model usage and the agents’ functions for the service role', async () => {
    await t.asUser(member, async () => {
      await expect(t.db.query('select count(*) from public.agent_usage')).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`select public.agent_begin(gen_random_uuid(), 'tracker')`)).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`select public.start_run('custom','text','x',array['meta'],'consultations', p_excerpt => $1)`, [EXCERPT])).rejects.toThrow(/permission denied/);
    });
  });
});

describe('changing', () => {
  it('lets nobody write a table directly, not even a member', async () => {
    await t.asUser(member, async () => {
      await expect(t.db.query(`update public.brand_profile set company = 'x'`)).rejects.toThrow(/permission denied/);
      await expect(t.db.query(`insert into public.runs (title, kind, input, platforms, goal, excerpt) values ('x','custom','text',array['meta'],'consultations', $1)`, [EXCERPT])).rejects.toThrow(/permission denied/);
    });
  });

  it('refuses a stranger every change', async () => {
    const { variantId } = await finishedRun();
    await t.asUser(outsider, async () => {
      await expect(t.db.query(`select public.create_run('custom','text','x',array['meta'],'consultations', p_excerpt => $1)`, [EXCERPT])).rejects.toThrow(/Only the QGR team/);
      await expect(t.db.query(`select public.approve_variant($1)`, [variantId])).rejects.toThrow(/Only the QGR team/);
      await expect(t.db.query(`select public.save_video_edit($1, null)`, [variantId])).rejects.toThrow(/Only the QGR team/);
    });
  });

  it('starts a run for the member who asked, skipping the tracker for a custom run', async () => {
    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom','text','Mine',array['meta','x'],'consultations', p_excerpt => $1)`, [EXCERPT]));
    expect(await t.value<string>('select created_by::text from public.runs where id = $1', [runId])).toBe(member);
    expect(await t.value<string>(`select status from public.run_stages where run_id = $1 and stage = 'tracker'`, [runId])).toBe('skipped');
    await t.asUser(member, () => expect(t.db.query(`select public.create_run('custom','text','x',array['meta','meta'],'consultations', p_excerpt => $1)`, [EXCERPT])).rejects.toThrow(/listed twice/));
  });

  it('records a run that could not reach the agents, once', async () => {
    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom','text','Unreached',array['meta'],'consultations', p_excerpt => $1)`, [EXCERPT]));
    await t.asUser(member, () => t.db.query(`select public.report_start_failure($1, 'n8n answered 503.')`, [runId]));
    expect(await t.value<string>(`select status || ': ' || error from public.run_stages where run_id = $1 and stage = 'strategist'`, [runId])).toBe('failed: n8n answered 503.');
    await t.asUser(member, () => expect(t.db.query(`select public.report_start_failure($1, 'again')`, [runId])).rejects.toThrow(/already started/));
  });

  it('saves an edit to a variant’s copy, only for the run’s platforms', async () => {
    const { variantId } = await finishedRun();
    const edited = { meta: { text: 'Edited', headline: 'H', description: 'D', cta: 'Book now' }, x: { text: 'Edited x', headline: 'H' } };
    await t.asUser(member, () => t.db.query(`select public.save_variant($1, 'New words', $2::jsonb, array['meta text says "guarantee"'])`, [variantId, JSON.stringify(edited)]));
    expect(await t.value<string>('select creative_text from public.ad_variants where id = $1', [variantId])).toBe('New words');
    await t.asUser(member, async () => {
      await expect(t.db.query(`select public.save_variant($1, 'x', $2::jsonb, null)`, [variantId, JSON.stringify({ ...edited, linkedin: { text: 't', headline: 'h' } })])).rejects.toThrow(/did not ask for/);
      await expect(t.db.query(`select public.save_variant($1, 'x', $2::jsonb, null)`, [variantId, JSON.stringify({ meta: edited.meta })])).rejects.toThrow(/x copy is missing/);
    });
  });

  it('approves the run and its strategy with the first approved variant', async () => {
    const { runId, variantId } = await finishedRun();
    await t.asUser(member, () => t.db.query('select public.approve_variant($1)', [variantId]));
    expect(await t.value<boolean>('select approved_at is not null from public.runs where id = $1', [runId])).toBe(true);
    expect(await t.value<boolean>('select approved_at is not null from public.strategies where run_id = $1', [runId])).toBe(true);
  });

  it('saves the brand profile through its function, tidying the handle', async () => {
    await t.asUser(member, () => t.db.query(`select public.update_brand_profile('Quantum Global Residency', 'quantumglobalresidency.com', 'Offer', 'Audience', array['Calm'], array['Rule'], 'Quantum Global', 'quantumglobal')`));
    expect(await t.value<string>('select x_handle from public.brand_profile')).toBe('@quantumglobal');
    await t.asUser(member, () => expect(t.db.query(`select public.update_brand_profile('Q', 'q.com', 'o', 'a', array[]::text[], null, 'Q', '@q')`)).rejects.toThrow(/voice/));
  });
});

describe('pages', () => {
  it('stores what was read from a link, and says so in the run’s activity', async () => {
    const page = { ok: true, url: 'https://www.horizonvisa.example/', title: 'Horizon Visa Partners', text: 'Words.', words: 640, readAt: '2026-10-08T09:00:00Z' };
    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('competitor','website','horizonvisa.example',array['meta'],'consultations', p_url => 'https://horizonvisa.example/', p_page => $1::jsonb)`, [JSON.stringify(page)]));
    expect(await t.value<string>(`select page ->> 'title' from public.runs where id = $1`, [runId])).toBe('Horizon Visa Partners');
    expect(await t.value<number>(`select count(*)::int from public.run_events where run_id = $1 and text = 'Read Horizon Visa Partners: 640 words'`, [runId])).toBe(1);

    const failed = { ok: false, url: 'https://atlas.example/', error: 'The site turned the reader away (403).', readAt: '2026-10-08T09:00:00Z' };
    const second = await t.asUser(member, () => t.value<string>(`select public.create_run('competitor','website','atlas.example',array['meta'],'consultations', p_url => 'https://atlas.example/', p_page => $1::jsonb)`, [JSON.stringify(failed)]));
    expect(await t.value<number>(`select count(*)::int from public.run_events where run_id = $1 and text = 'Could not read atlas.example: The site turned the reader away (403).'`, [second])).toBe(1);
  });

  it('gives the agents the page with the run', async () => {
    const page = { ok: true, url: 'https://journal.example/post', title: 'A post', text: 'The words the strategist reads.', words: 6, readAt: '2026-10-08T09:00:00Z' };
    const runId = await t.asUser(member, () => t.value<string>(`select public.create_run('custom','blog','A post',array['meta'],'consultations', p_url => 'https://journal.example/post', p_page => $1::jsonb)`, [JSON.stringify(page)]));
    const begun = await t.asService(() => t.value<{ run: { page: { text: string } } }>(`select public.agent_begin($1, 'strategist')`, [runId]));
    expect(begun.run.page.text).toBe('The words the strategist reads.');
  });
});

describe('clips and storage', () => {
  const mine = () => `uploads/${member}/0b6f7a4e-1f2a-4c3b-9d8e-7f6a5b4c3d2e.mp4`;
  const media = '{"duration": 42.5, "width": 1920, "height": 1080, "size": 12400000, "mime": "video/mp4"}';

  it('lets a member upload only into their own folder, and a stranger not at all', async () => {
    await t.asUser(member, async () => {
      await t.db.query(`insert into storage.objects (bucket_id, name) values ('run-media', $1)`, [mine()]);
      await expect(t.db.query(`insert into storage.objects (bucket_id, name) values ('run-media', $1)`, [`uploads/${outsider}/x.mp4`])).rejects.toThrow(/row-level security/);
      await expect(t.db.query(`insert into storage.objects (bucket_id, name) values ('run-media', 'elsewhere/x.mp4')`)).rejects.toThrow(/row-level security/);
      expect(await t.value<number>(`select count(*)::int from storage.objects where bucket_id = 'run-media'`)).toBe(1);
    });
    await t.asUser(outsider, async () => {
      await expect(t.db.query(`insert into storage.objects (bucket_id, name) values ('run-media', $1)`, [`uploads/${outsider}/x.mp4`])).rejects.toThrow(/row-level security/);
      expect(await t.value<number>(`select count(*)::int from storage.objects where bucket_id = 'run-media'`)).toBe(0);
    });
  });

  it('starts a clip run from a finished upload, with notes, for anyone on the team', async () => {
    const run = (who: string, path: string, notes = EXCERPT) =>
      t.asUser(who, () => t.value<string>(`select public.create_run('custom','video','Clip',array['meta'],'consultations', p_excerpt => $1, p_media_path => $2, p_media => $3::jsonb)`, [notes, path, media]));
    const runId = await run(member, mine());
    expect(await t.value<number>(`select count(*)::int from public.run_events where run_id = $1 and text = 'Clip uploaded: 0:43'`, [runId])).toBe(1);
    // A teammate retrying the run uses the same clip.
    await expect(run(teammate, mine())).resolves.toMatch(/^[0-9a-f-]{36}$/);
    await expect(run(member, `uploads/${member}/11111111-2222-4333-8444-555555555555.mp4`)).rejects.toThrow(/not finished uploading/);
    await expect(run(member, mine(), 'too short')).rejects.toThrow(/runs_source_present/);
    await expect(run(outsider, mine())).rejects.toThrow(/Only the QGR team/);
  });

  it('lets the uploader remove a clip no run uses, and nobody else', async () => {
    const unused = `uploads/${member}/2c9d8e7f-6a5b-4c3d-8e2f-1a0b9c8d7e6f.mp4`;
    const remove = (who: string, path: string) => t.asUser(who, () => t.value<number>(`with gone as (delete from storage.objects where bucket_id = 'run-media' and name = $1 returning 1) select count(*)::int from gone`, [path]));
    await t.asUser(member, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('run-media', $1)`, [unused]));
    expect(await remove(teammate, unused)).toBe(0);
    expect(await remove(outsider, unused)).toBe(0);
    expect(await remove(member, unused)).toBe(1);
    // mine() is the clip of the runs above.
    expect(await remove(member, mine())).toBe(0);
  });

  it('saves a variant’s video edit inside the clip, and clears it', async () => {
    const { runId, variantId } = await finishedRun({ mediaPath: mine() });
    const edit = { keep: [{ start: 2, end: 20 }, { start: 25, end: 40 }], aspect: '4:5', captions: [] };
    await t.asUser(member, () => t.db.query('select public.save_video_edit($1, $2::jsonb)', [variantId, JSON.stringify(edit)]));
    expect(await t.value<string>(`select video_edit ->> 'aspect' from public.ad_variants where id = $1`, [variantId])).toBe('4:5');
    await t.asUser(member, async () => {
      await expect(t.db.query('select public.save_video_edit($1, $2::jsonb)', [variantId, JSON.stringify({ keep: [{ start: 30, end: 90 }] })])).rejects.toThrow(/outside the clip/);
      await expect(t.db.query('select public.save_video_edit($1, $2::jsonb)', [variantId, JSON.stringify({ keep: [] })])).rejects.toThrow(/at least one part/);
    });
    await t.asUser(member, () => t.db.query('select public.save_video_edit($1, null)', [variantId]));
    expect(await t.value<unknown>('select video_edit from public.ad_variants where id = $1', [variantId])).toBeNull();
    expect(await t.value<number>(`select count(*)::int from public.run_events where run_id = $1 and text in ('Variant B video edited', 'Variant B video reset')`, [runId])).toBe(2);
  });

  it('refuses a video edit on a run without a clip', async () => {
    const { variantId } = await finishedRun();
    await t.asUser(member, () => expect(t.db.query('select public.save_video_edit($1, $2::jsonb)', [variantId, JSON.stringify({ keep: [{ start: 0, end: 5 }] })])).rejects.toThrow(/no clip/));
  });
});
