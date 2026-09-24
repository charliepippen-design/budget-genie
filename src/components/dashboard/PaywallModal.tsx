import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, Sparkles, TrendingUp, Cpu, Lock } from 'lucide-react';
import { useAuth, useUser } from '@/lib/auth';

interface PaywallModalProps {
    isOpen: boolean;
    onClose: () => void;
    featureName?: string;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({ isOpen, onClose, featureName = "Premium Features" }) => {
    const { isSignedIn } = useAuth();
    const { user } = useUser();

    const handleUpgrade = () => {
        if (!isSignedIn) {
            // Usually, we'd trigger Clerk login if not signed in instead of upgrade
            window.location.href = '/auth'; // generic fallback
            return;
        }

        // Send to Stripe Payment Link 
        // We'd embed client_reference_id=userId to link the webhook back to them
        const STRIPE_PAYMENT_LINK = import.meta.env.VITE_STRIPE_URL || '#';
        window.open(`${STRIPE_PAYMENT_LINK}?client_reference_id=${user?.id}`, '_blank');
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md w-full bg-slate-950 border-amber-500/20 p-0 overflow-hidden shadow-2xl">
                
                {/* Hero Graphic Section */}
                <div className="relative h-48 bg-gradient-to-br from-amber-600/20 via-orange-500/10 to-transparent flex items-center justify-center border-b border-amber-500/10">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
                    
                    <div className="relative">
                        <div className="absolute inset-0 bg-amber-500/30 rounded-full blur-xl animate-pulse" />
                        <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg border border-amber-200/30">
                            <Crown className="w-10 h-10 text-white drop-shadow-md" />
                        </div>
                        <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-amber-300 animate-bounce" />
                    </div>
                </div>

                {/* Content Section */}
                <div className="p-8 pb-10 text-center">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 mb-2">
                            Unlock the Power of a God
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 text-sm leading-relaxed">
                            <span className="text-white font-medium">{featureName}</span> requires the <strong className="text-amber-400">DEITY</strong> tier. Ascend your account to access enterprise-grade tooling.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-8 space-y-4 text-left">
                        <div className="flex items-start gap-3">
                            <TrendingUp className="w-5 h-5 text-amber-500 shrink-0" />
                            <div>
                                <h4 className="text-sm font-bold text-slate-200">12-Month Predictive Forecasting</h4>
                                <p className="text-xs text-slate-500">Calculate compounding LTV decay mapping natively.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Cpu className="w-5 h-5 text-amber-500 shrink-0" />
                            <div>
                                <h4 className="text-sm font-bold text-slate-200">Autonomous AI Rebalancing</h4>
                                <p className="text-xs text-slate-500">Enable Agentic Guardrails to automatically intercept budget bleed.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Lock className="w-5 h-5 text-amber-500 shrink-0" />
                            <div>
                                <h4 className="text-sm font-bold text-slate-200">Private Cloud Sync</h4>
                                <p className="text-xs text-slate-500">Save your custom setups securely to our encrypted Supabase vaults.</p>
                            </div>
                        </div>
                    </div>

                    <Button 
                        onClick={handleUpgrade}
                        className="mt-10 w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-lg shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all hover:scale-[1.02]"
                    >
                        {isSignedIn ? 'Upgrade to Deity - $99/mo' : 'Sign in to Upgrade'}
                    </Button>
                    <p className="mt-4 text-[10px] text-slate-600 uppercase tracking-widest font-mono">
                        Secured securely via Stripe Checkout
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
};
