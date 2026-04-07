import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import {
  ArrowLeft,
  Cloud,
  CreditCard,
  Database,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { SubscriptionTier, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { UpgradeGatewayModal } from '@/components/settings/UpgradeGatewayModal';
import { cn } from '@/lib/utils';
import { createCheckoutSession } from '@/lib/billing';

const NOWPAYMENTS_CHECKOUT_URL = 'https://nowpayments.io/payment/?iid=4321051348&source=button';
const NOWPAYMENTS_BUTTON_SRC = 'https://nowpayments.io/images/embeds/payment-button-white.svg';
// Keep Stripe integration in code, but disable it in UI for now.
const ENABLE_STRIPE_CHECKOUT = false;
type CheckoutMode = 'card' | 'crypto';

// Zod schema for validating billing pending checkout state
const BillingStateSchema = z.object({
  expectedTier: z.enum(['free', 'pro', 'enterprise']),
  state: z.string().uuid(),
  startedAt: z.number(),
});

// Zod schema for validating projects list from localStorage
const ProjectListForCountSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    mediaPlanState: z.unknown(),
    multiMonthState: z.unknown(),
  })
);

const PRICING_TIERS: Array<{
  key: SubscriptionTier;
  title: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}> = [
  {
    key: 'free',
    title: 'Solo Arbitrage',
    price: '$0',
    cadence: '/month',
    description: 'For solo operators validating channels and baseline acquisition plans.',
    features: [
      'Core budget planner and channel allocation',
      'Up to 10 stored projects',
      'Standard JSON config export',
      'Advanced LTV modeling locked',
      'Geo-Arbitrage matrix locked',
    ],
  },
  {
    key: 'pro',
    title: 'Pro Acquisition',
    price: '$129',
    cadence: '/month',
    description: 'For teams optimizing LTV and GEO-level acquisition economics every week.',
    highlighted: true,
    features: [
      'Advanced LTV Forecast Lab unlocked',
      'Global Geo-Arbitrage token matrix unlocked',
      'Priority optimization and sandbox modeling',
      'Unlimited projects and scenario snapshots',
      'Export analytics and strategy breakdowns',
    ],
  },
  {
    key: 'enterprise',
    title: 'Enterprise Operator',
    price: '$499',
    cadence: '/month',
    description: 'For performance orgs syncing planning decisions across data, BI, and CDP.',
    features: [
      'Everything in Pro Acquisition',
      'Server-Side CDP Exports unlocked',
      'Dedicated model governance controls',
      'Workspace roles and enterprise audit trail',
      'Strategic onboarding and SLA support',
    ],
  },
];

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [metadataTier, setMetadataTier] = useState<SubscriptionTier | null>(null);
  const [billingSyncStatus, setBillingSyncStatus] = useState<
    'idle' | 'waiting' | 'synced' | 'error'
  >('idle');
  const [billingSyncMessage, setBillingSyncMessage] = useState('Not syncing');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isRefreshingBilling, setIsRefreshingBilling] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [selectedUpgradeTier, setSelectedUpgradeTier] = useState<SubscriptionTier>('pro');
  const [upgradeCheckoutMode, setUpgradeCheckoutMode] = useState<CheckoutMode>(
    ENABLE_STRIPE_CHECKOUT ? 'card' : 'crypto'
  );
  const subscriptionTier = useMediaPlanStore((state) => state.subscriptionTier);
  const setSubscriptionTier = useMediaPlanStore((state) => state.setSubscriptionTier);
  const setHasCompletedOnboarding = useMediaPlanStore((state) => state.setHasCompletedOnboarding);
  const pendingCheckoutKey = 'billing_pending_checkout';

  const trackNowPaymentsEvent = useCallback(
    (
      action: 'open' | 'copy_link',
      source: 'settings_card' | 'upgrade_modal',
      tier: SubscriptionTier
    ) => {
      const payload = {
        event: 'nowpayments_checkout',
        action,
        source,
        tier,
        timestamp: Date.now(),
      };

      if (Array.isArray((window as Window & { dataLayer?: unknown[] }).dataLayer)) {
        (window as Window & { dataLayer?: unknown[] }).dataLayer?.push(payload);
      }

      window.dispatchEvent(new CustomEvent('budget-genie:nowpayments', { detail: payload }));
    },
    []
  );

  const copyNowPaymentsLink = useCallback(
    async (source: 'settings_card' | 'upgrade_modal', tier: SubscriptionTier) => {
      try {
        await navigator.clipboard.writeText(NOWPAYMENTS_CHECKOUT_URL);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = NOWPAYMENTS_CHECKOUT_URL;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      trackNowPaymentsEvent('copy_link', source, tier);
      toast.success('NOWPayments link copied to clipboard.');
    },
    [trackNowPaymentsEvent]
  );

  const syncBillingTierFromMetadata = useCallback(async () => {
    const {
      data: { user: refreshedUser },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      setBillingSyncStatus('error');
      setBillingSyncMessage(error.message);
      return null;
    }

    setUser(refreshedUser ?? null);

    const refreshedTier = refreshedUser?.app_metadata?.subscription_tier;
    if (refreshedTier === 'free' || refreshedTier === 'pro' || refreshedTier === 'enterprise') {
      setMetadataTier(refreshedTier);
      setSubscriptionTier(refreshedTier);
      setBillingSyncStatus('synced');
      setBillingSyncMessage(`Metadata sync healthy (${refreshedTier.toUpperCase()})`);
      setLastSyncedAt(new Date().toISOString());
      return refreshedTier;
    }

    setMetadataTier(null);
    setBillingSyncStatus('error');
    setBillingSyncMessage('No subscription_tier found in auth metadata');
    return null;
  }, [setSubscriptionTier]);

  useEffect(() => {
    async function fetchData() {
      try {
        await syncBillingTierFromMetadata();

        const { count, error } = await supabase
          .from('projects')
          .select('*', { count: 'exact', head: true });

        if (!error) {
          setProjectCount(count || 0);
        } else {
          const stored = localStorage.getItem('igaming_projects');
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              const validated = ProjectListForCountSchema.safeParse(parsed);
              if (validated.success) {
                setProjectCount(validated.data.length);
              } else {
                console.warn('Invalid projects list schema in localStorage:', validated.error);
                setProjectCount(0);
              }
            } catch (e) {
              console.error('Failed to parse projects from localStorage for count', e);
              setProjectCount(0);
            }
          } else {
            setProjectCount(0);
          }
        }
      } catch (e) {
        console.warn('Failed to fetch settings data', e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [setSubscriptionTier, syncBillingTierFromMetadata]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const checkoutStatus = params.get('checkout');

    if (!checkoutStatus) {
      return;
    }

    const processReturn = async () => {
      if (checkoutStatus === 'cancelled') {
        toast.info('Checkout canceled. Your plan remains unchanged.');
        navigate('/settings', { replace: true });
        return;
      }

      if (checkoutStatus !== 'success') {
        navigate('/settings', { replace: true });
        return;
      }

      const pendingRaw = localStorage.getItem(pendingCheckoutKey);

      if (!pendingRaw) {
        setBillingSyncStatus('error');
        setBillingSyncMessage('Missing pending checkout state');
        toast.error('Could not verify checkout state. Please refresh billing status manually.');
        navigate('/settings', { replace: true });
        return;
      }

      let pending: { expectedTier: SubscriptionTier; state: string; startedAt: number };
      try {
        const parsed = JSON.parse(pendingRaw);
        const validated = BillingStateSchema.safeParse(parsed);
        if (!validated.success) {
          throw new Error(`Billing state validation failed: ${validated.error.message}`);
        }
        pending = validated.data;
      } catch (e) {
        localStorage.removeItem(pendingCheckoutKey);
        setBillingSyncStatus('error');
        setBillingSyncMessage('Corrupted pending checkout state');
        toast.error('Invalid checkout state detected.');
        console.warn('Billing state validation error:', e);
        navigate('/settings', { replace: true });
        return;
      }

      // Check if billing state has expired (30 minute window)
      const thirtyMinutesMs = 30 * 60 * 1000;
      if (Date.now() - pending.startedAt > thirtyMinutesMs) {
        localStorage.removeItem(pendingCheckoutKey);
        setBillingSyncStatus('error');
        setBillingSyncMessage('Billing state expired');
        toast.error('Checkout verification expired. Please start a new checkout.');
        navigate('/settings', { replace: true });
        return;
      }

      setBillingSyncStatus('waiting');
      setBillingSyncMessage(
        `Waiting for Stripe webhook to promote ${pending.expectedTier} tier...`
      );

      let synced = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const refreshedTier = await syncBillingTierFromMetadata();

        if (refreshedTier === pending.expectedTier) {
          synced = true;
          setBillingSyncStatus('synced');
          setBillingSyncMessage(`Tier synced from webhook: ${refreshedTier.toUpperCase()}`);
          toast.success(`Checkout confirmed. ${refreshedTier.toUpperCase()} is now active.`);
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!synced) {
        setBillingSyncStatus('error');
        setBillingSyncMessage('Webhook sync pending; metadata not updated yet');
        toast.warning(
          'Checkout completed, but tier sync is still pending. Please refresh shortly.'
        );
      }

      // Delete billing state immediately after validation (single-use)
      localStorage.removeItem(pendingCheckoutKey);
      navigate('/settings', { replace: true });
    };

    void processReturn();
  }, [location.search, navigate, setSubscriptionTier, syncBillingTierFromMetadata]);

  const handleResetPassword = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) {
      toast.error('Failed to send reset email: ' + error.message);
    } else {
      toast.success('Password reset email sent!');
    }
  };

  const openUpgrade = (
    tier: SubscriptionTier,
    checkoutMode: CheckoutMode = ENABLE_STRIPE_CHECKOUT ? 'card' : 'crypto'
  ) => {
    setSelectedUpgradeTier(tier === 'free' ? 'pro' : tier);
    setUpgradeCheckoutMode(ENABLE_STRIPE_CHECKOUT ? checkoutMode : 'crypto');
    setIsUpgradeModalOpen(true);
  };

  const handleTierCheckout = (tier: SubscriptionTier) => {
    if (tier === 'free') {
      setSubscriptionTier('free');
      toast.success('Switched to Solo Arbitrage tier.');
      setIsUpgradeModalOpen(false);
      return;
    }

    setSubscriptionTier(tier);
    toast.success(
      tier === 'enterprise'
        ? 'Enterprise Operator activated (demo checkout).'
        : 'Pro Acquisition activated (demo checkout).'
    );
    setIsUpgradeModalOpen(false);
  };

  const handleStripeCheckout = async (tier: SubscriptionTier) => {
    if (tier === 'free') {
      handleTierCheckout('free');
      return;
    }

    try {
      setIsProcessingCheckout(true);

      const billingState = crypto.randomUUID();

      localStorage.setItem(
        pendingCheckoutKey,
        JSON.stringify({ expectedTier: tier, state: billingState, startedAt: Date.now() })
      );

      const checkout = await createCheckoutSession({
        tier,
        paymentMethod: 'card',
        successUrl: `${window.location.origin}/settings?checkout=success`,
        cancelUrl: `${window.location.origin}/settings?checkout=cancelled`,
      });

      if (!checkout.url) {
        throw new Error('Checkout URL not returned by billing gateway.');
      }

      window.location.href = checkout.url;
    } catch (error) {
      localStorage.removeItem(pendingCheckoutKey);
      toast.error(error instanceof Error ? error.message : 'Failed to start checkout.');
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  const handleCryptoCheckout = async (tier: SubscriptionTier) => {
    if (tier === 'free') {
      handleTierCheckout('free');
      return;
    }

    trackNowPaymentsEvent('open', 'upgrade_modal', tier);
    window.open(NOWPAYMENTS_CHECKOUT_URL, '_blank', 'noopener,noreferrer');
    toast.success('Opening NOWPayments checkout in a new tab.');
  };

  const handleRefreshBillingStatus = async () => {
    try {
      setIsRefreshingBilling(true);
      setBillingSyncStatus('waiting');
      setBillingSyncMessage('Refreshing billing metadata...');
      const refreshed = await syncBillingTierFromMetadata();

      if (refreshed) {
        toast.success(`Billing status refreshed: ${refreshed.toUpperCase()}`);
      } else {
        toast.warning('Billing refresh completed, but no tier metadata was found.');
      }
    } catch (error) {
      setBillingSyncStatus('error');
      setBillingSyncMessage('Manual refresh failed');
      toast.error(error instanceof Error ? error.message : 'Failed to refresh billing status.');
    } finally {
      setIsRefreshingBilling(false);
    }
  };

  const handleRestartOnboarding = () => {
    setHasCompletedOnboarding(false);
    toast.success('Onboarding has been reset. Launching Budget Wizard...');
    navigate('/onboard');
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 p-8 font-sans">
      <UpgradeGatewayModal
        open={isUpgradeModalOpen}
        onOpenChange={setIsUpgradeModalOpen}
        selectedTier={selectedUpgradeTier}
        enableStripe={ENABLE_STRIPE_CHECKOUT}
        preferredPaymentMethod={upgradeCheckoutMode}
        onPayWithStripe={ENABLE_STRIPE_CHECKOUT ? handleStripeCheckout : undefined}
        onPayWithCrypto={handleCryptoCheckout}
        onNowPaymentsOpen={(tier) => trackNowPaymentsEvent('open', 'upgrade_modal', tier)}
        onCopyNowPaymentsLink={(tier) => copyNowPaymentsLink('upgrade_modal', tier)}
        isProcessing={isProcessingCheckout}
      />

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Account Settings</h1>
            <p className="text-slate-400">Manage your profile, data, and subscription.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* User Profile */}
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-xl text-white">User Profile</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="mt-1 text-slate-200 font-medium">
                  {user?.email || 'guest@mediaplanner.pro (Demo Mode)'}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Account Status
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="bg-green-500/10 text-green-400 border-green-500/20"
                  >
                    Active
                  </Badge>
                  <Badge variant="outline" className="border-slate-600 text-slate-400">
                    {user ? 'Authenticated' : 'Anonymous Session'}
                  </Badge>
                </div>
              </div>
              <Separator className="bg-slate-700" />
              <Button
                variant="outline"
                onClick={handleResetPassword}
                disabled={!user}
                className="w-full border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 hover:border-slate-500"
              >
                Reset Password
              </Button>
              <Button
                variant="outline"
                onClick={handleRestartOnboarding}
                className="w-full border-indigo-500/40 text-indigo-200 hover:text-white hover:bg-indigo-600/20 hover:border-indigo-400"
              >
                Restart Onboarding Wizard
              </Button>
            </CardContent>
          </Card>

          {/* Cloud Status */}
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-blue-400" />
                <CardTitle className="text-xl text-white">Data Health</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#0f172a] border border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                  <span className="text-sm font-medium text-slate-300">Cloud Connection</span>
                </div>
                <span className="text-xs text-green-400 font-mono">CONNECTED</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400 flex items-center gap-2">
                    <Database className="h-4 w-4" /> Total Saved Projects
                  </span>
                  <span className="text-xl font-bold text-white">
                    {loading ? '...' : projectCount}
                  </span>
                </div>
                <Progress
                  value={Math.min(((projectCount || 0) / 10) * 100, 100)}
                  className="h-1.5 bg-slate-800 [&>div]:bg-blue-500"
                />
                <p className="text-xs text-slate-500 text-right">
                  {10 - (projectCount || 0)} free slots remaining
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 bg-[#1e293b] border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg text-white">Billing Sync Status</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshBillingStatus}
                  disabled={isRefreshingBilling}
                  className="border-slate-600 text-slate-200 hover:bg-slate-800"
                >
                  <RefreshCw
                    className={cn('mr-2 h-4 w-4', isRefreshingBilling && 'animate-spin')}
                  />
                  {isRefreshingBilling ? 'Refreshing...' : 'Refresh Billing Status'}
                </Button>
              </div>
              <CardDescription className="text-slate-400">
                Verify live subscription state from Supabase metadata versus local app state.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Store Tier</p>
                <p className="mt-2 text-xl font-black text-white">
                  {subscriptionTier.toUpperCase()}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Metadata Tier</p>
                <p className="mt-2 text-xl font-black text-white">
                  {(metadataTier ?? 'unknown').toUpperCase()}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Sync Signal</p>
                <Badge
                  variant="outline"
                  className={cn(
                    'mt-2',
                    billingSyncStatus === 'synced' && 'border-emerald-500/30 text-emerald-300',
                    billingSyncStatus === 'waiting' && 'border-amber-500/30 text-amber-300',
                    billingSyncStatus === 'error' && 'border-rose-500/30 text-rose-300',
                    billingSyncStatus === 'idle' && 'border-slate-600 text-slate-300'
                  )}
                >
                  {billingSyncStatus.toUpperCase()}
                </Badge>
                <p className="mt-2 text-xs text-slate-400">{billingSyncMessage}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Last sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Never'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 relative overflow-hidden border-slate-700 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.18),_transparent_32%),linear-gradient(165deg,_#0f172a_0%,_#111827_50%,_#1e293b_100%)]">
            <div className="absolute top-0 right-0 p-3">
              <ShieldCheck className="h-24 w-24 text-slate-800/50 -rotate-12" />
            </div>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-cyan-300" />
                <CardTitle className="text-xl text-white">Subscription Plan</CardTitle>
                <Badge variant="outline" className="border-slate-600 text-slate-300">
                  Current: {subscriptionTier.toUpperCase()}
                </Badge>
              </div>
              <CardDescription className="text-slate-400">
                Choose your growth stack. Pro unlocks advanced LTV modeling and Geo-Arbitrage.
                Enterprise unlocks Server-Side CDP exports.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {PRICING_TIERS.map((tier) => {
                  const isCurrent = tier.key === subscriptionTier;

                  return (
                    <article
                      key={tier.key}
                      className={cn(
                        'relative rounded-2xl border p-5 transition-all duration-300',
                        'bg-slate-950/55 border-slate-700 hover:border-slate-500',
                        tier.highlighted &&
                          'border-cyan-400/70 bg-[linear-gradient(160deg,rgba(34,211,238,0.2),rgba(15,23,42,0.85)_45%,rgba(2,6,23,0.88))] shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_0_40px_rgba(34,211,238,0.25)]',
                        isCurrent && 'ring-1 ring-emerald-400/60'
                      )}
                    >
                      {tier.highlighted ? (
                        <Badge className="absolute -top-2 right-4 bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                          Most Popular
                        </Badge>
                      ) : null}

                      <div className="mb-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          {tier.title}
                        </p>
                        <div className="mt-2 flex items-end gap-1">
                          <span className="text-3xl font-black text-white">{tier.price}</span>
                          <span className="text-sm text-slate-400 pb-1">{tier.cadence}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-400">{tier.description}</p>
                      </div>

                      <ul className="space-y-2 text-sm text-slate-300">
                        {tier.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2">
                            <Sparkles className="h-3.5 w-3.5 mt-0.5 text-cyan-300" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-6">
                        {tier.key === 'free' ? (
                          <Button
                            variant="outline"
                            className="w-full border-slate-600 text-slate-200 hover:bg-slate-800"
                            onClick={() => handleTierCheckout('free')}
                          >
                            Continue Free
                          </Button>
                        ) : (
                          <>
                            <Button
                              className={cn(
                                'w-full',
                                tier.highlighted
                                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700'
                                  : 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700'
                              )}
                              onClick={() =>
                                openUpgrade(tier.key, ENABLE_STRIPE_CHECKOUT ? 'card' : 'crypto')
                              }
                            >
                              {isCurrent
                                ? 'Manage Plan'
                                : ENABLE_STRIPE_CHECKOUT
                                  ? `Upgrade to ${tier.title}`
                                  : `Upgrade with Crypto`}
                            </Button>
                            {ENABLE_STRIPE_CHECKOUT ? (
                              <Button
                                variant="outline"
                                className="mt-2 w-full border-emerald-400/45 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                                onClick={() => openUpgrade(tier.key, 'crypto')}
                              >
                                Checkout with Crypto
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 overflow-hidden border-emerald-500/30 bg-[radial-gradient(circle_at_10%_20%,rgba(16,185,129,0.22),transparent_38%),radial-gradient(circle_at_85%_0%,rgba(34,211,238,0.18),transparent_35%),linear-gradient(150deg,#052e2b_0%,#0b1f34_55%,#111827_100%)]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-400/20 text-emerald-200 hover:bg-emerald-400/20">
                  Crypto Lane
                </Badge>
                <CardTitle className="text-xl text-white">Pay with NOWPayments</CardTitle>
              </div>
              <CardDescription className="text-emerald-100/85">
                Prefer crypto rails? Launch secure checkout instantly and complete upgrades with
                BTC, ETH, USDT, and more.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 rounded-b-xl border-t border-emerald-400/20 bg-slate-950/35 p-6 md:flex-row md:items-center md:justify-between">
              <a
                href={NOWPAYMENTS_CHECKOUT_URL}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => trackNowPaymentsEvent('open', 'settings_card', selectedUpgradeTier)}
                className="inline-flex w-fit rounded-lg transition hover:scale-[1.02]"
              >
                <img
                  src={NOWPAYMENTS_BUTTON_SRC}
                  alt="Cryptocurrency and Bitcoin payment button by NOWPayments"
                  className="h-14 w-auto rounded-md border border-slate-300/70 bg-white p-1"
                />
              </a>

              <div className="flex flex-col items-start gap-3 md:items-end">
                <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-emerald-100/85">
                  <span className="rounded-full border border-emerald-300/35 bg-emerald-400/10 px-3 py-1">
                    BTC
                  </span>
                  <span className="rounded-full border border-emerald-300/35 bg-emerald-400/10 px-3 py-1">
                    ETH
                  </span>
                  <span className="rounded-full border border-emerald-300/35 bg-emerald-400/10 px-3 py-1">
                    USDT
                  </span>
                  <span className="rounded-full border border-emerald-300/35 bg-emerald-400/10 px-3 py-1">
                    300+ coins
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-300/45 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                  onClick={() => copyNowPaymentsLink('settings_card', selectedUpgradeTier)}
                >
                  Copy Payment Link
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
