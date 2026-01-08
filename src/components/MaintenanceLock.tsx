import { Shield, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const MaintenanceLock = () => {
    return (
        <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
            <div className="max-w-md space-y-8 animate-in fade-in zoom-in duration-700">
                <div className="relative mx-auto w-24 h-24 mb-6">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                    <div className="relative bg-slate-900 border border-slate-800 rounded-full w-full h-full flex items-center justify-center shadow-2xl">
                        <Lock className="w-10 h-10 text-primary" />
                    </div>
                </div>

                <div className="space-y-2">
                    <h1 className="text-4xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                        Media Planner Pro
                    </h1>
                    <h2 className="text-lg font-medium text-slate-400">
                        Coming Soon - Private Beta
                    </h2>
                </div>

                <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 backdrop-blur-sm">
                    <p className="text-slate-400 leading-relaxed text-sm">
                        We are currently refining the platform. Access is restricted during this phase to ensure data integrity and system stability.
                    </p>
                </div>

                <div className="pt-8 flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
                        <Shield className="w-3 h-3" />
                        <span>Secure Environment • Production Locked</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
