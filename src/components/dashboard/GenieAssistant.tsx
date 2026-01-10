import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Send, Sparkles, Bot, Loader2, AlertTriangle } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import { cn } from '@/lib/utils';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, CoreMessage } from 'ai';

export const GenieAssistant: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const channels = useChannelsWithMetrics();
    const { totalBudget } = useProjectStore();

    // Manual State Management for Client-Side Chat
    const [messages, setMessages] = useState<CoreMessage[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Refs for scrolling
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initial Greeting & Insight Logic
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            if (channels.length > 0) {
                const topSpender = [...channels].sort((a, b) => b.metrics.spend - a.metrics.spend)[0];
                const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(topSpender?.metrics.spend || 0);

                if (topSpender) {
                    setMessages([
                        {
                            role: 'assistant',
                            content: `The channel spending the most is **${topSpender.name}** at **${amount}**.`
                        }
                    ]);
                }
            } else {
                setMessages([
                    {
                        role: 'assistant',
                        content: `I'm ready to help! Add some channels to get started. 🧞‍♂️`
                    }
                ]);
            }
        }
    }, [isOpen, channels, messages.length]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // --- LOCAL FALLBACK ENGINE ---
    const localFallbackResponse = (query: string): string => {
        const lower = query.toLowerCase();
        const currency = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);

        // 1. Spend / Cost
        if (lower.includes('spend') || lower.includes('cost') || lower.includes('money')) {
            if (channels.length === 0) return "You haven't added any channels yet.";

            // Highest spender
            const sorted = [...channels].sort((a, b) => b.metrics.spend - a.metrics.spend);
            const top = sorted[0];
            const topAmt = currency(top.metrics.spend);

            return `Your top spender is **${top.name}** (${topAmt}). Total spend is **${currency(sorted.reduce((s, c) => s + c.metrics.spend, 0))}**.`;
        }

        // 2. ROAS / Return
        if (lower.includes('roas') || lower.includes('return') || lower.includes('effec')) {
            if (channels.length === 0) return "No data available.";
            // Best ROAS (with > $0 spend)
            const active = channels.filter(c => c.metrics.spend > 0);
            if (active.length === 0) return "No channels have active spend yet.";

            const best = [...active].sort((a, b) => b.metrics.roas - a.metrics.roas)[0];
            return `Based on performance, **${best.name}** has the best ROAS at **${best.metrics.roas.toFixed(2)}x**.`;
        }

        // 3. Budget
        if (lower.includes('budget') || lower.includes('total')) {
            return `Your total budget is set to **${currency(totalBudget)}**.`;
        }

        return "I couldn't look that up directly, but I'm monitoring your channel performance daily!";
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = { role: 'user' as const, content: input };
        const newMessages = [...messages, userMessage];

        setMessages(newMessages);
        setInput("");
        setIsLoading(true);

        try {
            console.log("DEBUG: Attempting AI Request...");

            const apiKey = import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY;

            if (!apiKey) {
                console.warn("DEBUG: No API Key. Switching to local fallback.");
                throw new Error("Missing Google API Key");
            }

            const google = createGoogleGenerativeAI({ apiKey });

            // Context
            const contextData = {
                totalBudget,
                channels: channels.map(c => ({ name: c.name, spend: c.metrics.spend, roas: c.metrics.roas }))
            };

            const systemPrompt = `
                You are "Budget Genie", a helpful and witty financial assistant.
                Current Budget Context: ${JSON.stringify(contextData, null, 2)}
                
                Guidelines:
                1. Be concise, friendly, and professional.
                2. Use bolding for numbers and key terms.
            `;

            // Try Gemini Flash
            const { text } = await generateText({
                model: google('gemini-1.5-flash'),
                system: systemPrompt,
                messages: newMessages,
            });

            console.log("DEBUG: AI Success.");
            setMessages(prev => [...prev, { role: 'assistant', content: text }]);

        } catch (error: any) {
            console.error("DEBUG: AI Failed. Using Fallback.", error);

            const isApiKeyError = error.message?.includes("Missing Google API Key");
            const isModelError = error.message?.includes("not found");

            // Generate Local Response
            const localReply = localFallbackResponse(userMessage.content);

            // Add Warning Note
            let note = "";
            if (isApiKeyError) note = "\n\n*(⚠️ API Key Missing - Showing cached insights)*";
            else if (isModelError) note = "\n\n*(⚠️ AI Model Unavailable - Showing cached insights)*";
            else note = "\n\n*(⚠️ Network Issue - Showing cached insights)*";

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: localReply + note
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">

            {/* CHAT WINDOW */}
            {isOpen && (
                <Card className={cn(
                    "w-[340px] h-[450px] flex flex-col shadow-2xl border-slate-700 bg-slate-900 overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-10 fade-in",
                )}>
                    {/* Header */}
                    <div className="p-3 border-b border-slate-800 bg-indigo-600/10 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-indigo-100">
                            <div className="p-1.5 bg-indigo-600 rounded-lg">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <span className="font-semibold text-sm">Budget Genie</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white" onClick={() => setIsOpen(false)}>
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Messages */}
                    <ScrollArea className="flex-1 p-4">
                        <div className="space-y-4">
                            {messages.map((msg, i) => (
                                <div key={i} className={cn("flex gap-3", msg.role === 'user' ? "flex-row-reverse" : "")}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                                            {msg.content.includes('⚠️') ? (
                                                <AlertTriangle className="w-4 h-4 text-amber-300" />
                                            ) : (
                                                <Sparkles className="w-4 h-4 text-white" />
                                            )}
                                        </div>
                                    )}
                                    <div className={cn(
                                        "p-3 rounded-2xl text-sm max-w-[85%]",
                                        msg.role === 'assistant'
                                            ? "bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700"
                                            : "bg-indigo-600 text-white rounded-tr-none"
                                    )}>
                                        {typeof msg.content === 'string' && msg.content.split('**').map((part, idx) =>
                                            idx % 2 === 1 ? <span key={idx} className="font-bold text-indigo-300">{part}</span> : part
                                        )}
                                    </div>
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
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "h-14 w-14 rounded-full shadow-xl transition-all duration-300 hover:scale-105",
                    "bg-gradient-to-tr from-indigo-600 to-purple-600 border-2 border-white/10",
                    isOpen ? "rotate-180 opacity-0 pointer-events-none absolute bottom-0 right-0" : "opacity-100"
                )}
            >
                <Sparkles className="w-7 h-7 text-white" />
            </Button>
        </div>
    );
};
