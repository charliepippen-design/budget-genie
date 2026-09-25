import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerateJSON = vi.fn();

vi.mock('@/lib/ai-client', () => ({
  generateJSON: (...args: unknown[]) => mockGenerateJSON(...args),
}));

import { generateOnboardingPlan, generateWizardPlan, type WizardAnswers } from '@/lib/onboarding-ai';
import { getOnboardingMarkets } from '@/lib/geo-market-data';

const answers: WizardAnswers = {
  budget: 50000,
  vertical: 'igaming',
  goal: 'acquire_volume',
  geos: ['DE', 'QQ'],
  benchmarks: {},
};

const validPlan = {
  rationale: 'Primary response',
  channelAdjustments: [{ channelName: 'Affiliates', allocationPct: 100, reasoning: 'x' }],
  recommendedCpaTarget: 70,
  recommendedRoasTarget: 2.7,
  recommendedPlayerValue: 210,
  keyRisk: 'Risk',
  firstActionAfterLaunch: 'Action',
};

describe('generateOnboardingPlan', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the plan when the gateway answers with valid JSON', async () => {
    mockGenerateJSON.mockResolvedValueOnce(validPlan);
    expect(await generateOnboardingPlan(answers)).toEqual(validPlan);

    const prompt = mockGenerateJSON.mock.calls[0][0] as string;
    expect(prompt).toContain('Germany');
    expect(prompt).not.toContain('QQ');
  });

  it('returns null when the JSON does not match the schema', async () => {
    mockGenerateJSON.mockResolvedValueOnce({ rationale: 'missing fields' });
    expect(await generateOnboardingPlan(answers)).toBeNull();
  });

  it('returns null when the gateway fails', async () => {
    mockGenerateJSON.mockRejectedValueOnce(new Error('Sign in to use the AI planner.'));
    expect(await generateOnboardingPlan(answers)).toBeNull();
  });
});

describe('generateWizardPlan (no AI)', () => {
  const shares = (goal: WizardAnswers['goal']) => {
    const plan = generateWizardPlan({ ...answers, geos: [], goal })!;
    return Object.fromEntries(plan.channels.map((c) => [c.id, Math.round(c.allocationPct)]));
  };

  it('feeds the chosen goal into the deterministic generator', () => {
    const plan = generateWizardPlan({ ...answers, goal: 'maintain' })!;
    expect(plan.brief.riskProfile).toBe('conservative');
    expect(plan.brief.markets).toEqual(['DE', 'QQ']);
    expect(shares('acquire_volume')).not.toEqual(shares('maximize_revenue'));
  });

  it('passes a known CPA as the target', () => {
    const plan = generateWizardPlan({ ...answers, benchmarks: { cpa: 90 } })!;
    expect(plan.brief.targetCpa).toBe(90);
  });

  it('returns null for verticals without an industry pack', () => {
    expect(generateWizardPlan({ ...answers, vertical: 'lead_gen' })).toBeNull();
    expect(generateWizardPlan({ ...answers, vertical: 'other' })).toBeNull();
  });
});

describe('getOnboardingMarkets', () => {
  it('offers general ad markets outside iGaming and gambling geos for iGaming', () => {
    const general = getOnboardingMarkets('ecommerce').map((m) => m.code);
    expect(general).toEqual(expect.arrayContaining(['US', 'GB', 'FR', 'AU']));
    const igaming = getOnboardingMarkets('igaming').map((m) => m.code);
    expect(igaming).not.toContain('US');
    expect(igaming).toContain('GB');
  });

  it('uses valid ISO codes so every flag renders (no "UK")', () => {
    for (const vertical of ['igaming', 'ecommerce'] as const) {
      getOnboardingMarkets(vertical).forEach((m) => expect(m.code).toMatch(/^[A-Z]{2}$/));
      expect(getOnboardingMarkets(vertical).map((m) => m.code)).not.toContain('UK');
    }
  });
});

