import { beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test/supabase';
import type { TestDatabase } from '../test/supabase';

// Profile photos: teammates see each other's, each puts and takes away only their own.

let t: TestDatabase;
let member = '';
let teammate = '';
let outsider = '';

const path = (user: string) => `photos/${user}/${crypto.randomUUID()}.jpg`;
const upload = (user: string, name: string) => t.asUser(user, () => t.db.query(`insert into storage.objects (bucket_id, name) values ('profile-photos', $1)`, [name]));
const remove = (user: string, name: string) =>
  t.asUser(user, () => t.value<number>(`with gone as (delete from storage.objects where bucket_id = 'profile-photos' and name = $1 returning 1) select count(*)::int from gone`, [name]));
const seen = (user: string) => t.asUser(user, () => t.value<number>(`select count(*)::int from storage.objects where bucket_id = 'profile-photos'`));

beforeAll(async () => {
  t = await testDatabase();
  member = await t.addUser('member@qgr.example', 'owner');
  teammate = await t.addUser('teammate@qgr.example', 'member');
  outsider = await t.addUser('stranger@elsewhere.example');
}, 60_000);

describe('profile photos', () => {
  it('lets a teammate put a photo only in their own folder, and everyone on the team see it', async () => {
    const mine = path(member);
    await upload(member, mine);
    await expect(upload(member, path(teammate))).rejects.toThrow();
    await expect(upload(member, `elsewhere/${member}/a.jpg`)).rejects.toThrow();
    await expect(upload(outsider, path(outsider))).rejects.toThrow();
    expect(await seen(teammate)).toBe(1);
    expect(await seen(outsider)).toBe(0);

    // Only its owner takes it away.
    expect(await remove(teammate, mine)).toBe(0);
    expect(await remove(member, mine)).toBe(1);
  });
});
