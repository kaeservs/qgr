import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// A local stand-in for the Supabase project, for tests: real Postgres (PGlite,
// in this process, no network), with the roles, grants and the parts of the
// auth and storage schemas the migrations rely on, copied from the project.
// Every file in supabase/migrations runs on it in order, so a test exercises
// exactly the SQL that is deployed.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SUPABASE = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- What Supabase grants on everything new in public; the migrations take it back.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text,
  raw_app_meta_data jsonb default '{}',
  raw_user_meta_data jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- As defined in the project.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;
`;

export interface TestDatabase {
  db: PGlite;
  /** Runs `fn` as a signed-in user, as PostgREST would with their token. */
  asUser<T>(userId: string, fn: () => Promise<T>): Promise<T>;
  /** Runs `fn` as the service role, as n8n does. */
  asService<T>(fn: () => Promise<T>): Promise<T>;
  /** Creates an account; `member` also puts it on the team. */
  addUser(email: string, member?: 'owner' | 'member'): Promise<string>;
  /** One value from a query run as the database owner. */
  value<T>(sql: string, params?: unknown[]): Promise<T>;
}

export async function testDatabase(): Promise<TestDatabase> {
  const db = new PGlite();
  await db.exec(SUPABASE);
  const dir = join(root, 'supabase', 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), 'utf8'));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const as = async <T>(role: string, claims: string, fn: () => Promise<T>) => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
    await db.exec(`set role ${role}`);
    try {
      return await fn();
    } finally {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  };

  return {
    db,
    asUser: (userId, fn) => as('authenticated', JSON.stringify({ sub: userId, role: 'authenticated' }), fn),
    asService: (fn) => as('service_role', JSON.stringify({ role: 'service_role' }), fn),
    async addUser(email, member) {
      const { rows } = await db.query<{ id: string }>(
        `insert into auth.users (instance_id, id, aud, role, email) values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1) returning id`,
        [email],
      );
      const id = rows[0]!.id;
      if (member) await db.query(`select private.add_team_member($1, $2)`, [email, member]);
      return id;
    },
    async value<T>(sql: string, params: unknown[] = []) {
      const { rows } = await db.query<Record<string, T>>(sql, params);
      const row = rows[0];
      return (row ? Object.values(row)[0] : undefined) as T;
    },
  };
}
