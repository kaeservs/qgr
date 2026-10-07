import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/supabase/config';

// Runs before every page and API call. It refreshes the Supabase session (an
// expiring token is renewed here, where cookies can still be written) and
// sends anyone who is not signed in to /sign-in. This is only the first check:
// pages, actions and routes check again, and row level security is the last
// word on what anyone can read.

const OPEN = ['/sign-in'];

export async function proxy(request: NextRequest) {
  const supabase = supabaseConfig();
  // The sample data has no accounts and nothing to protect.
  if (!supabase) return NextResponse.next();

  let response = NextResponse.next({ request });
  const client = createServerClient(supabase.url, supabase.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await client.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (data?.claims || OPEN.some((p) => path === p || path.startsWith(`${p}/`))) return response;

  if (path.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/sign-in';
  url.search = '';
  if (path !== '/') url.searchParams.set('next', `${path}${request.nextUrl.search}`);
  const redirect = NextResponse.redirect(url);
  // Keep any cookie the refresh just cleared or rewrote.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.png|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)'],
};
