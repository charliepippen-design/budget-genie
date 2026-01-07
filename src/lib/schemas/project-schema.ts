
import { z } from 'zod';

// Basic Types
const ChannelCategorySchema = z.enum([
    'Paid Search', 'Paid Social', 'Display/Programmatic', 'Affiliate',
    'SEO/Content', 'Offline/TV', 'Email/SMS', 'Other'
]);

const ImpressionModeSchema = z.enum(['CPM', 'FIXED']);

// Media Plan Store Schemas
export const ChannelDataSchema = z.object({
    id: z.string(),
    name: z.string(),
    category: ChannelCategorySchema,
    allocationPct: z.number(),
    // Polymorphic fields (simplified for validation, can be refined)
    family: z.string().optional(),
    buyingModel: z.string().optional(),
    typeConfig: z.any().optional(),

    // Base KPI inputs
    baseCpm: z.number(),
    baseCtr: z.number(),
    baseCr: z.number(),
    baseCpa: z.number().nullable(),
    baseRoas: z.number(),

    // Overrides
    overrideCpm: z.number().nullable(),
    overrideCtr: z.number().nullable(),
    overrideCr: z.number().nullable(),
    overrideCpa: z.number().nullable(),
    overrideRoas: z.number().nullable(),

    impressionMode: ImpressionModeSchema,
    fixedImpressions: z.number(),
    locked: z.boolean(),
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
