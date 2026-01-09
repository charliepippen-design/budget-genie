
import { z } from 'zod';

// Basic Types
const ChannelCategorySchema = z.enum([
    'Paid Search', 'Paid Social', 'Display/Programmatic', 'Affiliate',
    'SEO/Content', 'Offline/TV', 'Email/SMS', 'Other'
]);

const BuyingModelSchema = z.enum([
    'CPM', 'CPC', 'CPA', 'REV_SHARE', 'HYBRID', 'FLAT_FEE', 'RETAINER'
]);

const ChannelFamilySchema = z.enum([
    'paid_media', 'affiliate', 'influencer', 'seo_content', 'pr_brand', 'email_crm'
]);

const BaselineMetricsSchema = z.object({
    ctr: z.number().optional(),
    conversionRate: z.number().optional(),
    aov: z.number().optional(),
    trafficPerUnit: z.number().optional(),
});

const ChannelTypeConfigSchema = z.object({
    family: ChannelFamilySchema,
    buyingModel: BuyingModelSchema,
    price: z.number(),
    secondaryPrice: z.number().optional(),
    baselineMetrics: BaselineMetricsSchema,
});

// Media Plan Store Schemas
export const ChannelDataSchema = z.object({
    id: z.string(),
    name: z.string(),
    category: ChannelCategorySchema,
    allocationPct: z.number(),

    // New Polymorphic fields
    family: ChannelFamilySchema,
    buyingModel: BuyingModelSchema,
    typeConfig: ChannelTypeConfigSchema,

    // UI State
    locked: z.boolean(),
    warnings: z.array(z.string()).optional(),
});

export const GlobalMultipliersSchema = z.object({
    spendMultiplier: z.number(),
    defaultCpmOverride: z.number().nullable(),
    ctrBump: z.number(),
    cpaTarget: z.number().nullable(),
    roasTarget: z.number().nullable(),
    playerValue: z.number(),
});

export const MediaPlanStateSchema = z.object({
    totalBudget: z.number().min(0),
    channels: z.array(ChannelDataSchema),
    globalMultipliers: GlobalMultipliersSchema,
});

// Multi Month Store Schemas
export const MonthDataSchema = z.object({
    id: z.string(),
    label: z.string(),
    monthIndex: z.number(),
    isSoftLaunch: z.boolean(),
    budget: z.number(),
    // Allow for loose validation on calculated fields as they are derived
}).passthrough();

export const MultiMonthStateSchema = z.object({
    planningMonths: z.number().min(1).max(60),
    startMonth: z.string(), // YYYY-MM
    includeSoftLaunch: z.boolean(),
    progressionPattern: z.string(),
    months: z.array(MonthDataSchema),
}).passthrough();

// Main Project Schema
export const ProjectSchema = z.object({
    mediaPlanState: MediaPlanStateSchema,
    multiMonthState: MultiMonthStateSchema,
    updatedAt: z.string().datetime().optional(),
});
