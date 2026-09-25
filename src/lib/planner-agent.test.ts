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

  it('keeps chat locks, removals and pinned shares across rebuilds', () => {
    applyPlannerToolCall({ name: 'update_brief', args: { industry: 'igaming', monthlyBudget: 60000 } });
    applyPlannerToolCall({ name: 'adjust_channel', args: { channelId: 'igaming-affiliate-cpa', action: 'set_share', sharePct: 40 } });
    applyPlannerToolCall({ name: 'adjust_channel', args: { channelId: 'igaming-affiliate-cpa', action: 'lock' } });
    applyPlannerToolCall({ name: 'adjust_channel', args: { channelId: 'igaming-native', action: 'remove' } });
    applyPlannerToolCall({ name: 'update_brief', args: { monthlyBudget: 120000 } });

    const chs = useMediaPlanStore.getState().channels;
    const aff = chs.find(c => c.id === 'igaming-affiliate-cpa');
    expect(aff?.locked).toBe(true);
    expect(summarizePlan().channels.find(c => c.id === 'igaming-affiliate-cpa')?.sharePct).toBeCloseTo(40, 0);
    expect(chs.find(c => c.id === 'igaming-native')).toBeUndefined();
  });

  it('reports when a requested share cannot be reached', () => {
    applyPlannerToolCall({ name: 'update_brief', args: { industry: 'ecommerce', monthlyBudget: 50000 } });
    const res = applyPlannerToolCall({ name: 'adjust_channel', args: { channelId: 'ecommerce-meta-social', action: 'set_share', sharePct: 120 } });
    expect(res.ok).toBe(true);
    expect(String(res.note)).toMatch(/maximum possible/);
  });

  it('drops ad restrictions and pins when the industry changes', () => {
    applyPlannerToolCall({ name: 'update_brief', args: { industry: 'igaming', monthlyBudget: 50000, excludeTags: ['restricted'] } });
    applyPlannerToolCall({ name: 'update_brief', args: { industry: 'forex' } });
    const brief = useMediaPlanStore.getState().brief!;
    expect(brief.excludeTags).toEqual([]);
    expect(useMediaPlanStore.getState().channels.map(c => c.id)).toContain('forex-google-search');
  });

  it('replaces objectives instead of merging them', () => {
    applyPlannerToolCall({ name: 'update_brief', args: { industry: 'saas', monthlyBudget: 50000, objectives: { branding: 1 } } });
    expect(useMediaPlanStore.getState().brief?.objectives).toEqual({ acquisition: 0, retention: 0, branding: 1 });
  });

  it('table shares sum to 100% even when budget is held back', () => {
    applyPlannerToolCall({ name: 'update_brief', args: { industry: 'igaming', monthlyBudget: 900000, markets: ['IT'] } });
    const total = summarizePlan().channels.reduce((sum, c) => sum + (c.sharePct ?? 0), 0);
    expect(total).toBeCloseTo(100, 0);
  });
});
