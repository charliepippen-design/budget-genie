// How proven a channel is, read from the industry packs rather than duplicated here: a channel
// built from a pack template has the id `${pack}-${template key}` (see plan-generator.ts), and
// the template's tags say whether it is proven, experimental or restricted.

import { INDUSTRY_PACKS } from '@/lib/industries/packs';
import type { ChannelData } from '@/lib/media-plan/types';
import {
  EFFICIENCY_LOG_SD_BY_BUYING_MODEL,
  EFFICIENCY_SPREAD_MULTIPLIER,
  EVIDENCE_PRECEDENCE,
  type EvidenceLevel,
} from './priors';

const levelByChannelId = new Map<string, EvidenceLevel>();
INDUSTRY_PACKS.forEach((pack) =>
  pack.channels.forEach((template) => {
    const tags = template.tags ?? [];
    const level = EVIDENCE_PRECEDENCE.find((candidate) => (tags as string[]).includes(candidate)) ?? 'unrated';
    levelByChannelId.set(`${pack.id}-${template.key}`, level);
  })
);

/** Evidence level of a channel; `unrated` for channels the packs do not know (user-created ones). */
export function evidenceLevel(channel: Pick<ChannelData, 'id'>): EvidenceLevel {
  return levelByChannelId.get(channel.id) ?? 'unrated';
}

/** Standard deviation of log(efficiency) for a channel: buying model spread x evidence multiplier. */
export function efficiencyLogSd(channel: Pick<ChannelData, 'id' | 'buyingModel'>): number {
  const base = EFFICIENCY_LOG_SD_BY_BUYING_MODEL[channel.buyingModel] ?? EFFICIENCY_LOG_SD_BY_BUYING_MODEL.CPM;
  return base * EFFICIENCY_SPREAD_MULTIPLIER[evidenceLevel(channel)];
}
