// One source for plan names and displayed prices (Pricing page and Settings).
// The amount actually charged is the Stripe price behind STRIPE_PRICE_*_MONTHLY: keep them equal.

export interface PlanInfo {
  tier: 'pro' | 'enterprise';
  name: string;
  priceLabel: string; // per month
  tagline: string;
  features: string[];
}

export const PAID_PLANS: PlanInfo[] = [
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
    features: ['Everything in Pro', 'Multi-month planning and P&L', 'Priority support'],
  },
];
