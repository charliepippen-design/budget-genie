import type { ChannelGroup } from '@/lib/planning-insights';
import type { ChannelSandboxAdjustment } from './types';

export const SANDBOX_DEFAULT_ADJUSTMENT: ChannelSandboxAdjustment = {
  spendPct: 0,
  cpaPct: 0,
  roasPct: 0,
  churnPct: 0,
};

export const CHANNEL_GROUPS: ChannelGroup[] = ['organic', 'paid', 'affiliate', 'influencer'];
