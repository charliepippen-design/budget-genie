
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Cloud, Database, CreditCard, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

export default function Settings() {
    const navigate = useNavigate();
    const [user, setUser] = useState<any>(null);
    const [projectCount, setProjectCount] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                // 1. Get User
                const { data: { user } } = await supabase.auth.getUser();
                setUser(user);

                // 2. Get Project Count (Mock for now if table doesn't exist, try/catch)
                // If 'projects' table doesn't exist yet, this might error, so we handle gracefully
                const { count, error } = await supabase
                    .from('projects')
                    .select('*', { count: 'exact', head: true });

                if (!error) {
                    setProjectCount(count || 0);
                } else {
                    // Fallback to local storage count for now
                    const stored = localStorage.getItem('igaming_projects');
                    if (stored) {
                        setProjectCount(JSON.parse(stored).length);
                    } else {
                        setProjectCount(0);
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch settings data", e);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const handleResetPassword = async () => {
        if (!user?.email) return;
        const { error } = await supabase.auth.resetPasswordForEmail(user.email);
        if (error) {
            toast.error("Failed to send reset email: " + error.message);
        } else {
            toast.success("Password reset email sent!");
        }
    };

    const handleUpgrade = () => {
        toast.info("Stripe integration coming soon! Stay tuned for Pro features.");
    };

    return (
        <div className="min-h-screen bg-[#0f172a] text-slate-100 p-8 font-sans">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate("/")}
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
                                <User className="h-5 w-5 text-blue-400" />
                                <CardTitle className="text-xl text-white">User Profile</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Email Address</label>
                                <div className="mt-1 text-slate-200 font-medium">
                                    {user?.email || "guest@mediaplanner.pro (Demo Mode)"}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Account Status</label>
                                <div className="mt-1 flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-green-500/20">
                                        Active
                                    </Badge>
                                    <Badge variant="outline" className="border-slate-600 text-slate-400">
                                        {user ? "Authenticated" : "Anonymous Session"}
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
                                        {loading ? "..." : projectCount}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min(((projectCount || 0) / 10) * 100, 100)}%` }}></div>
                                </div>
                                <p className="text-xs text-slate-500 text-right">
                                    {10 - (projectCount || 0)} free slots remaining
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Subscription */}
                    <Card className="md:col-span-2 bg-gradient-to-br from-[#1e293b] to-[#0f172a] border-slate-700 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3">
                            <ShieldCheck className="h-24 w-24 text-slate-800/50 -rotate-12" />
                        </div>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5 text-blue-400" />
                                <CardTitle className="text-xl text-white">Subscription Plan</CardTitle>
                            </div>
                            <CardDescription className="text-slate-400">
                                Upgrade your workspace for advanced AI features and unlimited storage.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col md:flex-row items-center justify-between gap-6">
                            <div>
                                <div className="text-2xl font-bold text-white mb-1">Free Tier</div>
                                <div className="text-sm text-slate-400 space-y-1">
                                    <p>• Basic AI Advisor access</p>
                                    <p>• Up to 10 stored projects</p>
                                    <p>• Standard CSV Export</p>
                                </div>
                            </div>
                            <Button
                                onClick={handleUpgrade}
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 w-full md:w-auto px-8"
                            >
                                Upgrade to Pro
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
