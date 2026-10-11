
import { SignIn } from '@clerk/clerk-react';
import { ShieldCheck } from "lucide-react";
import { BrandLogo } from '@/components/common/BrandLogo';

export default function Auth() {
    return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#1e293b] rounded-2xl shadow-xl border border-slate-700 overflow-hidden">
                {/* Header */}
                <div className="p-8 text-center border-b border-slate-700 bg-[#0f172a]/50">
                    <BrandLogo size="lg" as="h1" stacked className="mb-2" />
                    <p className="text-slate-400 text-sm">
                        Please sign in to access your media plans
                    </p>
                </div>

                {/* Clerk SignIn */}
                <div className="p-8">
                    <SignIn />
                </div>

                <div className="mt-6 text-center pb-8">
                    <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                        <ShieldCheck className="h-3 w-3" />
                        <span>Secure Professional Workspace</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
