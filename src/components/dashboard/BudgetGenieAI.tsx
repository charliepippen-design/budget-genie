import { useState, useRef, useEffect } from 'react';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { Bot, Sparkles, X, Loader2, Send, Trash2, TrendingUp, Scissors, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMediaPlanStore, useChannelsWithMetrics, useBlendedMetrics } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';

// Keep your working model
const MODEL_NAME = 'gemini-2.5-flash';

const google = createGoogleGenerativeAI({
    apiKey: import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY || '',
});

type Message = {
    role: 'user' | 'assistant';
    text: string;
};

export function BudgetGenieAI() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const [imageError, setImageError] = useState(false);

    // Auto-scroll to bottom
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, loading]);

    // Hook into data
    const { totalBudget } = useMediaPlanStore();
    const channels = useChannelsWithMetrics();
    const metrics = useBlendedMetrics();
    const { symbol } = useCurrency();

    const activeChannelCount = channels.filter(c => (c as any).allocationPct > 0).length;

    const getSystemContext = (userQuery: string) => {
        const safeMetric = (val: any) => val || 0;

        const channelList = channels.map((c: any) => {
            const name = c.name;
            const alloc = safeMetric(c.allocationPct);
            const spend = safeMetric(c.metrics?.spend);
            const roas = safeMetric(c.metrics?.roas);

            if (alloc > 0) {
                return `* CHANNEL: "${name}" | Spend: ${symbol}${spend.toLocaleString()} (Alloc: ${alloc.toFixed(1)}%) | ROAS: ${roas.toFixed(2)}x`;
            }
            return null;
        }).filter(Boolean).join('\n');

        return `
      You are "MediaPlanner Pro Advisor", an elite Senior Media Buying Strategist.
      
      === DASHBOARD TOTALS ===
      Total Budget: ${symbol}${totalBudget.toLocaleString()}
      Allocated Spend: ${symbol}${metrics.totalSpend.toLocaleString()}
      Blended ROAS: ${metrics.blendedRoas}x
      
      === CHANNEL PERFORMANCE ===
      ${channelList || "No active channels."}
      
      === USER REQUEST ===
      "${userQuery}"
      
      INSTRUCTIONS:
      1. Act as an optimizer. Don't just read numbers; give ADVICE.
      2. If looking for "Cuts": Identify channels with High Spend but LOW ROAS (< 1.5).
      3. If looking to "Scale": Identify channels with Low Spend but HIGH ROAS (> 2.5).
      4. Be concise (max 3-4 sentences). Use bullet points for clarity.
    `;
    };

    const handleAsk = async (customQuery?: string) => {
        const promptText = customQuery || query;
        if (!promptText.trim()) return;

        // Add User Message
        setMessages(prev => [...prev, { role: 'user', text: promptText }]);
        setQuery('');
        setLoading(true);

        try {
            const prompt = getSystemContext(promptText);
            const { text } = await generateText({
                model: google(MODEL_NAME),
                prompt: prompt,
            });

            // Add AI Response
            setMessages(prev => [...prev, { role: 'assistant', text: text }]);
        } catch (error: any) {
            setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${error.message || "Connection failed. Try again."}` }]);
        }
        setLoading(false);
    };

    if (!isOpen) {
        return (
            <Button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl bg-[#0f172a] hover:bg-[#1e293b] border border-blue-500/30 hover:scale-110 hover:shadow-blue-500/50 transition-all duration-300 z-50 flex items-center justify-center group"
            >
                <Sparkles className="h-6 w-6 text-blue-400 group-hover:text-white animate-pulse" />
            </Button>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 w-[400px] h-[600px] bg-[#0f172a]/95 backdrop-blur-sm border border-blue-500/20 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300 text-slate-100 font-sans">

            {/* Header */}
            <div className="bg-[#1e293b] p-4 flex justify-between items-center text-white shadow-md border-b border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="bg-slate-800 p-1.5 rounded-lg border border-slate-700">
                        {!imageError ? (
                            <img
                                src="https://igamingperform.com/wp-content/uploads/2023/10/logo-1.svg"
                                alt="Logo"
                                className="h-6 w-auto"
                                onError={() => setImageError(true)}
                            />
                        ) : (
                            <Bot className="h-5 w-5 text-blue-400" />
                        )}
                    </div>
                    <div>
                        <span className="font-bold text-sm block tracking-wide">MediaPlanner Pro Advisor</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
                            {activeChannelCount} Channels Active
                        </span>
                    </div>
                </div>
                <div className="flex gap-1">
                    <button onClick={() => setMessages([])} className="hover:bg-slate-700 rounded p-1.5 transition-colors text-slate-400 hover:text-white" title="Clear Chat">
                        <Trash2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => setIsOpen(false)} className="hover:bg-red-500/20 hover:text-red-400 rounded p-1.5 transition-colors text-slate-400">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <ScrollArea className="flex-1 p-4 bg-[#0f172a]">
                {messages.length === 0 ? (
                    <div className="text-center mt-12 space-y-6">
                        <div className="bg-[#1e293b] p-4 rounded-xl shadow-lg border border-slate-700 inline-block mx-auto">
                            {!imageError ? (
                                <img
                                    src="https://igamingperform.com/wp-content/uploads/2023/10/logo-1.svg"
                                    alt="Logo"
                                    className="h-8 w-auto opacity-80"
                                />
                            ) : (
                                <Sparkles className="h-8 w-8 text-blue-500 mx-auto" />
                            )}
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-100 text-lg">AI Performance Analyst</h3>
                            <p className="text-sm text-slate-400 mt-1 px-8">
                                Analyzing {symbol}{totalBudget.toLocaleString()} budget across {activeChannelCount} channels.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 px-6">
                            <Button
                                variant="ghost"
                                className="justify-start gap-3 h-auto py-3 bg-[#1e293b] hover:bg-[#334155] border border-slate-700 hover:border-blue-500/50 transition-all text-left group"
                                onClick={() => handleAsk("Identify waste: Which channels have high spend but low ROAS?")}
                            >
                                <div className="p-2 rounded-lg bg-[#0f172a] group-hover:bg-[#1e293b] transition-colors border border-slate-800">
                                    <Scissors className="h-4 w-4 text-red-500" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-200">Cut Waste</span>
                                    <span className="block text-[10px] text-slate-500 group-hover:text-slate-400">Find inefficient spend</span>
                                </div>
                            </Button>

                            <Button
                                variant="ghost"
                                className="justify-start gap-3 h-auto py-3 bg-[#1e293b] hover:bg-[#334155] border border-slate-700 hover:border-blue-500/50 transition-all text-left group"
                                onClick={() => handleAsk("Identify opportunities: Which channels have high ROAS but low allocation?")}
                            >
                                <div className="p-2 rounded-lg bg-[#0f172a] group-hover:bg-[#1e293b] transition-colors border border-slate-800">
                                    <TrendingUp className="h-4 w-4 text-green-500" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-200">Scale Winners</span>
                                    <span className="block text-[10px] text-slate-500 group-hover:text-slate-400">High ROAS potential</span>
                                </div>
                            </Button>

                            <Button
                                variant="ghost"
                                className="justify-start gap-3 h-auto py-3 bg-[#1e293b] hover:bg-[#334155] border border-slate-700 hover:border-blue-500/50 transition-all text-left group"
                                onClick={() => handleAsk("Give me a brief executive summary of this media plan performance.")}
                            >
                                <div className="p-2 rounded-lg bg-[#0f172a] group-hover:bg-[#1e293b] transition-colors border border-slate-800">
                                    <BarChart3 className="h-4 w-4 text-blue-500" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-200">Plan Summary</span>
                                    <span className="block text-[10px] text-slate-500 group-hover:text-slate-400">Executive overview</span>
                                </div>
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 pb-4">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`
                                        max-w-[85%] rounded-2xl p-3 text-sm shadow-md animate-in fade-in slide-in-from-bottom-2 duration-300
                                        ${m.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-br-none'
                                            : 'bg-[#1e293b] text-slate-200 border border-slate-700 rounded-bl-none'}
                                    `}
                                >
                                    {m.role === 'assistant' && (
                                        <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                                            <Sparkles className="h-3 w-3" /> AI Analysis
                                        </div>
                                    )}
                                    <div className="whitespace-pre-wrap leading-relaxed">
                                        {m.text}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-[#1e293b] border border-slate-700 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                                    <span className="text-xs text-slate-400">Analyzing performance data...</span>
                                </div>
                            </div>
                        )}
                        <div ref={scrollRef} />
                    </div>
                )}
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 bg-[#1e293b] border-t border-slate-700">
                <div className="flex items-center gap-2 bg-[#0f172a] rounded-xl px-3 py-2 border border-slate-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all shadow-inner">
                    <input
                        className="flex-1 bg-transparent text-sm focus:outline-none text-slate-100 placeholder:text-slate-500 font-medium"
                        placeholder="Ask a strategic question..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                    />
                    <Button
                        size="icon"
                        className="h-8 w-8 bg-blue-600 hover:bg-blue-500 rounded-lg transition-all hover:scale-105 shadow-lg shadow-blue-500/20"
                        onClick={() => handleAsk()}
                        disabled={loading || !query}
                    >
                        <Send className="h-4 w-4 text-white" />
                    </Button>
                </div>
            </div>
        </div>
    );
}