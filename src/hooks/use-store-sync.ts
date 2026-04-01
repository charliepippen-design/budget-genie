import { useEffect } from 'react';
import { useMediaPlanStore } from './use-media-plan-store';
import { useMultiMonthStore } from './use-multi-month-store';
import { supabase } from '@/lib/supabase';

export function useStoreSync() {
  useEffect(() => {
    // 1. BroadcastChannel for modern browsers
    const channel = new BroadcastChannel('media_planner_sync');

    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'STATE_UPDATE') {
        useMediaPlanStore.setState(event.data.payload);
      }
    };

    // 2. Storage event fallback for older browsers/persistence sync
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'media-plan-storage' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed.state) {
            useMediaPlanStore.setState(parsed.state);
          }
        } catch (err) {
          console.error('Failed to sync from storage', err);
        }
      }
    };

    window.addEventListener('storage', handleStorage);

    // Subscribe to changes to broadcast them
    const unsubscribe = useMediaPlanStore.subscribe((state) => {
      // FILTER: Only broadcast DATA, not ACTIONS (functions cannot be cloned)
      const serializableState = {
        totalBudget: state.totalBudget,
        channels: state.channels,
        globalMultipliers: state.globalMultipliers,
        presets: state.presets,
        projectName: state.projectName,
      };
      channel.postMessage({ type: 'STATE_UPDATE', payload: serializableState });
    });

    let supabaseChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtime = async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;

      supabaseChannel = supabase
        .channel('budget-plans-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'budget_plans',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const next = payload.new as {
              payload?: { mediaPlanState?: unknown; multiMonthState?: unknown };
            };
            const statePayload = next?.payload;
            if (!statePayload) return;

            if (statePayload.mediaPlanState) {
              useMediaPlanStore.setState(
                statePayload.mediaPlanState as Partial<
                  ReturnType<typeof useMediaPlanStore.getState>
                >
              );
            }

            if (statePayload.multiMonthState) {
              useMultiMonthStore.setState(
                statePayload.multiMonthState as Partial<
                  ReturnType<typeof useMultiMonthStore.getState>
                >
              );
            }
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      channel.close();
      window.removeEventListener('storage', handleStorage);
      unsubscribe();
      supabaseChannel?.unsubscribe();
    };
  }, []);
}
