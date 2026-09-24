
import { SignIn, SignUp } from "@clerk/clerk-react";
import { DollarSign, ShieldCheck, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CLERK_ENABLED } from "@/lib/auth";
import { useMediaPlanStore } from "@/hooks/use-media-plan-store";

export default function Auth() {
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const { setDevDeityMode } = useMediaPlanStore();
    const navigate = useNavigate();

    const handleMockLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // --- THE ADMIN MASTER OVERRIDE ---
        if (email.toLowerCase() === 'admin@mediaplanner.pro' && password === 'deity_2026') {
             setDevDeityMode(true);
             setTimeout(() => {
                setIsLoading(false);
                navigate("/");
             }, 500);
             return;
        }

        // Standard mock login
        setTimeout(() => {
            setIsLoading(false);
            navigate("/");
        }, 1000);
    };

    return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
            <div className="absolute top-8 left-8">
                <Link to="/">
                    <Button variant="ghost" className="text-slate-400 hover:text-white flex items-center gap-2">
                        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
                    </Button>
                </Link>
            </div>

            <div className="w-full max-w-md">
                {/* Brand Header */}
                <div className="text-center mb-8">
                    <div className="mx-auto h-16 w-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/30">
                        <DollarSign className="h-8 w-8 text-blue-500" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
                        MediaPlanner <span className="text-blue-500">Pro</span>
                    </h1>
                    <p className="text-slate-400">
                        The ultimate iGaming forecasting engine.
                    </p>
                </div>

                {CLERK_ENABLED ? (
                    <div className="flex justify-center">
                        {mode === 'signin' ? (
                            <SignIn 
                                routing="hash" 
                                signUpUrl="/auth#signup" 
                                appearance={{
                                    elements: {
                                        card: "bg-[#1e293b] border-slate-700 shadow-xl",
                                        headerTitle: "text-white",
                                        headerSubtitle: "text-slate-400",
                                        socialButtonsBlockButton: "bg-slate-800 border-slate-700 text-white hover:bg-slate-700",
                                        formButtonPrimary: "bg-blue-600 hover:bg-blue-700",
                                        footerActionText: "text-slate-400",
                                        footerActionLink: "text-blue-500 hover:text-blue-400",
                                        identityPreviewText: "text-white",
                                        identityPreviewEditButtonIcon: "text-blue-500",
                                        formFieldLabel: "text-slate-300",
                                        formFieldInput: "bg-[#0f172a] border-slate-700 text-white focus:ring-blue-500"
                                    }
                                }}
                            />
                        ) : (
                            <SignUp 
                                routing="hash" 
                                signInUrl="/auth"
                                appearance={{
                                    elements: {
                                        card: "bg-[#1e293b] border-slate-700 shadow-xl",
                                        headerTitle: "text-white",
                                        headerSubtitle: "text-slate-400",
                                        formButtonPrimary: "bg-blue-600 hover:bg-blue-700",
                                        footerActionText: "text-slate-400",
                                        footerActionLink: "text-blue-500 hover:text-blue-400"
                                    }
                                }}
                            />
                        )}
                    </div>
                ) : (
                    <div className="bg-[#1e293b] rounded-2xl shadow-xl border border-slate-700 p-8">
                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-white mb-1">Guest Mode</h2>
                            <p className="text-sm text-slate-400 italic">Auth is disabled (No Clerk Key found). Use credentials to continue locally.</p>
                        </div>
                        
                        <form onSubmit={handleMockLogin} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Email Address</label>
                                <Input
                                    type="email"
                                    placeholder="advisor@mediaplanner.pro"
                                    className="bg-[#0f172a] border-slate-700 text-white placeholder:text-slate-600 focus-visible:ring-blue-500"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Password</label>
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    className="bg-[#0f172a] border-slate-700 text-white placeholder:text-slate-600 focus-visible:ring-blue-500"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11"
                                disabled={isLoading}
                            >
                                {isLoading ? "Signing in..." : "Sign In"}
                            </Button>
                        </form>
                    </div>
                )}

                <div className="mt-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                        <ShieldCheck className="h-3 w-3" />
                        <span>Secure Professional Workspace</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

