import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { safeNext } from '@/lib/safe-next';
import { getSupabase } from '@/lib/supabase/server';

// Where a link from Supabase's emails lands: confirming a new email address
// from the Profile page. The link carries either a one-time code for this
// browser (`code`) or a token for any browser (`token_hash` and `type`); either
// is exchanged here, then the person goes back to where they were.
const TYPES: readonly EmailOtpType[] = ['email_change', 'email', 'signup', 'invite', 'magiclink', 'recovery'];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get('next'));
  const back = (to: string) => NextResponse.redirect(new URL(to, request.nextUrl.origin));
  const supabase = await getSupabase();
  if (!supabase) return back('/');

  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type && TYPES.includes(type)
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: { message: 'The link has no code' } };
  if (error) {
    console.error('Confirming an email link failed', error);
    return back(`/profile?confirm=failed`);
  }
  // Secure email change sends two links; after the first, the change waits for the other.
  return back(`${next}${next.includes('?') ? '&' : '?'}confirm=done`);
}
