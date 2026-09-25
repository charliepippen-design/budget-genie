export type GeoTierKey = 'tier1' | 'tier2' | 'tier3';

export interface GeoCountryProfile {
  name: string;
  code: string;
  tier: GeoTierKey;
  baselineCpa: number;
  baselineLtv: number;
}

export const TIER_LABELS: Record<GeoTierKey, string> = {
  tier1: 'Tier 1: Premium',
  tier2: 'Tier 2: Volume',
  tier3: 'Tier 3: Emerging',
};

export const TIER_DEFAULTS: Record<GeoTierKey, number> = {
  tier1: 40,
  tier2: 35,
  tier3: 25,
};

export const TOP_IGAMING_GEOS: GeoCountryProfile[] = [
  { name: 'Germany', code: 'DE', tier: 'tier1', baselineCpa: 118, baselineLtv: 285 },
  { name: 'Canada', code: 'CA', tier: 'tier1', baselineCpa: 102, baselineLtv: 255 },
  { name: 'Japan', code: 'JP', tier: 'tier1', baselineCpa: 126, baselineLtv: 295 },
  { name: 'United Kingdom', code: 'UK', tier: 'tier1', baselineCpa: 110, baselineLtv: 272 },
  { name: 'Sweden', code: 'SE', tier: 'tier1', baselineCpa: 98, baselineLtv: 248 },
  { name: 'Brazil', code: 'BR', tier: 'tier2', baselineCpa: 64, baselineLtv: 182 },
  { name: 'Mexico', code: 'MX', tier: 'tier2', baselineCpa: 58, baselineLtv: 168 },
  { name: 'Spain', code: 'ES', tier: 'tier2', baselineCpa: 72, baselineLtv: 194 },
  { name: 'Italy', code: 'IT', tier: 'tier2', baselineCpa: 69, baselineLtv: 188 },
  { name: 'Poland', code: 'PL', tier: 'tier2', baselineCpa: 61, baselineLtv: 176 },
  { name: 'India', code: 'IN', tier: 'tier3', baselineCpa: 31, baselineLtv: 108 },
  { name: 'Nigeria', code: 'NG', tier: 'tier3', baselineCpa: 27, baselineLtv: 92 },
  { name: 'Peru', code: 'PE', tier: 'tier3', baselineCpa: 34, baselineLtv: 114 },
  { name: 'Vietnam', code: 'VN', tier: 'tier3', baselineCpa: 29, baselineLtv: 98 },
  { name: 'South Africa', code: 'ZA', tier: 'tier3', baselineCpa: 36, baselineLtv: 119 },
];

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const TIER1_GEOS = TOP_IGAMING_GEOS.filter((g) => g.tier === 'tier1');

/**
 * Tier-1 market averages. Channel prices and values in presets/industry packs are
 * Tier-1 figures; other markets scale them by their ratio to this reference.
 */
export const TIER1_REFERENCE = {
  cpa: avg(TIER1_GEOS.map((g) => g.baselineCpa)),
  ltv: avg(TIER1_GEOS.map((g) => g.baselineLtv)),
};

// Countries outside TOP_IGAMING_GEOS, bucketed by media cost level.
const EXTRA_TIER1 = ['US', 'GB', 'AU', 'NL', 'NO', 'DK', 'CH', 'IE', 'FI', 'AT', 'BE', 'NZ'];
const EXTRA_TIER2 = ['FR', 'PT', 'CZ', 'GR', 'KR', 'AE', 'SA', 'IL', 'SG', 'HK', 'CL', 'AR'];

export function marketTier(code: string): GeoTierKey {
  const c = code.trim().toUpperCase() === 'GB' ? 'UK' : code.trim().toUpperCase();
  const known = TOP_IGAMING_GEOS.find((g) => g.code === c);
  if (known) return known.tier;
  if (EXTRA_TIER1.includes(c)) return 'tier1';
  if (EXTRA_TIER2.includes(c)) return 'tier2';
  return 'tier3';
}

/**
 * ISO country codes -> the store's geo selection.
 * All codes known: pick those countries. Otherwise weight the tiers by how many markets fall in each.
 */
export function marketsToGeoSelection(codes: string[]): {
  activeGeos: string[];
  activeTiers: Record<GeoTierKey, number>;
} {
  const normalized = codes.map((c) => (c.trim().toUpperCase() === 'GB' ? 'UK' : c.trim().toUpperCase()));
  if (normalized.length === 0) return { activeGeos: [], activeTiers: { tier1: 100, tier2: 0, tier3: 0 } };

  const known = normalized.map((c) => TOP_IGAMING_GEOS.find((g) => g.code === c));
  if (known.every(Boolean)) {
    return { activeGeos: known.map((g) => g!.name), activeTiers: { ...TIER_DEFAULTS } };
  }

  const counts: Record<GeoTierKey, number> = { tier1: 0, tier2: 0, tier3: 0 };
  normalized.forEach((c) => (counts[marketTier(c)] += 1));
  const toPct = (n: number) => Math.round((n / normalized.length) * 100);
  return { activeGeos: [], activeTiers: { tier1: toPct(counts.tier1), tier2: toPct(counts.tier2), tier3: toPct(counts.tier3) } };
}
