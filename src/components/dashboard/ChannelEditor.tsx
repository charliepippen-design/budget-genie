import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Settings2, DollarSign, TrendingUp, Percent, Zap, Target, Info } from 'lucide-react';
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

  // --- ConfigurationHeader section ---
  const configurationHeader = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            Channel Family
          </Label>
          <Select value={family} onValueChange={(v) => handleFamilyChange(v as ChannelFamily)}>
            <SelectTrigger className="h-9 text-sm bg-slate-800 border-slate-700 text-slate-200 focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-0 focus:border-cyan-500 hover:border-slate-600 transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {Object.entries(FAMILY_INFO).map(([key, info]) => (
                <SelectItem
                  key={key}
                  value={key}
                  className="text-slate-200 focus:bg-slate-700 focus:text-cyan-400 cursor-pointer"
                >
                  {info.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Buying Model
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Buying model info"
                  className="inline-flex items-center"
                >
                  <Info className="w-4 h-4 text-slate-500 hover:text-cyan-400 transition-colors" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="bg-slate-800 text-slate-200 border border-slate-700 shadow-xl rounded-md text-xs px-2 py-1.5 z-50"
              >
                {modelInfo.description}
              </TooltipContent>
            </Tooltip>
          </div>
          <Select value={buyingModel} onValueChange={(v) => handleModelChange(v as BuyingModel)}>
            <SelectTrigger className="h-9 text-sm bg-slate-800 border-slate-700 text-slate-200 focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-0 focus:border-cyan-500 hover:border-slate-600 transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {allowedModels.map((model) => (
                <SelectItem
                  key={model}
                  value={model}
                  className="text-slate-200 focus:bg-slate-700 focus:text-cyan-400 cursor-pointer"
                >
                  {BUYING_MODEL_INFO[model].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  // --- VariableInputs section ---
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
            className="grid gap-4"
          >
            <FormField
              label="CPM Price"
              value={config.price ?? 5}
              onChange={updatePrice}
              icon={<DollarSign className="h-3.5 w-3.5" />}
              suffix="per 1K"
            />
            <SliderField
              label="CTR"
              value={config.baselineMetrics.ctr ?? 1}
              onChange={(v) => updateBaselineMetric('ctr', v)}
              min={0.05}
              max={20}
              step={0.05}
              icon={<Percent className="h-3.5 w-3.5" />}
              suffix="%"
              tooltip="Click-through rate: percentage of impressions that result in a click"
            />
            <SliderField
              label="Conv. Rate"
              value={config.baselineMetrics.conversionRate ?? 2.5}
              onChange={(v) => updateBaselineMetric('conversionRate', v)}
              min={0.1}
              max={30}
              step={0.1}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              suffix="%"
              tooltip="Conversion rate: percentage of clicks that convert to FTDs"
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
            className="grid gap-4"
          >
            <FormField
              label="CPC Price"
              value={config.price ?? 0.5}
              onChange={updatePrice}
              icon={<DollarSign className="h-3.5 w-3.5" />}
              suffix="per click"
            />
            <SliderField
              label="Conv. Rate"
              value={config.baselineMetrics.conversionRate ?? 2.5}
              onChange={(v) => updateBaselineMetric('conversionRate', v)}
              min={0.1}
              max={30}
              step={0.1}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              suffix="%"
              tooltip="Conversion rate: percentage of clicks that convert to FTDs"
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
            className="grid gap-4"
          >
            <FormField
              label="Target CPA"
              value={config.price ?? 50}
              onChange={updatePrice}
              icon={<Target className="h-3.5 w-3.5" />}
              suffix="per FTD"
            />
            <p className="text-xs text-slate-500 px-1 leading-relaxed">
              FTDs are calculated directly from spend divided by Target CPA.
            </p>
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
            className="grid gap-4"
          >
            <SliderField
              label="RevShare %"
              value={config.secondaryPrice ?? 30}
              onChange={updateSecondaryPrice}
              min={1}
              max={80}
              step={1}
              icon={<Percent className="h-3.5 w-3.5" />}
              suffix="%"
              tooltip="Percentage of partner revenue shared back to the affiliate"
            />
            <FormField
              label="Avg Order Value"
              value={config.baselineMetrics.aov ?? 150}
              onChange={(v) => updateBaselineMetric('aov', v)}
              icon={<DollarSign className="h-3.5 w-3.5" />}
              suffix="per FTD"
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
            className="grid gap-4"
          >
            <FormField
              label="Base CPA"
              value={config.price ?? 20}
              onChange={updatePrice}
              icon={<Target className="h-3.5 w-3.5" />}
              suffix="per FTD"
            />
            <SliderField
              label="RevShare %"
              value={config.secondaryPrice ?? 20}
              onChange={updateSecondaryPrice}
              min={1}
              max={80}
              step={1}
              icon={<Percent className="h-3.5 w-3.5" />}
              suffix="%"
              tooltip="Revenue share percentage stacked on top of the base CPA"
            />
            <FormField
              label="Avg Order Value"
              value={config.baselineMetrics.aov ?? 150}
              onChange={(v) => updateBaselineMetric('aov', v)}
              icon={<DollarSign className="h-3.5 w-3.5" />}
              suffix="per FTD"
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
            className="grid gap-4"
          >
            <FormField
              label="Monthly Cost"
              value={config.price ?? 1000}
              onChange={updatePrice}
              icon={<DollarSign className="h-3.5 w-3.5" />}
              suffix="total"
            />
            <FormField
              label="Est. Traffic"
              value={config.baselineMetrics.trafficPerUnit ?? 1000}
              onChange={(v) => updateBaselineMetric('trafficPerUnit', v)}
              icon={<Zap className="h-3.5 w-3.5" />}
              suffix="visits"
            />
            <SliderField
              label="Conv. Rate"
              value={config.baselineMetrics.conversionRate ?? 2.5}
              onChange={(v) => updateBaselineMetric('conversionRate', v)}
              min={0.1}
              max={30}
              step={0.1}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              suffix="%"
              tooltip="Conversion rate: percentage of visits that convert to FTDs"
            />
          </motion.div>
        );

      default:
        return null;
    }
  })();

  // --- YieldProjectionCard section ---
  const playerValue = globalMultipliers.playerValue || 150;
  const roasColor =
    previewMetrics.roas >= 2
      ? 'text-emerald-400'
      : previewMetrics.roas < 1
        ? 'text-rose-400'
        : 'text-amber-400';
  const cpaColor =
    previewMetrics.cpa != null
      ? previewMetrics.cpa <= playerValue
        ? 'text-emerald-400'
        : 'text-rose-400'
      : 'text-slate-400';

  const yieldProjectionCard = (
    <div className="p-px rounded-xl bg-gradient-to-br from-cyan-500/30 via-slate-700/20 to-teal-500/20">
      <motion.div
        layout
        className="rounded-[11px] bg-slate-900/80 backdrop-blur-md px-4 py-4 space-y-3"
      >
        <p className="text-[11px] font-semibold text-cyan-400 uppercase tracking-widest">
          Projected Yield — Sample {symbol}10k Budget
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <YieldStat label="Spend" value={formatCurrency(previewMetrics.spend)} />
          <YieldStat label="FTDs" value={previewMetrics.ftds.toFixed(0)} />
          <YieldStat
            label="CPA"
            value={previewMetrics.cpa ? formatCurrency(previewMetrics.cpa) : '—'}
            valueClass={cpaColor}
          />
          <YieldStat
            label="ROAS"
            value={`${previewMetrics.roas.toFixed(1)}x`}
            valueClass={roasColor}
          />
        </div>
      </motion.div>
    </div>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 whitespace-nowrap px-3 gap-2 print-mode-hide"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="leading-none">Configure</span>
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg bg-slate-900 border-l border-slate-700/60 overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2 text-slate-100">
            <Settings2 className="h-4 w-4 text-cyan-400" />
            {channel.name}
          </SheetTitle>
          <SheetDescription className="text-slate-500 text-xs">
            Configure buying model and parameters for this channel
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {configurationHeader}

          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              Model Parameters
            </h4>
            <AnimatePresence mode="wait">{variableInputs}</AnimatePresence>
          </div>

          {yieldProjectionCard}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --- FormField ---

function FormField({
  label,
  value,
  onChange,
  icon,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon?: React.ReactNode;
  suffix?: string;
}) {
  const id = useId();
  const [localVal, setLocalVal] = useState<string>(String(value));
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setLocalVal(String(value));
  }, [value]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-slate-400">
        {label}
      </Label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          id={id}
          name={id}
          type="number"
          title={label}
          aria-label={label}
          value={localVal}
          onChange={(e) => {
            setLocalVal(e.target.value);
            const parsed = parseFloat(e.target.value);
            if (!isNaN(parsed)) onChange(parsed);
          }}
          onFocus={() => {
            isFocused.current = true;
          }}
          onBlur={() => {
            isFocused.current = false;
            const parsed = parseFloat(localVal);
            const final = isNaN(parsed) ? 0 : parsed;
            onChange(final);
            setLocalVal(String(final));
          }}
          className={cn(
            'w-full h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 font-mono text-sm',
            'shadow-inner focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500',
            'hover:border-slate-600 transition-colors duration-150',
            icon ? 'pl-10' : 'pl-4',
            suffix ? 'pr-16' : 'pr-4'
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// --- SliderField ---

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  icon,
  suffix,
  tooltip,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  icon?: React.ReactNode;
  suffix?: string;
  tooltip?: string;
}) {
  const id = useId();
  const numberInputId = `${id}-number`;
  const rangeInputId = `${id}-range`;
  const [localVal, setLocalVal] = useState<string>(String(value));
  const isFocused = useRef(false);
  const sliderTrackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFocused.current) setLocalVal(String(value));
  }, [value]);

  const clampedValue = Math.min(Math.max(value, min), max);
  const trackFill = `${((clampedValue - min) / (max - min)) * 100}%`;
  const sliderAriaProps = {
    'aria-valuenow': clampedValue,
    'aria-valuemin': min,
    'aria-valuemax': max,
  } as const;

  useEffect(() => {
    sliderTrackRef.current?.style.setProperty('--track-fill', trackFill);
  }, [trackFill]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label
          htmlFor={numberInputId}
          className={cn(
            'text-xs font-medium text-slate-400 flex items-center gap-1.5',
            tooltip &&
              'cursor-help underline decoration-dotted decoration-slate-600 underline-offset-2'
          )}
          title={tooltip}
        >
          {icon && <span className="text-slate-500">{icon}</span>}
          {label}
        </Label>
        <span className="text-xs font-mono text-cyan-400 tabular-nums">
          {localVal}
          {suffix}
        </span>
      </div>

      <div className="relative">
        <input
          id={numberInputId}
          name={numberInputId}
          type="number"
          title={label}
          aria-label={label}
          value={localVal}
          aria-describedby={tooltip ? `${id}-desc` : undefined}
          onChange={(e) => {
            setLocalVal(e.target.value);
            const parsed = parseFloat(e.target.value);
            if (!isNaN(parsed)) onChange(Math.min(Math.max(parsed, min), max));
          }}
          onFocus={() => {
            isFocused.current = true;
          }}
          onBlur={() => {
            isFocused.current = false;
            const parsed = parseFloat(localVal);
            const final = isNaN(parsed) ? min : Math.min(Math.max(parsed, min), max);
            onChange(final);
            setLocalVal(String(final));
          }}
          className={cn(
            'w-full h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 font-mono text-sm',
            'shadow-inner focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500',
            'hover:border-slate-600 transition-colors duration-150',
            'pl-4',
            suffix ? 'pr-16' : 'pr-4'
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>

      <div ref={sliderTrackRef} className="[--track-fill:0%]">
        <Label htmlFor={rangeInputId} className="sr-only">
          {label} slider
        </Label>
        <input
          id={rangeInputId}
          name={rangeInputId}
          type="range"
          role="slider"
          title={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={clampedValue}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(v);
            setLocalVal(String(v));
          }}
          aria-label={`${label} slider`}
          aria-describedby={tooltip ? `${id}-desc` : undefined}
          {...sliderAriaProps}
          className={cn(
            'w-full h-1.5 rounded-full cursor-pointer outline-none',
            'appearance-none bg-slate-700 bg-gradient-to-r from-cyan-500 to-cyan-500 bg-no-repeat bg-[length:var(--track-fill)_100%]',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
            '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400',
            '[&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(6,182,212,0.7)]',
            '[&::-webkit-slider-thumb]:cursor-pointer',
            '[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125',
            '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4',
            '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-cyan-400',
            '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer'
          )}
        />
      </div>

      {tooltip && (
        <p id={`${id}-desc`} className="sr-only">
          {tooltip}
        </p>
      )}
    </div>
  );
}

// --- YieldStat ---

function YieldStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</span>
      <motion.span
        layout
        key={value}
        initial={{ opacity: 0.6, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className={cn('font-mono font-semibold text-sm text-slate-100', valueClass)}
      >
        {value}
      </motion.span>
    </div>
  );
}
