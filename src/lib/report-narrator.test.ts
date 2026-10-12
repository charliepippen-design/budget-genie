import { describe, expect, it, vi } from 'vitest';
import { generateReportNarrative, type ReportNarratorInput } from './report-narrator';

vi.mock('@/lib/ai-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai-client')>()),
  generateJSON: vi.fn(async () => ({ nope: true })),
}));

describe('generateReportNarrative failures', () => {
  it('rethrows busy / unavailable AI errors so the caller can explain them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { generateJSON, AIError } = await import('@/lib/ai-client');
    vi.mocked(generateJSON).mockRejectedValueOnce(new AIError('x', 'AI_BUSY', 503, 60));
    const ok = { totalBudget: 1, scenarioBase: { ltvToCac: 1, projectedCohortValue: 1 }, geos: [], blendedRoas: 1 } as unknown as ReportNarratorInput;
    await expect(generateReportNarrative(ok)).rejects.toMatchObject({ code: 'AI_BUSY' });
  });
});

describe('generateReportNarrative', () => {
  it('resolves null instead of throwing on bad input', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bad = { totalBudget: 1, scenarioBase: undefined, geos: undefined, blendedRoas: undefined } as unknown as ReportNarratorInput;
    await expect(generateReportNarrative(bad)).resolves.toBeNull();
    await expect(generateReportNarrative(null as unknown as ReportNarratorInput)).resolves.toBeNull();
  });
});
