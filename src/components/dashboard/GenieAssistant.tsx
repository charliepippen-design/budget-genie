import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
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
  LayoutGrid,
  Lock,
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { useChannelsWithMetrics } from '@/hooks/use-media-plan-store';
import { cn } from '@/lib/utils';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { calculateDistribution, DistributionStrategy } from '@/lib/distribution-logic';
import { toast } from 'sonner';
import { useVerticalConfig } from '@/hooks/use-vertical-config';

// ─── Tool Schemas ────────────────────────────────────────────────────────────

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

const SetDistributionStrategyToolSchema = z.object({
  tool: z.literal('setDistributionStrategy'),
  strategy: z.enum([
    'balanced',
    'affiliate_dominant',
    'influencer_dominant',
    'hybrid_growth',
    'seo_foundation',
    'conversion_max',
    'programmatic_blitz',
    'retention_ltv',
  ]),
  reason: z.string().optional(),
});

const SetGeoMixToolSchema = z.object({
  tool: z.literal('setGeoMix'),
  tier1Pct: z.number().min(0).max(100),
  tier2Pct: z.number().min(0).max(100),
  reason: z.string().optional(),
});

const UpdatePlayerValueToolSchema = z.object({
  tool: z.literal('updatePlayerValue'),
  playerValue: z.number().min(1).max(100000),
  reason: z.string().optional(),
});

const OracleToolSchema = z.discriminatedUnion('tool', [
  SetTotalBudgetToolSchema,
  SetChannelAllocationToolSchema,
  ExecuteArbitrageRebalanceToolSchema,
  SetDistributionStrategyToolSchema,
  SetGeoMixToolSchema,
  UpdatePlayerValueToolSchema,
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
  isAlert?: boolean;
};

const GENIE_SESSION_KEY = 'genie_last_session';
const SESSION_DIVIDER_TEXT = '— Previous session —';

// ─── Component ───────────────────────────────────────────────────────────────

export const GenieAssistant: React.FC = () => {
  const location = useLocation();
  const [isAiLive, setIsAiLive] = useState<boolean | null>(null); // null = untested
  const hasApiKey = !!import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY;
  const vc = useVerticalConfig();
  const channels = useChannelsWithMetrics();
  const {
    totalBudget,
    setTotalBudget,
    setChannelAllocation,
    setAllocations,
    setGlobalMultipliers,
    setTierAllocation,
    rebalanceToTargets,
    normalizeAllocations,
    globalMultipliers,
    subscriptionTier,
    isGenieOpen,
    setIsGenieOpen,
  } = useProjectStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const showLocalModeBanner = !hasApiKey && isAiLive !== true;

  const isPro = subscriptionTier === 'pro' || subscriptionTier === 'enterprise';

  const buildDistributionChangeSummary = (nextAllocations: Record<string, number>) => {
    const significant = channels
      .map((ch) => {
        const before = ch.allocationPct ?? 0;
        const after = nextAllocations[ch.id] ?? before;
        const delta = after - before;
        return { name: ch.name, delta };
      })
      .filter((item) => Math.abs(item.delta) > 1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    if (significant.length === 0) {
      return 'Strategy applied. No major allocation shifts (>1%).';
    }

    const top = significant.slice(0, 3);
    const summary = top
      .map(
        (item) => `${item.name} ${item.delta > 0 ? '↑' : '↓'} ${Math.abs(item.delta).toFixed(0)}%`
      )
      .join(' · ');

    const remaining = significant.length - top.length;
    return remaining > 0 ? `${summary} + ${remaining} more` : summary;
  };

  const makeMessage = (
    role: 'user' | 'assistant',
    content: string,
    proposal?: OracleToolProposal,
    isAlert?: boolean
  ): ChatMessage => ({
    id: crypto.randomUUID(),
    role,
    content,
    proposal,
    executed: false,
    isAlert,
  });

  // ─── Initial Greeting + Proactive ROAS Alert ───────────────────────────────

  useEffect(() => {
    if (!isGenieOpen || !isPro || messages.length > 0) return;

    const active = channels.filter((c) => c.metrics.spend > 0);
    const totalSpend = active.reduce((s, c) => s + c.metrics.spend, 0);
    const totalRevenue = active.reduce((s, c) => s + c.metrics.revenue, 0);
    const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const topSpender = [...active].sort((a, b) => b.metrics.spend - a.metrics.spend)[0];
    const bestRoas = [...active].sort((a, b) => b.metrics.roas - a.metrics.roas)[0];

    const $ = (n: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(n);

    const init: ChatMessage[] = [];

    if (active.length > 0) {
      const greeting =
        `Plan is at **${blendedRoas.toFixed(2)}x** blended ROAS on **${$(totalSpend)}** deployed. ` +
        `Top spender is **${topSpender?.name}**; best performer is **${bestRoas?.name}** (${bestRoas?.metrics.roas.toFixed(2)}x). ` +
        `${vc.genie.greeting}`;
      init.push(makeMessage('assistant', greeting));

      // Proactive alert: channels below 1x ROAS
      const subOneRoas = active
        .filter((c) => c.metrics.roas < 1 && c.metrics.spend > 0)
        .sort((a, b) => a.metrics.roas - b.metrics.roas);

      if (subOneRoas.length > 0) {
        const names = subOneRoas
          .map((c) => `**${c.name}** (${c.metrics.roas.toFixed(2)}x)`)
          .join(', ');
        const totalWaste = subOneRoas.reduce((s, c) => s + c.metrics.spend, 0);
        const alert =
          `⚠️ **${subOneRoas.length} channel${subOneRoas.length > 1 ? 's are' : ' is'} below 1x ROAS:** ` +
          `${names}. That's **${$(totalWaste)}** in potentially mis-allocated spend.`;
        init.push(makeMessage('assistant', alert, undefined, true));
      }

      const nearSaturation = channels
        .filter((c) => {
          const ceiling = c.typeConfig.baselineMetrics.saturationCeiling ?? 0;
          return (
            c.isActive === true &&
            c.metrics.spend > 0 &&
            ceiling > 0 &&
            c.metrics.spend > ceiling * 0.85
          );
        })
        .sort((a, b) => b.metrics.spend - a.metrics.spend);

      if (nearSaturation.length > 0) {
        const names = nearSaturation.map((c) => `**${c.name}**`).join(', ');
        const verb = nearSaturation.length === 1 ? 'is' : 'are';
        const saturationAlert =
          `⚠ Saturation warning: ${names} ${verb} above 85% of ceiling. ` +
          'Incremental spend here has diminishing returns.';
        init.push(makeMessage('assistant', saturationAlert, undefined, true));
      }
    } else {
      init.push(
        makeMessage(
          'assistant',
          'Channels are configured but no spend is active. Set your budget and allocations to see projections.'
        )
      );
    }

    setMessages(init);
  }, [isGenieOpen, isPro, channels, messages.length, vc.genie.greeting]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GENIE_SESSION_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Array<Pick<ChatMessage, 'role' | 'content' | 'isAlert'>>;
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      const restored: ChatMessage[] = [
        { id: crypto.randomUUID(), role: 'assistant', content: SESSION_DIVIDER_TEXT },
        ...parsed
          .filter(
            (m) =>
              m && (m.role === 'assistant' || m.role === 'user') && typeof m.content === 'string'
          )
          .slice(-5)
          .map((m) => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
            isAlert: m.isAlert,
            executed: false,
          })),
      ];

      if (restored.length > 1) {
        setMessages(restored);
      }
    } catch (error) {
      console.warn('Failed to restore Genie session history', error);
    }
  }, []);

  useEffect(() => {
    try {
      const serializable = messages
        .filter(
          (m) => (m.role === 'assistant' || m.role === 'user') && m.content !== SESSION_DIVIDER_TEXT
        )
        .slice(-5)
        .map(({ role, content, isAlert }) => ({ role, content, isAlert }));

      if (serializable.length === 0) {
        localStorage.removeItem(GENIE_SESSION_KEY);
        return;
      }

      localStorage.setItem(GENIE_SESSION_KEY, JSON.stringify(serializable));
    } catch (error) {
      console.warn('Failed to persist Genie session history', error);
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ─── Local Fallback Analytics ──────────────────────────────────────────────

  const localFallbackResponse = (query: string): string => {
    const lower = query.toLowerCase();
    const $ = (n: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(n);

    if (channels.length === 0)
      return 'No channels found. Add channels to your plan to get insights.';

    const active = channels.filter((c) => c.metrics.spend > 0);
    const totalSpend = active.reduce((s, c) => s + c.metrics.spend, 0);
    const totalRevenue = active.reduce((s, c) => s + c.metrics.revenue, 0);
    const totalFtds = active.reduce((s, c) => s + c.metrics.conversions, 0);
    const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const blendedCpa = totalFtds > 0 ? totalSpend / totalFtds : null;

    const sorted = [...active].sort((a, b) => b.metrics.spend - a.metrics.spend);
    const byRoas = [...active].sort((a, b) => b.metrics.roas - a.metrics.roas);
    const byCpa = [...active]
      .filter((c) => c.metrics.cpa != null && (c.metrics.cpa as number) > 0)
      .sort((a, b) => (a.metrics.cpa as number) - (b.metrics.cpa as number));

    const topSpender = sorted[0];
    const bestRoas = byRoas[0];
    const worstRoas = byRoas[byRoas.length - 1];
    const lowestCpa = byCpa[0];
    const highestCpa = byCpa[byCpa.length - 1];

    if (
      lower.includes('summary') ||
      lower.includes('overview') ||
      lower.includes('executive') ||
      lower.includes('plan')
    ) {
      const roasLine = `Blended ROAS is **${blendedRoas.toFixed(2)}x** on **${$(totalSpend)}** deployed.`;
      const cpaLine = blendedCpa ? `Blended CPA is **${$(blendedCpa)}**.` : '';
      const winnerLine = bestRoas
        ? `**${bestRoas.name}** leads on ROAS at **${bestRoas.metrics.roas.toFixed(2)}x**.`
        : '';
      const wasteFlag =
        worstRoas && worstRoas.metrics.roas < 1
          ? `**${worstRoas.name}** is sub-1x ROAS — a candidate for reallocation.`
          : '';
      return [roasLine, cpaLine, winnerLine, wasteFlag].filter(Boolean).join(' ');
    }

    if (
      lower.includes('waste') ||
      lower.includes('cut') ||
      lower.includes('inefficien') ||
      lower.includes('underperform')
    ) {
      const underperformers = active
        .filter((c) => c.metrics.roas < 1 || c.aboveCpaTarget)
        .sort((a, b) => a.metrics.roas - b.metrics.roas);
      if (underperformers.length === 0)
        return `All active channels are above 1x ROAS. No obvious waste detected.`;
      const worst = underperformers[0];
      return `**${worst.name}** is the weakest channel — ROAS **${worst.metrics.roas.toFixed(2)}x**, spend **${$(worst.metrics.spend)}**. Reducing its allocation would free budget for better-performing channels.`;
    }

    if (
      lower.includes('scale') ||
      lower.includes('winner') ||
      lower.includes('best') ||
      lower.includes('high roas') ||
      lower.includes('top')
    ) {
      if (!bestRoas) return 'No channels with positive ROAS found.';
      const shareOfBudget =
        totalSpend > 0 ? ((bestRoas.metrics.spend / totalSpend) * 100).toFixed(1) : '0';
      return `**${bestRoas.name}** has the highest ROAS at **${bestRoas.metrics.roas.toFixed(2)}x**, currently taking **${shareOfBudget}%** of active spend (${$(bestRoas.metrics.spend)}). Increasing its allocation is the highest-leverage move.`;
    }

    if (lower.includes('cpa') || lower.includes('acquisition') || lower.includes('cost per')) {
      if (lowestCpa) {
        return `Lowest CPA is **${$(lowestCpa.metrics.cpa as number)}** on **${lowestCpa.name}**${highestCpa && highestCpa.id !== lowestCpa.id ? `. Highest is **${$(highestCpa.metrics.cpa as number)}** on **${highestCpa.name}**` : ''}.`;
      }
      return blendedCpa
        ? `Blended CPA across the plan is **${$(blendedCpa)}**.`
        : 'CPA data unavailable — check channel configurations.';
    }

    if (lower.includes('roas') || lower.includes('return')) {
      return `Blended ROAS is **${blendedRoas.toFixed(2)}x**. Best channel is **${bestRoas?.name ?? 'N/A'}** at **${bestRoas?.metrics.roas.toFixed(2) ?? 0}x**${worstRoas ? `. Worst is **${worstRoas.name}** at **${worstRoas.metrics.roas.toFixed(2)}x**` : ''}.`;
    }

    if (
      lower.includes('spend') ||
      lower.includes('budget') ||
      lower.includes('cost') ||
      lower.includes('money')
    ) {
      return `Total deployed spend: **${$(totalSpend)}**. Top spender is **${topSpender?.name ?? 'N/A'}** at **${$(topSpender?.metrics.spend ?? 0)}** (${topSpender ? ((topSpender.metrics.spend / totalSpend) * 100).toFixed(1) : 0}% of budget).`;
    }

    if (lower.includes('ftd') || lower.includes('conversion') || lower.includes('player')) {
      return `The plan is projecting **${Math.round(totalFtds).toLocaleString()} FTDs** at a blended CPA of **${blendedCpa ? $(blendedCpa) : 'N/A'}**.`;
    }

    return `Plan snapshot: **${$(totalSpend)}** deployed, **${blendedRoas.toFixed(2)}x** blended ROAS, **${Math.round(totalFtds).toLocaleString()}** projected FTDs. Ask me about spend, ROAS, CPA, or which channels to cut or scale.`;
  };

  // ─── Execute Confirmed Proposal ────────────────────────────────────────────

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
      case 'setDistributionStrategy': {
        const channelInputs = channels.map((c) => ({
          id: c.id,
          category: c.category,
          family: c.family,
          name: c.name,
        }));
        const newAllocations = calculateDistribution(
          channelInputs,
          proposal.strategy as DistributionStrategy
        );
        setAllocations(newAllocations);
        normalizeAllocations();
        toast.info(buildDistributionChangeSummary(newAllocations), { duration: 4000 });
        break;
      }
      case 'setGeoMix': {
        // Set tier1 first — the store rebalances tier2/tier3 proportionally.
        // Then correct tier2 explicitly; tier3 absorbs the remainder.
        setTierAllocation('tier1', proposal.tier1Pct);
        setTierAllocation('tier2', proposal.tier2Pct);
        break;
      }
      case 'updatePlayerValue': {
        setGlobalMultipliers({ playerValue: proposal.playerValue });
        break;
      }
    }
  };

  const handleConfirmProposal = (messageId: string) => {
    const target = messagesRef.current.find((msg) => msg.id === messageId);
    if (!target?.proposal || target.executed) return;

    const parsed = OracleToolSchema.safeParse(target.proposal);
    if (!parsed.success) return;

    const proposal = parsed.data;
    executeProposal(proposal);

    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, executed: true } : msg))
    );

    const proposalSummary = buildProposalSummary(proposal);
    const confirmationMessage = makeMessage('assistant', `${proposalSummary} applied.`);
    setMessages((prev) => [...prev, confirmationMessage]);

    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));

      const followUpPrompt = `The user just executed: ${proposalSummary}. In 2 sentences, what should they watch next given the current channel data?`;
      const contextMessages = [...messagesRef.current, makeMessage('user', followUpPrompt)];

      setIsLoading(true);
      try {
        const result = await requestOracle(contextMessages);
        setIsAiLive(true);
        setMessages((prev) => [...prev, makeMessage('assistant', result.object.reply)]);
      } catch (error: unknown) {
        console.error('Oracle follow-up request failed:', error);
        setIsAiLive(false);
        const localReply = localFallbackResponse(followUpPrompt);
        setMessages((prev) => [...prev, makeMessage('assistant', localReply)]);
      } finally {
        setIsLoading(false);
      }
    })();
  };

  // ─── Proposal Summary Text ─────────────────────────────────────────────────

  const buildProposalSummary = (proposal: OracleToolProposal): string => {
    const $ = (n: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(n);

    switch (proposal.tool) {
      case 'setTotalBudget':
        return `Set total budget to ${$(proposal.totalBudget)}`;
      case 'setChannelAllocation': {
        const name =
          channels.find((ch) => ch.id === proposal.channelId)?.name ?? proposal.channelId;
        return `Set ${name} allocation to ${proposal.allocationPct.toFixed(1)}%`;
      }
      case 'executeArbitrageRebalance':
        return `Execute arbitrage rebalance${proposal.roasTarget ? ` (ROAS ≥ ${proposal.roasTarget.toFixed(2)}x)` : ''}${proposal.cpaTarget ? ` (CPA ≤ ${$(proposal.cpaTarget)})` : ''}`;
      case 'setDistributionStrategy':
        return `Apply "${proposal.strategy.replace(/_/g, ' ')}" distribution strategy`;
      case 'setGeoMix':
        return `Set geo mix — Tier 1: ${proposal.tier1Pct}%, Tier 2: ${proposal.tier2Pct}%, Tier 3: ${100 - proposal.tier1Pct - proposal.tier2Pct}%`;
      case 'updatePlayerValue':
        return `Update player LTV to ${$(proposal.playerValue)} per FTD`;
    }
  };

  // ─── Gemini Request ────────────────────────────────────────────────────────

  const requestOracle = async (nextMessages: ChatMessage[]) => {
    const apiKey = import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error('Missing Google API Key');

    const google = createGoogleGenerativeAI({ apiKey });
    const channelContext = channels.slice(0, 16).map((c) => {
      const cpa = c.metrics.cpa != null && c.metrics.cpa > 0 ? c.metrics.cpa : null;
      return {
        id: c.id,
        name: c.name,
        spend: Math.round(c.metrics.spend),
        roas: Number(c.metrics.roas.toFixed(2)),
        cpa: cpa != null ? Math.round(cpa) : null,
        ltvToCac: cpa != null ? Number((globalMultipliers.playerValue / cpa).toFixed(2)) : null,
        allocationPct: Number(c.allocationPct.toFixed(1)),
      };
    });

    const oraclePrompt = [
      `Total budget: $${totalBudget.toLocaleString()}`,
      `LTV per FTD (player value): $${globalMultipliers.playerValue}`,
      `CPA target: ${globalMultipliers.cpaTarget != null ? '$' + globalMultipliers.cpaTarget : 'not set'}`,
      `ROAS target: ${globalMultipliers.roasTarget != null ? globalMultipliers.roasTarget + 'x' : 'not set'}`,
      `Channel performance (top 16):\n${JSON.stringify(channelContext, null, 2)}`,
      ...nextMessages.map((m) => `${m.role.toUpperCase()}: ${m.content}`),
    ].join('\n\n');

    const run = (modelName: string) =>
      generateObject({
        model: google(modelName),
        schema: OracleResponseSchema,
        system: vc.genie.persona,
        prompt: oraclePrompt,
      });

    try {
      return await run('gemini-2.0-flash');
    } catch {
      return run('gemini-1.5-flash-latest');
    }
  };

  // ─── Submit Handler ────────────────────────────────────────────────────────

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
      const result = await requestOracle(newMessages);
      setIsAiLive(true);
      setMessages((prev) => [
        ...prev,
        makeMessage('assistant', result.object.reply, result.object.proposal),
      ]);
    } catch (error: unknown) {
      console.error('Oracle request failed:', error);
      setIsAiLive(false);
      const localReply = localFallbackResponse(userMessage.content);
      setMessages((prev) => [...prev, makeMessage('assistant', localReply)]);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Route guard: suppress on client-facing output page ───────────────────
  if (location.pathname === '/output') return null;

  // ─── Render: Pro Gate ──────────────────────────────────────────────────────

  if (!isPro) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => {}}
          title="Upgrade to Pro to unlock the AI Analyst"
          className={cn(
            'h-14 w-14 rounded-full shadow-xl',
            'bg-gradient-to-tr from-slate-700 to-slate-600 border-2 border-white/10',
            'cursor-not-allowed opacity-60'
          )}
        >
          <Lock className="w-6 h-6 text-slate-300" />
        </Button>
      </div>
    );
  }

  // ─── Render: Full UI ───────────────────────────────────────────────────────

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
      {isGenieOpen && (
        <Card className="w-[380px] h-[600px] flex flex-col shadow-2xl border-slate-700 bg-slate-950 overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-10 fade-in">
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
                onClick={() => setIsGenieOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Context + AI mode indicator */}
            <div className="flex items-center justify-between ml-9">
              <p className="text-[10px] text-slate-400">
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
              {isAiLive !== null && (
                <span
                  className={cn(
                    'flex items-center gap-1 text-[10px]',
                    isAiLive ? 'text-green-400' : 'text-amber-400'
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      isAiLive ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
                    )}
                  />
                  {isAiLive ? 'Gemini live' : 'Local mode'}
                </span>
              )}
            </div>

            {showLocalModeBanner ? (
              <div className="ml-9 mt-2 rounded-md border border-amber-500/50 bg-amber-500/20 px-2.5 py-1.5 text-xs text-amber-100">
                Running in local analysis mode. AI advisor unavailable.
              </div>
            ) : null}

            {/* Quick Actions */}
            <div className="grid grid-cols-1 gap-2 mt-4">
              {vc.genie.quickActions.map((action, index) => {
                const Icon =
                  index === 0
                    ? Scissors
                    : index === 1
                      ? TrendingUp
                      : index === 2
                        ? BarChart
                        : LayoutGrid;

                const iconColorClass =
                  index === 0
                    ? 'bg-red-500/20 text-red-400'
                    : index === 1
                      ? 'bg-green-500/20 text-green-400'
                      : index === 2
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-purple-500/20 text-purple-400';

                return (
                  <Button
                    key={`${action.label}-${index}`}
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2 h-9 text-xs border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white"
                    onClick={() => handleSubmit(undefined, action.prompt)}
                  >
                    <div className={cn('p-1 rounded', iconColorClass)}>
                      <Icon className="w-3 h-3" />
                    </div>
                    {action.label}
                    <span className="ml-auto text-[10px] text-slate-500">{action.subLabel}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg, i) =>
                (() => {
                  const isSessionDivider =
                    msg.role === 'assistant' &&
                    msg.content === SESSION_DIVIDER_TEXT &&
                    !msg.proposal;

                  if (isSessionDivider) {
                    return (
                      <div key={i} className="text-center text-sm italic text-slate-500">
                        {msg.content}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={i}
                      className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : '')}
                    >
                      {msg.role === 'assistant' && (
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                            msg.isAlert ? 'bg-amber-600' : 'bg-indigo-600'
                          )}
                        >
                          {msg.isAlert ? (
                            <AlertTriangle className="w-4 h-4 text-white" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-white" />
                          )}
                        </div>
                      )}
                      <div
                        className={cn(
                          'p-3 rounded-2xl text-sm max-w-[85%]',
                          msg.role === 'assistant'
                            ? msg.isAlert
                              ? 'bg-amber-950/60 text-amber-100 rounded-tl-none border border-amber-700/50'
                              : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'
                            : 'bg-indigo-600 text-white rounded-tr-none'
                        )}
                      >
                        {typeof msg.content === 'string' &&
                          msg.content.split('**').map((part, idx) =>
                            idx % 2 === 1 ? (
                              <span
                                key={idx}
                                className={cn(
                                  'font-bold',
                                  msg.isAlert ? 'text-amber-300' : 'text-indigo-300'
                                )}
                              >
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
                  );
                })()
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="p-3 bg-slate-950 border-t border-slate-800 mt-auto"
          >
            <div className="relative">
              <Input
                placeholder="Ask about spend, ROAS, geo mix, strategy..."
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
            <div className="mt-2 flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-slate-400 hover:text-slate-200"
                onClick={() => {
                  localStorage.removeItem(GENIE_SESSION_KEY);
                  setMessages([]);
                }}
              >
                Clear history
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Toggle Button */}
      <Button
        onClick={() => setIsGenieOpen(!isGenieOpen)}
        className={cn(
          'h-14 w-14 rounded-full shadow-xl transition-all duration-300 hover:scale-105',
          'bg-gradient-to-tr from-indigo-600 to-purple-600 border-2 border-white/10',
          isGenieOpen
            ? 'rotate-180 opacity-0 pointer-events-none absolute bottom-0 right-0'
            : 'opacity-100'
        )}
      >
        <Sparkles className="w-7 h-7 text-white" />
      </Button>
    </div>
  );
};
