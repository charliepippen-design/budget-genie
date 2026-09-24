import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Send, Sparkles, Bot, Loader2, AlertTriangle, Scissors, TrendingUp, BarChart, CheckCircle2 } from 'lucide-react';
import { useChannelsWithMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { cn } from '@/lib/utils';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, tool, CoreMessage } from 'ai';
import { z } from 'zod';
import { useUser } from '@/lib/auth';
import { PaywallModal } from './PaywallModal';
import { useCurrency } from '@/contexts/CurrencyContext';
import { toast } from 'sonner';

export type LocalMessage = {
    role: 'user' | 'assistant';
    content: string;
    pendingAction?: {
        name: string;
        args: any;
    };
};

export const GenieAssistant: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const channels = useChannelsWithMetrics();
    const { format: formatCurrency } = useCurrency();
    const { 
        totalBudget, 
        setTotalBudget, 
        setChannelAllocation, 
        normalizeAllocations, 
        globalMultipliers, 
        devDeityMode,
        applyArbitrageRebalance,
        projectName
    } = useMediaPlanStore();

    const { user } = useUser();
    const [isPaywallOpen, setIsPaywallOpen] = useState(false);

    // Manual State Management for Client-Side Chat
    const [messages, setMessages] = useState<LocalMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Refs for scrolling
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initial Greeting & Insight Logic
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            if (channels.length > 0) {
                const topSpender = [...channels].sort((a, b) => b.metrics.spend - a.metrics.spend)[0];
                const amount = formatCurrency(topSpender?.metrics.spend || 0);

                if (topSpender) {
                    setMessages([
                        {
                            role: 'assistant',
                            content: `**Hello!** I've analyzed **${projectName || 'the current plan'}**. Your top spender is **${topSpender.name}** at **${amount}**. How can I improve your efficiency today?`
                        }
                    ]);
                }
            } else {
                setMessages([
                    {
                        role: 'assistant',
                        content: `I'm ready to help! Add some channels to the dashboard so I can start auditing your performance. 🧞‍♂️`
                    }
                ]);
            }
        }
    }, [isOpen, channels, messages.length, projectName, formatCurrency]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // --- LOCAL FALLBACK ENGINE ---
    const localFallbackResponse = (query: string): string => {
        const lower = query.toLowerCase();
        const targetRoas = globalMultipliers.roasTarget || 2.5;

        if (channels.length === 0) return "Add channels to the dashboard first so I can analyze your media mix.";

        // --- ANALYSIS LOGIC ---
        const active = channels.filter(c => c.metrics.spend > 0);
        const sortedByRoas = [...active].sort((a, b) => b.metrics.roas - a.metrics.roas);
        const winner = sortedByRoas[0];
        const loser = sortedByRoas[sortedByRoas.length - 1];

        // 1. Audit / Waste / Performance
        if (lower.includes('audit') || lower.includes('waste') || lower.includes('bleeding') || lower.includes('identify')) {
            if (active.length === 0) return "I need active spend data to identify waste. Increase your budget or allocations first.";

            let report = `### **Strategic Media Audit**\n\n`;
            
            if (loser && loser.metrics.roas < targetRoas) {
                report += `🔴 **Bleeding:** **${loser.name}** is significantly underperforming with a **${loser.metrics.roas.toFixed(2)}x ROAS** (Target: ${targetRoas}x).\n\n`;
            } else {
                report += `✅ **Health Check:** All active channels currently meet your **${targetRoas}x ROAS target**.\n\n`;
            }

            if (winner) {
                report += `🟢 **Scale Opportunity:** **${winner.name}** is your efficiency leader at **${winner.metrics.roas.toFixed(2)}x ROAS**. This is where we should inject found capital.\n\n`;
            }

            report += `📊 **Observation:** Your blended portfolio is currently yielding a **${(active.reduce((s, c) => s + c.metrics.revenue, 0) / active.reduce((s, c) => s + c.metrics.spend, 0)).toFixed(2)}x ROAS**.`;
            
            return report;
        }

        // 2. Simple rebalance suggestion
        if (lower.includes('rebalance') || lower.includes('shift') || lower.includes('move')) {
             if (!winner || !loser || winner.id === loser.id) return "I need at least 2 active channels to calculate a rebalance.";
             const recommendation = (loser.allocationPct * 0.2).toFixed(1);
             return `**Recommendation:** Shift **${recommendation}%** from **${loser.name}** and reallocate it directly into **${winner.name}**. This arbitrage move should improve your consolidated ROAS floor immediately.`;
        }

        // 3. Fallback to generic spend check
        if (lower.includes('spend') || lower.includes('cost') || lower.includes('money')) {
            return `You are currently deploying **${formatCurrency(active.reduce((s, c) => s + c.metrics.spend, 0))}** across **${active.length} active channels**. Top spender: **${winner?.name}**.`;
        }

        return "I've analyzed your data. I recommend checking for **'waste'** or asking for an **'audit'** to see my specific rebalance suggestions!";
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: LocalMessage = { role: 'user', content: input };
        const newMessages = [...messages, userMessage];

        setMessages(newMessages);
        setInput("");
        setIsLoading(true);

        try {
            const apiKey = (import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY || "").trim();

            if (!apiKey || apiKey.length < 20) {
                throw new Error("Missing Google API Key");
            }

            const google = createGoogleGenerativeAI({ 
                apiKey,
                // v1beta supports modern features like system instructions and tools more reliably
                baseURL: 'https://generativelanguage.googleapis.com/v1beta' 
            });

            // Deep Context for "The Oracle"
            const roasTarget = globalMultipliers.roasTarget || 2.5;
            const contextData = {
                totalBudget,
                roasTarget,
                efficiencyMetrics: channels.map(c => {
                    const ltv = c.typeConfig?.baselineMetrics?.expectedLtv || 150;
                    const cpa = c.metrics.cpa || 0;
                    const ltvCpaRatio = cpa > 0 ? (ltv / cpa).toFixed(2) : 'N/A';
                    const roasGap = (c.metrics.roas - roasTarget).toFixed(2);
                    
                    return {
                        name: c.name,
                        category: c.category,
                        spend: c.metrics.spend,
                        allocation: `${c.allocationPct}%`,
                        roas: c.metrics.roas.toFixed(2),
                        roasTargetGap: roasGap,
                        ltvToCpa: ltvCpaRatio,
                        isLocked: c.locked
                    };
                }),
                topEfficiencyChannel: [...channels].sort((a,b) => b.metrics.roas - a.metrics.roas)[0]?.name,
                bottomEfficiencyChannel: [...channels].sort((a,b) => a.metrics.roas - b.metrics.roas)[0]?.name
            };

            const systemPrompt = `
                You are "The Oracle", a world-class iGaming Media Auditor. 
                Your goal is to maximize ROAS and LTV:CPA efficiency for the user's media plan.
                
                CURRENT AUDIT DATA:
                ${JSON.stringify(contextData, null, 2)}
                
                ANALYSIS RULES:
                1. If a channel's ROAS is below the target (${roasTarget}x), immediately flag it as "Bleeding".
                2. If LTV:CPA is > 3x, identify it as a "Scale Opportunity".
                3. Use the 'executeArbitrageRebalance' tool if you see a clear performance gap.
                4. Use 'setChannelAllocation' for precision tuning.
            `;

            // --- MODEL FAILOVER LOOP (v1beta modern models) ---
            const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
            let lastError = null;
            let success = false;
            let responseText = "";
            let responseTools = null;

            for (const modelId of modelsToTry) {
                try {
                    const result = await generateText({
                        model: google(modelId),
                        // Prepend instructions to ensure compatibility with all model variants
                        messages: [
                            { role: 'user', content: `SYSTEM INSTRUCTIONS: ${systemPrompt}` },
                            ...newMessages.map(m => ({ role: m.role, content: m.content }) as CoreMessage)
                        ],
                        tools: {
                            setTotalBudget: tool({
                                description: "Update the global total budget.",
                                // @ts-ignore
                                parameters: z.object({ newBudget: z.number().min(5000).max(1000000) })
                            }),
                            setChannelAllocation: tool({
                                description: "Adjust percentage for a channel name.",
                                // @ts-ignore
                                parameters: z.object({ channelName: z.string(), newAllocationPct: z.number().min(0).max(80) })
                            }),
                            executeArbitrageRebalance: tool({
                                description: "Perform an arbitrage rebalance (best for high performance gaps).",
                                // @ts-ignore
                                parameters: z.object({})
                            })
                        }
                    });
                    
                    responseText = result.text;
                    responseTools = result.toolCalls;
                    success = true;
                    break;
                } catch (err: any) {
                    console.warn(`Oracle: ${modelId} failed:`, err.message);
                    lastError = err;
                    if (err.message?.includes("401") || err.message?.includes("API key")) throw err;
                }
            }

            if (!success) throw lastError || new Error("All models failed");

            let pendingAction;
            if (responseTools && responseTools.length > 0) {
                const callInfo = responseTools[0] as any;
                pendingAction = {
                    name: callInfo.toolName,
                    args: callInfo.args
                };
            }
            setMessages(prev => [...prev, { role: 'assistant', content: responseText || "I have prepared an action for your approval.", pendingAction }]);

        } catch (error: any) {
            console.error("AI_ORACLE_ERROR:", error);

            const msg = error.message?.toLowerCase() || "";
            let note = "";
            const rawError = error.message?.slice(0, 50) || "Unknown Error";
            
            if (msg.includes("api key") || msg.includes("401")) {
                note = `\n\n*(⚠️ API Key Error: ${rawError})*`;
            } else if (msg.includes("not found") || msg.includes("404")) {
                note = `\n\n*(⚠️ AI Model Unavailable: ${rawError} - Switched to local engine)*`;
            } else {
                note = `\n\n*(⚠️ Service Issue: ${rawError} - Using local audit engine)*`;
            }

            const localReply = localFallbackResponse(userMessage.content);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: localReply + note
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmAction = (msgIndex: number, action: any) => {
        let confirmationText = "";

        if (action.name === 'setTotalBudget') {
            setTotalBudget(action.args.newBudget);
            normalizeAllocations();
            confirmationText = `Total budget successfully secured at ${formatCurrency(action.args.newBudget)}.`;
        } else if (action.name === 'setChannelAllocation') {
            const target = channels.find(c => c.name.toLowerCase().includes(action.args.channelName.toLowerCase()));
            if (target) {
                setChannelAllocation(target.id, action.args.newAllocationPct);
                normalizeAllocations();
                confirmationText = `Adjusted ${target.name} allocation to ${action.args.newAllocationPct}%. Remaining pool auto-normalized.`;
            } else {
                confirmationText = `Error: Could not find channel matching "${action.args.channelName}".`;
            }
        } else if (action.name === 'executeArbitrageRebalance') {
            applyArbitrageRebalance();
            confirmationText = `Arbitrage successful: ${totalBudget < 50000 ? 'Low-threshold' : 'Strategic'} rebalance executed based on current efficiency gaps.`;
            toast.success("AI Arbitrage Applied");
        }

        setMessages(prev => {
            const copy = [...prev];
            if (copy[msgIndex]) {
                 copy[msgIndex] = { ...copy[msgIndex], pendingAction: undefined };
            }
            return [...copy, { role: 'assistant', content: `**Execution complete:** ${confirmationText}` }];
        });
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">

            {/* CHAT WINDOW */}
            {isOpen && (
                <Card className={cn(
                    "w-[380px] h-[600px] flex flex-col shadow-2xl border-slate-700 bg-slate-950 overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-10 fade-in",
                )}>
                    {/* Header */}
                    <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 text-indigo-100">
                                <div className="p-1.5 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
                                    <Bot className="w-4 h-4 text-white" />
                                </div>
                                <span className="font-semibold text-sm tracking-wide uppercase">The Oracle <span className="text-[10px] text-indigo-400 font-mono ml-1">v2.0</span></span>
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white" onClick={() => setIsOpen(false)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <p className="text-[10px] text-slate-400 ml-9">
                            Auditing <span className="text-slate-200 font-mono">{formatCurrency(totalBudget)}</span> across <span className="text-slate-200 font-mono">{channels.length} channels</span>.
                        </p>

                        {/* Quick Actions */}
                        <div className="grid grid-cols-1 gap-2 mt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                className="justify-start gap-2 h-9 text-xs border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white"
                                onClick={() => {
                                    setInput("Identify wasted spend and inefficient channels.");
                                    handleSubmit();
                                }}
                            >
                                <div className="p-1 bg-red-500/20 rounded">
                                    <Scissors className="w-3 h-3 text-red-400" />
                                </div>
                                Cut Waste
                                <span className="ml-auto text-[10px] text-slate-500">Find inefficiencies</span>
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                className="justify-start gap-2 h-9 text-xs border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white"
                                onClick={() => {
                                    setInput("Identify high ROAS channels to scale.");
                                    handleSubmit();
                                }}
                            >
                                <div className="p-1 bg-green-500/20 rounded">
                                    <TrendingUp className="w-3 h-3 text-green-400" />
                                </div>
                                Scale Winners
                                <span className="ml-auto text-[10px] text-slate-500">High ROAS potential</span>
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                className="justify-start gap-2 h-9 text-xs border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white"
                                onClick={() => {
                                    setInput("Give me an executive summary of the current plan.");
                                    handleSubmit();
                                }}
                            >
                                <div className="p-1 bg-blue-500/20 rounded">
                                    <BarChart className="w-3 h-3 text-blue-400" />
                                </div>
                                Plan Summary
                                <span className="ml-auto text-[10px] text-slate-500">Executive overview</span>
                            </Button>
                        </div>
                    </div>

                    {/* Messages */}
                    <ScrollArea className="flex-1 p-4">
                        <div className="space-y-4">
                            {messages.map((msg, i) => (
                                <div key={i} className="flex flex-col gap-2">
                                    <div className={cn("flex gap-3", msg.role === 'user' ? "flex-row-reverse" : "")}>
                                        {msg.role === 'assistant' && (
                                            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 shadow-md">
                                                {msg.content.includes('⚠️') ? (
                                                    <AlertTriangle className="w-4 h-4 text-amber-300" />
                                                ) : msg.content.includes('Execution complete') ? (
                                                    <CheckCircle2 className="w-4 h-4 text-green-300" />
                                                ) : (
                                                    <Sparkles className="w-4 h-4 text-white" />
                                                )}
                                            </div>
                                        )}
                                        <div className={cn(
                                            "p-3 rounded-2xl text-sm max-w-[85%] shadow-sm",
                                            msg.role === 'assistant'
                                                ? "bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700"
                                                : "bg-indigo-600 text-white rounded-tr-none"
                                        )}>
                                            {typeof msg.content === 'string' && msg.content.split('**').map((part, idx) =>
                                                idx % 2 === 1 ? <span key={idx} className={msg.content.includes('Execution complete') ? "font-bold text-green-400" : "font-bold text-indigo-300"}>{part}</span> : part
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Action Card */}
                                    {msg.pendingAction && msg.role === 'assistant' && (
                                        <div className="ml-11 p-3 bg-slate-900 border border-indigo-500/30 rounded-lg max-w-[85%] animate-in zoom-in-95 duration-200 shadow-lg">
                                            <p className="text-[11px] uppercase tracking-wider font-semibold text-indigo-400 mb-2 flex items-center gap-1.5"><Sparkles className="w-3 h-3"/> Proposed Action</p>
                                            <p className="text-sm text-slate-200 mb-3">
                                                {msg.pendingAction.name === 'setTotalBudget' && `Update total budget to ${formatCurrency(msg.pendingAction.args.newBudget)}.`}
                                                {msg.pendingAction.name === 'setChannelAllocation' && `Update ${msg.pendingAction.args.channelName} allocation to ${msg.pendingAction.args.newAllocationPct}%.`}
                                                {msg.pendingAction.name === 'executeArbitrageRebalance' && `Execute strict arbitrage:`}
                                            </p>
                                            {msg.pendingAction.name === 'executeArbitrageRebalance' && (
                                                <div className="text-xs text-slate-400 font-mono mb-3 bg-slate-950 p-2 rounded border border-slate-800/50">
                                                    - Find lowest ROAS & siphon max 20%<br/>
                                                    - Inject direct to highest ROAS winner
                                                </div>
                                            )}
                                            <Button size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-xs font-semibold" onClick={() => handleConfirmAction(i, msg.pendingAction!)}>
                                               Confirm & Execute
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {/* Scroll Anchor */}
                            <div ref={scrollRef} />
                        </div>
                    </ScrollArea>

                    {/* Input Area */}
                    <form onSubmit={handleSubmit} className="p-3 bg-slate-950 border-t border-slate-800 mt-auto">
                        <div className="relative">
                            <Input
                                placeholder="Ask about spend, roas..."
                                className="pr-10 bg-slate-900 border-slate-700 text-sm focus-visible:ring-indigo-500"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={isLoading}
                            />
                            <Button
                                type="submit"
                                size="icon"
                                className="absolute right-1 top-1 h-7 w-7 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500"
                                disabled={!input.trim() || isLoading}
                            >
                                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            </Button>
                        </div>
                        <p className="text-[10px] text-center text-slate-600 mt-2 flex items-center justify-center gap-1">
                            {channels.length > 0 ? (
                                <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    Live Data Connected
                                </>
                            ) : "Add channels to activate"}
                        </p>
                    </form>
                </Card>
            )}

            {/* TOGGLE BUTTON */}
            <Button
                onClick={() => {
                    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                    const tier = user?.publicMetadata?.tier;
                    if (tier !== 'DEITY' && !devDeityMode && !isLocal) {
                        setIsPaywallOpen(true);
                    } else {
                        setIsOpen(!isOpen);
                    }
                }}
                className={cn(
                    "h-14 w-14 rounded-full shadow-xl transition-all duration-300 hover:scale-105",
                    "bg-gradient-to-tr from-indigo-600 to-purple-600 border-2 border-white/10",
                    isOpen ? "rotate-180 opacity-0 pointer-events-none absolute bottom-0 right-0" : "opacity-100"
                )}
            >
                <Sparkles className="w-7 h-7 text-white" />
            </Button>

            <PaywallModal isOpen={isPaywallOpen} onClose={() => setIsPaywallOpen(false)} featureName="Agentic AI Analyst" />
        </div>
    );
};
