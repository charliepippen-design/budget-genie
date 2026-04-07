import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Slider } from '../../components/ui/slider';
import { TrendingUp, Rocket, Crown, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTheme } from '@/hooks/use-theme';
import { useBlendedMetrics } from '@/hooks/use-media-plan-store';
import { ForecastCard } from './ForecastCard';
import { useBudgetEngine } from '@/hooks/use-budget-engine';

export const BudgetHero = () => {
  const { totalBudget, channels, beginBudgetDrag, endBudgetDrag, isBudgetDragging } =
    useProjectStore();
  const { updateBudget } = useBudgetEngine();
  const { symbol } = useCurrency();
  const blendedMetrics = useBlendedMetrics();
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'contrast';
  const [localBudget, setLocalBudget] = useState(totalBudget);
  const [inputBudget, setInputBudget] = useState(Math.round(totalBudget).toLocaleString('en-US'));
  const [mood, setMood] = useState({
    text: 'Bootstrapping',
    color: 'text-blue-400',
    bg: 'bg-blue-500',
    icon: Zap,
  });

  const minBudget = channels
    .filter((c) => c.tier === 'fixed')
    .reduce((sum, c) => sum + (c.typeConfig.price || 0), 0);

  useEffect(() => {
    setLocalBudget(totalBudget);
    setInputBudget(Math.round(totalBudget).toLocaleString('en-US'));
    updateMood(totalBudget);
  }, [totalBudget]);

  const clampBudget = (value: number) => Math.max(minBudget, Math.min(1000000, value));

  const parseBudgetInput = (raw: string) => {
    const numeric = raw.replace(/[^\d]/g, '');
    return numeric.length > 0 ? Number(numeric) : NaN;
  };

  const updateMood = (value: number) => {
    if (value < 10000)
      setMood({ text: 'Bootstrapping', color: 'text-blue-400', bg: 'bg-blue-500', icon: Zap });
    else if (value < 50000)
      setMood({
        text: 'High Growth Velocity',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500',
        icon: TrendingUp,
      });
    else if (value < 200000)
      setMood({
        text: 'Aggressive Scaling',
        color: 'text-purple-400',
        bg: 'bg-purple-500',
        icon: Rocket,
      });
    else
      setMood({
        text: 'Market Domination',
        color: 'text-orange-500',
        bg: 'bg-orange-500',
        icon: Crown,
      });
  };

  const handleSlide = (val: number[]) => {
    if (!isBudgetDragging) {
      beginBudgetDrag(blendedMetrics.projectedRevenue, blendedMetrics.blendedRoas);
    }

    let value = val[0];
    if (value < minBudget) {
      value = minBudget;
    }
    if (value > 1000000) {
      value = 1000000;
    }
    setLocalBudget(value);
    setInputBudget(Math.round(value).toLocaleString('en-US'));
    updateBudget(value);
    updateMood(value);
  };

  const commitBudgetInput = () => {
    const parsed = parseBudgetInput(inputBudget);
    if (!Number.isFinite(parsed)) {
      setInputBudget(Math.round(localBudget).toLocaleString('en-US'));
      return;
    }

    const clamped = clampBudget(Math.round(parsed));
    setLocalBudget(clamped);
    setInputBudget(clamped.toLocaleString('en-US'));
    updateBudget(clamped);
    updateMood(clamped);
  };

  const presets = [minBudget > 0 ? minBudget : 10000, 25000, 50000, 100000, 500000].filter(
    (v) => v >= minBudget
  );

  return (
    <div
      className={cn(
        'w-full border-b p-6 md:p-8 flex flex-col items-center justify-center space-y-8 relative overflow-hidden shrink-0 transition-all duration-300',
        isDark ? 'bg-[#020617] border-slate-800' : 'bg-transparent border-slate-200'
      )}
    >
      {/* Background Glow Effect */}
      <div
        className={cn(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] blur-[100px] rounded-full pointer-events-none transition-colors duration-500 opacity-10',
          mood.bg
        )}
      />

      {/* SPLIT LAYOUT CONTAINER */}
      <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN: BUDGET INPUT */}
        <div
          className={cn(
            'backdrop-blur-md border rounded-2xl p-8 shadow-2xl flex flex-col items-center justify-between gap-8 h-full transition-all duration-300',
            isDark
              ? 'bg-slate-900/80 dark:bg-slate-900/80 border-slate-700/50 dark:border-slate-700/50'
              : 'bg-white border-slate-200'
          )}
        >
          {/* Dynamic Header */}
          <div
            className={cn(
              'flex items-center gap-2 font-mono text-sm uppercase tracking-widest animate-pulse transition-colors duration-300',
              mood.color
            )}
          >
            <mood.icon className="w-4 h-4" />
            {mood.text}
          </div>

          {/* MASSIVE BUDGET DISPLAY */}
          <div className="relative text-center w-full">
            <div className="flex items-center justify-center gap-2">
              <span
                className={cn(
                  'text-6xl md:text-7xl font-black tracking-tighter drop-shadow-2xl transition-all duration-300',
                  isDark ? 'text-white' : 'text-slate-900'
                )}
              >
                {symbol}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={inputBudget}
                onChange={(event) => {
                  const nextRaw = event.target.value;
                  const parsed = parseBudgetInput(nextRaw);

                  if (!Number.isFinite(parsed)) {
                    setInputBudget('');
                    return;
                  }

                  const clamped = clampBudget(Math.round(parsed));
                  setInputBudget(clamped.toLocaleString('en-US'));
                  setLocalBudget(clamped);
                  updateBudget(clamped);
                  updateMood(clamped);
                }}
                onBlur={commitBudgetInput}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitBudgetInput();
                    (event.currentTarget as HTMLInputElement).blur();
                  }
                }}
                className={cn(
                  'w-full max-w-[520px] bg-transparent border-0 text-center text-6xl md:text-7xl font-black tracking-tighter drop-shadow-2xl transition-all duration-300 focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                  isDark ? 'text-white' : 'text-slate-900'
                )}
                aria-label="Edit total budget"
              />
            </div>
          </div>

          {/* THE GIANT CURSOR (Slider) */}
          <div className="w-full px-4">
            <Slider
              defaultValue={[localBudget]}
              max={1000000}
              step={1000}
              value={[localBudget]}
              onValueChange={handleSlide}
              onValueCommit={() => endBudgetDrag()}
              className="cursor-pointer py-4"
            />
            <div
              className={cn(
                'flex justify-between text-xs mt-2 font-mono uppercase transition-colors duration-300',
                isDark ? 'text-slate-500 dark:text-slate-500' : 'text-slate-600'
              )}
            >
              <span>Min: {symbol}1k</span>
              <span>Max: {symbol}1M+</span>
            </div>
          </div>

          {/* PRESET TRIGGERS */}
          <div className="flex flex-wrap justify-center gap-2">
            {presets.map((amount) => (
              <button
                key={amount}
                onClick={() => handleSlide([amount])}
                className={cn(
                  'px-4 py-2 rounded-full border font-medium text-xs transition-all',
                  isDark
                    ? 'border-slate-700 dark:border-slate-700 bg-slate-950/50 dark:bg-slate-950/50 text-slate-300 dark:text-slate-300 hover:bg-slate-800 dark:hover:bg-slate-800 hover:border-slate-500 dark:hover:border-slate-500 hover:text-white dark:hover:text-white hover:scale-105'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-400 hover:text-slate-900 hover:scale-105',
                  localBudget === amount &&
                    (isDark
                      ? 'ring-2 ring-blue-500 dark:ring-blue-500 bg-blue-500/10 dark:bg-blue-500/10 text-white dark:text-white border-blue-500 dark:border-blue-500'
                      : 'ring-2 ring-blue-400 bg-blue-50 text-blue-900 border-blue-400')
                )}
              >
                {symbol}
                {amount / 1000}k
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: FORECAST ENGINE */}
        <div className="h-full">
          <ForecastCard />
        </div>
      </div>
    </div>
  );
};
