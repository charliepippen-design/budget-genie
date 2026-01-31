import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wand2, Sparkles, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardLauncherCardProps {
    onLaunch: () => void;
    variant?: 'card' | 'banner';
}

export const WizardLauncherCard: React.FC<WizardLauncherCardProps> = ({ onLaunch, variant = 'card' }) => {
    if (variant === 'banner') {
        return (
            <Card className="relative overflow-hidden border-border/50 bg-slate-950/50 card-shadow group">
                <div className="absolute inset-0 p-[1px] bg-gradient-to-r from-indigo-500/30 via-purple-500/30 to-blue-500/30 rounded-xl pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-transparent to-blue-500/5 opacity-50 transition-opacity group-hover:opacity-100" />

                <CardContent className="relative flex items-center justify-between p-4 z-10">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-md animate-pulse" />
                            <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg border border-white/10">
                                <Wand2 className="h-5 w-5 text-white" />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-white">
                                Budget Wizard: Master Edition
                            </h3>
                            <p className="text-xs text-slate-500 font-medium hidden sm:block">
                                Unlock advanced strategies, multi-month planning, and AI normalization.
                            </p>
                        </div>
                    </div>

                    <Button
                        onClick={onLaunch}
                        className="relative overflow-hidden bg-white text-slate-900 hover:bg-indigo-50 hover:text-indigo-900 border-0 shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all duration-300 group-hover:scale-105"
                    >
                        <Zap className="mr-2 h-4 w-4 fill-current" />
                        <span className="font-bold">Launch</span>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="relative h-full overflow-hidden border-border/50 bg-slate-950/50 card-shadow group">
            {/* Premium Gradient Border Effect via pseudo-element or absolute div */}
            <div className="absolute inset-0 p-[1px] bg-gradient-to-br from-indigo-500/30 via-purple-500/30 to-blue-500/30 rounded-xl pointer-events-none" />

            {/* Subtle Glow Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-blue-500/5 opacity-50 transition-opacity group-hover:opacity-100" />

            <CardContent className="relative h-full flex flex-col items-center justify-center text-center p-6 space-y-6 z-10">

                {/* Icon Circle with Pulse */}
                <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl animate-pulse" />
                    <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-900/50 border border-white/10">
                        <Wand2 className="h-8 w-8 text-white" />
                    </div>
                    <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-amber-300 animate-bounce delay-700" />
                </div>

                <div className="space-y-1">
                    <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-white">
                        Budget Wizard
                    </h3>
                    <p className="text-sm text-muted-foreground font-medium">
                        AI Auto-Distribution
                    </p>
                </div>

                <div className="pt-2">
                    <Button
                        onClick={onLaunch}
                        size="lg"
                        className="relative overflow-hidden bg-white text-slate-900 hover:bg-indigo-50 hover:text-indigo-900 border-0 shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all duration-300 group-hover:scale-105"
                    >
                        <Zap className="mr-2 h-4 w-4 fill-current" />
                        <span className="font-bold">Launch Master Edition</span>
                    </Button>
                </div>

                <p className="text-[10px] text-slate-500 max-w-[200px]">
                    Unlock advanced strategies, multi-month planning, and smart normalization.
                </p>

            </CardContent>
        </Card>
    );
};
