
import { useEffect } from 'react';
import { useMediaPlanStore } from './use-media-plan-store';

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
            channel.postMessage({ type: 'STATE_UPDATE', payload: state });
        });

        return () => {
            channel.close();
            window.removeEventListener('storage', handleStorage);
            unsubscribe();
        };
    }, []);
}
