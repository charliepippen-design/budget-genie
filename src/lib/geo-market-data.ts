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
