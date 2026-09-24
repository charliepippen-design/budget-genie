/**
 * Deductions Model (GGR -> NGR)
 * 
 * In iGaming media planning and affiliate evaluation, Net Gaming Revenue (NGR)
 * is derived from Gross Gaming Revenue (GGR) after subtracting mandatory operational deductions:
 * 1. Player Bonuses (free spins, deposit match bonus costs)
 * 2. Admin / Platform Provider Fee (game provider royalties, platform fees)
 * 3. Payment Processing Fees (deposit/withdrawal PSP costs)
 * 4. Gaming Tax (jurisdictional wagering or GGR taxes)
 * 
 * Standard Industry Benchmark Baseline (Matching Deal Evaluator):
 * - Bonus: 30%
 * - Admin Fee: 15%
 * - Payment Fee: 4%
 * - Gaming Tax: 10%
 * -> Total Margin Leakage: 59% of GGR
 * -> Retained NGR: 41% of GGR
 */

export interface DeductionConfig {
  bonusPct: number;
  bonusCapPct?: number;
  adminFeePct: number;
  payFeePct: number;
  taxPct: number;
}

export const DEFAULT_DEDUCTIONS: DeductionConfig = {
  bonusPct: 30,
  bonusCapPct: 100,
  adminFeePct: 15,
  payFeePct: 4,
  taxPct: 10,
};

export interface NgrCalculationResult {
  ggr: number;
  ngr: number;
  totalDeductionPct: number;
  leakageFactor: number;
  retainedMarginPct: number;
}

/**
 * Calculates Net Gaming Revenue from Gross Gaming Revenue given operational deductions.
 */
export function calculateNgrFromGgr(
  ggr: number,
  deductions: DeductionConfig = DEFAULT_DEDUCTIONS
): NgrCalculationResult {
  const effectiveBonusPct = Math.min(deductions.bonusPct || 0, deductions.bonusCapPct ?? 100);
  const totalDeductionPct =
    effectiveBonusPct +
    (deductions.adminFeePct || 0) +
    (deductions.payFeePct || 0) +
    (deductions.taxPct || 0);

  const retainedMarginPct = Math.max(0, 100 - totalDeductionPct);
  const leakageFactor = retainedMarginPct / 100;
  const ngr = ggr * leakageFactor;

  return {
    ggr,
    ngr,
    totalDeductionPct,
    leakageFactor,
    retainedMarginPct,
  };
}

/**
 * Derives Gross Gaming Revenue needed to produce a target Net Gaming Revenue.
 */
export function calculateGgrFromNgr(
  ngr: number,
  deductions: DeductionConfig = DEFAULT_DEDUCTIONS
): number {
  const { leakageFactor } = calculateNgrFromGgr(1, deductions);
  return leakageFactor > 0 ? ngr / leakageFactor : ngr;
}
