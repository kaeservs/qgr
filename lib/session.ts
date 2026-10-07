import 'server-only';
import { cache } from 'react';
import { supabaseConfig } from './supabase/config';
import { getSupabase } from './supabase/server';

export type TeamRole = 'owner' | 'member';

export interface Viewer {
  id: string;
  email: string;
  name: string;
  /** Null for an account that is not on the team: it can sign in but sees nothing. */
  role: TeamRole | null;
}

const fromEmail = (email: string) =>
  (email.split('@')[0] ?? '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Teammate';

/**
 * Who is signed in, from a verified token, and their place on the team. Null
 * when nobody is, or when Supabase is not configured (the sample data has no
 * accounts). One lookup per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  // A non-member cannot read even their own row, so no row means not on the team.
  const { data: member } = await supabase.from('team_members').select('role').eq('user_id', claims.sub).maybeSingle();
  const email = claims.email ?? '';
  const meta: Record<string, unknown> = claims.user_metadata ?? {};
  const given = [meta.full_name, meta.name].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  const role = member?.role === 'owner' || member?.role === 'member' ? member.role : null;
  return { id: claims.sub, email, name: given?.trim() ?? fromEmail(email), role };
});

/**
 * For actions and routes, before any change: on Supabase only a team member
 * may change anything. The database checks again; this answers sooner and in
 * plain words. The sample data has no accounts, so it lets everything through.
 */
export async function checkTeam(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!supabaseConfig()) return { ok: true };
  const viewer = await getViewer();
  if (!viewer) return { ok: false, status: 401, error: 'Sign in first.' };
  if (!viewer.role) return { ok: false, status: 403, error: 'Only the QGR team can do this.' };
  return { ok: true };
}
