import { create } from 'zustand';

// Lets any screen send a prompt to the AI planner chat. PlannerChat is the only consumer: it
// takes one prompt at a time, when it is not busy, and sends it as if the user had typed it.

interface PlannerPromptState {
  /** Prompts waiting for the chat, oldest first. */
  queue: string[];
  /** Queues a prompt for the chat. Blank text is ignored. */
  submit: (text: string) => void;
  /** Removes and returns the oldest prompt; null when nothing is waiting. */
  take: () => string | null;
}

export const usePlannerPromptStore = create<PlannerPromptState>((set, get) => ({
  queue: [],
  submit: (text) => {
    const trimmed = text.trim();
    if (trimmed) set((state) => ({ queue: [...state.queue, trimmed] }));
  },
  take: () => {
    const [next, ...rest] = get().queue;
    if (next === undefined) return null;
    set({ queue: rest });
    return next;
  },
}));
