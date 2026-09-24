
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Generates a Supabase client that utilizes a live Clerk session token to satisfy Postgres RLS
export const getSupabaseClient = async (getToken: (options?: any) => Promise<string | null>) => {
    const supabaseToken = await getToken({ template: 'supabase' });

    return createClient(
        supabaseUrl || 'https://placeholder-url.supabase.co',
        supabaseAnonKey || 'placeholder-key',
        {
            global: {
                headers: {
                    Authorization: `Bearer ${supabaseToken}`,
                },
            },
        }
    );
};

// Create a single supabase client for interacting with your database
export const supabase = createClient(
    supabaseUrl || 'https://placeholder-url.supabase.co',
    supabaseAnonKey || 'placeholder-key'
);
