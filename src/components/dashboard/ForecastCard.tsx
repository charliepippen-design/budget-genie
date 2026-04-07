import React from 'react';
import { useBlendedMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTheme } from '@/hooks/use-theme';
import { Target, TrendingUp, Users, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ForecastCard = () => {
  const { projectedRevenue, blendedCpa, blendedRoas, totalConversions } = useBlendedMetrics();
  const {
    isBudgetDragging,
    budgetDragBaselineRevenue,
    budgetDragBaselineRoas,
    ghostProjectedRevenue,
  } = useMediaPlanStore();
  const { symbol } = useCurrency();
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'contrast';

  const revenueDeltaPct =
    isBudgetDragging && budgetDragBaselineRevenue && budgetDragBaselineRevenue > 0
      ? ((projectedRevenue - budgetDragBaselineRevenue) / budgetDragBaselineRevenue) * 100
      : null;

  const roasDeltaPct =
    isBudgetDragging && budgetDragBaselineRoas && budgetDragBaselineRoas > 0
      ? ((blendedRoas - budgetDragBaselineRoas) / budgetDragBaselineRoas) * 100
      : null;

  return (
    <div
      className={cn(
        'h-full backdrop-blur-sm border rounded-xl p-6 flex flex-col justify-between transition-all duration-300',
        isDark
          ? 'bg-slate-800/50 dark:bg-slate-800/50 border-slate-700/50 dark:border-slate-700/50'
          : 'bg-white border-slate-200'
      )}
    >
      <div className="flex items-center gap-2 mb-6">
        <div
          className={cn(
            'p-2 rounded-lg transition-colors duration-300',
            isDark ? 'bg-emerald-500/10 dark:bg-emerald-500/10' : 'bg-emerald-100'
          )}
        >
          <TrendingUp
            className={cn(
              'w-5 h-5 transition-colors duration-300',
              isDark ? 'text-emerald-400 dark:text-emerald-400' : 'text-emerald-600'
            )}
          />
        </div>
        <div>
          <h3
            className={cn(
              'text-lg font-semibold transition-colors duration-300',
              isDark ? 'text-white dark:text-white' : 'text-slate-900'
            )}
          >
            Projected Outcomes
          </h3>
          <p
            className={cn(
              'text-xs transition-colors duration-300',
              isDark ? 'text-slate-400 dark:text-slate-400' : 'text-slate-600'
            )}
          >
            Based on current allocation
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Est. Revenue */}
        <div
          className={cn(
            'relative group p-4 rounded-xl border transition-all duration-300',
            isDark
              ? 'bg-slate-900/50 dark:bg-slate-900/50 border-slate-700/50 dark:border-slate-700/50 hover:border-emerald-500/30 dark:hover:border-emerald-500/30'
              : 'bg-slate-50 border-slate-200 hover:border-emerald-500/60'
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span
              className={cn(
                'text-sm font-medium transition-colors duration-300',
                isDark ? 'text-slate-400 dark:text-slate-400' : 'text-slate-600'
              )}
            >
              Est. Revenue
            </span>
            {revenueDeltaPct !== null ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  revenueDeltaPct >= 0
                    ? isDark
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-emerald-100 text-emerald-700'
                    : isDark
                      ? 'bg-rose-500/15 text-rose-300'
                      : 'bg-rose-100 text-rose-700'
                )}
              >
                {revenueDeltaPct >= 0 ? '+' : ''}
                {revenueDeltaPct.toFixed(1)}%
              </span>
            ) : null}
            <DollarSign
              className={cn(
                'w-4 h-4 transition-colors duration-300',
                isDark ? 'text-emerald-500 dark:text-emerald-500' : 'text-emerald-600'
              )}
            />
          </div>
          <div className="relative">
            <div
              className={cn(
                'text-3xl font-bold tracking-tight transition-all duration-200',
                isDark ? 'text-white dark:text-white' : 'text-emerald-600',
                ghostProjectedRevenue !== null && 'opacity-35'
              )}
            >
              {symbol}
              {projectedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            {ghostProjectedRevenue !== null ? (
              <div
                className={cn(
                  'absolute top-0 left-0 text-3xl font-bold tracking-tight animate-pulse',
                  isDark
                    ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.55)]'
                    : 'text-cyan-600'
                )}
              >
                {symbol}
                {ghostProjectedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            ) : null}
          </div>
          <div
            className={cn(
              'absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity',
              isDark
                ? 'bg-gradient-to-r from-emerald-500/5 dark:from-emerald-500/5 to-transparent'
                : 'bg-gradient-to-r from-emerald-200/5 to-transparent'
            )}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Blended CPA */}
          <div
            className={cn(
              'p-3 rounded-xl border flex flex-col justify-center transition-all duration-300',
              isDark
                ? 'bg-slate-900/50 dark:bg-slate-900/50 border-slate-700/50 dark:border-slate-700/50'
                : 'bg-slate-50 border-slate-200'
            )}
          >
            <div
              className={cn(
                'text-xs uppercase tracking-wider mb-1 transition-colors duration-300',
                isDark ? 'text-slate-500 dark:text-slate-500' : 'text-slate-600'
              )}
            >
              Blended CPA
            </div>
            <div
              className={cn(
                'text-xl font-bold',
                (blendedCpa || 0) < 50
                  ? isDark
                    ? 'text-emerald-400 dark:text-emerald-400'
                    : 'text-emerald-600'
                  : isDark
                    ? 'text-white dark:text-white'
                    : 'text-slate-900'
              )}
            >
              {symbol}
              {blendedCpa?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}
            </div>
          </div>

          {/* Blended ROAS */}
          <div
            className={cn(
              'p-3 rounded-xl border flex flex-col justify-center transition-all duration-300',
              isDark
                ? 'bg-slate-900/50 dark:bg-slate-900/50 border-slate-700/50 dark:border-slate-700/50'
                : 'bg-slate-50 border-slate-200'
            )}
          >
            <div
              className={cn(
                'text-xs uppercase tracking-wider mb-1 transition-colors duration-300',
                isDark ? 'text-slate-500 dark:text-slate-500' : 'text-slate-600'
              )}
            >
              Blended ROAS
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'text-xl font-bold',
                  blendedRoas > 3
                    ? isDark
                      ? 'text-emerald-400 dark:text-emerald-400'
                      : 'text-emerald-600'
                    : blendedRoas > 1
                      ? isDark
                        ? 'text-yellow-400 dark:text-yellow-400'
                        : 'text-yellow-600'
                      : isDark
                        ? 'text-red-400 dark:text-red-400'
                        : 'text-red-600'
                )}
              >
                {blendedRoas.toFixed(2)}x
              </div>
              {roasDeltaPct !== null ? (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    roasDeltaPct >= 0
                      ? isDark
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-emerald-100 text-emerald-700'
                      : isDark
                        ? 'bg-rose-500/15 text-rose-300'
                        : 'bg-rose-100 text-rose-700'
                  )}
                >
                  {roasDeltaPct >= 0 ? '+' : ''}
                  {roasDeltaPct.toFixed(1)}%
                </span>
              ) : null}
            </div>
          </div>

          {/* Total Conversions */}
          <div
            className={cn(
              'p-3 rounded-xl border flex flex-col justify-center transition-all duration-300',
              isDark
                ? 'bg-slate-900/50 dark:bg-slate-900/50 border-slate-700/50 dark:border-slate-700/50'
                : 'bg-slate-50 border-slate-200'
            )}
          >
            <div
              className={cn(
                'text-xs uppercase tracking-wider mb-1 transition-colors duration-300',
                isDark ? 'text-slate-500 dark:text-slate-500' : 'text-slate-600'
              )}
            >
              Conversions
            </div>
            <div
              className={cn(
                'text-xl font-bold transition-colors duration-300',
                isDark ? 'text-white dark:text-white' : 'text-slate-900'
              )}
            >
              {totalConversions.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          'mt-6 pt-4 border-t text-center transition-colors duration-300',
          isDark ? 'border-slate-700/50 dark:border-slate-700/50' : 'border-slate-200'
        )}
      >
        <span
          className={cn(
            'text-xs italic transition-colors duration-300',
            isDark ? 'text-slate-500 dark:text-slate-500' : 'text-slate-600'
          )}
        >
          *Estimates assume historical performance metrics hold true
        </span>
      </div>
    </div>
  );
};
