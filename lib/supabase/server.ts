import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { supabaseConfig } from './config';
import type { Database } from './database.types';

export type Supabase = SupabaseClient<Database>;

/**
 * This request's Supabase client, acting as the signed-in person with the
 * publishable key, so row level security decides what it sees. Null when
 * Supabase is not configured. One client per request (React's cache).
 */
export const getSupabase = cache(async (): Promise<Supabase | null> => {
  const config = supabaseConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Pages cannot set cookies, only actions and routes can. proxy.ts
          // refreshes the session before a page renders, so nothing is lost.
        }
      },
    },
  });
});
