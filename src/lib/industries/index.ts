import { INDUSTRY_PACKS } from './packs';
import type { IndustryId, IndustryPack } from './types';
import type { Vertical } from '@/lib/vertical-presets';

export * from './types';
export { INDUSTRY_PACKS };

export const INDUSTRY_IDS = INDUSTRY_PACKS.map(p => p.id) as IndustryId[];

export function getIndustryPack(id: IndustryId | string | undefined): IndustryPack {
  return INDUSTRY_PACKS.find(p => p.id === id) ?? INDUSTRY_PACKS[0];
}

/** Dashboard verticals are coarser than industry packs; map for vertical-aware UI. */
export function industryToVertical(id: IndustryId): Vertical {
  if (id === 'igaming' || id === 'ecommerce' || id === 'saas') return id;
  return 'other';
}
