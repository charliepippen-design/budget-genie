// One source for plan names, displayed prices and features (Pricing page and Settings).
// The amount actually charged is the Stripe price behind STRIPE_PRICE_*_MONTHLY: keep them equal.
// Only list features that exist in the app. Do not add claims about results, SLAs or integrations.

export interface PlanInfo {
  tier: 'free' | 'pro' | 'enterprise';
  name: string;
  priceLabel: string; // per month
  tagline: string;
  features: string[];
}

export type PaidPlanInfo = PlanInfo & { tier: 'pro' | 'enterprise' };

export const FREE_PLAN: PlanInfo = {
  tier: 'free',
  name: 'Free',
  priceLabel: '$0',
  tagline: 'For trying the planner',
  features: ['Budget planner and channel allocation', 'Scenario modeling', 'JSON config export'],
};

export const PAID_PLANS: PaidPlanInfo[] = [
  {
    tier: 'pro',
    name: 'Pro',
    priceLabel: '$19',
    tagline: 'For marketers planning real budgets',
    features: [
      'AI media planner (chat)',
      'All industries and markets',
      'Unlimited plans and scenarios',
      'PDF, Excel, CSV exports',
    ],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    priceLabel: '$39',
    tagline: 'For agencies and multi-brand teams',
    features: ['Everything in Pro', 'Multi-month planning and P&L'],
  },
];
