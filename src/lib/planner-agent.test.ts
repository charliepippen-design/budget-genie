import { describe, it, expect, beforeEach } from 'vitest';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { applyPlannerToolCall, buildPlannerContext, summarizePlan } from '@/lib/planner-agent';

describe('Planner agent tool bridge', () => {
  beforeEach(() => {
    useMediaPlanStore.getState().resetAll();
    useMediaPlanStore.setState({ brief: null, planRationale: [], planWarnings: [] });
  });

  it('has no plan context before a brief exists', () => {
    expect(buildPlannerContext().plan).toBeNull();
  });

  it('update_brief generates a plan in the store', () => {
    const res = applyPlannerToolCall({ name: 'update_brief', args: { industry: 'forex', monthlyBudget: 40000, markets: ['de'] } });
    expect(res.ok).toBe(true);
    const s = useMediaPlanStore.getState();
    expect(s.brief?.industry).toBe('forex');
    expect(s.brief?.markets).toEqual(['DE']);
    expect(s.channels.every(c => c.id.startsWith('forex-'))).toBe(true);
    expect(summarizePlan().blended.spend).toBeCloseTo(s.totalBudget, -1);
  });

  it('changing industry drops stale channel preferences', () => {
    applyPlannerToolCall({ name: 'update_brief', args: { industry: 'igaming', monthlyBudget: 30000, excludeChannels: ['push'] } });
    applyPlannerToolCall({ name: 'update_brief', args: { industry: 'saas' } });
    expect(useMediaPlanStore.getState().brief?.excludeChannels).toEqual([]);
  });

  it('adjust_channel set_share hits the requested share and keeps total spend', () => {
    applyPlannerToolCall({ name: 'update_brief', args: { industry: 'ecommerce', monthlyBudget: 50000 } });
    const res = applyPlannerToolCall({ name: 'adjust_channel', args: { channelId: 'ecommerce-meta-social', action: 'set_share', sharePct: 40 } });
    expect(res.ok).toBe(true);
    const plan = summarizePlan();
    expect(plan.channels.find(c => c.id === 'ecommerce-meta-social')?.sharePct).toBeCloseTo(40, 0);
    expect(plan.blended.spend).toBeCloseTo(useMediaPlanStore.getState().totalBudget, -1);
  });

  it('adjust_channel lock/deactivate/remove', () => {
    applyPlannerToolCall({ name: 'update_brief', args: { industry: 'ecommerce', monthlyBudget: 50000 } });
    applyPlannerToolCall({ name: 'adjust_channel', args: { channelId: 'ecommerce-meta-social', action: 'lock' } });
    applyPlannerToolCall({ name: 'adjust_channel', args: { channelId: 'ecommerce-tiktok', action: 'deactivate' } });
    applyPlannerToolCall({ name: 'adjust_channel', args: { channelId: 'ecommerce-retargeting', action: 'remove' } });
    const chs = useMediaPlanStore.getState().channels;
    expect(chs.find(c => c.id === 'ecommerce-meta-social')?.locked).toBe(true);
    expect(chs.find(c => c.id === 'ecommerce-tiktok')?.isActive).toBe(false);
    expect(chs.find(c => c.id === 'ecommerce-retargeting')).toBeUndefined();
  });

  it('rejects unknown channels and tools', () => {
    expect(applyPlannerToolCall({ name: 'adjust_channel', args: { channelId: 'nope', action: 'lock' } }).ok).toBe(false);
    expect(applyPlannerToolCall({ name: 'hack', args: {} }).ok).toBe(false);
  });
});
