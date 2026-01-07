
import { useState, useEffect, useCallback } from 'react';
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

    const saveToCloud = useCallback(async () => {
        setStatus('syncing');

        try {
            // 1. Snapshot Data
            const mediaPlanState = useMediaPlanStore.getState();
            const multiMonthState = useMultiMonthStore.getState();

            const payload = {
                mediaPlanState,
                multiMonthState,
                updatedAt: new Date().toISOString() // We manually add this for validation pass
            };

            // 2. Validate Data
            const result = ProjectSchema.safeParse(payload);

            if (!result.success) {
                console.warn('Validation Failed:', result.error);
                // We generally shouldn't block saving on minor validation errors in a draft
                // But for "Cloud-Ready", we want to be safe. 
                // fallback: local save only
                throw new Error('Data validation failed');
            }

            // 3. Send to Cloud (Mocked for now as we setup Supabase Table)
            // Real impl would be: 
            // await supabase.from('projects').upsert({ ... })

            // Simulate network delay
            await new Promise(r => setTimeout(r, 800));

            // For now, we update local storage "draft" key to simulate cloud persistence
            localStorage.setItem('mediaplanner_cloud_draft', JSON.stringify(payload));

            setStatus('idle');
            setLastSaved(new Date());
        } catch (error) {
            console.error('Auto-save failed', error);
            setStatus('error');

            // Fallback
            toast.error('Cloud save failed - Saved to device');
            const mediaPlanState = useMediaPlanStore.getState();
            const multiMonthState = useMultiMonthStore.getState();
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
        // We can subscribe to specific changes or just the whole store
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
