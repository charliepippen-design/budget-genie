import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  X,
  Send,
  Sparkles,
  Bot,
  Loader2,
  AlertTriangle,
  Scissors,
  TrendingUp,
  BarChart,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import { cn } from '@/lib/utils';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

const SetTotalBudgetToolSchema = z.object({
  tool: z.literal('setTotalBudget'),
  totalBudget: z.number().min(1000).max(10000000),
  reason: z.string().optional(),
});

const SetChannelAllocationToolSchema = z.object({
  tool: z.literal('setChannelAllocation'),
  channelId: z.string(),
  allocationPct: z.number().min(0).max(100),
  reason: z.string().optional(),
});

const ExecuteArbitrageRebalanceToolSchema = z.object({
  tool: z.literal('executeArbitrageRebalance'),
  roasTarget: z.number().min(0).max(100).optional(),
  cpaTarget: z.number().min(0).max(100000).optional(),
  reason: z.string().optional(),
});

const OracleToolSchema = z.discriminatedUnion('tool', [
  SetTotalBudgetToolSchema,
  SetChannelAllocationToolSchema,
  ExecuteArbitrageRebalanceToolSchema,
]);

const OracleResponseSchema = z.object({
  reply: z.string(),
  proposal: OracleToolSchema.optional(),
});

type OracleToolProposal = z.infer<typeof OracleToolSchema>;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposal?: OracleToolProposal;
  executed?: boolean;
};

export const GenieAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const channels = useChannelsWithMetrics();
  const {
    totalBudget,
    setTotalBudget,
    setChannelAllocation,
    setGlobalMultipliers,
    rebalanceToTargets,
    normalizeAllocations,
    globalMultipliers,
  } = useProjectStore();

  // Manual State Management for Client-Side Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Refs for scrolling
  const scrollRef = useRef<HTMLDivElement>(null);

  const makeMessage = (
    role: 'user' | 'assistant',
    content: string,
    proposal?: OracleToolProposal
  ): ChatMessage => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    proposal,
    executed: false,
  });

  // Initial Greeting & Insight Logic
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      if (channels.length > 0) {
        const topSpender = [...channels].sort((a, b) => b.metrics.spend - a.metrics.spend)[0];
        const amount = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(topSpender?.metrics.spend || 0);

        if (topSpender) {
          setMessages([
            {
              id: `welcome-${Date.now()}`,
              role: 'assistant',
              content: `The channel spending the most is **${topSpender.name}** at **${amount}**.`,
            },
          ]);
        }
      } else {
        setMessages([
          {
            id: `welcome-${Date.now()}`,
            role: 'assistant',
            content: `I'm ready to help! Add some channels to get started. 🧞‍♂️`,
          },
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
    const currency = (num: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);

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
      if (channels.length === 0) return 'No data available.';
      // Best ROAS (with > $0 spend)
      const active = channels.filter((c) => c.metrics.spend > 0);
      if (active.length === 0) return 'No channels have active spend yet.';

      const best = [...active].sort((a, b) => b.metrics.roas - a.metrics.roas)[0];
      return `Based on performance, **${best.name}** has the best ROAS at **${best.metrics.roas.toFixed(2)}x**.`;
    }

    // 3. Budget
    if (lower.includes('budget') || lower.includes('total')) {
      return `Your total budget is set to **${currency(totalBudget)}**.`;
    }

    return "I couldn't look that up directly, but I'm monitoring your channel performance daily!";
  };

  const executeProposal = (proposal: OracleToolProposal) => {
    switch (proposal.tool) {
      case 'setTotalBudget': {
        setTotalBudget(proposal.totalBudget);
        break;
      }
      case 'setChannelAllocation': {
        setChannelAllocation(proposal.channelId, proposal.allocationPct);
        normalizeAllocations();
        break;
      }
      case 'executeArbitrageRebalance': {
        setGlobalMultipliers({
          roasTarget: proposal.roasTarget ?? globalMultipliers.roasTarget,
          cpaTarget: proposal.cpaTarget ?? globalMultipliers.cpaTarget,
        });
        rebalanceToTargets();
        break;
      }
    }
  };

  const handleConfirmProposal = (messageId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId || !msg.proposal || msg.executed) return msg;
        const parsed = OracleToolSchema.safeParse(msg.proposal);
        if (!parsed.success) return msg;
        executeProposal(parsed.data);
        return { ...msg, executed: true };
      })
    );
  };

  const buildProposalSummary = (proposal: OracleToolProposal): string => {
    if (proposal.tool === 'setTotalBudget') {
      return `Set total budget to ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(proposal.totalBudget)}`;
    }

    if (proposal.tool === 'setChannelAllocation') {
      const channelName =
        channels.find((ch) => ch.id === proposal.channelId)?.name ?? proposal.channelId;
      return `Set ${channelName} allocation to ${proposal.allocationPct.toFixed(1)}%`;
    }

    return `Execute arbitrage rebalance${proposal.roasTarget ? ` (ROAS >= ${proposal.roasTarget.toFixed(2)}x)` : ''}${proposal.cpaTarget ? ` (CPA <= $${proposal.cpaTarget.toFixed(2)})` : ''}`;
  };

  const requestOracle = async (nextMessages: ChatMessage[]) => {
    const apiKey = import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing Google API Key');
    }

    const google = createGoogleGenerativeAI({ apiKey });
    const channelContext = channels.slice(0, 16).map((c) => ({
      id: c.id,
      name: c.name,
      spend: c.metrics.spend,
      roas: c.metrics.roas,
      cpa: c.metrics.cpa,
      ratio: c.metrics.cpa > 0 ? globalMultipliers.playerValue / c.metrics.cpa : 0,
    }));

    const oraclePrompt = [
      `Current budget: ${totalBudget}`,
      `Global LTV proxy: ${globalMultipliers.playerValue}`,
      `Channels: ${JSON.stringify(channelContext)}`,
      ...nextMessages.map((m) => `${m.role.toUpperCase()}: ${m.content}`),
    ].join('\n\n');

    const run = (modelName: 'gemini-1.5-flash' | 'gemini-1.5-pro') =>
      generateObject({
        model: google(modelName),
        schema: OracleResponseSchema,
        system: `You are The Oracle, a senior iGaming media auditor.
Prioritize LTV:CPA arbitrage over vanity spend.
Never execute tools directly; always return one optional proposal for explicit user confirmation.
Proposal rules:
- setTotalBudget for macro budget shifts.
- setChannelAllocation for one channel-level shift.
- executeArbitrageRebalance for full rebalance according to ROAS/CPA constraints.
If uncertain, return no proposal and explain your reasoning briefly.`,
        prompt: oraclePrompt,
      });

    try {
      return await run('gemini-1.5-flash');
    } catch {
      return run('gemini-1.5-pro');
    }
  };

  const handleSubmit = async (e?: React.FormEvent, promptOverride?: string) => {
    if (e) e.preventDefault();
    const query = (promptOverride ?? input).trim();
    if (!query || isLoading) return;

    const userMessage = makeMessage('user', query);
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      console.log('DEBUG: Attempting AI Request...');

      const result = await requestOracle(newMessages);

      console.log('DEBUG: AI Success.');
      setMessages((prev) => [
        ...prev,
        makeMessage('assistant', result.object.reply, result.object.proposal),
      ]);
    } catch (error: unknown) {
      console.error('DEBUG: AI Failed. Using Fallback.', error);

      const errorMessage = error instanceof Error ? error.message : '';
      const isApiKeyError = errorMessage.includes('Missing Google API Key');
      const isModelError = errorMessage.includes('not found');

      // Generate Local Response
      const localReply = localFallbackResponse(userMessage.content);

      // Add Warning Note
      let note = '';
      if (isApiKeyError) note = '\n\n*(⚠️ API Key Missing - Showing cached insights)*';
      else if (isModelError) note = '\n\n*(⚠️ AI Model Unavailable - Showing cached insights)*';
      else note = '\n\n*(⚠️ Network Issue - Showing cached insights)*';

      setMessages((prev) => [...prev, makeMessage('assistant', localReply + note)]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
      {/* CHAT WINDOW */}
      {isOpen && (
        <Card
          className={cn(
            'w-[380px] h-[600px] flex flex-col shadow-2xl border-slate-700 bg-slate-950 overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-10 fade-in'
          )}
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-indigo-100">
                <div className="p-1.5 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-sm tracking-wide">AI Performance Analyst</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-400 hover:text-white"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-slate-400 ml-9">
              Analyzing{' '}
              <span className="text-slate-200 font-mono">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0,
                }).format(totalBudget)}
              </span>{' '}
              across <span className="text-slate-200 font-mono">{channels.length} channels</span>.
            </p>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2 h-9 text-xs border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white"
                onClick={() => {
                  handleSubmit(
                    undefined,
                    'Identify wasted spend and inefficient channels. Propose one action card.'
                  );
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
                  handleSubmit(
                    undefined,
                    'Identify high LTV:CPA channels to scale. Propose one action card.'
                  );
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
                  handleSubmit(
                    undefined,
                    'Give me an executive summary with one actionable proposal.'
                  );
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
                <div
                  key={i}
                  className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : '')}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                      {msg.content.includes('⚠️') ? (
                        <AlertTriangle className="w-4 h-4 text-amber-300" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-white" />
                      )}
                    </div>
                  )}
                  <div
                    className={cn(
                      'p-3 rounded-2xl text-sm max-w-[85%]',
                      msg.role === 'assistant'
                        ? 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'
                        : 'bg-indigo-600 text-white rounded-tr-none'
                    )}
                  >
                    {typeof msg.content === 'string' &&
                      msg.content.split('**').map((part, idx) =>
                        idx % 2 === 1 ? (
                          <span key={idx} className="font-bold text-indigo-300">
                            {part}
                          </span>
                        ) : (
                          part
                        )
                      )}

                    {msg.proposal && (
                      <div className="mt-3 rounded-lg border border-indigo-500/30 bg-slate-900/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-indigo-300 mb-2">
                          Oracle Action Confirmation
                        </p>
                        <p className="text-xs text-slate-200 mb-3">
                          {buildProposalSummary(msg.proposal)}
                        </p>
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700"
                          onClick={() => handleConfirmProposal(msg.id)}
                          disabled={msg.executed}
                        >
                          {msg.executed ? 'Executed' : 'Confirm & Execute'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {/* Scroll Anchor */}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <form
            onSubmit={handleSubmit}
            className="p-3 bg-slate-950 border-t border-slate-800 mt-auto"
          >
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
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-center text-slate-600 mt-2 flex items-center justify-center gap-1">
              {channels.length > 0 ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live Data Connected
                </>
              ) : (
                'Add channels to activate'
              )}
            </p>
          </form>
        </Card>
      )}

      {/* TOGGLE BUTTON */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'h-14 w-14 rounded-full shadow-xl transition-all duration-300 hover:scale-105',
          'bg-gradient-to-tr from-indigo-600 to-purple-600 border-2 border-white/10',
          isOpen
            ? 'rotate-180 opacity-0 pointer-events-none absolute bottom-0 right-0'
            : 'opacity-100'
        )}
      >
        <Sparkles className="w-7 h-7 text-white" />
      </Button>
    </div>
  );
};
