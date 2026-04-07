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
import { cn } from '@/lib/utils';

interface ChannelEditorProps {
  channel: ChannelData;
  trigger?: React.ReactNode;
}

export function ChannelEditor({ channel, trigger }: ChannelEditorProps) {
  const { setChannelType, updateChannelConfigField, globalMultipliers } = useMediaPlanStore();
  const { format: formatCurrency, symbol } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);

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
            />
            <SaturationToggle enabled={saturationEnabled} onToggle={handleSaturationToggle} />
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
            className="h-9 shrink-0 whitespace-nowrap px-3 gap-2 print-mode-hide bg-gradient-to-r from-cyan-500/10 to-transparent hover:from-cyan-500/20 text-cyan-300 transition-all duration-300"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="leading-none">Configure</span>
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto border-0 bg-transparent p-0 sm:max-w-lg">
        <AnimatePresence>
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="h-full"
          >
            {/* Glass-morphism container */}
            <div className="min-h-full bg-gradient-to-b from-slate-900/80 via-slate-900/70 to-slate-950/80 backdrop-blur-xl border-l border-cyan-500/20 shadow-2xl">
              {/* Header */}
              <div className="sticky top-0 z-50 border-b border-cyan-500/20 bg-gradient-to-b from-slate-900/95 to-slate-900/70 backdrop-blur-lg px-6 py-5">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-1"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-teal-500 rounded-lg blur opacity-50 animate-pulse" />
                      <Settings2 className="h-5 w-5 text-cyan-300 relative" />
                    </div>
                    <h2 className="text-lg font-semibold bg-gradient-to-r from-cyan-300 via-slate-100 to-teal-200 bg-clip-text text-transparent">
                      {channel.name}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400">Configure buying model and parameters</p>
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
                  <SectionHeader title="Channel Setup" icon={<Layers3 className="h-4 w-4" />} />
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
                  />
                  <div className="mt-4 space-y-4">
                    <AnimatePresence mode="wait">{variableInputs}</AnimatePresence>
                  </div>
                </motion.div>

                {/* Projected Yield Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <SectionHeader title="Projected Yield" icon={<BarChart3 className="h-4 w-4" />} />
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <YieldMetricCard
                      label="Spend"
                      value={formatCurrency(previewMetrics.spend)}
                      icon={<Wallet className="h-4 w-4" />}
                      color="from-blue-500 to-cyan-500"
                    />
                    <YieldMetricCard
                      label="FTDs"
                      value={previewMetrics.ftds.toFixed(0)}
                      icon={<Users className="h-4 w-4" />}
                      color="from-violet-500 to-purple-500"
                    />
                    <YieldMetricCard
                      label="CPA"
                      value={previewMetrics.cpa ? formatCurrency(previewMetrics.cpa) : '—'}
                      icon={<Coins className="h-4 w-4" />}
                      color="from-amber-500 to-orange-500"
                    />
                    <YieldMetricCard
                      label="ROAS"
                      value={`${previewMetrics.roas.toFixed(2)}x`}
                      icon={<BarChart3 className="h-4 w-4" />}
                      color="from-emerald-500 to-teal-500"
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
          <div className="text-cyan-400/70 hover:text-cyan-300 transition-colors">{icon}</div>
          <label htmlFor={id} className="text-sm font-medium text-slate-200">
            {label}
          </label>
        </div>
        <motion.div animate={{ scale: isDragging ? 1.05 : 1 }} className="text-right">
          <div className="text-xs text-slate-400 mb-0.5">Value</div>
          <div className="flex items-center justify-end gap-1">
            {prefix ? <span className="text-xs text-slate-300">{prefix}</span> : null}
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
              className="w-24 rounded border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-right text-xs font-semibold text-slate-100"
            />
            {suffix ? <span className="text-xs text-slate-300">{suffix}</span> : null}
          </div>
        </motion.div>
      </div>

      {/* Slider track */}
      <div className="relative group">
        {/* Background track */}
        <div className="absolute inset-y-0 left-0 right-0 h-1.5 top-1/2 -translate-y-1/2 rounded-full bg-slate-700/30 border border-slate-600/30" />

        {/* Filled track */}
        <motion.div
          className="absolute inset-y-0 left-0 h-1.5 top-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-cyan-500 to-teal-500 shadow-lg shadow-cyan-500/50"
          style={{ width: `${percentage}%` }}
          transition={{ type: 'spring', damping: 15, stiffness: 300 }}
        />

        {/* Slider input */}
        <input
          ref={sliderRef}
          id={id}
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
          className="relative w-full h-1.5 rounded-full bg-transparent appearance-none cursor-pointer outline-none
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-gradient-to-b
            [&::-webkit-slider-thumb]:from-cyan-300
            [&::-webkit-slider-thumb]:to-cyan-500
            [&::-webkit-slider-thumb]:shadow-lg
            [&::-webkit-slider-thumb]:shadow-cyan-500/70
            [&::-webkit-slider-thumb]:cursor-grab
            [&::-webkit-slider-thumb]:active:cursor-grabbing
            [&::-webkit-slider-thumb]:border
            [&::-webkit-slider-thumb]:border-cyan-400
            [&::-webkit-slider-thumb]:transition-all
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-webkit-slider-thumb]:hover:shadow-cyan-500/100
            [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-gradient-to-b
            [&::-moz-range-thumb]:from-cyan-300
            [&::-moz-range-thumb]:to-cyan-500
            [&::-moz-range-thumb]:shadow-lg
            [&::-moz-range-thumb]:shadow-cyan-500/70
            [&::-moz-range-thumb]:cursor-grab
            [&::-moz-range-thumb]:active:cursor-grabbing
            [&::-moz-range-thumb]:border
            [&::-moz-range-thumb]:border-cyan-400
            [&::-moz-range-thumb]:transition-all
            [&::-moz-range-thumb]:hover:scale-110
          "
        />
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {/* Min/Max labels */}
      <div className="flex justify-between text-xs text-slate-500 px-1">
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon: React.ReactNode;
  hint?: string;
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
        <div className="text-cyan-400/70">{icon}</div>
        <label className="text-sm font-medium text-slate-200">{label}</label>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-lg border border-cyan-500/30 bg-slate-900/50 backdrop-blur text-slate-100 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 hover:border-cyan-500/50 transition-all duration-200">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-cyan-500/30 bg-slate-900/95 backdrop-blur text-slate-100">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="focus:bg-cyan-500/20">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-slate-400 ml-7">{hint}</p>}
    </motion.div>
  );
}

// ============================================================================
// SATURATION TOGGLE
// ============================================================================

function SaturationToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="rounded-lg border border-cyan-500/20 bg-gradient-to-r from-slate-900/50 to-slate-800/30 backdrop-blur p-4 flex items-center justify-between group hover:border-cyan-500/40 transition-all duration-300"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-100">Enable Saturation Decay</p>
        <p className="text-xs text-slate-400">Model diminishing returns as budgets scale</p>
      </div>
      <motion.div whileTap={{ scale: 0.95 }}>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          className="h-6 w-11 data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-cyan-500 data-[state=checked]:to-teal-500"
        />
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// SECTION HEADER
// ============================================================================

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 pb-3 border-b border-cyan-500/20">
      <div className="text-cyan-400/70">{icon}</div>
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">{title}</h3>
      <div className="ml-auto h-px flex-1 bg-gradient-to-r from-cyan-500/20 to-transparent" />
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
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      className={cn(
        'relative overflow-hidden rounded-lg border border-cyan-500/20 bg-gradient-to-br from-slate-900/60 to-slate-800/30 backdrop-blur p-3 group',
        'hover:border-cyan-500/40 transition-all duration-300'
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
        <div className="text-xs text-slate-400 mb-1">{label}</div>
        <motion.div
          layout
          key={value}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-mono text-sm font-bold text-slate-100"
        >
          {value}
        </motion.div>
      </div>
    </motion.div>
  );
}
