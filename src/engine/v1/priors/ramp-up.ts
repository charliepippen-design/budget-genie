// PRIOR: how long a channel takes to reach its full effect after launch, by channel family.
// In month m of the timeline (0 = first month) a channel delivers
//   start + (1 - start) * (1 - exp(-m / monthsToMature))
// of its steady-state conversions for the same spend. All numbers are assumptions, to be
// replaced by the ramp observed on the user's own channels. The timeline is assumed to begin
// when the channels launch; a channel that is already running needs no ramp, which the engine
// cannot know.

import type { ChannelFamily } from '@/types/channel';

export interface RampUpPrior {
  /** Share of the steady-state effect delivered in the first month (0-1). */
  start: number;
  /** Time constant in months: after this long about 63% of the remaining gap has closed. */
  monthsToMature: number;
}

export const RAMP_UP_BY_FAMILY: Record<ChannelFamily, RampUpPrior> = {
  // Auction media delivers from day one.
  paid_media: { start: 1, monthsToMature: 1 },
  // Partners need recruiting and take a few weeks to place links and rank offers.
  affiliate: { start: 0.7, monthsToMature: 1 },
  // Creator deals take a cycle to brief, produce and publish; early posts under-deliver.
  influencer: { start: 0.5, monthsToMature: 1.5 },
  // Content has to be written, indexed and ranked: little in month one, most of it by month six.
  seo_content: { start: 0.25, monthsToMature: 3 },
  // Sponsorship and PR build recall slowly.
  pr_brand: { start: 0.4, monthsToMature: 2.5 },
  // Works on the existing customer base, which is small at launch and fills quickly.
  email_crm: { start: 0.8, monthsToMature: 1 },
};
