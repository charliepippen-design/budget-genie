import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WizardAnswers } from '@/lib/onboarding-ai';
import { VERTICAL_PRESETS, type IgamingSubvertical, type Vertical } from '@/lib/vertical-presets';

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 'generating' | 'done';

export interface WizardDraft {
  step: WizardStep;
  budget: number | '';
  vertical: Vertical | null;
  subvertical: IgamingSubvertical | null;
  goal: WizardAnswers['goal'] | null;
  geos: string[]; // ISO country codes
  benchmarks: { cpa: string; ltv: string };
}

export const ONBOARDING_DRAFT_KEY = 'onboarding-wizard-draft-v1';

export const INITIAL_DRAFT: WizardDraft = {
  step: 1,
  budget: '',
  vertical: null,
  subvertical: null,
  goal: null,
  geos: [],
  benchmarks: { cpa: '', ltv: '' },
};

interface OnboardingDraftState {
  draft: WizardDraft;
  selectedBudgetTierKey: string | null;
  setDraft: (updater: (prev: WizardDraft) => WizardDraft) => void;
  setSelectedBudgetTierKey: (key: string | null) => void;
  /** Wipe the in-progress answers (completion, cancel, or explicit restart). */
  reset: () => void;
}

const GOALS: WizardAnswers['goal'][] = [
  'acquire_volume',
  'maximize_revenue',
  'test_channels',
  'maintain',
];

/** Restores only what is safe to resume; anything malformed falls back to a fresh start. */
export function sanitizeDraft(raw: unknown): WizardDraft {
  if (!raw || typeof raw !== 'object') return { ...INITIAL_DRAFT };
  const d = raw as Partial<WizardDraft>;
  const vertical =
    typeof d.vertical === 'string' && d.vertical in VERTICAL_PRESETS ? d.vertical : null;
  const step =
    typeof d.step === 'number' && d.step >= 1 && d.step <= 6 ? (Math.floor(d.step) as WizardStep) : 1;
  const budget = typeof d.budget === 'number' && Number.isFinite(d.budget) ? d.budget : '';
  return {
    step: budget === '' ? 1 : step,
    budget,
    vertical,
    subvertical: vertical === 'igaming' && typeof d.subvertical === 'string' ? d.subvertical : null,
    goal: d.goal && GOALS.includes(d.goal) ? d.goal : null,
    geos: Array.isArray(d.geos) ? d.geos.filter((g): g is string => typeof g === 'string') : [],
    benchmarks: {
      cpa: typeof d.benchmarks?.cpa === 'string' ? d.benchmarks.cpa : '',
      ltv: typeof d.benchmarks?.ltv === 'string' ? d.benchmarks.ltv : '',
    },
  };
}

export const useOnboardingDraftStore = create<OnboardingDraftState>()(
  persist(
    (set) => ({
      draft: { ...INITIAL_DRAFT },
      selectedBudgetTierKey: null,
      setDraft: (updater) => set((s) => ({ draft: updater(s.draft) })),
      setSelectedBudgetTierKey: (key) => set({ selectedBudgetTierKey: key }),
      reset: () => set({ draft: { ...INITIAL_DRAFT }, selectedBudgetTierKey: null }),
    }),
    {
      name: ONBOARDING_DRAFT_KEY,
      version: 1,
      partialize: (s) => {
        // A finished wizard leaves nothing behind; a reload mid-generation resumes at the last step.
        if (s.draft.step === 'done') {
          return { draft: { ...INITIAL_DRAFT }, selectedBudgetTierKey: null };
        }
        return {
          draft: { ...s.draft, step: s.draft.step === 'generating' ? 6 : s.draft.step },
          selectedBudgetTierKey: s.selectedBudgetTierKey,
        };
      },
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<OnboardingDraftState>;
        const draft = sanitizeDraft(saved.draft);
        return {
          ...current,
          draft,
          selectedBudgetTierKey:
            draft.budget !== '' && typeof saved.selectedBudgetTierKey === 'string'
              ? saved.selectedBudgetTierKey
              : null,
        };
      },
    }
  )
);
