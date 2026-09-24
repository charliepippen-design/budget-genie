import { INDUSTRY_PACKS } from './packs';
import type { IndustryId, IndustryPack } from './types';

export * from './types';
export { INDUSTRY_PACKS };

export const INDUSTRY_IDS = INDUSTRY_PACKS.map(p => p.id) as IndustryId[];

export function getIndustryPack(id: IndustryId | string | undefined): IndustryPack {
  return INDUSTRY_PACKS.find(p => p.id === id) ?? INDUSTRY_PACKS[0];
}

// ========== MARKETS ==========
// Media cost index vs Tier-1 (1.0). Applied to CPM/CPC/CPA and fixed fees.

const TIER1 = ['US', 'GB', 'UK', 'DE', 'CA', 'AU', 'NL', 'SE', 'NO', 'DK', 'CH', 'IE', 'FI', 'AT', 'BE', 'NZ'];
const TIER2 = ['IT', 'ES', 'FR', 'PT', 'PL', 'CZ', 'GR', 'JP', 'KR', 'AE', 'SA', 'IL', 'SG', 'HK', 'CL', 'MX', 'AR'];

export function marketCostIndex(code: string): number {
  const c = code.trim().toUpperCase();
  if (TIER1.includes(c)) return 1;
  if (TIER2.includes(c)) return 0.7;
  return 0.4; // Tier-3: LatAm/Asia/Africa/CEE rest
}

export function averageCostIndex(markets: string[] | undefined): number {
  if (!markets || markets.length === 0) return 1;
  return markets.reduce((s, m) => s + marketCostIndex(m), 0) / markets.length;
}
