import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, FileJson, FileText, CheckCircle2, AlertTriangle, ChevronRight, Loader2, RefreshCw, Sparkles, DollarSign, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useToast } from '@/hooks/use-toast';
import {
  importMediaPlan,
  DetectedStructure,
  ImportResult,
  FileFormat,
  ValidationReport,
} from '@/lib/import-service';
import { ChannelData } from '@/hooks/use-media-plan-store';
import { inferChannelFamily, inferBuyingModel, ChannelTypeConfig, getLikelyModel } from '@/types/channel';
import { ReconciliationTable } from './ReconciliationTable';
import { GranularitySelector, ImportGranularity, DistributionStrategy } from './GranularitySelector';
import { CurrencyConflictDialog, CurrencyConflictResolution } from './CurrencyConflictDialog';

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 'upload' | 'detecting' | 'analyze' | 'reconcile' | 'preview' | 'success';

const FORMAT_INFO: Record<FileFormat | 'txt', { icon: React.ReactNode; label: string; extensions: string }> = {
  csv: { icon: <FileText className="h-6 w-6" />, label: 'CSV', extensions: '.csv' },
  txt: { icon: <FileText className="h-6 w-6" />, label: 'Text', extensions: '.txt' },
  xlsx: { icon: <FileSpreadsheet className="h-6 w-6" />, label: 'Excel', extensions: '.xlsx, .xls' },
  json: { icon: <FileJson className="h-6 w-6" />, label: 'JSON', extensions: '.json' },
};

const STEP_LABELS: Record<WizardStep, string> = {
  upload: 'Upload',
  detecting: 'Detecting',
  analyze: 'Analyze',
  reconcile: 'Review',
  preview: 'Preview',
  success: 'Done',
};

export function ImportWizard({ open, onOpenChange }: ImportWizardProps) {
  const { toast } = useToast();
  const store = useMultiMonthStore();
  const { setTotalBudget, setChannels, setGlobalMultipliers } = useMediaPlanStore();
  const { format: formatCurrency, symbol, code: appCurrency } = useCurrency();

  // Wizard state
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [detected, setDetected] = useState<DetectedStructure | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Analysis state
  const [granularity, setGranularity] = useState<ImportGranularity>('monthly');
  const [distribution, setDistribution] = useState<DistributionStrategy>('even');
  const [targetMonths, setTargetMonths] = useState(12);
  const [currencyResolution, setCurrencyResolution] = useState<CurrencyConflictResolution>('keep-numbers');
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);

  const hasIssues = validationReport && (
    validationReport.dirtyRows.length > 0 ||
    validationReport.columnIssues.length > 0
  );

  const pendingIssues = validationReport
    ? validationReport.dirtyRows.reduce((c, r) => c + r.issues.filter(i => !i.resolved).length, 0) +
    validationReport.columnIssues.filter(i => !i.resolved).length
    : 0;

  const hasCurrencyConflict = detected &&
    detected.detectedCurrency &&
    detected.detectedCurrency !== appCurrency &&
    detected.currencyConfidence > 0.3;

  const resetWizard = useCallback(() => {
    setStep('upload');
    setFile(null);
    setDetected(null);
    setResult(null);
    setIsProcessing(false);
    setGranularity('monthly');
    setDistribution('even');
    setTargetMonths(12);
    setCurrencyResolution('keep-numbers');
    setValidationReport(null);
  }, []);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setStep('detecting');
    setIsProcessing(true);

    try {
      const { detected: det, result: res } = await importMediaPlan(selectedFile);
      setDetected(det);
      setResult(res);
      setGranularity(det.granularity);
      setValidationReport(det.validationReport);
      setStep('analyze');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Import error:', error);
      }
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Could not parse the file. Please check the format and try again.',
        variant: 'destructive',
      });
      setStep('upload');
    } finally {
      setIsProcessing(false);
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleHealData = useCallback(() => {
    if (!validationReport) return;

    // Auto-resolve all healable issues
    const updatedDirtyRows = validationReport.dirtyRows.map(row => ({
      ...row,
      issues: row.issues.map(issue => ({
        ...issue,
        resolved: true,
        resolvedValue: issue.suggestedValue ?? 0,
      })),
    }));

    const updatedColumnIssues = validationReport.columnIssues.map(issue => ({
      ...issue,
      resolved: true,
    }));

    setValidationReport({
      ...validationReport,
      dirtyRows: updatedDirtyRows,
      columnIssues: updatedColumnIssues,
    });

    toast({
      title: 'Data Healed',
      description: `Auto-resolved ${validationReport.healableFields} issues with estimated values`,
    });
  }, [validationReport, toast]);

  const handleConfirmImport = useCallback(() => {
    if (!result || !result.success) return;

    // Update store with imported data
    store.setIncludeSoftLaunch(result.includeSoftLaunch);
    store.setPlanningMonths(result.planningMonths);
    store.setStartMonth(result.startMonth);
    store.setProgressionPattern(result.progressionPattern);

    if (result.globalSettings) {
      store.setGlobalSettings(result.globalSettings);
    }

    // Generate months first, then update with imported data
    store.generateMonths();

    // Calclate total budget
    const totalImportedBudget = result.months.reduce((sum, m) => sum + m.budget, 0);

    // Update each month with imported data
    setTimeout(() => {
      // 1. Update Multi-Month Store
      result.months.forEach((month) => {
        store.updateMonth(month.id, {
          budget: month.budget,
          budgetMultiplier: month.budgetMultiplier,
          channels: month.channels,
          useGlobalChannels: false,
        });
      });

      // 2. SYNC WITH QUICK VIEW (MediaPlanStore)
      if (totalImportedBudget > 0) {
        // Aggregate all channels from all months
        const channelTotals: Record<string, { spend: number; name: string; category: any; cpm: number; ctr: number; roas: number }> = {};

        result.months.forEach(month => {
          month.channels.forEach(ch => {
            if (!channelTotals[ch.channelId]) {
              channelTotals[ch.channelId] = {
                spend: 0,
                name: ch.name,
                category: ch.category,
                cpm: ch.cpm,
                ctr: ch.ctr,
                roas: ch.roas
              };
            }
            // Calculate monthly spend for this channel
            const monthlySpend = (ch.allocationPct / 100) * month.budget;
            channelTotals[ch.channelId].spend += monthlySpend;
          });
        });

        // Convert to MediaPlanStore ChannelData format
        const newChannels: ChannelData[] = Object.entries(channelTotals).map(([id, data]) => {
          const allocationPct = (data.spend / totalImportedBudget) * 100;
          const family = inferChannelFamily(data.name);
          const buyingModel = inferBuyingModel(data.name, family);

          // Construct legacy-free channel object
          return {
            id,
            name: data.name,
            category: data.category,
            allocationPct,

            family,
            buyingModel,
            typeConfig: {
              family,
              buyingModel,
              price: data.cpm || 5, // Fallback price (assuming CPM import)
              baselineMetrics: {
                ctr: data.ctr,
                conversionRate: 2.5,
                aov: 150
              },
              secondaryPrice: 0 // Optional
            },

            locked: false,
          };
        });

        // Apply Updates
        setTotalBudget(totalImportedBudget);
        setChannels(newChannels);

        // IMPORTANT: Reset multipliers so the total budget matches exactly
        setGlobalMultipliers({
          spendMultiplier: 1.0,
          ctrBump: 0,
        });
      }

      setStep('success');

      toast({
        title: 'Import Successful',
        description: `Imported ${result.months.length} months of data`,
      });
    }, 100);
  }, [result, store, toast]);

  const handleClose = useCallback(() => {
    resetWizard();
    onOpenChange(false);
  }, [onOpenChange, resetWizard]);

  const canProceedFromAnalyze = !hasCurrencyConflict || currencyResolution === 'keep-numbers';
  const canProceedFromReconcile = pendingIssues === 0;

  const getNextStep = (current: WizardStep): WizardStep => {
    switch (current) {
      case 'analyze':
        return hasIssues ? 'reconcile' : 'preview';
      case 'reconcile':
        return 'preview';
      default:
        return current;
    }
  };

  const visibleSteps: WizardStep[] = ['upload', 'analyze', hasIssues ? 'reconcile' : null, 'preview', 'success'].filter(Boolean) as WizardStep[];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            Import Genius
          </DialogTitle>
          <DialogDescription>
            Upload your media plan and let me help you import it perfectly
          </DialogDescription>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex items-center gap-2 px-2 py-3">
          {visibleSteps.map((s, idx) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors",
                step === s
                  ? "bg-primary text-primary-foreground"
                  : step === 'success' || visibleSteps.indexOf(step) > idx
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              )}>
                {step === 'success' || visibleSteps.indexOf(step) > idx ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  idx + 1
                )}
              </div>
              <span className={cn(
                "text-xs hidden sm:inline",
                step === s ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {STEP_LABELS[s]}
              </span>
              {idx < visibleSteps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/50 hidden sm:inline" />}
            </div>
          ))}
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  accept=".csv,.xlsx,.xls,.json,.txt"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium mb-1">
                  Drag & drop your file here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports CSV, Excel (.xlsx), and JSON
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {Object.entries(FORMAT_INFO).filter(([k]) => k !== 'txt').map(([key, info]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card/50"
                  >
                    <div className="text-primary">{info.icon}</div>
                    <div>
                      <p className="text-sm font-medium">{info.label}</p>
                      <p className="text-xs text-muted-foreground">{info.extensions}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step: Detecting */}
          {step === 'detecting' && (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin" />
              <div>
                <p className="text-sm font-medium">Analyzing file structure...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Detecting channels, months, currency, and metrics
                </p>
              </div>
              <Progress value={66} className="w-48 mx-auto" />
            </div>
          )}

          {/* Step: Analyze (Currency + Granularity) */}
          {step === 'analyze' && detected && result && (
            <div className="space-y-4">
              {/* Detection Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border border-border bg-card/50">
                  <p className="text-xs text-muted-foreground">Format</p>
                  <p className="text-sm font-medium capitalize">{detected.format}</p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card/50">
                  <p className="text-xs text-muted-foreground">Structure</p>
                  <p className="text-sm font-medium capitalize">{detected.structure.replace('-', ' ')}</p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card/50">
                  <p className="text-xs text-muted-foreground">Data Points</p>
                  <p className="text-sm font-medium">{result.months.length} months</p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card/50">
                  <p className="text-xs text-muted-foreground">Confidence</p>
                  <p className="text-sm font-medium">{Math.round(detected.confidence * 100)}%</p>
                </div>
              </div>

              {/* Currency Conflict */}
              {hasCurrencyConflict && detected.detectedCurrency && (
                <CurrencyConflictDialog
                  fileCurrency={detected.detectedCurrency as any}
                  appCurrency={appCurrency}
                  samples={[]}
                  resolution={currencyResolution}
                  onResolutionChange={setCurrencyResolution}
                />
              )}

              {/* Granularity Selection */}
              <GranularitySelector
                granularity={granularity}
                distribution={distribution}
                targetMonths={targetMonths}
                onGranularityChange={setGranularity}
                onDistributionChange={setDistribution}
                onTargetMonthsChange={setTargetMonths}
              />

              {/* Channel Mappings */}
              {detected.channelMappings.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    Detected Channels ({detected.channelMappings.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {detected.channelMappings.map((m, i) => (
                      <Badge
                        key={i}
                        variant={m.confidence >= 0.9 ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {m.targetChannelName}
                        {m.confidence < 0.9 && (
                          <span className="ml-1 opacity-60">{Math.round(m.confidence * 100)}%</span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {detected.warnings.length > 0 && (
                <Alert variant="default" className="border-warning/50 bg-warning/10">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertTitle className="text-warning">Notes</AlertTitle>
                  <AlertDescription>
                    <ul className="text-xs space-y-1 mt-2">
                      {detected.warnings.map((w, i) => (
                        <li key={i}>• {w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Step: Reconcile (Fix Issues) */}
          {step === 'reconcile' && validationReport && (
            <ReconciliationTable
              report={validationReport}
              onResolve={setValidationReport}
              onHealData={handleHealData}
            />
          )}

          {/* Step: Preview */}
          {step === 'preview' && detected && result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-success/10 border border-success/30">
                <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Ready to Import</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    All data has been validated and is ready to load into your plan
                  </p>
                </div>
              </div>

              {/* Data Preview */}
              <div className="border rounded-lg overflow-hidden">
                <ScrollArea className="h-64">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Month</TableHead>
                        <TableHead className="text-xs text-right">Budget</TableHead>
                        <TableHead className="text-xs text-right">Channels</TableHead>
                        <TableHead className="text-xs text-right">Top Channel</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.months.map((m, i) => {
                        const topChannel = m.channels.reduce((top, ch) =>
                          ch.allocationPct > (top?.allocationPct || 0) ? ch : top
                          , m.channels[0]);
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-1">
                                {m.label}
                                {m.isSoftLaunch && (
                                  <Badge variant="outline" className="text-[10px] px-1">SL</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">
                              {formatCurrency(m.budget)}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {m.channels.filter(c => c.allocationPct > 0).length} active
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {topChannel?.name} ({Math.round(topChannel?.allocationPct || 0)}%)
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border border-border bg-card/50 text-center">
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(result.months.reduce((s, m) => s + m.budget, 0))}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Budget</p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card/50 text-center">
                  <p className="text-2xl font-bold">{result.months.length}</p>
                  <p className="text-xs text-muted-foreground">Months</p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card/50 text-center">
                  <p className="text-2xl font-bold">{detected.channelMappings.length}</p>
                  <p className="text-xs text-muted-foreground">Channels</p>
                </div>
              </div>
            </div>
          )}

          {/* Step: Success */}
          {step === 'success' && result && (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <div>
                <p className="text-lg font-medium">Import Successful!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.months.length} months of data have been loaded into your plan
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                <div className="p-3 rounded-lg border border-border bg-card/50">
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(result.months.reduce((s, m) => s + m.budget, 0))}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Budget</p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card/50">
                  <p className="text-2xl font-bold">{result.months.length}</p>
                  <p className="text-xs text-muted-foreground">Months</p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card/50">
                  <p className="text-2xl font-bold">11</p>
                  <p className="text-xs text-muted-foreground">Channels</p>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}

          {step === 'analyze' && (
            <>
              <Button variant="outline" onClick={resetWizard}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Another File
              </Button>
              <Button
                onClick={() => setStep(getNextStep('analyze'))}
                disabled={!canProceedFromAnalyze}
              >
                Continue
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}

          {step === 'reconcile' && (
            <>
              <Button variant="outline" onClick={() => setStep('analyze')}>
                Back
              </Button>
              <Button
                onClick={() => setStep('preview')}
                disabled={!canProceedFromReconcile}
              >
                {pendingIssues > 0 ? `${pendingIssues} issues remaining` : 'Continue'}
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep(hasIssues ? 'reconcile' : 'analyze')}>
                Back
              </Button>
              <Button onClick={handleConfirmImport}>
                Import Plan
                <CheckCircle2 className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}

          {step === 'success' && (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
