// PRIOR: the spend at which a channel's efficiency has halved, for channels that do not carry a
// `saturationCeiling` of their own (channels created by the user). Not hard-coded: it is the
// median ceiling the industry packs give to channels of the same family, so it follows the
// packs when they change. Still an assumption, to be replaced by a curve fitted to the channel's
// own spend and results.

import { INDUSTRY_PACKS } from '@/lib/industries/packs';
import type { ChannelFamily } from '@/types/channel';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const ceilingsByFamily = new Map<ChannelFamily, number[]>();
INDUSTRY_PACKS.forEach((pack) =>
  pack.channels.forEach((template) => {
    const list = ceilingsByFamily.get(template.family) ?? [];
    list.push(template.saturationCeiling);
    ceilingsByFamily.set(template.family, list);
  })
);

const medianByFamily = new Map<ChannelFamily, number>();
ceilingsByFamily.forEach((ceilings, family) => medianByFamily.set(family, median(ceilings)));

/** Used when no pack has a channel of the family (cannot happen with today's packs). */
const OVERALL_HALF_SATURATION_SPEND = median(
  INDUSTRY_PACKS.flatMap((pack) => pack.channels.map((template) => template.saturationCeiling))
);

/** Monthly Tier-1 spend at which efficiency halves, by family (median of the packs' ceilings). */
export function defaultHalfSaturationSpend(family: ChannelFamily): number {
  return medianByFamily.get(family) ?? OVERALL_HALF_SATURATION_SPEND;
}
