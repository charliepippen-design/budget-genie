
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Auth() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate login
        setTimeout(() => {
            setIsLoading(false);
            navigate("/");
        }, 1000);
    };

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

                {/* Form */}
                <div className="p-8">
                    <form onSubmit={handleLogin} className="space-y-4">
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

                    <div className="mt-6 text-center">
                        <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                            <ShieldCheck className="h-3 w-3" />
                            <span>Secure Professional Workspace</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
