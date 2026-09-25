import type { ChannelCategory } from '@/lib/mediaplan-data';
import type { BuyingModel, ChannelFamily } from '@/types/channel';

export type IndustryId = 'igaming' | 'forex' | 'fintech' | 'ecommerce' | 'saas';

export type Objective = 'acquisition' | 'retention' | 'branding';

export type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

/** How the generic funnel (click -> lead -> conversion -> value) is named in this industry. */
export interface FunnelLabels {
  lead: string;            // e.g. "Registration", "Trial", "Add to cart"
  leadShort: string;       // e.g. "Reg", "Trial"
  conversion: string;      // e.g. "First Deposit (FTD)", "Purchase"
  conversionShort: string; // e.g. "FTD", "Sale"
  value: string;           // e.g. "NGR", "Revenue", "LTV"
  costPerLead: string;     // e.g. "CPL", "Cost per Trial"
  costPerConversion: string; // e.g. "CPA (FTD)", "CAC"
}

/**
 * A channel the planner can pick for an industry.
 * `price` meaning depends on buyingModel: CPM, CPC, CPA per conversion, or monthly fee (FLAT_FEE/RETAINER).
 */
export interface ChannelTemplate {
  key: string;
  name: string;
  category: ChannelCategory;
  family: ChannelFamily;
  buyingModel: BuyingModel;
  price: number;
  secondaryPrice?: number;   // RevShare % for REV_SHARE / HYBRID
  ctr: number;               // %
  clickToLead: number;       // %
  leadToConversion: number;  // %
  ltv: number;               // value per conversion
  trafficPerUnit?: number;   // monthly clicks for fixed-fee channels
  saturationCeiling: number; // monthly spend where returns flatten
  fit: Record<Objective, number>; // 0..1 suitability per objective
  baseWeight: number;        // relative share in a balanced plan
  minBudget?: number;        // skip below this monthly budget unless explicitly requested
  tags?: ChannelTag[];
  note?: string;             // one-line why/when, shown to user and AI
}

export type ChannelTag =
  | 'restricted'   // platform policy / licence needed (e.g. Google Ads for gambling)
  | 'proven'       // predictable, low-variance
  | 'experimental' // high variance, test budgets
  | 'fixed_cost';

export interface IndustryPack {
  id: IndustryId;
  label: string;
  description: string;
  funnel: FunnelLabels;
  defaultLtv: number;
  /** Share of gross value kept after industry deductions (bonus/tax/COGS...). 1 = none. */
  netValueShare: number;
  netValueNote: string;
  benchmarks: { cpl: number; cpa: number; ctr: number; conversionRate: number; source: string };
  complianceNotes: string[];
  channels: ChannelTemplate[];
}
