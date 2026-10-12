import { describe, expect, it } from 'vitest';
import { buildPlanReadyToast } from './plan-ready-toast';
import { isBannedClaim } from './claims-filter';

describe('buildPlanReadyToast', () => {
  it('uses fixed honest copy with no AI text', () => {
    const t = buildPlanReadyToast();
    expect(t.title).toBe('Your plan is ready');
    expect(t.options.description).toContain('estimates');
    expect(t.options.description).toContain('not guarantees');
  });

  it('passes its own claims filter apart from the explicit disclaimer', () => {
    expect(isBannedClaim(buildPlanReadyToast().title)).toBe(false);
  });
});
