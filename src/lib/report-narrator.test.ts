import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateReportNarrative, type ReportNarratorInput } from './report-narrator';

const { generateJSON } = vi.hoisted(() => ({ generateJSON: vi.fn() }));
vi.mock('@/lib/ai-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai-client')>()),
  generateJSON,
}));

beforeEach(() => {
  generateJSON.mockReset();
  generateJSON.mockResolvedValue({ nope: true });
});

// Numbers from the reported screenshot: budget 20000, "return on spend 1.44x",
// yet the plan loses about 18783 per month (break-even 11 vs current 178).
const losing = (over: Partial<ReportNarratorInput> = {}): ReportNarratorInput => ({
  totalBudget: 20000,
  totalSpend: 20000,
  projectedRevenue: 28704,
  projectedFtds: 113,
  blendedCpa: 177.54,
  blendedRoas: 1.44,
  paybackMonths: null,
  topChannel: 'Search',
  weakestChannel: 'Display',
  scenarioBase: { ltvToCac: 1.4, projectedCohortValue: 28704 },
  alertCount: 2,
  vertical: 'igaming',
  geos: ['IT'],
  currency: 'EUR',
  profitability: {
    losesMoney: true,
    monthlyContribution: -18783,
    breakEvenCpa: 11,
    blendedCpa: 177.54,
  },
  revenueLabel: 'Projected Player Value (lifetime)',
  ...over,
});

const promptFor = async (input: ReportNarratorInput): Promise<string> => {
  await generateReportNarrative(input);
  return generateJSON.mock.calls[0][0] as string;
};

describe('generateReportNarrative', () => {
  it('resolves null instead of throwing on bad input', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bad = { totalBudget: 1, scenarioBase: undefined, geos: undefined, blendedRoas: undefined } as unknown as ReportNarratorInput;
    await expect(generateReportNarrative(bad)).resolves.toBeNull();
    await expect(generateReportNarrative(null as unknown as ReportNarratorInput)).resolves.toBeNull();
  });
});

describe('narrator prompt profitability', () => {
  it('regression: "short summary for my boss" on the losing plan leads with loss and break-even', async () => {
    // Eval seed d2-007: "Write me a short summary of this plan for my boss"
    const prompt = await promptFor(losing());
    const data = prompt.slice(prompt.indexOf('Plan data:'));
    const lines = data.split('\n');
    expect(lines[1]).toBe('- Monthly profit or loss (engine): LOSS of €18,783 per month');
    expect(lines[2]).toBe('- Break-even cost per customer (engine): €11 (current €178)');
    expect(prompt).toContain('THIS PLAN LOSES MONEY');
    expect(prompt).toContain('Never describe return on spend or value as positive');
    expect(prompt).toContain('Projected Player Value (lifetime): €28,704');
    expect(prompt).not.toMatch(/Month 1/);
    expect(prompt).not.toContain('first-month revenue):');
    expect(prompt).toContain('leading with profit or loss');
    expect(prompt).not.toContain('leading with return on investment');
  });

  it('uses the default value label when none is given', async () => {
    const prompt = await promptFor(losing({ revenueLabel: undefined }));
    expect(prompt).toContain('Projected customer value (not first-month revenue): €28,704');
  });

  it('says profit for a profitable plan and omits the loss rule', async () => {
    const prompt = await promptFor(
      losing({
        profitability: { losesMoney: false, monthlyContribution: 5200, breakEvenCpa: 250, blendedCpa: 177.54 },
      })
    );
    expect(prompt).toContain('Monthly profit or loss (engine): PROFIT of €5,200 per month');
    expect(prompt).toContain('Break-even cost per customer (engine): €250 (current €178)');
    expect(prompt).not.toContain('THIS PLAN LOSES MONEY');
  });

  it('handles a non-computable break-even and omits lines without profitability', async () => {
    const prompt = await promptFor(
      losing({ profitability: { losesMoney: true, monthlyContribution: -100, breakEvenCpa: null, blendedCpa: null } })
    );
    expect(prompt).toContain('Break-even cost per customer (engine): Not calculable (current Not calculable)');
    generateJSON.mockClear();
    const bare = await promptFor(losing({ profitability: undefined }));
    expect(bare).not.toContain('(engine)');
  });

  it('adds no em or en dashes to the prompt lines we own', async () => {
    const prompt = await promptFor(losing());
    const owned = prompt.slice(prompt.indexOf('Plan data:'), prompt.indexOf('Respond with valid JSON'));
    expect(owned).not.toMatch(/[–—]/);
  });
});
