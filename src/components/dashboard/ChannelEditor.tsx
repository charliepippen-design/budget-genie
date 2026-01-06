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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Settings2, 
  DollarSign, 
  Users, 
  TrendingUp, 
  Percent,
  Zap,
  FileText,
  Target
} from 'lucide-react';
import { 
  ChannelFamily, 
  BuyingModel, 
  FAMILY_INFO, 
  BUYING_MODEL_INFO,
  calculateUnifiedMetrics,
  ChannelTypeConfig,
} from '@/types/channel';
import { 
  useMediaPlanStore,
  ChannelData,
} from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { cn } from '@/lib/utils';

interface ChannelEditorProps {
  channel: ChannelData;
  trigger?: React.ReactNode;
}

export function ChannelEditor({ channel, trigger }: ChannelEditorProps) {
  const { setChannelType, updateChannelTypeConfig, globalMultipliers } = useMediaPlanStore();
  const { format: formatCurrency } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);
  
  // Local state for form
  const [family, setFamily] = useState<ChannelFamily>(channel.family);
  const [buyingModel, setBuyingModel] = useState<BuyingModel>(channel.buyingModel);
  const [config, setConfig] = useState<ChannelTypeConfig>(channel.typeConfig);

  // Get allowed models for selected family
  const allowedModels = useMemo(() => {
    return FAMILY_INFO[family].allowedModels;
  }, [family]);

  // Calculate preview metrics
  const previewMetrics = useMemo(() => {
    const playerValue = globalMultipliers.playerValue || 150;
    // Use a sample spend for preview
    const sampleSpend = 10000;
    return calculateUnifiedMetrics({ ...config, family, buyingModel }, sampleSpend, playerValue);
  }, [config, family, buyingModel, globalMultipliers.playerValue]);

  const handleFamilyChange = (newFamily: ChannelFamily) => {
    setFamily(newFamily);
    const defaultModel = FAMILY_INFO[newFamily].defaultModel;
    setBuyingModel(defaultModel);
    setConfig(prev => ({ ...prev, family: newFamily, buyingModel: defaultModel }));
    setChannelType(channel.id, newFamily, defaultModel);
  };

  const handleModelChange = (newModel: BuyingModel) => {
    setBuyingModel(newModel);
    setConfig(prev => ({ ...prev, buyingModel: newModel }));
    setChannelType(channel.id, family, newModel);
  };

  const handleConfigChange = (field: keyof ChannelTypeConfig, value: number) => {
    const newConfig = { ...config, [field]: value };
    setConfig(newConfig);
    updateChannelTypeConfig(channel.id, { [field]: value });
  };

  // Render fields based on buying model
  const renderModelFields = () => {
    switch (buyingModel) {
      case 'cpm':
        return (
          <>
            <FormField 
              label="CPM" 
              value={config.cpm || 5} 
              onChange={(v) => handleConfigChange('cpm', v)}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="per 1K"
            />
            <FormField 
              label="CTR %" 
              value={config.ctr || 1} 
              onChange={(v) => handleConfigChange('ctr', v)}
              icon={<Percent className="h-4 w-4" />}
              suffix="%"
            />
            <FormField 
              label="Conv. Rate %" 
              value={config.cr || 2.5} 
              onChange={(v) => handleConfigChange('cr', v)}
              icon={<TrendingUp className="h-4 w-4" />}
              suffix="%"
            />
          </>
        );

      case 'cpc':
        return (
          <>
            <FormField 
              label="CPC" 
              value={config.cpc || 0.5} 
              onChange={(v) => handleConfigChange('cpc', v)}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="per click"
            />
            <FormField 
              label="Conv. Rate %" 
              value={config.cr || 2.5} 
              onChange={(v) => handleConfigChange('cr', v)}
              icon={<TrendingUp className="h-4 w-4" />}
              suffix="%"
            />
          </>
        );

      case 'cpa':
        return (
          <>
            <FormField 
              label="CPA Amount" 
              value={config.targetCpa || 50} 
              onChange={(v) => handleConfigChange('targetCpa', v)}
              icon={<Target className="h-4 w-4" />}
              suffix="per FTD"
            />
            <FormField 
              label="Target FTDs" 
              value={config.targetFtds || 10} 
              onChange={(v) => handleConfigChange('targetFtds', v)}
              icon={<Users className="h-4 w-4" />}
              suffix="players"
            />
          </>
        );

      case 'rev_share':
        return (
          <>
            <FormField 
              label="RevShare %" 
              value={config.revSharePercentage || 30} 
              onChange={(v) => handleConfigChange('revSharePercentage', v)}
              icon={<Percent className="h-4 w-4" />}
              suffix="%"
            />
            <FormField 
              label="NGR per FTD" 
              value={config.ngrPerFtd || 150} 
              onChange={(v) => handleConfigChange('ngrPerFtd', v)}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="revenue"
            />
            <FormField 
              label="Target FTDs" 
              value={config.targetFtds || 10} 
              onChange={(v) => handleConfigChange('targetFtds', v)}
              icon={<Users className="h-4 w-4" />}
              suffix="players"
            />
          </>
        );

      case 'hybrid':
        return (
          <>
            <FormField 
              label="CPA Amount" 
              value={config.targetCpa || 50} 
              onChange={(v) => handleConfigChange('targetCpa', v)}
              icon={<Target className="h-4 w-4" />}
              suffix="per FTD"
            />
            <FormField 
              label="RevShare %" 
              value={config.revSharePercentage || 20} 
              onChange={(v) => handleConfigChange('revSharePercentage', v)}
              icon={<Percent className="h-4 w-4" />}
              suffix="%"
            />
            <FormField 
              label="NGR per FTD" 
              value={config.ngrPerFtd || 150} 
              onChange={(v) => handleConfigChange('ngrPerFtd', v)}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="revenue"
            />
            <FormField 
              label="Target FTDs" 
              value={config.targetFtds || 10} 
              onChange={(v) => handleConfigChange('targetFtds', v)}
              icon={<Users className="h-4 w-4" />}
              suffix="players"
            />
          </>
        );

      case 'flat_fee':
        return (
          <>
            <FormField 
              label="Fixed Cost" 
              value={config.fixedCost || 1000} 
              onChange={(v) => handleConfigChange('fixedCost', v)}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="monthly"
            />
            <FormField 
              label="Est. FTDs" 
              value={config.estFtds || 5} 
              onChange={(v) => handleConfigChange('estFtds', v)}
              icon={<Users className="h-4 w-4" />}
              suffix="players"
            />
          </>
        );

      case 'retainer':
        return (
          <>
            <FormField 
              label="Monthly Retainer" 
              value={config.fixedCost || 2000} 
              onChange={(v) => handleConfigChange('fixedCost', v)}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="monthly"
            />
            <FormField 
              label="Est. Traffic" 
              value={config.estTraffic || 5000} 
              onChange={(v) => handleConfigChange('estTraffic', v)}
              icon={<Zap className="h-4 w-4" />}
              suffix="visits"
            />
            <FormField 
              label="Conv. Rate %" 
              value={config.cr || 2} 
              onChange={(v) => handleConfigChange('cr', v)}
              icon={<TrendingUp className="h-4 w-4" />}
              suffix="%"
            />
          </>
        );

      case 'unit_based':
        return (
          <>
            <FormField 
              label="Number of Units" 
              value={config.unitCount || 4} 
              onChange={(v) => handleConfigChange('unitCount', v)}
              icon={<FileText className="h-4 w-4" />}
              suffix="posts"
            />
            <FormField 
              label="Cost per Unit" 
              value={config.costPerUnit || 500} 
              onChange={(v) => handleConfigChange('costPerUnit', v)}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="each"
            />
            <FormField 
              label="Est. Reach/Unit" 
              value={config.estReachPerUnit || 50000} 
              onChange={(v) => handleConfigChange('estReachPerUnit', v)}
              icon={<Zap className="h-4 w-4" />}
              suffix="views"
            />
            <FormField 
              label="CTR %" 
              value={config.ctr || 2} 
              onChange={(v) => handleConfigChange('ctr', v)}
              icon={<Percent className="h-4 w-4" />}
              suffix="%"
            />
            <FormField 
              label="Conv. Rate %" 
              value={config.cr || 1} 
              onChange={(v) => handleConfigChange('cr', v)}
              icon={<TrendingUp className="h-4 w-4" />}
              suffix="%"
            />
          </>
        );

      case 'cpl':
        return (
          <>
            <FormField 
              label="CPL" 
              value={config.cpl || 5} 
              onChange={(v) => handleConfigChange('cpl', v)}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="per lead"
            />
            <FormField 
              label="Lead → FTD %" 
              value={config.leadToFtdRate || 10} 
              onChange={(v) => handleConfigChange('leadToFtdRate', v)}
              icon={<TrendingUp className="h-4 w-4" />}
              suffix="%"
            />
          </>
        );

      case 'input_based':
      default:
        return (
          <>
            <FormField 
              label="Manual Spend" 
              value={config.fixedCost || 1000} 
              onChange={(v) => handleConfigChange('fixedCost', v)}
              icon={<DollarSign className="h-4 w-4" />}
              suffix="total"
            />
            <FormField 
              label="Est. FTDs" 
              value={config.estFtds || 5} 
              onChange={(v) => handleConfigChange('estFtds', v)}
              icon={<Users className="h-4 w-4" />}
              suffix="players"
            />
          </>
        );
    }
  };

  // Calculate deal summary for affiliates
  const dealSummary = useMemo(() => {
    if (family !== 'affiliate') return null;
    
    const ftds = config.targetFtds || 10;
    let totalPerPlayer = 0;
    let breakdown = '';
    
    switch (buyingModel) {
      case 'cpa':
        totalPerPlayer = config.targetCpa || 50;
        breakdown = `${formatCurrency(totalPerPlayer)} CPA`;
        break;
      case 'rev_share':
        const rsAmount = (config.ngrPerFtd || 150) * ((config.revSharePercentage || 30) / 100);
        totalPerPlayer = rsAmount;
        breakdown = `${config.revSharePercentage || 30}% of ${formatCurrency(config.ngrPerFtd || 150)} NGR`;
        break;
      case 'hybrid':
        const cpaPart = config.targetCpa || 50;
        const rsPart = (config.ngrPerFtd || 150) * ((config.revSharePercentage || 20) / 100);
        totalPerPlayer = cpaPart + rsPart;
        breakdown = `${formatCurrency(cpaPart)} CPA + ${formatCurrency(rsPart)} RS`;
        break;
      case 'flat_fee':
        totalPerPlayer = (config.fixedCost || 1000) / (config.estFtds || 5);
        breakdown = `${formatCurrency(config.fixedCost || 1000)} ÷ ${config.estFtds || 5} FTDs`;
        break;
    }
    
    return { totalPerPlayer, breakdown };
  }, [family, buyingModel, config, formatCurrency]);

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

          {/* Deal Summary Card (Affiliates Only) */}
          {dealSummary && (
            <>
              <Separator />
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    Deal Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Payout per Player:</span>
                      <span className="font-mono font-bold text-primary">
                        {formatCurrency(dealSummary.totalPerPlayer)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {dealSummary.breakdown}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Live Preview */}
          <Separator />
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Projected Metrics (Sample)</CardTitle>
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
