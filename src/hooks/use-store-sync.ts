import { useEffect } from 'react';
import { useMediaPlanStore } from './use-media-plan-store';
import { useMultiMonthStore } from './use-multi-month-store';
import { supabase } from '@/lib/supabase';
import { SYNC_CHANNEL_NAME, createSyncController, createTabId } from '@/lib/store-sync';
import type { MediaPlanState } from '@/lib/media-plan/state';

type SyncPayload = Pick<
  MediaPlanState,
  'totalBudget' | 'channels' | 'globalMultipliers' | 'presets' | 'projectName'
>;

export function useStoreSync() {
  useEffect(() => {
    // BroadcastChannel keeps open tabs in step. (localStorage itself is shared by persist.)
    const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);

    const sync = createSyncController<SyncPayload>({
      tabId: createTabId(),
      post: (message) => channel.postMessage(message),
      apply: (payload) => useMediaPlanStore.setState(payload),
    });

    channel.onmessage = (event) => {
      sync.onMessage(event.data);
    };

    // Broadcast local changes. Only DATA, not ACTIONS (functions cannot be cloned).
    const unsubscribe = useMediaPlanStore.subscribe((state) => {
      sync.onLocalChange({
        totalBudget: state.totalBudget,
        channels: state.channels,
        globalMultipliers: state.globalMultipliers,
        presets: state.presets,
        projectName: state.projectName,
      });
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

            // Every tab receives the realtime event itself, so it is not re-broadcast.
            sync.applyRemote(() => {
              if (statePayload.mediaPlanState) {
                useMediaPlanStore.setState(
                  statePayload.mediaPlanState as Partial<ReturnType<typeof useMediaPlanStore.getState>>
                );
              }

              if (statePayload.multiMonthState) {
                useMultiMonthStore.setState(
                  statePayload.multiMonthState as Partial<ReturnType<typeof useMultiMonthStore.getState>>
                );
              }
            });
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      channel.close();
      unsubscribe();
      supabaseChannel?.unsubscribe();
    };
  }, []);
}
