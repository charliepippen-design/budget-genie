import { useEffect, useState } from 'react';
import { Bitcoin, CreditCard, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SubscriptionTier } from '@/hooks/use-media-plan-store';
import { cn } from '@/lib/utils';
import { PAID_PLANS } from '@/lib/plans';

interface UpgradeGatewayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTier: SubscriptionTier;
  enableStripe?: boolean;
  preferredPaymentMethod?: 'card' | 'crypto';
  onPayWithStripe?: (tier: SubscriptionTier) => Promise<void> | void;
  onPayWithCrypto: (tier: SubscriptionTier) => Promise<void> | void;
  onNowPaymentsOpen?: (tier: SubscriptionTier) => Promise<void> | void;
  onCopyNowPaymentsLink?: (tier: SubscriptionTier) => Promise<void> | void;
  isProcessing?: boolean;
}

const NOWPAYMENTS_CHECKOUT_URL = 'https://nowpayments.io/payment/?iid=4321051348&source=button';
const NOWPAYMENTS_BUTTON_SRC = 'https://nowpayments.io/images/embeds/payment-button-white.svg';

export function UpgradeGatewayModal({
  open,
  onOpenChange,
  selectedTier,
  enableStripe = false,
  preferredPaymentMethod = 'card',
  onPayWithStripe,
  onPayWithCrypto,
  onNowPaymentsOpen,
  onCopyNowPaymentsLink,
  isProcessing = false,
}: UpgradeGatewayModalProps) {
  const billableTier = selectedTier === 'free' ? 'pro' : selectedTier;
  const plan = PAID_PLANS.find((p) => p.tier === billableTier) ?? PAID_PLANS[0];
  const isStripeAvailable = enableStripe && typeof onPayWithStripe === 'function';
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'card' | 'crypto'>(
    isStripeAvailable ? preferredPaymentMethod : 'crypto'
  );

  useEffect(() => {
    if (open) {
      setSelectedPaymentMethod(isStripeAvailable ? preferredPaymentMethod : 'crypto');
    }
  }, [open, preferredPaymentMethod, isStripeAvailable]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl border-slate-700 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_40%),linear-gradient(155deg,_#020617,_#0f172a_45%,_#111827)] p-0 text-slate-100 shadow-[0_30px_90px_rgba(15,23,42,0.8)]"
        overlayClassName="bg-slate-950/80 backdrop-blur-sm"
      >
        <div className="overflow-hidden rounded-lg border border-slate-700/70">
          <div className="border-b border-slate-700/80 px-7 py-6">
            <DialogHeader className="space-y-2 text-left">
              <div className="flex items-center gap-2">
                <Badge className="bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/20">
                  Upgrade Gateway
                </Badge>
                <Badge variant="outline" className="border-slate-600 text-slate-300">
                  {plan.name}
                </Badge>
              </div>
              <DialogTitle className="text-2xl font-black tracking-tight text-white">
                Upgrade to {plan.name}
              </DialogTitle>
              <DialogDescription className="max-w-2xl text-slate-300">
                {plan.tagline}. {plan.priceLabel}/month, billed monthly.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid grid-cols-1 gap-6 px-7 py-6 md:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Checkout Rail
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {isStripeAvailable
                    ? 'Pick your preferred payment rail. Stripe opens a hosted card session and crypto routes to NOWPayments.'
                    : 'Crypto checkout is currently active. Card payments are temporarily hidden and can be re-enabled later.'}
                </p>
                {isStripeAvailable ? (
                  <div className="mt-4 inline-flex rounded-lg border border-slate-700 bg-slate-900/70 p-1">
                    <button
                      type="button"
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors',
                        selectedPaymentMethod === 'card'
                          ? 'bg-cyan-500/25 text-cyan-100'
                          : 'text-slate-400 hover:text-slate-200'
                      )}
                      onClick={() => setSelectedPaymentMethod('card')}
                    >
                      Card
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors',
                        selectedPaymentMethod === 'crypto'
                          ? 'bg-emerald-500/25 text-emerald-100'
                          : 'text-slate-400 hover:text-slate-200'
                      )}
                      onClick={() => setSelectedPaymentMethod('crypto')}
                    >
                      Crypto
                    </button>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Button
                    disabled={isProcessing}
                    className={cn(
                      'h-11 flex-1 text-white',
                      selectedPaymentMethod === 'card' && isStripeAvailable
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700'
                    )}
                    onClick={() =>
                      selectedPaymentMethod === 'card' && isStripeAvailable
                        ? onPayWithStripe?.(billableTier)
                        : onPayWithCrypto(billableTier)
                    }
                  >
                    {selectedPaymentMethod === 'card' && isStripeAvailable ? (
                      <CreditCard className="mr-2 h-4 w-4" />
                    ) : (
                      <Bitcoin className="mr-2 h-4 w-4" />
                    )}
                    {isProcessing
                      ? 'Preparing Checkout...'
                      : selectedPaymentMethod === 'card' && isStripeAvailable
                        ? 'Pay with Credit Card (Stripe)'
                        : 'Pay with Crypto (NOWPayments)'}
                  </Button>
                  {isStripeAvailable ? (
                    <Button
                      disabled={isProcessing}
                      variant="outline"
                      className="h-11 flex-1 border-slate-500/70 bg-slate-800/60 text-slate-100 hover:bg-slate-700/70"
                      onClick={() =>
                        selectedPaymentMethod === 'card'
                          ? onPayWithCrypto(billableTier)
                          : onPayWithStripe?.(billableTier)
                      }
                    >
                      {selectedPaymentMethod === 'card' ? (
                        <>
                          <Bitcoin className="mr-2 h-4 w-4" />
                          Switch to Crypto
                        </>
                      ) : (
                        <>
                          <CreditCard className="mr-2 h-4 w-4" />
                          Switch to Card
                        </>
                      )}
                    </Button>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={NOWPAYMENTS_CHECKOUT_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={() => onNowPaymentsOpen?.(billableTier)}
                    className="inline-flex"
                  >
                    <img
                      src={NOWPAYMENTS_BUTTON_SRC}
                      alt="Cryptocurrency and Bitcoin payment button by NOWPayments"
                      className="h-12 w-auto rounded-md border border-slate-600/70 bg-white/95 p-1"
                    />
                  </a>
                  {onCopyNowPaymentsLink ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                      onClick={() => onCopyNowPaymentsLink(billableTier)}
                    >
                      Copy Link
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                What is included
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 text-cyan-300" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
