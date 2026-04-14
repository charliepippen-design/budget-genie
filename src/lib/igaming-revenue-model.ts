import type { Vertical, IgamingSubvertical } from '@/lib/vertical-presets';

export interface IgamingRevenueInputs {
  playerValue: number;
  retentionRate: number;
  regToFtdCvr: number;
  turnoverRate: number;
  margin: number;
  bonusRate: number;
}

export interface IgamingRevenueMonthInput {
  ftds: number;
  marketingCost: number;
}

export interface IgamingRevenueMonthValues {
  registrations: number;
  activePlayers: number;
  ggr: number;
  bonus: number;
  ngr: number;
  grossContribution: number;
  ngrPerPlayer: number;
}

export interface IgamingSubverticalPreset {
  label: string;
  description: string;
  margin: number;
  bonusRate: number;
  regToFtdCvr: number;
  playerValue: number;
  retentionRate: number;
  turnoverRate: number;
}

export const DEFAULT_IGAMING_REVENUE_INPUTS: Omit<IgamingRevenueInputs, 'playerValue'> = {
  retentionRate: 0.55,
  regToFtdCvr: 0.2,
  turnoverRate: 1,
  margin: 0.06,
  bonusRate: 0.25,
};

export const IGAMING_SUBVERTICAL_PRESETS: Record<IgamingSubvertical, IgamingSubverticalPreset> = {
  casino: {
    label: 'Casino',
    description: 'Balanced casino benchmark with moderate edge and heavier bonus cost.',
    margin: 0.06,
    bonusRate: 0.28,
    regToFtdCvr: 0.2,
    playerValue: 150,
    retentionRate: 0.55,
    turnoverRate: 1,
  },
  sportsbook: {
    label: 'Sportsbook',
    description: 'Higher hold profile with stronger registration-to-FTD efficiency.',
    margin: 0.08,
    bonusRate: 0.15,
    regToFtdCvr: 0.28,
    playerValue: 120,
    retentionRate: 0.6,
    turnoverRate: 1,
  },
  crypto_casino: {
    label: 'Crypto Casino',
    description: 'Higher-value cohorts with lower margin and more bonus pressure.',
    margin: 0.035,
    bonusRate: 0.35,
    regToFtdCvr: 0.14,
    playerValue: 200,
    retentionRate: 0.45,
    turnoverRate: 1,
  },
};

function clampRate(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

export function isIgamingVertical(vertical: Vertical | null | undefined): vertical is 'igaming' {
  return vertical === 'igaming';
}

export function normalizeIgamingRevenueInputs(
  partial: Partial<IgamingRevenueInputs> | undefined,
  playerValue: number
): IgamingRevenueInputs {
  return {
    playerValue: Number.isFinite(partial?.playerValue)
      ? Math.max(0, partial!.playerValue!)
      : playerValue,
    retentionRate: clampRate(
      partial?.retentionRate ?? DEFAULT_IGAMING_REVENUE_INPUTS.retentionRate,
      DEFAULT_IGAMING_REVENUE_INPUTS.retentionRate
    ),
    regToFtdCvr: clampRate(
      partial?.regToFtdCvr ?? DEFAULT_IGAMING_REVENUE_INPUTS.regToFtdCvr,
      DEFAULT_IGAMING_REVENUE_INPUTS.regToFtdCvr
    ),
    turnoverRate: clampRate(
      partial?.turnoverRate ?? DEFAULT_IGAMING_REVENUE_INPUTS.turnoverRate,
      DEFAULT_IGAMING_REVENUE_INPUTS.turnoverRate
    ),
    margin: clampRate(
      partial?.margin ?? DEFAULT_IGAMING_REVENUE_INPUTS.margin,
      DEFAULT_IGAMING_REVENUE_INPUTS.margin
    ),
    bonusRate: clampRate(
      partial?.bonusRate ?? DEFAULT_IGAMING_REVENUE_INPUTS.bonusRate,
      DEFAULT_IGAMING_REVENUE_INPUTS.bonusRate
    ),
  };
}

export function calculateIgamingRevenueMonth(
  input: IgamingRevenueMonthInput,
  previousActivePlayers: number,
  inputs: IgamingRevenueInputs
): IgamingRevenueMonthValues {
  const ftds = Math.max(0, input.ftds);
  const marketingCost = Math.max(0, input.marketingCost);
  const activePlayers = Math.max(0, previousActivePlayers * inputs.retentionRate + ftds);
  const registrations = inputs.regToFtdCvr > 0 ? ftds / inputs.regToFtdCvr : 0;
  const ggr = activePlayers * inputs.playerValue * inputs.turnoverRate * inputs.margin;
  const bonus = ggr * inputs.bonusRate;
  const ngr = ggr - bonus;
  const ngrPerPlayer =
    inputs.playerValue * inputs.turnoverRate * inputs.margin * (1 - inputs.bonusRate);

  return {
    registrations,
    activePlayers,
    ggr,
    bonus,
    ngr,
    grossContribution: ngr - marketingCost,
    ngrPerPlayer,
  };
}

export function calculateIgamingRevenueSeries(
  months: IgamingRevenueMonthInput[],
  inputs: IgamingRevenueInputs
): IgamingRevenueMonthValues[] {
  let previousActivePlayers = 0;

  return months.map((month, index) => {
    const values = calculateIgamingRevenueMonth(
      month,
      index === 0 ? 0 : previousActivePlayers,
      inputs
    );
    previousActivePlayers = values.activePlayers;
    return values;
  });
}
