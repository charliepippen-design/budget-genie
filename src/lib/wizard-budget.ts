export const WIZARD_MIN_BUDGET = 5000;
export const WIZARD_MAX_BUDGET = 1000000;

export interface BudgetTier {
  key: string;
  title: string;
  rangeLabel: string;
  helper: string;
  description: string;
  min: number;
  max: number;
}

export const BUDGET_TIERS: readonly BudgetTier[] = [
  {
    key: 'getting-started',
    title: 'Getting Started',
    rangeLabel: '$5,000 - $20,000',
    helper: '/ month',
    description: 'Test 2-3 channels and identify what works before scaling.',
    min: 5000,
    max: 20000,
  },
  {
    key: 'growing',
    title: 'Growing',
    rangeLabel: '$20,000 - $75,000',
    helper: '/ month',
    description: 'Build a multi-channel presence with enough data to optimise.',
    min: 20000,
    max: 75000,
  },
  {
    key: 'scaling',
    title: 'Scaling',
    rangeLabel: '$75,000 - $250,000',
    helper: '/ month',
    description: 'Compete across all key channels with serious volume.',
    min: 75000,
    max: 250000,
  },
  {
    key: 'market-leader',
    title: 'Market Leader',
    rangeLabel: '$250,000+',
    helper: '/ month',
    description: 'Dominate your vertical with full-funnel coverage.',
    min: 250000,
    max: 1000000,
  },
];

/** The budget a band starts at: its lower bound, so the plan never silently assumes more spend. */
export function defaultBudgetForTier(tier: Pick<BudgetTier, 'min'>): number {
  return tier.min;
}

/** Exact budget typed by the user: '' while empty, otherwise a whole number (separators ignored). */
export function parseBudgetInput(raw: string): number | '' {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits === '') return '';
  return Number.parseInt(digits, 10);
}

export function isValidBudget(value: number | ''): value is number {
  return typeof value === 'number' && value >= WIZARD_MIN_BUDGET && value <= WIZARD_MAX_BUDGET;
}
