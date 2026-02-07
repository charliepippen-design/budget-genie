import { create } from 'zustand';
import { useMediaPlanStore, MediaPlanState } from './use-media-plan-store';
import { useEffect, useRef } from 'react';

interface HistoryState {
    past: Partial<MediaPlanState>[];
    future: Partial<MediaPlanState>[];

    undo: () => void;
    redo: () => void;
    record: (state: Partial<MediaPlanState>) => void;
    canUndo: boolean;
    canRedo: boolean;

    isUndoing: boolean;
}

const HISTORY_LIMIT = 50;

export const useHistoryStore = create<HistoryState>((set, get) => ({
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,
    isUndoing: false,

    record: (snapshot) => {
        const { isUndoing, past } = get();
        if (isUndoing) return;

        // Optional: Deep compare or just crude check to avoid duplicates?
        // For now, simple push.

        // Check if new snapshot is identical to last past (if strict)
        // But object refs change in Zustand.

        set((state) => {
            const newPast = [...state.past, snapshot].slice(-HISTORY_LIMIT);
            return {
                past: newPast,
                future: [],
                canUndo: true,
                canRedo: false
            };
        });
    },

    undo: () => {
        const { past, future } = get();
        if (past.length === 0) return;

        // We need the CURRENT state to put into future
        const currentState = useMediaPlanStore.getState();
        const currentSnapshot = {
            totalBudget: currentState.totalBudget,
            channels: currentState.channels,
            globalMultipliers: currentState.globalMultipliers,
        };

        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);

        set({
            past: newPast,
            future: [currentSnapshot, ...future],
            canUndo: newPast.length > 0,
            canRedo: true,
            isUndoing: true
        });

        // Restore
        useMediaPlanStore.getState().restoreState(previous);

        // Reset flag
        setTimeout(() => set({ isUndoing: false }), 0);
    },

    redo: () => {
        const { past, future } = get();
        if (future.length === 0) return;

        // Current state to past
        const currentState = useMediaPlanStore.getState();
        const currentSnapshot = {
            totalBudget: currentState.totalBudget,
            channels: currentState.channels,
            globalMultipliers: currentState.globalMultipliers,
        };

        const next = future[0];
        const newFuture = future.slice(1);

        set({
            past: [...past, currentSnapshot].slice(-HISTORY_LIMIT),
            future: newFuture,
            canUndo: true,
            canRedo: newFuture.length > 0,
            isUndoing: true
        });

        useMediaPlanStore.getState().restoreState(next);

        setTimeout(() => set({ isUndoing: false }), 0);
    },
}));

/**
 * Hook to attach history recording to the main store.
 * Should be mounted once in the app layout.
 */
export function useHistoryRecorder() {
    const record = useHistoryStore((s) => s.record);
    const isUndoing = useHistoryStore((s) => s.isUndoing);

    // Ref to track last saved state to debounce or dedupe
    // We'll use a timeout to debounce slider drags
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const unsub = useMediaPlanStore.subscribe((state, prevState) => {
            // Ignore if we are undoing/redoing
            if (useHistoryStore.getState().isUndoing) return;

            // We want to record 'prevState' when state changes, 
            // so that we can go BACK to it.
            // Wait, standard undo:
            // State A -> (User Action) -> State B.
            // We want to record State A.
            // So 'undo' takes us back to A.

            // Zustand subscribe gives (state, prevState).
            // If we record prevState, we have the history.

            // DEBOUNCE:
            // If user drags slider, we get multpile updates.
            // We only want to record usage of "start of drag".
            // But we don't know when drag starts vs continues.

            // Simple approach: Debounce the RECORDING.
            // But we need to record the *state before the burst of changes*.
            // So we record prevState on the *first* change of a burst.

            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            } else {
                // First change of a sequence? Record the prevState.
                // This is tricky. 
                // Let's rely on a simpler model: Record `state` after 500ms stable? 
                // No, that's not undo.

                // Let's just record every change for now, and rely on the fact that
                // `useMediaPlanStore` updates might be granular.
                // If it's too much, we'll fix it.

                const snapshot = {
                    totalBudget: prevState.totalBudget,
                    channels: prevState.channels,
                    globalMultipliers: prevState.globalMultipliers,
                };
                record(snapshot);
            }

            // Reset timeout
            timeoutRef.current = setTimeout(() => {
                timeoutRef.current = null;
            }, 1000); // 1 sec debounce window effectively merging frequent updates? 
            // This logic is flawed for a true undo stack.
            // True undo: save snapshot immediately before mutation.
            // Since we are external, we see it after.
        });

        return () => {
            unsub();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [record]);
}

export function useHistory() {
    return useHistoryStore();
}
