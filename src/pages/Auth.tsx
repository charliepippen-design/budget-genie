
import { SignIn } from '@clerk/clerk-react';
import { DollarSign, ShieldCheck } from "lucide-react";

export default function Auth() {
    return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#1e293b] rounded-2xl shadow-xl border border-slate-700 overflow-hidden">
                {/* Header */}
                <div className="p-8 text-center border-b border-slate-700 bg-[#0f172a]/50">
                    <div className="mx-auto h-16 w-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/30">
                        <DollarSign className="h-8 w-8 text-blue-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
                        MediaPlanner <span className="text-blue-500">Pro</span>
                    </h1>
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
