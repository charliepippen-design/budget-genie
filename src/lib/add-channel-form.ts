import { BuyingModel, ChannelFamily, FAMILY_INFO, getLikelyModel } from '@/types/channel';
import type { ChannelCategory } from '@/lib/mediaplan-data';

const CATEGORY_FAMILY: Record<ChannelCategory, ChannelFamily> = {
  'Paid Search': 'paid_media',
  'Paid Social': 'paid_media',
  'Display/Programmatic': 'paid_media',
  Affiliate: 'affiliate',
  'SEO/Content': 'seo_content',
  'Offline/TV': 'paid_media',
  'Email/SMS': 'email_crm',
  Other: 'paid_media',
};

export function familyForCategory(category: ChannelCategory): ChannelFamily {
  return CATEGORY_FAMILY[category] ?? 'paid_media';
}

/** Buying models valid for a category, derived from FAMILY_INFO. */
export function modelChoicesForCategory(category: ChannelCategory): BuyingModel[] {
  return FAMILY_INFO[familyForCategory(category)].allowedModels;
}

/** Default model for a category; always one of modelChoicesForCategory. */
export function defaultModelForCategory(category: ChannelCategory): BuyingModel {
  const choices = modelChoicesForCategory(category);
  const likely = getLikelyModel(category);
  return choices.includes(likely) ? likely : FAMILY_INFO[familyForCategory(category)].defaultModel;
}

/** Strip characters that cannot be part of a non-negative decimal; keep one separator. */
export function sanitizePriceInput(raw: string): string {
  const cleaned = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

export type PriceParseResult = { value: number; error: null } | { value: null; error: string };

/** Parse the raw price string on submit/blur. */
export function parsePriceInput(raw: string): PriceParseResult {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '.') {
    return { value: null, error: 'Enter a price greater than zero' };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return { value: null, error: 'Price must be greater than zero' };
  }
  return { value, error: null };
}
