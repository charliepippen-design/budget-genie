import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, X, Send, Sparkles, Bot } from 'lucide-react';
import { useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import { cn } from '@/lib/utils';

export const GenieAssistant: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'genie' | 'user'; text: string }[]>([]);
    const channels = useChannelsWithMetrics();

    // Insight Logic: Highest Spender
    useEffect(() => {
        if (isOpen && messages.length === 0 && channels.length > 0) {
            // Find highest spend channel
            const topSpender = [...channels].sort((a, b) => b.metrics.spend - a.metrics.spend)[0];

            if (topSpender) {
                const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(topSpender.metrics.spend);
                setMessages([
                    {
                        role: 'genie',
                        text: `The channel spending the most is **${topSpender.name}** at **${amount}**.`
                    }
                ]);
            } else {
                setMessages([{ role: 'genie', text: "I'm ready to help! Add some channels to get started." }]);
            }
        }
    }, [isOpen, channels, messages.length]);

    const handleSend = () => {
        // Placeholder for future logic
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
                                    {msg.role === 'genie' && (
                                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                                            <Sparkles className="w-4 h-4 text-white" />
                                        </div>
                                    )}
                                    <div className={cn(
                                        "p-3 rounded-2xl text-sm max-w-[85%]",
                                        msg.role === 'genie'
                                            ? "bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700"
                                            : "bg-indigo-600 text-white rounded-tr-none"
                                    )}>
                                        {msg.text.split('**').map((part, idx) =>
                                            idx % 2 === 1 ? <span key={idx} className="font-bold text-indigo-300">{part}</span> : part
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>

                    {/* Input Area */}
                    <div className="p-3 bg-slate-950 border-t border-slate-800 mt-auto">
                        <div className="relative">
                            <Input
                                placeholder="Ask anything..."
                                className="pr-10 bg-slate-900 border-slate-700 text-sm focus-visible:ring-indigo-500"
                                disabled
                            />
                            <Button size="icon" className="absolute right-1 top-1 h-7 w-7 bg-indigo-600 hover:bg-indigo-700">
                                <Send className="w-3 h-3" />
                            </Button>
                        </div>
                        <p className="text-[10px] text-center text-slate-600 mt-2">
                            AI insights driven by your live data.
                        </p>
                    </div>
                </Card>
            )}

            {/* TOGGLE BUTTON */}
            <Button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "h-14 w-14 rounded-full shadow-xl transition-all duration-300 hover:scale-105",
                    "bg-gradient-to-tr from-indigo-600 to-purple-600 border-2 border-white/10",
                    isOpen ? "rotate-180 opacity-0 pointer-events-none absolute bottom-0 right-0" : "opacity-100" // Hide when open nicely
                )}
            >
                <Sparkles className="w-7 h-7 text-white" />
            </Button>

            {/* Re-show button when open but static? No, usually it transforms or hides. 
                Let's keep it simple: If open, hide the big button or turn it into close?
                Design asked for "Collapsed State" button. 
                I'll hide the floating button when open, relying on the 'X' in the header to close. 
                Actually, typical chat widgets keep the button or turn it into a close button. 
                I implemented hide for cleanliness.
            */}

        </div>
    );
};
