import { describe, expect, it } from 'vitest';
import type { ChannelData } from '@/lib/media-plan/types';
import type { EngineInput } from '../contract';
import { responseCurveEngine as engine } from './index';
import { inputFor } from './testing';

// `compute` runs on every slider tick, so it has to be far below a frame. The limits are loose
// on purpose (shared CI machines are slow and noisy): they catch an accidental simulation or a
// quadratic blow-up, not a 20% regression. The measured figures are printed and quoted in the PR.

function fifteenChannelPlan(): EngineInput {
  const base = inputFor({ industry: 'igaming', monthlyBudget: 400_000, markets: ['DE', 'CA'] });
  const channels: ChannelData[] = [...base.channels];
  let copy = 0;
  while (channels.length < 15) {
    const source = base.channels[copy % base.channels.length];
    channels.push({ ...source, id: `custom-${copy}`, name: `${source.name} (copy ${copy})` });
    copy += 1;
  }
  return { ...base, channels: channels.slice(0, 15), observedValue: { m1: 60, m3: 120, m6: 170 } };
}

function meanMs(run: () => void, iterations: number): number {
  for (let i = 0; i < 50; i += 1) run();
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) run();
  return (performance.now() - start) / iterations;
}

describe('response-curve engine: performance', () => {
  const input = fifteenChannelPlan();

  it('compute takes well under 5 ms for 15 channels, with calibration on', () => {
    expect(input.channels).toHaveLength(15);
    const ms = meanMs(() => engine.compute(input), 300);
    console.log(`compute, 15 channels, calibrated: ${ms.toFixed(3)} ms per call`);
    expect(ms).toBeLessThan(5);
  });

  it('the optimiser takes well under 50 ms for 15 channels, with a cost ceiling', () => {
    const ms = meanMs(() => engine.optimise!(input, { goal: 'net', constraints: { maxCostPerConversion: 250 } }), 50);
    console.log(`optimise, 15 channels, cost ceiling: ${ms.toFixed(3)} ms per call`);
    expect(ms).toBeLessThan(50);
  });

  it('the customer-value lab takes well under 10 ms', () => {
    const whatIf = {
      churnRatePct: 5,
      cpaShockPct: 10,
      roasLiftPct: 5,
      decayCurve: 'standard-linear' as const,
      sandbox: {
        enabled: true,
        selectedChannelIds: [],
        channelAdjustments: {},
        groupAdjustments: { organic: 0, paid: 10, affiliate: 0, influencer: 0 },
      },
    };
    const ms = meanMs(() => engine.computeWhatIf(input, whatIf), 200);
    console.log(`computeWhatIf, 15 channels: ${ms.toFixed(3)} ms per call`);
    expect(ms).toBeLessThan(10);
  });
});
