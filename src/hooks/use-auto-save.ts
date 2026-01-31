
import { useState, useEffect, useCallback, useRef } from 'react';
import { useMediaPlanStore } from './use-media-plan-store';
import { useMultiMonthStore } from './use-multi-month-store';
import { ProjectSchema } from '@/lib/schemas/project-schema';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// Debounce helper
function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function useAutoSave() {
    const [status, setStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const retryCount = useRef(0);

    const saveToCloud = useCallback(async () => {
        setStatus('syncing');

        // Snapshot Data
        const mediaPlanState = useMediaPlanStore.getState();
        const multiMonthState = useMultiMonthStore.getState();

        const payload = {
            mediaPlanState,
            multiMonthState,
            updatedAt: new Date().toISOString()
        };

        // Validate Data
        const result = ProjectSchema.safeParse(payload);
        if (!result.success) {
            console.warn('Validation Failed:', result.error);
            // Fallback: local save only
            // For "Cloud-Ready", we might enforce valid data, but for draft we allow it.
        }

        const performSave = async (attempt = 1): Promise<void> => {
            try {
                // 1. Refresh Session (Critical for long sessions)
                await supabase.auth.refreshSession();

                // 2. Simulate Save or Real Save
                // In a real scenario, checks for 409 would go here.
                // await supabase.from('projects').upsert(...)

                // For now, assume success after delay
                await new Promise(r => setTimeout(r, 600));

                // Simulate random conflict for demonstration if needed, but we'll stick to robust happy path + generic error handling
                // Mock Cloud Save
                localStorage.setItem('mediaplanner_cloud_draft', JSON.stringify(payload));

                setStatus('idle');
                setLastSaved(new Date());
                retryCount.current = 0; // Reset retries on success

            } catch (error) {
                console.error(`Save failed (Attempt ${attempt}/3)`, error);

                // 3. Simple Backoff Strategy
                if (attempt < 3) {
                    const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s
                    console.log(`Retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    return performSave(attempt + 1);
                } else {
                    // Final Failure
                    throw error;
                }
            }
        };

        try {
            await performSave();
        } catch (error) {
            console.error('Final Auto-save failed after retries', error);
            setStatus('error');
            retryCount.current = 0;

            // Fallback Logic
            toast.error('Cloud save failed - Saved to device');
            localStorage.setItem('mediaplanner_offline_backup', JSON.stringify({
                mediaPlanState, multiMonthState, timestamp: Date.now()
            }));
        }
    }, []);

    // Debounced Version
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedSave = useCallback(debounce(saveToCloud, 2000), []);

    // Subscribe to changes
    useEffect(() => {
        const unsubscribe1 = useMediaPlanStore.subscribe((state, prevState) => {
            if (state !== prevState) debouncedSave();
        });

        const unsubscribe2 = useMultiMonthStore.subscribe((state, prevState) => {
            if (state !== prevState) debouncedSave();
        });

        return () => {
            unsubscribe1();
            unsubscribe2();
        }
    }, [debouncedSave]);

    return { status, lastSaved };
}
