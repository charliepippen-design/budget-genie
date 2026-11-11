import { FlaskConical, Shield, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import type { WizardAnswers } from '@/lib/onboarding-ai';

export type OnboardingGoal = WizardAnswers['goal'];

/** The four goals offered in onboarding (quick start and guided wizard). */
export const GOAL_OPTIONS: Array<{
  key: OnboardingGoal;
  title: string;
  short: string;
  subtitle: string;
  Icon: LucideIcon;
}> = [
  {
    key: 'acquire_volume',
    title: 'Acquire as many new customers as possible',
    short: 'More new customers',
    subtitle: 'Focus on reaching more people and growing quickly.',
    Icon: Users,
  },
  {
    key: 'maximize_revenue',
    title: 'Maximise revenue per customer',
    short: 'More revenue per customer',
    subtitle: 'Prioritise higher value outcomes over raw volume.',
    Icon: TrendingUp,
  },
  {
    key: 'test_channels',
    title: 'Test new channels and find what works',
    short: 'Test new channels',
    subtitle: 'Spread budget across options to learn faster.',
    Icon: FlaskConical,
  },
  {
    key: 'maintain',
    title: 'Maintain current performance, minimise risk',
    short: 'Hold steady, low risk',
    subtitle: 'Protect consistency and avoid major swings.',
    Icon: Shield,
  },
];
