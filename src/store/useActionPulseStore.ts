import { create } from 'zustand';

export type ActionPulseType = 'reduce-spend' | 'reallocate' | 'cap-spend' | 'focus-channel';

interface ActionPulseState {
  targetChannelId: string | null;
  actionType: ActionPulseType | null;
  pulseKey: number;
  dispatchActionPulse: (targetChannelId: string, actionType: ActionPulseType) => void;
  clearActionPulse: () => void;
}

export const useActionPulseStore = create<ActionPulseState>((set) => ({
  targetChannelId: null,
  actionType: null,
  pulseKey: 0,
  dispatchActionPulse: (targetChannelId, actionType) =>
    set((state) => ({
      targetChannelId,
      actionType,
      pulseKey: state.pulseKey + 1,
    })),
  clearActionPulse: () => set({ targetChannelId: null, actionType: null }),
}));
