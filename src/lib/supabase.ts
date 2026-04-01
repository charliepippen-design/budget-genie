import { createClient } from '@supabase/supabase-js';
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

// Create a single supabase client for interacting with your database
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export const typedSupabase = createClient<Database>(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
