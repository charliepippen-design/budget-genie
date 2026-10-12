import { describe, expect, it, vi } from 'vitest';
import { generateReportNarrative, type ReportNarratorInput } from './report-narrator';

vi.mock('@/lib/ai-client', () => ({ generateJSON: vi.fn(async () => ({ nope: true })) }));

describe('generateReportNarrative', () => {
  it('resolves null instead of throwing on bad input', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bad = { totalBudget: 1, scenarioBase: undefined, geos: undefined, blendedRoas: undefined } as unknown as ReportNarratorInput;
    await expect(generateReportNarrative(bad)).resolves.toBeNull();
    await expect(generateReportNarrative(null as unknown as ReportNarratorInput)).resolves.toBeNull();
  });
});
