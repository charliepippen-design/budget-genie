import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { getSupabaseClient } from '@/lib/supabase';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';

export function DbHydrator() {
  const { getToken, userId, isSignedIn } = useAuth();
  const hydrateFromDB = useMediaPlanStore(s => s.hydrateFromDB);
  
  // Core state pointers for persistence trigger
  const totalBudget = useMediaPlanStore(s => s.totalBudget);
  const channels = useMediaPlanStore(s => s.channels);
  const globalMultipliers = useMediaPlanStore(s => s.globalMultipliers);
  const isHydrated = useRef(false);

  // 1. Initial Hydration upon Sign In
  useEffect(() => {
    if (!isSignedIn || !userId) return;

    let isMounted = true;
    const fetchConfig = async () => {
      try {
        const client = await getSupabaseClient(getToken);
        const { data, error } = await client
          .from('user_configs')
          .select('config_json')
          .eq('user_id', userId)
          .single();

        // 406 or equivalent normally means row not found yet; that's fine.
        if (error && error.code !== 'PGRST116') {
            console.error("Hydration Error:", error);
        }
        
        if (data && data.config_json && isMounted) {
          hydrateFromDB(data.config_json);
          isHydrated.current = true;
          console.log("☁️ Successfully hydrated state from Supabase Cloud.");
        } else {
            // First time user, mark as hydrated to allow saves
            isHydrated.current = true;
        }
      } catch (err) {
        console.error("Failed to fetch cloud config", err);
      }
    };
    fetchConfig();
    
    return () => { isMounted = false; };
  }, [isSignedIn, userId, getToken, hydrateFromDB]);

  // 2. Automated Cloud Persistance (Debounced)
  useEffect(() => {
     if (!isSignedIn || !userId || !isHydrated.current) return;
     
     const timeout = setTimeout(async () => {
        try {
           const client = await getSupabaseClient(getToken);
           const { error } = await client.from('user_configs').upsert({
               user_id: userId,
               config_json: { totalBudget, channels, globalMultipliers },
               updated_at: new Date().toISOString()
           }, { onConflict: 'user_id' });

           if (error) throw error;
           console.log("☁️ Saved state securely to Supabase.");
        } catch(err) { 
            console.error("Persist Error", err); 
        }
     }, 2500); // 2.5s debounce
     
     return () => clearTimeout(timeout);
  }, [totalBudget, channels, globalMultipliers, isSignedIn, userId, getToken]);

  return null; // Headless component
}
