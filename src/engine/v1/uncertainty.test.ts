import { describe, expect, it } from 'vitest';
import type { ChannelFamily } from '@/types/channel';
import { responseCurveEngine as engine } from './index';
import { buildPlanModel } from './model';
import { CROSS_FAMILY_CORRELATION, SAME_FAMILY_CORRELATION } from './priors';
import { Z_90, lognormalRange } from './stats';
import { inputFor } from './testing';

// The engine propagates uncertainty analytically (first order, in log space). This file checks
// that shortcut against a brute simulation of the same assumptions. The simulation lives only
// here: it is seeded, so the test is deterministic, and the engine itself never samples.

/** Small seeded generator (mulberry32) and Box-Muller normals. */
function normals(seed: number) {
  let state = seed >>> 0;
  const uniform = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(Math.max(uniform(), 1e-12))) * Math.cos(2 * Math.PI * uniform());
}

const quantile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/**
 * Simulates the plan's conversions under the stated assumptions: each channel's conversions are
 * its median times a log-normal error, errors correlated SAME_FAMILY within a family and
 * CROSS_FAMILY across (a common factor, a family factor and an own factor).
 */
function simulate(parts: Array<{ median: number; logSd: number; family: ChannelFamily }>, draws: number) {
  const normal = normals(20261113);
  const families = [...new Set(parts.map((p) => p.family))];
  const common = Math.sqrt(CROSS_FAMILY_CORRELATION);
  const family = Math.sqrt(SAME_FAMILY_CORRELATION - CROSS_FAMILY_CORRELATION);
  const own = Math.sqrt(1 - SAME_FAMILY_CORRELATION);
  const totals: number[] = [];
  for (let d = 0; d < draws; d += 1) {
    const g = normal();
    const f = new Map(families.map((name) => [name, normal()]));
    let total = 0;
    for (const part of parts) {
      const z = common * g + family * f.get(part.family)! + own * normal();
      total += part.median * Math.exp(part.logSd * z);
    }
    totals.push(total);
  }
  return totals.sort((a, b) => a - b);
}

describe('uncertainty propagation', () => {
  it('a log-normal range is symmetric in log space around its median', () => {
    const range = lognormalRange(200, 0.3);
    expect(range.p50).toBe(200);
    expect(Math.log(range.p90 / range.p50)).toBeCloseTo(Z_90 * 0.3, 12);
    expect(range.p10 * range.p90).toBeCloseTo(200 * 200, 6);
    expect(lognormalRange(0, 0.3)).toEqual({ p10: 0, p50: 0, p90: 0 });
    expect(lognormalRange(50, 0)).toEqual({ p10: 50, p50: 50, p90: 50 });
  });

  it.each([
    ['iGaming 60k', inputFor({ industry: 'igaming', monthlyBudget: 60_000, markets: ['DE', 'CA'] })],
    ['e-commerce 25k', inputFor({ industry: 'ecommerce', monthlyBudget: 25_000, markets: ['DE'] })],
    ['SaaS 150k', inputFor({ industry: 'saas', monthlyBudget: 150_000, markets: ['US'] })],
  ])('%s: the analytic plan range matches a 60,000-draw simulation of the same assumptions within 5%%', (_name, input) => {
    const model = buildPlanModel(input);
    const parts = model.channels
      .filter((c) => c.conversions > 0)
      .map((c) => ({ median: c.conversions, logSd: c.logSd, family: c.channel.family }));
    const simulated = simulate(parts, 60_000);
    const analytic = engine.compute(input).ranges!.totals.conversions;

    const error = (p: number, value: number) => Math.abs(value / quantile(simulated, p) - 1);
    console.log(
      `${_name}: analytic vs simulated P10 / P50 / P90 off by ` +
        [error(0.1, analytic.p10), error(0.5, analytic.p50), error(0.9, analytic.p90)].map((e) => `${(e * 100).toFixed(1)}%`).join(' / ')
    );
    expect(error(0.1, analytic.p10)).toBeLessThan(0.05);
    expect(error(0.5, analytic.p50)).toBeLessThan(0.05);
    expect(error(0.9, analytic.p90)).toBeLessThan(0.05);
    // The simulation's 10-90% band really holds about 80% of outcomes of the analytic range.
    const inside = simulated.filter((v) => v >= analytic.p10 && v <= analytic.p90).length / simulated.length;
    expect(inside).toBeGreaterThan(0.75);
    expect(inside).toBeLessThan(0.85);
  });

  it('correlation matters: the plan is wider than independent channels would be, narrower than identical ones', () => {
    const model = buildPlanModel(inputFor({ industry: 'igaming', monthlyBudget: 150_000, markets: ['DE'] }));
    const live = model.channels.filter((c) => c.conversions > 0);
    const total = live.reduce((sum, c) => sum + c.conversions, 0);
    const weights = live.map((c) => (c.conversions / total) * c.logSd);
    const independent = Math.sqrt(weights.reduce((sum, w) => sum + w * w, 0));
    const identical = weights.reduce((sum, w) => sum + w, 0);
    expect(model.conversionsLogSd).toBeGreaterThan(independent);
    expect(model.conversionsLogSd).toBeLessThan(identical);
  });
});
