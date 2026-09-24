import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerateJSON = vi.fn();

vi.mock('@/lib/ai-client', () => ({
  generateJSON: (...args: unknown[]) => mockGenerateJSON(...args),
}));

import { generateOnboardingPlan, type WizardAnswers } from '@/lib/onboarding-ai';

const answers: WizardAnswers = {
  budget: 50000,
  vertical: 'igaming',
  goal: 'acquire_volume',
  geos: ['Germany', 'Unknownland'],
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
    expect(prompt).not.toContain('Unknownland');
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
