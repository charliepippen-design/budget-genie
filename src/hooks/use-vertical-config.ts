import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import type { Vertical } from '@/lib/vertical-presets';

export interface VerticalConfig {
  // Identity
  vertical: Vertical | null;
  label: string;
  emoji: string;

  // Terminology — what to call things in this vertical
  terms: {
    conversion: string; // 'FTD' | 'Order' | 'Trial Signup' | 'Lead'
    conversionPlural: string; // 'FTDs' | 'Orders' | 'Trial Signups' | 'Leads'
    customerValue: string; // 'Player Value' | 'Customer LTV' | 'Contract Value' | 'Lead Value'
    costPerConversion: string; // 'Cost per FTD' | 'Cost per Order' | etc
    revenueMetric: string; // 'NGR' | 'Revenue' | 'MRR' | 'Pipeline Value'
    returnMetric: string; // 'ROAS' | 'ROAS' | 'Payback Period' | 'Cost per Lead'
  };

  // Dashboard panels — which specialised panels to show/hide
  panels: {
    showGeoMatrix: boolean; // iGaming geo-arbitrage tier matrix
    showFunnelView: boolean; // eCommerce impression→purchase funnel
    showMrrProjection: boolean; // SaaS MRR/ARR growth projection
    showPipelineView: boolean; // Lead Gen leads→close pipeline
    showPlayerValue: boolean; // iGaming-specific LTV input label
    showChurnRate: boolean; // relevant to iGaming + SaaS
    showAov: boolean; // Average Order Value — eCommerce
    showTrialConversion: boolean; // SaaS freemium/trial rate
  };

  // Genie persona
  genie: {
    persona: string; // system prompt persona description
    greeting: string; // how the Genie introduces itself on first open
    quickActions: Array<{
      label: string;
      subLabel: string;
      prompt: string;
    }>;
  };

  // Report page labels
  report: {
    heroTitle: string; // "Your Plan at a Glance"
    customerCountLabel: string; // "Projected New Players" | "Projected Orders"
    revenueLabel: string; // "Projected Revenue" | "Projected NGR"
    paybackLabel: string; // "Estimated Payback" | "CAC Payback"
    cohortValueLabel: string; // "Player Cohort Value" | "Customer Cohort Value"
    primaryKpi: string; // the single most important KPI for this vertical
  };

  // Colour accent — subtle per-vertical tinting
  accent: {
    primary: string; // Tailwind class e.g. 'indigo' | 'violet' | 'cyan' | 'emerald'
    hex: string; // for recharts which needs hex
  };
}

const VERTICAL_CONFIGS: Record<Vertical, VerticalConfig> = {
  igaming: {
    vertical: 'igaming',
    label: 'iGaming / Betting',
    emoji: '🎰',
    terms: {
      conversion: 'FTD',
      conversionPlural: 'FTDs',
      customerValue: 'Player Value',
      costPerConversion: 'Cost per FTD',
      revenueMetric: 'Projected NGR',
      returnMetric: 'ROAS',
    },
    panels: {
      showGeoMatrix: true,
      showFunnelView: false,
      showMrrProjection: false,
      showPipelineView: false,
      showPlayerValue: true,
      showChurnRate: true,
      showAov: false,
      showTrialConversion: false,
    },
    genie: {
      persona: `You are The Oracle, a senior iGaming media budget analyst.
Prioritize LTV:CPA arbitrage over vanity spend metrics.
Speak like a CFO, not a copywriter. Use iGaming terminology naturally:
FTDs, NGR, player value, geo-arbitrage, affiliate CPA, ROAS.
Be concise — 2-4 sentences max. Never execute tools without user confirmation.`,
      greeting: 'Oracle online. Show me the numbers.',
      quickActions: [
        {
          label: 'Cut Waste',
          subLabel: 'Find inefficiencies',
          prompt: 'Identify wasted spend and inefficient channels. Propose one action card.',
        },
        {
          label: 'Scale Winners',
          subLabel: 'High FTD potential',
          prompt: 'Identify high LTV:CPA channels to scale. Propose one action card.',
        },
        {
          label: 'Plan Summary',
          subLabel: 'Executive overview',
          prompt: 'Give me an executive summary with one actionable proposal.',
        },
        {
          label: 'Geo Arbitrage',
          subLabel: 'Market opportunities',
          prompt:
            'Which geo markets offer the best LTV:CPA arbitrage opportunity right now? Propose one geo mix adjustment.',
        },
      ],
    },
    report: {
      heroTitle: 'Campaign Performance Forecast',
      customerCountLabel: 'Projected FTDs',
      revenueLabel: 'Projected NGR',
      paybackLabel: 'Player Payback Period',
      cohortValueLabel: 'Player Cohort Value',
      primaryKpi: 'LTV : CAC Ratio',
    },
    accent: { primary: 'indigo', hex: '#6366f1' },
  },

  ecommerce: {
    vertical: 'ecommerce',
    label: 'eCommerce',
    emoji: '🛍️',
    terms: {
      conversion: 'Order',
      conversionPlural: 'Orders',
      customerValue: 'Customer LTV',
      costPerConversion: 'Cost per Order',
      revenueMetric: 'Projected Revenue',
      returnMetric: 'ROAS',
    },
    panels: {
      showGeoMatrix: false,
      showFunnelView: true,
      showMrrProjection: false,
      showPipelineView: false,
      showPlayerValue: false,
      showChurnRate: false,
      showAov: true,
      showTrialConversion: false,
    },
    genie: {
      persona: `You are a senior eCommerce growth analyst.
Focus on ROAS, cost per order, AOV, and repeat purchase rate.
Speak in eCommerce terms: conversion rate, cart abandonment, AOV, ROAS, CAC.
Be concise — 2-4 sentences max. Never execute tools without user confirmation.`,
      greeting: 'Ready to grow your store. What do you want to optimise?',
      quickActions: [
        {
          label: 'Cut Waste',
          subLabel: 'Low ROAS channels',
          prompt: 'Identify channels with below-target ROAS. Propose one action card.',
        },
        {
          label: 'Scale Revenue',
          subLabel: 'High ROAS potential',
          prompt: 'Which channels should I scale to maximise revenue? Propose one action.',
        },
        {
          label: 'Plan Summary',
          subLabel: 'Executive overview',
          prompt: 'Give me an executive summary of this eCommerce plan.',
        },
        {
          label: 'AOV Analysis',
          subLabel: 'Order value insights',
          prompt: 'How does my average order value affect the efficiency of each channel?',
        },
      ],
    },
    report: {
      heroTitle: 'eCommerce Growth Forecast',
      customerCountLabel: 'Projected Orders',
      revenueLabel: 'Projected Revenue',
      paybackLabel: 'CAC Payback Period',
      cohortValueLabel: 'Customer Cohort Value',
      primaryKpi: 'Return on Ad Spend',
    },
    accent: { primary: 'violet', hex: '#8b5cf6' },
  },

  saas: {
    vertical: 'saas',
    label: 'SaaS / Software',
    emoji: '💻',
    terms: {
      conversion: 'Trial Signup',
      conversionPlural: 'Trial Signups',
      customerValue: 'Contract Value (ACV)',
      costPerConversion: 'Cost per Trial',
      revenueMetric: 'Projected MRR',
      returnMetric: 'CAC Payback',
    },
    panels: {
      showGeoMatrix: false,
      showFunnelView: false,
      showMrrProjection: true,
      showPipelineView: false,
      showPlayerValue: false,
      showChurnRate: true,
      showAov: false,
      showTrialConversion: true,
    },
    genie: {
      persona: `You are a senior SaaS growth strategist.
Focus on CAC payback, MRR impact, trial-to-paid conversion, and churn.
Speak in SaaS terms: MRR, ARR, CAC, LTV, churn rate, trial conversion.
Be concise — 2-4 sentences max. Never execute tools without user confirmation.`,
      greeting: 'SaaS growth mode. What metric are we moving today?',
      quickActions: [
        {
          label: 'Reduce CAC',
          subLabel: 'Lower acquisition cost',
          prompt: 'Which channels are driving the highest CAC? Propose one reallocation.',
        },
        {
          label: 'Scale MRR',
          subLabel: 'Revenue growth',
          prompt: 'Which channels should I scale to maximise new MRR? Propose one action.',
        },
        {
          label: 'Plan Summary',
          subLabel: 'Executive overview',
          prompt: 'Give me an executive summary of this SaaS growth plan.',
        },
        {
          label: 'Churn Impact',
          subLabel: 'Retention analysis',
          prompt: 'How does my churn rate affect the LTV projections across channels?',
        },
      ],
    },
    report: {
      heroTitle: 'SaaS Growth Forecast',
      customerCountLabel: 'Projected Trial Signups',
      revenueLabel: 'Projected MRR Impact',
      paybackLabel: 'CAC Payback Period',
      cohortValueLabel: 'Cohort Contract Value',
      primaryKpi: 'CAC Payback Period',
    },
    accent: { primary: 'cyan', hex: '#06b6d4' },
  },

  lead_gen: {
    vertical: 'lead_gen',
    label: 'Lead Generation',
    emoji: '🎯',
    terms: {
      conversion: 'Lead',
      conversionPlural: 'Leads',
      customerValue: 'Lead Value',
      costPerConversion: 'Cost per Lead',
      revenueMetric: 'Pipeline Value',
      returnMetric: 'Cost per Lead',
    },
    panels: {
      showGeoMatrix: false,
      showFunnelView: false,
      showMrrProjection: false,
      showPipelineView: true,
      showPlayerValue: false,
      showChurnRate: false,
      showAov: false,
      showTrialConversion: false,
    },
    genie: {
      persona: `You are a senior lead generation strategist.
Focus on cost per lead, lead quality, pipeline value, and close rates.
Speak in lead gen terms: CPL, MQL, SQL, pipeline, conversion rate, close rate.
Be concise — 2-4 sentences max. Never execute tools without user confirmation.`,
      greeting: 'Pipeline ready. What are we optimising today?',
      quickActions: [
        {
          label: 'Reduce CPL',
          subLabel: 'Lower cost per lead',
          prompt: 'Which channels have the highest cost per lead? Propose one reallocation.',
        },
        {
          label: 'Scale Pipeline',
          subLabel: 'More qualified leads',
          prompt: 'Which channels should I scale to maximise pipeline value? Propose one action.',
        },
        {
          label: 'Plan Summary',
          subLabel: 'Executive overview',
          prompt: 'Give me an executive summary of this lead generation plan.',
        },
        {
          label: 'Quality Score',
          subLabel: 'Lead quality analysis',
          prompt: 'How can I improve lead quality across my current channel mix?',
        },
      ],
    },
    report: {
      heroTitle: 'Lead Generation Forecast',
      customerCountLabel: 'Projected Leads',
      revenueLabel: 'Projected Pipeline Value',
      paybackLabel: 'Pipeline Payback',
      cohortValueLabel: 'Lead Cohort Value',
      primaryKpi: 'Cost per Lead',
    },
    accent: { primary: 'emerald', hex: '#10b981' },
  },

  other: {
    vertical: 'other',
    label: 'General Marketing',
    emoji: '📊',
    terms: {
      conversion: 'Conversion',
      conversionPlural: 'Conversions',
      customerValue: 'Customer Value',
      costPerConversion: 'Cost per Conversion',
      revenueMetric: 'Projected Revenue',
      returnMetric: 'ROAS',
    },
    panels: {
      showGeoMatrix: false,
      showFunnelView: false,
      showMrrProjection: false,
      showPipelineView: false,
      showPlayerValue: true,
      showChurnRate: false,
      showAov: false,
      showTrialConversion: false,
    },
    genie: {
      persona: `You are a senior digital marketing analyst.
Focus on ROAS, cost per conversion, and budget efficiency.
Be concise — 2-4 sentences max. Never execute tools without user confirmation.`,
      greeting: 'Ready to optimise your marketing plan. What do you need?',
      quickActions: [
        {
          label: 'Cut Waste',
          subLabel: 'Find inefficiencies',
          prompt: 'Identify wasted spend and inefficient channels. Propose one action.',
        },
        {
          label: 'Scale Winners',
          subLabel: 'High ROAS channels',
          prompt: 'Which channels should I scale? Propose one action card.',
        },
        {
          label: 'Plan Summary',
          subLabel: 'Executive overview',
          prompt: 'Give me an executive summary with one actionable proposal.',
        },
        {
          label: 'Suggest Strategy',
          subLabel: 'AI recommendation',
          prompt: 'Based on my channel mix, which distribution strategy should I apply?',
        },
      ],
    },
    report: {
      heroTitle: 'Marketing Performance Forecast',
      customerCountLabel: 'Projected Conversions',
      revenueLabel: 'Projected Revenue',
      paybackLabel: 'Estimated Payback',
      cohortValueLabel: 'Customer Cohort Value',
      primaryKpi: 'Return on Ad Spend',
    },
    accent: { primary: 'indigo', hex: '#6366f1' },
  },
};

const DEFAULT_CONFIG: VerticalConfig = VERTICAL_CONFIGS.other;

export function useVerticalConfig(): VerticalConfig {
  const vertical = useMediaPlanStore((s) => s.onboardingVertical);
  if (!vertical || !VERTICAL_CONFIGS[vertical]) return DEFAULT_CONFIG;
  return VERTICAL_CONFIGS[vertical];
}
