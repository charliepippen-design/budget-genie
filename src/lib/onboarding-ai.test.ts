import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerateObject = vi.fn();
const mockGoogleFactory = vi.fn();

vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: (...args: unknown[]) => mockGoogleFactory(...args),
}));

import { generateOnboardingPlan } from '@/lib/onboarding-ai';

describe('generateOnboardingPlan', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();

    mockGoogleFactory.mockReturnValue((modelName: string) => `model:${modelName}`);
  });

  it('returns null when API key is missing', async () => {
    vi.stubEnv('VITE_GOOGLE_GENERATIVE_AI_API_KEY', '');

    const result = await generateOnboardingPlan({
      budget: 50000,
      vertical: 'igaming',
      goal: 'acquire_volume',
      geos: ['Germany'],
      benchmarks: {},
    });

    expect(result).toBeNull();
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('returns primary model result when first call succeeds', async () => {
    vi.stubEnv('VITE_GOOGLE_GENERATIVE_AI_API_KEY', 'test-key');

    const expected = {
      rationale: 'Primary response',
      channelAdjustments: [],
      recommendedCpaTarget: 70,
      recommendedRoasTarget: 2.7,
      recommendedPlayerValue: 210,
      keyRisk: 'Risk',
      firstActionAfterLaunch: 'Action',
    };

    mockGenerateObject.mockResolvedValueOnce({ object: expected });

    const result = await generateOnboardingPlan({
      budget: 50000,
      vertical: 'igaming',
      goal: 'acquire_volume',
      geos: ['Germany'],
      benchmarks: {},
    });

    expect(result).toEqual(expected);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockGenerateObject.mock.calls[0][0].model).toBe('model:gemini-2.0-flash');
  });

  it('falls back to secondary model when primary throws', async () => {
    vi.stubEnv('VITE_GOOGLE_GENERATIVE_AI_API_KEY', 'test-key');

    const fallback = {
      rationale: 'Fallback response',
      channelAdjustments: [],
      recommendedCpaTarget: 65,
      recommendedRoasTarget: 2.4,
      recommendedPlayerValue: 190,
      keyRisk: 'Risk',
      firstActionAfterLaunch: 'Action',
    };

    mockGenerateObject.mockRejectedValueOnce(new Error('primary failed'));
    mockGenerateObject.mockResolvedValueOnce({ object: fallback });

    const result = await generateOnboardingPlan({
      budget: 65000,
      vertical: 'lead_gen',
      goal: 'maximize_revenue',
      geos: ['Germany', 'Unknownland'],
      benchmarks: { cpa: 60 },
    });

    expect(result).toEqual(fallback);
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    expect(mockGenerateObject.mock.calls[1][0].model).toBe('model:gemini-1.5-flash-latest');

    const usedPrompt = mockGenerateObject.mock.calls[0][0].prompt as string;
    expect(usedPrompt).toContain('Germany');
    expect(usedPrompt).not.toContain('Unknownland');
  });

  it('returns null when both primary and fallback fail', async () => {
    vi.stubEnv('VITE_GOOGLE_GENERATIVE_AI_API_KEY', 'test-key');

    mockGenerateObject.mockRejectedValueOnce(new Error('primary failed'));
    mockGenerateObject.mockRejectedValueOnce(new Error('fallback failed'));

    const result = await generateOnboardingPlan({
      budget: 40000,
      vertical: 'other',
      goal: 'maintain',
      geos: [],
      benchmarks: {},
    });

    expect(result).toBeNull();
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
  });
});
