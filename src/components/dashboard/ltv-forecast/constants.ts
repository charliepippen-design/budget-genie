import type { ChannelGroup } from '@/lib/planning-insights';
import type { ChannelSandboxAdjustment } from '@/store/useSandboxStore';

export const SCENARIO_COLORS = {
  Bear: '#ef4444',
  Base: '#14b8a6',
  Bull: '#22c55e',
};

export const SCENARIO_DOT_CLASS = {
  Bear: 'bg-rose-500',
  Base: 'bg-teal-500',
  Bull: 'bg-emerald-500',
};

export const SANDBOX_INCREASE_FILL = 'rgba(34,197,94,0.82)';
export const SANDBOX_DECREASE_FILL = 'rgba(239,68,68,0.82)';
export const SANDBOX_NEUTRAL_FILL = 'rgba(99,102,241,0.82)';

export const SANDBOX_DEFAULT_ADJUSTMENT: ChannelSandboxAdjustment = {
  spendPct: 0,
  cpaPct: 0,
  roasPct: 0,
  churnPct: 0,
};

export const CHANNEL_GROUPS: ChannelGroup[] = ['organic', 'paid', 'affiliate', 'influencer'];
