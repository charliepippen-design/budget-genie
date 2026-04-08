import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Settings2,
  DollarSign,
  TrendingUp,
  Percent,
  Zap,
  Target,
  Info,
  Layers3,
  BadgeDollarSign,
  Wallet,
  Users,
  Coins,
  BarChart3,
  ChevronRight,
} from 'lucide-react';
import {
  ChannelFamily,
  BuyingModel,
  FAMILY_INFO,
  BUYING_MODEL_INFO,
  calculateUnifiedMetrics,
} from '@/types/channel';
import { useMediaPlanStore, ChannelData } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTheme } from '@/hooks/use-theme';
import { useVerticalConfig } from '@/hooks/use-vertical-config';
import { cn } from '@/lib/utils';

interface ChannelEditorProps {
  channel: ChannelData;
  trigger?: React.ReactNode;
}

export function ChannelEditor({ channel, trigger }: ChannelEditorProps) {
  const { setChannelType, updateChannelConfigField, globalMultipliers } = useMediaPlanStore();
  const { format: formatCurrency, symbol } = useCurrency();
  const { theme } = useTheme();
  const vc = useVerticalConfig();
  const [isOpen, setIsOpen] = useState(false);

  const isDark = theme === 'dark' || theme === 'contrast';

  const family = channel.family;
  const buyingModel = channel.buyingModel;
  const config = channel.typeConfig;

  const familyInfo = FAMILY_INFO[family];
  const modelInfo = BUYING_MODEL_INFO[buyingModel];

  const allowedModels = useMemo(() => familyInfo?.allowedModels || ['CPM', 'CPC'], [familyInfo]);

  const previewMetrics = useMemo(() => {
    if (!config)
      return { spend: 0, ftds: 0, revenue: 0, cpa: null, roas: 0, impressions: 0, clicks: 0 };
    return calculateUnifiedMetrics(config, 10000, globalMultipliers.playerValue || 150);
  }, [config, globalMultipliers.playerValue]);

  if (!channel || !family || !buyingModel || !config) return null;

  if (!familyInfo || !modelInfo) {
    return (
      <div className="text-red-500 text-xs p-2 border border-red-500 rounded">Invalid Data</div>
    );
  }

  const handleFamilyChange = (newFamily: ChannelFamily) => {
    setChannelType(channel.id, newFamily, FAMILY_INFO[newFamily].defaultModel);
  };

  const handleModelChange = (newModel: BuyingModel) => {
    setChannelType(channel.id, family, newModel);
  };

  const updatePrice = (val: number) => updateChannelConfigField(channel.id, 'price', val);
  const updateSecondaryPrice = (val: number) =>
    updateChannelConfigField(channel.id, 'secondaryPrice', val);
  const updateBaselineMetric = (field: keyof typeof config.baselineMetrics, val: number) => {
    updateChannelConfigField(channel.id, 'baselineMetrics', { [field]: val });
  };

  const defaultSaturationCeiling = Math.max((config.price ?? 0) * 3, 10000);
  const saturationEnabled = (config.baselineMetrics.saturationCeiling ?? 0) > 0;

  const handleSaturationToggle = (checked: boolean) => {
    updateChannelConfigField(channel.id, 'baselineMetrics', {
      saturationCeiling: checked
        ? config.baselineMetrics.saturationCeiling && config.baselineMetrics.saturationCeiling > 0
          ? config.baselineMetrics.saturationCeiling
          : defaultSaturationCeiling
        : 0,
    });
  };

  // --- Variable inputs based on buying model ---
  const variableInputs = (() => {
    switch (buyingModel) {
      case 'CPM':
        return (
          <motion.div
            key="CPM"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <PremiumSlider
              label="CPM Price"
              value={config.price ?? 5}
              onChange={updatePrice}
              min={0.01}
              max={100000}
              step={0.1}
              icon={<DollarSign className="h-4 w-4" />}
              prefix="€"
              suffix="per 1K"
              isDark={isDark}
            />
            <PremiumSlider
              label="Click-Through Rate"
              value={config.baselineMetrics.ctr ?? 1}
              onChange={(v) => updateBaselineMetric('ctr', v)}
              min={0}
              max={100}
              step={0.05}
              icon={<Percent className="h-4 w-4" />}
              suffix="%"
              isDark={isDark}
            />
            <PremiumSlider
              label="Conversion Rate"
              value={config.baselineMetrics.conversionRate ?? 2.5}
              onChange={(v) => updateBaselineMetric('conversionRate', v)}
              min={0}
              max={100}
              step={0.1}
              icon={<TrendingUp className="h-4 w-4" />}
              suffix="%"
              isDark={isDark}
            />
          </motion.div>
        );

      case 'CPC':
        return (
          <motion.div
            key="CPC"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <PremiumSlider
              label="CPC Price"
              value={config.price ?? 0.5}
              onChange={updatePrice}
              min={0.01}
              max={100000}
              step={0.01}
              icon={<DollarSign className="h-4 w-4" />}
              prefix="€"
              suffix="per click"
              isDark={isDark}
            />
            <PremiumSlider
              label="Conversion Rate"
              value={config.baselineMetrics.conversionRate ?? 2.5}
              onChange={(v) => updateBaselineMetric('conversionRate', v)}
              min={0}
              max={100}
              step={0.1}
              icon={<TrendingUp className="h-4 w-4" />}
              suffix="%"
              isDark={isDark}
            />
          </motion.div>
        );

      case 'CPA':
        return (
          <motion.div
            key="CPA"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <PremiumSlider
              label="Target CPA"
              value={config.price ?? 50}
              onChange={updatePrice}
              min={0.01}
              max={100000}
              step={1}
              icon={<Target className="h-4 w-4" />}
              prefix="€"
              suffix="per FTD"
              isDark={isDark}
            />
          </motion.div>
        );

      case 'REV_SHARE':
        return (
          <motion.div
            key="REV_SHARE"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <PremiumSlider
              label="Revenue Share %"
              value={config.secondaryPrice ?? 30}
              onChange={updateSecondaryPrice}
              min={0}
              max={100}
              step={1}
              icon={<Percent className="h-4 w-4" />}
              suffix="%"
              isDark={isDark}
            />
            <PremiumSlider
              label="Avg Order Value"
              value={config.baselineMetrics.aov ?? 150}
              onChange={(v) => updateBaselineMetric('aov', v)}
              min={0}
              max={1000000}
              step={5}
              icon={<DollarSign className="h-4 w-4" />}
              prefix="€"
              isDark={isDark}
            />
          </motion.div>
        );

      case 'HYBRID':
        return (
          <motion.div
            key="HYBRID"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <PremiumSlider
              label="Base CPA"
              value={config.price ?? 20}
              onChange={updatePrice}
              min={0.01}
              max={100000}
              step={1}
              icon={<Target className="h-4 w-4" />}
              prefix="€"
              isDark={isDark}
            />
            <PremiumSlider
              label="Revenue Share %"
              value={config.secondaryPrice ?? 20}
              onChange={updateSecondaryPrice}
              min={0}
              max={100}
              step={1}
              icon={<Percent className="h-4 w-4" />}
              suffix="%"
              isDark={isDark}
            />
            <PremiumSlider
              label="Avg Order Value"
              value={config.baselineMetrics.aov ?? 150}
              onChange={(v) => updateBaselineMetric('aov', v)}
              min={0}
              max={1000000}
              step={5}
              icon={<DollarSign className="h-4 w-4" />}
              prefix="€"
              isDark={isDark}
            />
          </motion.div>
        );

      case 'FLAT_FEE':
      case 'RETAINER':
        return (
          <motion.div
            key={buyingModel}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <PremiumSlider
              label="Monthly Cost"
              value={config.price ?? 1000}
              onChange={updatePrice}
              min={100}
              max={50000}
              step={50}
              icon={<Wallet className="h-4 w-4" />}
              prefix="€"
              isDark={isDark}
            />
            <PremiumSlider
              label="Est. Traffic"
              value={config.baselineMetrics.trafficPerUnit ?? 1000}
              onChange={(v) => updateBaselineMetric('trafficPerUnit', v)}
              min={100}
              max={100000}
              step={100}
              icon={<Zap className="h-4 w-4" />}
              suffix="visits"
              isDark={isDark}
            />
            <PremiumSlider
              label="Conversion Rate"
              value={config.baselineMetrics.conversionRate ?? 2.5}
              onChange={(v) => updateBaselineMetric('conversionRate', v)}
              min={0}
              max={100}
              step={0.1}
              icon={<TrendingUp className="h-4 w-4" />}
              suffix="%"
              isDark={isDark}
            />
            <SaturationToggle
              enabled={saturationEnabled}
              onToggle={handleSaturationToggle}
              isDark={isDark}
            />
            {saturationEnabled ? (
              <PremiumSlider
                label="Saturation Ceiling"
                value={config.baselineMetrics.saturationCeiling ?? defaultSaturationCeiling}
                onChange={(v) => updateBaselineMetric('saturationCeiling', v)}
                min={0}
                max={1000000}
                step={100}
                icon={<Zap className="h-4 w-4" />}
                prefix="€"
                isDark={isDark}
              />
            ) : null}
          </motion.div>
        );

      default:
        return null;
    }
  })();

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-9 shrink-0 whitespace-nowrap px-3 gap-2 print-mode-hide transition-all duration-300',
              isDark
                ? 'bg-gradient-to-r from-cyan-500/10 to-transparent hover:from-cyan-500/20 text-cyan-300'
                : 'bg-gradient-to-r from-blue-400/10 to-transparent hover:from-blue-400/20 text-blue-600'
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="leading-none">Configure</span>
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        className={cn(
          'w-full overflow-y-auto border-0 p-0 sm:max-w-lg',
          isDark ? 'bg-transparent' : 'bg-transparent'
        )}
      >
        <AnimatePresence>
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="h-full"
          >
            {/* Glass-morphism container */}
            <div
              className={cn(
                'min-h-full backdrop-blur-xl border-l shadow-2xl',
                isDark
                  ? 'bg-gradient-to-b from-slate-900/80 via-slate-900/70 to-slate-950/80 border-cyan-500/20'
                  : 'bg-gradient-to-b from-white/80 via-slate-50/80 to-white/60 border-slate-200/60'
              )}
            >
              {/* Header */}
              <div
                className={cn(
                  'sticky top-0 z-50 border-b bg-gradient-to-b backdrop-blur-lg px-6 py-5',
                  isDark
                    ? 'border-cyan-500/20 from-slate-900/95 to-slate-900/70'
                    : 'border-slate-200 from-white/95 to-slate-50/80'
                )}
              >
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-1"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="relative">
                      <div
                        className={cn(
                          'absolute inset-0 rounded-lg blur opacity-50 animate-pulse',
                          isDark
                            ? 'bg-gradient-to-r from-cyan-500 to-teal-500'
                            : 'bg-gradient-to-r from-blue-400 to-cyan-400'
                        )}
                      />
                      <Settings2
                        className={cn(
                          'h-5 w-5 relative',
                          isDark ? 'text-cyan-300' : 'text-blue-500'
                        )}
                      />
                    </div>
                    <h2
                      className={cn(
                        'text-lg font-semibold bg-clip-text text-transparent',
                        isDark
                          ? 'bg-gradient-to-r from-cyan-300 via-slate-100 to-teal-200'
                          : 'bg-gradient-to-r from-blue-600 via-slate-900 to-cyan-600'
                      )}
                    >
                      {channel.name}
                    </h2>
                  </div>
                  <p className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-600')}>
                    Configure buying model and parameters
                  </p>
                </motion.div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Channel Setup Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <SectionHeader
                    title="Channel Setup"
                    icon={<Layers3 className="h-4 w-4" />}
                    isDark={isDark}
                  />
                  <div className="space-y-4 mt-4">
                    <PremiumSelect
                      label="Channel Family"
                      value={family}
                      onChange={(v) => handleFamilyChange(v as ChannelFamily)}
                      options={Object.entries(FAMILY_INFO).map(([key, info]) => ({
                        value: key,
                        label: info.name,
                      }))}
                      icon={<Layers3 className="h-4 w-4" />}
                      isDark={isDark}
                    />
                    <PremiumSelect
                      label="Buying Model"
                      value={buyingModel}
                      onChange={(v) => handleModelChange(v as BuyingModel)}
                      options={allowedModels.map((model) => ({
                        value: model,
                        label: BUYING_MODEL_INFO[model].name,
                      }))}
                      icon={<BadgeDollarSign className="h-4 w-4" />}
                      hint={modelInfo.description}
                      isDark={isDark}
                    />
                  </div>
                </motion.div>

                {/* Model Parameters Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <SectionHeader
                    title="Model Parameters"
                    icon={<TrendingUp className="h-4 w-4" />}
                    isDark={isDark}
                  />
                  <div className="mt-4 space-y-4">
                    <AnimatePresence mode="wait">
                      {variableInputs &&
                      typeof variableInputs === 'object' &&
                      'props' in variableInputs
                        ? variableInputs
                        : variableInputs}
                    </AnimatePresence>
                  </div>
                </motion.div>

                {/* Projected Yield Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <SectionHeader
                    title="Projected Yield"
                    icon={<BarChart3 className="h-4 w-4" />}
                    isDark={isDark}
                  />
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <YieldMetricCard
                      label="Spend"
                      value={formatCurrency(previewMetrics.spend)}
                      icon={<Wallet className="h-4 w-4" />}
                      color="from-blue-500 to-cyan-500"
                      isDark={isDark}
                    />
                    <YieldMetricCard
                      label={vc.terms.conversionPlural}
                      value={previewMetrics.ftds.toFixed(0)}
                      icon={<Users className="h-4 w-4" />}
                      color="from-violet-500 to-purple-500"
                      isDark={isDark}
                    />
                    <YieldMetricCard
                      label="CPA"
                      value={previewMetrics.cpa ? formatCurrency(previewMetrics.cpa) : '—'}
                      icon={<Coins className="h-4 w-4" />}
                      color="from-amber-500 to-orange-500"
                      isDark={isDark}
                    />
                    <YieldMetricCard
                      label="ROAS"
                      value={`${previewMetrics.roas.toFixed(2)}x`}
                      icon={<BarChart3 className="h-4 w-4" />}
                      color="from-emerald-500 to-teal-500"
                      isDark={isDark}
                    />
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// PREMIUM SLIDER COMPONENT
// ============================================================================

function PremiumSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  icon,
  prefix,
  suffix,
  isDark = true,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  icon: React.ReactNode;
  prefix?: string;
  suffix?: string;
  isDark?: boolean;
}) {
  const id = useId();
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLInputElement>(null);
  const [draftValue, setDraftValue] = useState(value.toString());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftValue(value.toString());
  }, [value]);

  const clampValue = (next: number) => Math.min(max, Math.max(min, next));

  const applyWithValidation = (raw: number) => {
    if (Number.isNaN(raw)) {
      setError(`Value must be between ${min} and ${max}.`);
      const fallback = clampValue(value);
      onChange(fallback);
      setDraftValue(fallback.toString());
      return;
    }

    const clamped = clampValue(raw);
    const wasOutOfRange = raw < min || raw > max;

    onChange(clamped);
    setDraftValue(clamped.toString());
    setError(wasOutOfRange ? `Value must be between ${min} and ${max}.` : null);
  };

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <motion.div
      layout
      className="space-y-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
    >
      {/* Label with icon */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'transition-colors',
              isDark
                ? 'text-cyan-400/70 hover:text-cyan-300'
                : 'text-blue-500/70 hover:text-blue-600'
            )}
          >
            {icon}
          </div>
          <label
            htmlFor={id}
            className={cn('text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-800')}
          >
            {label}
          </label>
        </div>
        <motion.div animate={{ scale: isDragging ? 1.05 : 1 }} className="text-right">
          <div className={cn('text-xs mb-0.5', isDark ? 'text-slate-400' : 'text-slate-500')}>
            {isDark ? 'Value' : 'Value'}
          </div>
          <div className="flex items-center justify-end gap-1">
            {prefix ? (
              <span className={cn('text-xs', isDark ? 'text-slate-300' : 'text-slate-700')}>
                {prefix}
              </span>
            ) : null}
            <input
              type="number"
              aria-label={`${label} value`}
              title={label}
              value={draftValue}
              min={min}
              max={max}
              step={step}
              onChange={(e) => {
                setDraftValue(e.target.value);
                if (error) setError(null);
              }}
              onBlur={(e) => applyWithValidation(parseFloat(e.target.value))}
              className={cn(
                'w-24 rounded border px-2 py-0.5 text-right text-xs font-semibold',
                isDark
                  ? 'border-slate-600 bg-slate-900/70 text-slate-100'
                  : 'border-slate-300 bg-white text-slate-900'
              )}
            />
            {suffix ? (
              <span className={cn('text-xs', isDark ? 'text-slate-300' : 'text-slate-700')}>
                {suffix}
              </span>
            ) : null}
          </div>
        </motion.div>
      </div>

      {/* Slider track */}
      <div className="relative group">
        {/* Background track */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 right-0 h-1.5 top-1/2 -translate-y-1/2 rounded-full border',
            isDark ? 'bg-slate-700/30 border-slate-600/30' : 'bg-slate-300/30 border-slate-400/30'
          )}
        />

        {/* Filled track */}
        <motion.div
          className={cn(
            'absolute inset-y-0 left-0 h-1.5 top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r shadow-lg',
            isDark
              ? 'from-cyan-500 to-teal-500 shadow-cyan-500/50'
              : 'from-blue-500 to-cyan-500 shadow-blue-400/50'
          )}
          style={{ width: `${percentage}%` }}
          transition={{ type: 'spring', damping: 15, stiffness: 300 }}
        />

        {/* Slider input */}
        <style>{`
          #slider-${id}-dark::-webkit-slider-thumb {
            appearance: none;
            width: 1.25rem;
            height: 1.25rem;
            border-radius: 9999px;
            background: linear-gradient(to bottom, #06b6d4, #14b8a6);
            box-shadow: 0 10px 15px -3px rgba(6, 182, 212, 0.7);
            cursor: grab;
            border: 1px solid #06d6d4;
            transition: all 0.2s;
          }
          #slider-${id}-dark::-webkit-slider-thumb:active {
            cursor: grabbing;
          }
          #slider-${id}-dark::-webkit-slider-thumb:hover {
            transform: scale(1.1);
          }
          
          #slider-${id}-dark::-moz-range-thumb {
            width: 1.25rem;
            height: 1.25rem;
            border-radius: 9999px;
            background: linear-gradient(to bottom, #06b6d4, #14b8a6);
            box-shadow: 0 10px 15px -3px rgba(6, 182, 212, 0.7);
            cursor: grab;
            border: 1px solid #06d6d4;
            transition: all 0.2s;
          }
          #slider-${id}-dark::-moz-range-thumb:active {
            cursor: grabbing;
          }
          #slider-${id}-dark::-moz-range-thumb:hover {
            transform: scale(1.1);
          }

          #slider-${id}-light::-webkit-slider-thumb {
            appearance: none;
            width: 1.25rem;
            height: 1.25rem;
            border-radius: 9999px;
            background: linear-gradient(to bottom, #3b82f6, #06b6d4);
            box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.7);
            cursor: grab;
            border: 1px solid #0284c7;
            transition: all 0.2s;
          }
          #slider-${id}-light::-webkit-slider-thumb:active {
            cursor: grabbing;
          }
          #slider-${id}-light::-webkit-slider-thumb:hover {
            transform: scale(1.1);
          }
          
          #slider-${id}-light::-moz-range-thumb {
            width: 1.25rem;
            height: 1.25rem;
            border-radius: 9999px;
            background: linear-gradient(to bottom, #3b82f6, #06b6d4);
            box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.7);
            cursor: grab;
            border: 1px solid #0284c7;
            transition: all 0.2s;
          }
          #slider-${id}-light::-moz-range-thumb:active {
            cursor: grabbing;
          }
          #slider-${id}-light::-moz-range-thumb:hover {
            transform: scale(1.1);
          }
        `}</style>
        <input
          ref={sliderRef}
          id={`slider-${id}-${isDark ? 'dark' : 'light'}`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const next = parseFloat(e.target.value);
            onChange(next);
            setDraftValue(next.toString());
            if (error) setError(null);
          }}
          onBlur={(e) => applyWithValidation(parseFloat(e.target.value))}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          className="relative w-full h-1.5 rounded-full bg-transparent appearance-none cursor-pointer outline-none"
        />
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {/* Min/Max labels */}
      <div
        className={cn(
          'flex justify-between text-xs px-1',
          isDark ? 'text-slate-500' : 'text-slate-600'
        )}
      >
        <span>
          {prefix}
          {min}
          {suffix}
        </span>
        <span>
          {prefix}
          {max}
          {suffix}
        </span>
      </div>
    </motion.div>
  );
}

// ============================================================================
// PREMIUM SELECT COMPONENT
// ============================================================================

function PremiumSelect({
  label,
  value,
  onChange,
  options,
  icon,
  hint,
  isDark = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon: React.ReactNode;
  hint?: string;
  isDark?: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="space-y-2"
    >
      <div className="flex items-center gap-2.5">
        <div className={cn(isDark ? 'text-cyan-400/70' : 'text-blue-500/70')}>{icon}</div>
        <label className={cn('text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-800')}>
          {label}
        </label>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className={cn(
            'h-10 rounded-lg border backdrop-blur transition-all duration-200 focus:ring-2',
            isDark
              ? 'border-cyan-500/30 bg-slate-900/50 text-slate-100 focus:ring-cyan-500/50 focus:border-cyan-500/50 hover:border-cyan-500/50'
              : 'border-blue-400/30 bg-slate-100/50 text-slate-900 focus:ring-blue-500/50 focus:border-blue-500/50 hover:border-blue-400/50'
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          className={cn(
            'backdrop-blur',
            isDark
              ? 'border-cyan-500/30 bg-slate-900/95 text-slate-100'
              : 'border-blue-400/30 bg-slate-100/95 text-slate-900'
          )}
        >
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              className={cn(isDark ? 'focus:bg-cyan-500/20' : 'focus:bg-blue-500/20')}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && (
        <p className={cn('text-xs ml-7', isDark ? 'text-slate-400' : 'text-slate-600')}>{hint}</p>
      )}
    </motion.div>
  );
}

// ============================================================================
// SATURATION TOGGLE
// ============================================================================

function SaturationToggle({
  enabled,
  onToggle,
  isDark = true,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  isDark?: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 22, stiffness: 280 }}
      className={cn(
        'flex items-center justify-between rounded-xl border px-4 py-3',
        isDark ? 'border-slate-700/50 bg-slate-900/40' : 'border-slate-200/50 bg-slate-50/40'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={isDark ? 'text-cyan-400/70' : 'text-blue-500/70'}>
          <Zap className="w-4 h-4" />
        </div>
        <div>
          <p className={cn('text-sm font-medium', isDark ? 'text-slate-200' : 'text-slate-900')}>
            Enable Saturation Decay
          </p>
          <p className={cn('text-xs mt-0.5', isDark ? 'text-slate-500' : 'text-slate-600')}>
            Diminishing returns as spend approaches ceiling
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        className={isDark ? 'data-[state=checked]:bg-cyan-500' : 'data-[state=checked]:bg-blue-500'}
      />
    </motion.div>
  );
}

// ============================================================================
// SECTION HEADER
// ============================================================================

function SectionHeader({
  title,
  icon,
  isDark = true,
}: {
  title: string;
  icon: React.ReactNode;
  isDark?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 pb-3 border-b',
        isDark ? 'border-cyan-500/20' : 'border-blue-400/20'
      )}
    >
      <div className={cn(isDark ? 'text-cyan-400/70' : 'text-blue-500/70')}>{icon}</div>
      <h3
        className={cn(
          'text-sm font-semibold uppercase tracking-wider',
          isDark ? 'text-slate-200' : 'text-slate-800'
        )}
      >
        {title}
      </h3>
      <div
        className={cn(
          'ml-auto h-px flex-1 bg-gradient-to-r',
          isDark ? 'from-cyan-500/20 to-transparent' : 'from-blue-400/20 to-transparent'
        )}
      />
    </div>
  );
}

// ============================================================================
// YIELD METRIC CARD
// ============================================================================

function YieldMetricCard({
  label,
  value,
  icon,
  color,
  isDark = true,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  isDark?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      className={cn(
        'relative overflow-hidden rounded-lg border bg-gradient-to-br backdrop-blur p-3 group transition-all duration-300',
        isDark
          ? 'border-cyan-500/20 from-slate-900/60 to-slate-800/30 hover:border-cyan-500/40'
          : 'border-blue-400/20 from-slate-100/60 to-slate-50/30 hover:border-blue-400/40'
      )}
    >
      {/* Gradient background */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-5 transition-opacity duration-300',
          color
        )}
      />

      {/* Glow effect */}
      <div
        className={cn(
          'absolute -inset-px rounded-lg blur opacity-0 group-hover:opacity-20 transition-opacity duration-300',
          color
        )}
      />

      {/* Content */}
      <div className="relative">
        <div className={cn('h-5 w-5 rounded-lg bg-gradient-to-br p-1 mb-2', color)}>
          <div className="h-full w-full flex items-center justify-center text-white">{icon}</div>
        </div>
        <div className={cn('text-xs mb-1', isDark ? 'text-slate-400' : 'text-slate-600')}>
          {label}
        </div>
        <motion.div
          layout
          key={value}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'font-mono text-sm font-bold',
            isDark ? 'text-slate-100' : 'text-slate-900'
          )}
        >
          {value}
        </motion.div>
      </div>
    </motion.div>
  );
}
