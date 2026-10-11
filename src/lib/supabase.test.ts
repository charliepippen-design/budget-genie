import { describe, expect, it, vi } from 'vitest';

describe('supabase client', () => {
  it('creates exactly one client (no duplicate GoTrueClient)', async () => {
    const createClient = vi.fn(() => ({ auth: {} }));
    vi.doMock('@supabase/supabase-js', () => ({ createClient }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('./supabase');
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(mod.supabase).toBe(mod.typedSupabase);
    vi.doUnmock('@supabase/supabase-js');
  });
});
