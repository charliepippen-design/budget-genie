import { beforeEach, describe, expect, it } from 'vitest';
import {
  INITIAL_DRAFT,
  ONBOARDING_DRAFT_KEY,
  sanitizeDraft,
  useOnboardingDraftStore,
} from '@/store/useOnboardingDraftStore';

const read = () => JSON.parse(localStorage.getItem(ONBOARDING_DRAFT_KEY) ?? 'null');

describe('onboarding wizard draft', () => {
  beforeEach(() => {
    localStorage.clear();
    useOnboardingDraftStore.getState().reset();
  });

  it('persists step and answers, and restores them on reload', async () => {
    const s = useOnboardingDraftStore.getState();
    s.setSelectedBudgetTierKey('growing');
    s.setDraft((d) => ({ ...d, budget: 40000, vertical: 'ecommerce', goal: 'maintain', geos: ['US'], step: 4 }));

    const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY) as string;
    expect(read().state.draft.step).toBe(4);

    useOnboardingDraftStore.getState().reset();
    localStorage.setItem(ONBOARDING_DRAFT_KEY, raw);
    await useOnboardingDraftStore.persist.rehydrate();

    const { draft, selectedBudgetTierKey } = useOnboardingDraftStore.getState();
    expect(draft).toMatchObject({ step: 4, budget: 40000, vertical: 'ecommerce', goal: 'maintain', geos: ['US'] });
    expect(selectedBudgetTierKey).toBe('growing');
  });

  it('reset clears the saved draft', () => {
    useOnboardingDraftStore.getState().setDraft((d) => ({ ...d, budget: 10000, step: 3 }));
    useOnboardingDraftStore.getState().reset();
    expect(read().state.draft).toEqual(INITIAL_DRAFT);
  });

  it('a finished wizard leaves nothing to resume', () => {
    useOnboardingDraftStore.getState().setDraft((d) => ({ ...d, budget: 10000, vertical: 'saas', step: 'done' }));
    expect(read().state.draft).toEqual(INITIAL_DRAFT);
  });

  it('reloading mid-generation resumes at the last question', () => {
    useOnboardingDraftStore.getState().setDraft((d) => ({ ...d, budget: 10000, vertical: 'saas', step: 'generating' }));
    expect(read().state.draft.step).toBe(6);
  });

  it('sanitizes corrupt or stale drafts', () => {
    expect(sanitizeDraft(null)).toEqual(INITIAL_DRAFT);
    const bad = sanitizeDraft({ step: 99, budget: 'x', vertical: 'nope', goal: 'bogus', geos: [1, 'US'] });
    expect(bad).toMatchObject({ step: 1, budget: '', vertical: null, goal: null, geos: ['US'] });
    expect(sanitizeDraft({ step: 3, budget: 20000, vertical: 'saas', subvertical: 'casino' }).subvertical).toBeNull();
  });
});

// SA-11: without a migrate function zustand silently drops a save whose version differs.
describe('onboarding draft migration (SA-11)', () => {
  beforeEach(() => {
    localStorage.clear();
    useOnboardingDraftStore.getState().reset();
  });

  it('has a version and a migrate function', () => {
    const options = useOnboardingDraftStore.persist.getOptions();
    expect(options.version).toBe(1);
    expect(typeof options.migrate).toBe('function');
  });

  it('a save from an older version is restored, not dropped', async () => {
    localStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({
        state: { draft: { ...INITIAL_DRAFT, budget: 25000, vertical: 'saas', step: 3 }, selectedBudgetTierKey: 'starter' },
        version: 0,
      })
    );
    await useOnboardingDraftStore.persist.rehydrate();
    const { draft, selectedBudgetTierKey } = useOnboardingDraftStore.getState();
    expect(draft).toMatchObject({ budget: 25000, vertical: 'saas', step: 3 });
    expect(selectedBudgetTierKey).toBe('starter');
  });

  it('a malformed older save still falls back to a fresh start', async () => {
    localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ state: { draft: 'nope' }, version: 0 }));
    await useOnboardingDraftStore.persist.rehydrate();
    expect(useOnboardingDraftStore.getState().draft).toEqual(INITIAL_DRAFT);
  });
});
