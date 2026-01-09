import { useState, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Settings2,
  DollarSign,
  Users,
  TrendingUp,
  Percent,
  Zap,
  Target
} from 'lucide-react';
import {
  ChannelFamily,
  BuyingModel,
  FAMILY_INFO,
  BUYING_MODEL_INFO,
  calculateUnifiedMetrics,
  ChannelTypeConfig
} from '@/types/channel';
import {
  useMediaPlanStore,
  ChannelData
} from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';

interface ChannelEditorProps {
  channel: ChannelData;
  trigger?: React.ReactNode;
}

export function ChannelEditor({ channel, trigger }: ChannelEditorProps) {
  const {
    setChannelType,
    updateChannelTypeConfig,
    updateChannelConfigField,
    globalMultipliers
  } = useMediaPlanStore();

  const { format: formatCurrency } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);

  // Local state derived from store (syncing happens on change)
  const family = channel.family;
  const buyingModel = channel.buyingModel;

  // Config comes directly from store channel object
  const config = channel.typeConfig;

  // Get allowed models for selected family
  const allowedModels = useMemo(() => {
    const familyInfo = FAMILY_INFO[family];
    return familyInfo?.allowedModels || ['CPM', 'CPC'];
  }, [family]);

  // Calculate preview metrics using dummy spend
  const previewMetrics = useMemo(() => {
    const playerValue = globalMultipliers.playerValue || 150;
    const sampleSpend = 10000;
    // We pass the config as is
    return calculateUnifiedMetrics(config, sampleSpend, playerValue);
  }, [config, globalMultipliers.playerValue]);

  const handleFamilyChange = (newFamily: ChannelFamily) => {
    const defaultModel = FAMILY_INFO[newFamily].defaultModel;
    setChannelType(channel.id, newFamily, defaultModel);
  };

  const handleModelChange = (newModel: BuyingModel) => {
    setChannelType(channel.id, family, newModel);
  };

  const updatePrice = (val: number) => {
    updateChannelConfigField(channel.id, 'price', val);
  };

  const updateSecondaryPrice = (val: number) => {
    updateChannelConfigField(channel.id, 'secondaryPrice', val);
  };

  const updateBaselineMetric = (field: keyof typeof config.baselineMetrics, val: number) => {
    updateChannelConfigField(channel.id, 'baselineMetrics', { [field]: val });
  };

  // Render fields based on buying model (The Chameleon)
  const renderModelFields = () => {
    switch (buyingModel) {
      case 'CPM':
        return (
          <>
            <FormField
              label="CPM Price"
              value={config.price || 5}
              onChange={updatePrice}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="per 1K"
            />
            <FormField
              label="CTR %"
              value={config.baselineMetrics.ctr || 1}
              onChange={(v) => updateBaselineMetric('ctr', v)}
              icon={<Percent className="h-4 w-4" />}
              suffix="%"
            />
            <FormField
              label="Conv. Rate %"
              value={config.baselineMetrics.conversionRate || 2.5}
              onChange={(v) => updateBaselineMetric('conversionRate', v)}
              icon={<TrendingUp className="h-4 w-4" />}
              suffix="%"
            />
          </>
        );

      case 'CPC':
        return (
          <>
            <FormField
              label="CPC Price"
              value={config.price || 0.5}
              onChange={updatePrice}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="per click"
            />
            <FormField
              label="Conv. Rate %"
              value={config.baselineMetrics.conversionRate || 2.5}
              onChange={(v) => updateBaselineMetric('conversionRate', v)}
              icon={<TrendingUp className="h-4 w-4" />}
              suffix="%"
            />
          </>
        );

      case 'CPA':
        return (
          <>
            <FormField
              label="Target CPA"
              value={config.price || 50}
              onChange={updatePrice}
              icon={<Target className="h-4 w-4" />}
              suffix="per FTD"
            />
            {/* Hide CTR, maybe show CR to estimate traffic? */}
            <div className="text-xs text-muted-foreground mt-2">
              Based on the budget allocation, we calculate total FTDs using this Target CPA.
            </div>
          </>
        );

      case 'REV_SHARE':
        return (
          <>
            <FormField
              label="RevShare %"
              value={config.secondaryPrice || 30}
              onChange={updateSecondaryPrice}
              icon={<Percent className="h-4 w-4" />}
              suffix="%"
            />
            <FormField
              label="Avg Order Value"
              value={config.baselineMetrics.aov || 150}
              onChange={(v) => updateBaselineMetric('aov', v)}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="per FTD"
            />
          </>
        );

      case 'HYBRID':
        return (
          <>
            <FormField
              label="Base CPA"
              value={config.price || 20}
              onChange={updatePrice}
              icon={<Target className="h-4 w-4" />}
              suffix="per FTD"
            />
            <FormField
              label="RevShare %"
              value={config.secondaryPrice || 20}
              onChange={updateSecondaryPrice}
              icon={<Percent className="h-4 w-4" />}
              suffix="%"
            />
            <FormField
              label="Avg Order Value"
              value={config.baselineMetrics.aov || 150}
              onChange={(v) => updateBaselineMetric('aov', v)}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="per FTD"
            />
          </>
        );

      case 'FLAT_FEE':
      case 'RETAINER':
        return (
          <>
            <FormField
              label="Monthly Cost"
              value={config.price || 1000}
              onChange={updatePrice}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="total"
            />
            <FormField
              label="Est. Traffic"
              value={config.baselineMetrics.trafficPerUnit || 1000}
              onChange={(v) => updateBaselineMetric('trafficPerUnit', v)}
              icon={<Zap className="h-4 w-4" />}
              suffix="visits"
            />
            <FormField
              label="Conv. Rate %"
              value={config.baselineMetrics.conversionRate || 2.5}
              onChange={(v) => updateBaselineMetric('conversionRate', v)}
              icon={<TrendingUp className="h-4 w-4" />}
              suffix="%"
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            <span className="text-xs">Configure</span>
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            {channel.name}
          </SheetTitle>
          <SheetDescription>
            Configure buying model and parameters for this channel
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Channel Type Selectors */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Channel Family</Label>
              <Select value={family} onValueChange={(v) => handleFamilyChange(v as ChannelFamily)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FAMILY_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Buying Model</Label>
              <Select value={buyingModel} onValueChange={(v) => handleModelChange(v as BuyingModel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {BUYING_MODEL_INFO[model].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            {BUYING_MODEL_INFO[buyingModel].description}
          </div>

          <Separator />

          {/* Dynamic Form Fields */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Model Parameters</h4>
            <div className="grid gap-4">
              {renderModelFields()}
            </div>
          </div>

          {/* Live Preview */}
          <Separator />
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Projected Metrics (Sample $10k Budget)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <MetricRow label="Spend" value={formatCurrency(previewMetrics.spend)} />
                <MetricRow label="FTDs" value={previewMetrics.ftds.toFixed(0)} />
                <MetricRow
                  label="CPA"
                  value={previewMetrics.cpa ? formatCurrency(previewMetrics.cpa) : 'N/A'}
                />
                <MetricRow
                  label="ROAS"
                  value={`${previewMetrics.roas.toFixed(1)}x`}
                  highlight={previewMetrics.roas >= 2}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Helper Components
function FormField({
  label,
  value,
  onChange,
  icon,
  suffix
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon?: React.ReactNode;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={cn(
            "font-mono",
            icon && "pl-10"
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  highlight
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(
        "font-mono font-medium",
        highlight && "text-success"
      )}>
        {value}
      </span>
    </div>
  );
}
