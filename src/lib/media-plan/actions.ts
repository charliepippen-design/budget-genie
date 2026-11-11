/**
 * Pure state transitions behind the media plan store actions. Each takes the current
 * values and returns the next ones; the store only wires them to `set`.
 */
import type { ChannelCategory } from '@/lib/mediaplan-data';
import {
  type BuyingModel,
  type ChannelFamily,
  type ChannelTypeConfig,
  inferChannelFamily,
  getLikelyModel,
} from '@/types/channel';
import type { GeoTierKey } from '@/lib/geo-market-data';
import { TIER_DEFAULTS } from '@/lib/geo-market-data';
import { sanitizeChannelName } from '@/lib/utils';
import { GLOBAL_BUDGET_CAP, MIN_BUDGET_CAP } from './constants';
import { BASE_CHANNELS_DATA, DEFAULT_MULTIPLIERS } from './defaults';
import { isFixedCostChannel } from './plan-snapshot';
import type {
  ChannelData,
  ChannelWithMetrics,
  GeoAllocationState,
  GlobalMultipliers,
  Preset,
} from './types';
import type { MediaPlanData } from './state';

export function clampBudget(value: number): number {
  return Math.max(MIN_BUDGET_CAP, Math.min(GLOBAL_BUDGET_CAP, value));
}

/** Sets one tier and rescales the others so the three always sum to 100. */
export function rebalanceTiers(
  activeTiers: GeoAllocationState,
  tier: GeoTierKey,
  nextValue: number
): GeoAllocationState {
  const clamped = Math.max(0, Math.min(100, nextValue));
  const otherTiers = (Object.keys(activeTiers) as GeoTierKey[]).filter((key) => key !== tier);
  const remaining = Math.max(0, 100 - clamped);
  const currentOtherTotal = otherTiers.reduce((sum, key) => sum + activeTiers[key], 0);

  const nextTiers = { ...activeTiers, [tier]: clamped };

  if (currentOtherTotal === 0) {
    const equalShare = remaining / otherTiers.length;
    otherTiers.forEach((key) => {
      nextTiers[key] = Number(equalShare.toFixed(2));
    });
  } else {
    otherTiers.forEach((key) => {
      nextTiers[key] = Number(((activeTiers[key] / currentOtherTotal) * remaining).toFixed(2));
    });
  }

  const sum = Object.values(nextTiers).reduce((acc, value) => acc + value, 0);
  const drift = Number((100 - sum).toFixed(2));
  if (Math.abs(drift) > 0) {
    const repairKey = otherTiers[0] ?? tier;
    nextTiers[repairKey] = Number((nextTiers[repairKey] + drift).toFixed(2));
  }

  return nextTiers;
}

/**
 * Moves one channel to `percentage`; the difference is taken from (or given to) the other
 * active, unlocked, variable channels in proportion to their share.
 */
export function reallocateChannel(
  channels: ChannelData[],
  channelId: string,
  percentage: number
): ChannelData[] {
  const targetChannel = channels.find((ch) => ch.id === channelId);
  if (!targetChannel) return channels;

  const oldPercentage = targetChannel.allocationPct;
  const newPercentage = Math.max(0, Math.min(100, percentage));
  const delta = newPercentage - oldPercentage;

  // Only active, unlocked, variable channels absorb the change: inactive channels are out
  // of the plan and fixed-fee spend comes from their price, not the percentage.
  const absorbs = (ch: ChannelData) =>
    ch.id !== channelId && !ch.locked && ch.isActive !== false && !isFixedCostChannel(ch);
  const availableChannels = channels.filter(absorbs);
  const availableTotal = availableChannels.reduce((sum, ch) => sum + ch.allocationPct, 0);

  if (delta > 0 && availableTotal <= 0) return channels;

  // Cap growth so proportional reductions can never push others below 0.
  const cappedDelta = delta > 0 ? Math.min(delta, availableTotal) : delta;
  const finalTargetPercentage = oldPercentage + cappedDelta;

  return channels.map((ch) => {
    if (ch.id === channelId) {
      return { ...ch, allocationPct: Math.max(0, finalTargetPercentage) };
    }
    if (!absorbs(ch)) return ch;
    if (availableTotal <= 0) return ch;

    const weight = ch.allocationPct / availableTotal;
    const adjustedPercentage = ch.allocationPct - cappedDelta * weight;
    return { ...ch, allocationPct: Math.max(0, adjustedPercentage) };
  });
}

export function setChannelAllocations(
  channels: ChannelData[],
  allocations: Record<string, number>
): ChannelData[] {
  return channels.map((ch) =>
    allocations[ch.id] !== undefined
      ? { ...ch, allocationPct: Math.max(0, Math.min(100, allocations[ch.id])) }
      : ch
  );
}

export function updateChannelConfigField(
  channels: ChannelData[],
  channelId: string,
  field: keyof ChannelTypeConfig | 'baselineMetrics',
  value: unknown
): ChannelData[] {
  return channels.map((ch) => {
    if (ch.id !== channelId) return ch;

    if (field === 'baselineMetrics') {
      const baselineUpdates =
        typeof value === 'object' && value !== null
          ? (value as Partial<ChannelTypeConfig['baselineMetrics']>)
          : {};

      return {
        ...ch,
        typeConfig: {
          ...ch.typeConfig,
          baselineMetrics: { ...ch.typeConfig.baselineMetrics, ...baselineUpdates },
        },
      };
    }

    return { ...ch, typeConfig: { ...ch.typeConfig, [field]: value } };
  });
}

/** A new manual channel with auto-sensed family and buying model (name is sanitised). */
export function buildNewChannel(
  channelData: Partial<ChannelData> & { name: string; category: ChannelCategory }
): ChannelData {
  // Defensively sanitize channel name to prevent XSS
  const sanitizedName = sanitizeChannelName(channelData.name) ?? 'Unnamed Channel';
  const family = channelData.family ?? inferChannelFamily(sanitizedName);
  const likelyModel = getLikelyModel(channelData.category);
  const buyingModel = channelData.buyingModel ?? likelyModel;

  return {
    id: crypto.randomUUID(),
    name: sanitizedName,
    category: channelData.category,
    allocationPct: 5,
    family,
    buyingModel,
    typeConfig: channelData.typeConfig ?? {
      family,
      buyingModel,
      price: 5,
      baselineMetrics: {
        ctr: 1,
        conversionRate: 2.5,
        saturationCeiling: 50000, // Default for new manual channels
      },
    },
    tier: likelyModel === 'RETAINER' || likelyModel === 'FLAT_FEE' ? 'fixed' : 'scalable',
    maxSpendLimit: 0,
    locked: false,
    isActive: true,
  };
}

/**
 * Translates a channel's price into a new buying model from its current economics, so a
 * €6 CPM doesn't silently become a €6 CPA.
 */
export function translatePriceForModel(
  current: ChannelWithMetrics | undefined,
  buyingModel: BuyingModel
): number {
  const m = current?.metrics;
  if (!current || current.buyingModel === buyingModel) return current?.typeConfig.price ?? 0;
  switch (buyingModel) {
    case 'CPM':
      return m && m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 5;
    case 'CPC':
      return m && m.clicks > 0 ? m.spend / m.clicks : 1;
    case 'CPA':
    case 'HYBRID':
      return m && m.conversions > 0 ? m.spend / m.conversions : 50;
    case 'FLAT_FEE':
    case 'RETAINER':
      return m && m.spend > 0 ? m.spend : 1000;
    case 'REV_SHARE':
      return 25;
    default:
      return current.typeConfig.price;
  }
}

export function applyChannelType(
  channels: ChannelData[],
  channelId: string,
  family: ChannelFamily,
  buyingModel: BuyingModel,
  price: number
): ChannelData[] {
  const fixed = buyingModel === 'FLAT_FEE' || buyingModel === 'RETAINER';
  return channels.map((ch) =>
    ch.id === channelId
      ? {
          ...ch,
          family,
          buyingModel,
          tier: fixed ? 'fixed' : ch.tier === 'fixed' ? 'scalable' : ch.tier,
          typeConfig: {
            ...ch.typeConfig,
            family,
            buyingModel,
            price: Math.round(price * 100) / 100,
            ...(buyingModel === 'REV_SHARE' || buyingModel === 'HYBRID'
              ? { secondaryPrice: ch.typeConfig.secondaryPrice || 25 }
              : {}),
          },
        }
      : ch
  );
}

/** Skip undefined/NaN so a partial update can never wipe a default (e.g. revenue-model rates). */
export function cleanMultiplierUpdates(updates: Partial<GlobalMultipliers>): Partial<GlobalMultipliers> {
  return Object.fromEntries(
    Object.entries(updates).filter(
      ([, v]) => v !== undefined && !(typeof v === 'number' && !Number.isFinite(v))
    )
  ) as Partial<GlobalMultipliers>;
}

export function buildPreset(
  state: Pick<
    MediaPlanData,
    'totalBudget' | 'channels' | 'globalMultipliers' | 'activeTiers' | 'activeGeos' | 'geoOverrides' | 'observedLtv'
  >,
  name: string
): Preset {
  return {
    name,
    totalBudget: state.totalBudget,
    channels: JSON.parse(JSON.stringify(state.channels)),
    globalMultipliers: { ...state.globalMultipliers },
    activeTiers: { ...state.activeTiers },
    activeGeos: [...state.activeGeos],
    geoOverrides: JSON.parse(JSON.stringify(state.geoOverrides)),
    observedLtv: { ...state.observedLtv },
  };
}

export function stateFromPreset(preset: Preset) {
  return {
    totalBudget: preset.totalBudget,
    channels: JSON.parse(JSON.stringify(preset.channels)) as ChannelData[],
    globalMultipliers: { ...DEFAULT_MULTIPLIERS, ...preset.globalMultipliers },
    activeTiers: { ...TIER_DEFAULTS, ...(preset.activeTiers ?? {}) },
    activeGeos: [...(preset.activeGeos ?? [])],
    geoOverrides: JSON.parse(JSON.stringify(preset.geoOverrides ?? {})),
    observedLtv: { m1: null, m3: null, m6: null, ...(preset.observedLtv ?? {}) },
  };
}

/** The zero-budget channel set "Reset to Zero" starts from. */
export function createResetChannels(): ChannelData[] {
  const DEFAULT_CHANNELS_DATA = [
    {
      id: '1',
      name: 'Paid Search',
      category: 'Paid Search',
      buyingModel: 'CPC',
      baselineMetrics: { conversionRate: 3.5, ctr: 2.0 },
    },
    {
      id: '2',
      name: 'Facebook Ads',
      category: 'Paid Social',
      buyingModel: 'CPM',
      baselineMetrics: { ctr: 1.2, conversionRate: 1.5 },
    },
    {
      id: '3',
      name: 'Affiliates',
      category: 'Affiliate',
      buyingModel: 'CPA',
      baselineMetrics: { conversionRate: 5.0 },
    },
    {
      id: '4',
      name: 'Display / Programmatic',
      category: 'Display/Programmatic',
      buyingModel: 'CPM',
      baselineMetrics: { ctr: 0.8, conversionRate: 0.5 },
    },
    {
      id: '5',
      name: 'SEO Content',
      category: 'SEO/Content',
      buyingModel: 'FLAT_FEE',
      baselineMetrics: { trafficPerUnit: 5000, conversionRate: 1.8 },
    },
  ];

  return DEFAULT_CHANNELS_DATA.map((d) => {
    const family = inferChannelFamily(d.name);
    const buyingModel = d.buyingModel as BuyingModel;
    const tier: ChannelData['tier'] =
      buyingModel === 'RETAINER' || buyingModel === 'FLAT_FEE' ? 'fixed' : 'scalable';

    return {
      id: d.id,
      name: d.name,
      category: d.category as ChannelCategory,
      allocationPct: 0,
      family,
      buyingModel,
      typeConfig: {
        family,
        buyingModel,
        price: 0,
        baselineMetrics: d.baselineMetrics,
        secondaryPrice: 0,
        saturationCeiling: 50000,
      },
      tier,
      maxSpendLimit: 0,
      locked: false,
      isActive: true,
    };
  });
}

/** Re-weights the seeded channels by category multiplier, normalised to 100%. */
export function applyCategoryMultipliersToChannels(
  channels: ChannelData[],
  multipliers: Record<string, number>
): ChannelData[] {
  const baseTotalSpend = BASE_CHANNELS_DATA.reduce((sum, ch) => sum + ch.baseSpend, 0);

  const newAllocations = channels.map((ch) => {
    const base = BASE_CHANNELS_DATA.find((b) => b.id === ch.id);
    if (!base) return { id: ch.id, raw: ch.allocationPct };

    const mult = multipliers[base.category] ?? 1.0;
    const baseShare = (base.baseSpend / baseTotalSpend) * 100;
    return { id: ch.id, raw: baseShare * mult };
  });

  const totalRaw = newAllocations.reduce((sum, item) => sum + item.raw, 0);
  const factor = totalRaw > 0 ? 100 / totalRaw : 1;

  return channels.map((ch) => {
    const newAlloc = newAllocations.find((n) => n.id === ch.id);
    return { ...ch, allocationPct: newAlloc ? newAlloc.raw * factor : ch.allocationPct };
  });
}
