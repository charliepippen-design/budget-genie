import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl === 'https://placeholder-url.supabase.co') {
  console.warn(
    'Supabase URL not configured. Please set VITE_SUPABASE_URL in your environment variables.'
  );
}

if (!supabaseAnonKey || supabaseAnonKey === 'placeholder-key') {
  console.warn(
    'Supabase Anon Key not configured. Please set VITE_SUPABASE_ANON_KEY in your environment variables.'
  );
}

// Create ONE supabase client. Two createClient() calls in the same page made two GoTrueClient
// instances share the same storage key ("Multiple GoTrueClient instances detected" warning and
// undefined behaviour). typedSupabase is the same instance with the Database types applied.
// Legacy: the product does not use Supabase auth/data today (see README); kept for use-store-sync/use-auto-save.
export const typedSupabase = createClient<Database>(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export const supabase = typedSupabase as unknown as SupabaseClient;
