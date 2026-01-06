import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, FileJson, FileText, CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft, Loader2, X, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useMultiMonthStore } from '@/hooks/use-multi-month-store';
import { useToast } from '@/hooks/use-toast';
import {
  importMediaPlan,
  DetectedStructure,
  ImportResult,
  ChannelMapping,
  FileFormat,
} from '@/lib/import-service';

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 'upload' | 'detecting' | 'review' | 'mapping' | 'confirm' | 'success';

const FORMAT_INFO: Record<FileFormat | 'txt', { icon: React.ReactNode; label: string; extensions: string }> = {
  csv: { icon: <FileText className="h-6 w-6" />, label: 'CSV', extensions: '.csv' },
  txt: { icon: <FileText className="h-6 w-6" />, label: 'Text', extensions: '.txt' },
  xlsx: { icon: <FileSpreadsheet className="h-6 w-6" />, label: 'Excel', extensions: '.xlsx, .xls' },
  json: { icon: <FileJson className="h-6 w-6" />, label: 'JSON', extensions: '.json' },
};

export function ImportWizard({ open, onOpenChange }: ImportWizardProps) {
  const { toast } = useToast();
  const store = useMultiMonthStore();
  
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [detected, setDetected] = useState<DetectedStructure | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  
  const resetWizard = useCallback(() => {
    setStep('upload');
    setFile(null);
    setDetected(null);
    setResult(null);
    setIsProcessing(false);
  }, []);
  
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setStep('detecting');
    setIsProcessing(true);
    
    try {
      const { detected: det, result: res } = await importMediaPlan(selectedFile);
      setDetected(det);
      setResult(res);
      setStep('review');
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Import Failed',
        description: error instanceof Error ? error.message : 'Could not parse the file',
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
    
    // Update each month with imported data
    setTimeout(() => {
      result.months.forEach((month) => {
        store.updateMonth(month.id, {
          budget: month.budget,
          budgetMultiplier: month.budgetMultiplier,
          channels: month.channels,
          useGlobalChannels: false,
        });
      });
      
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
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Import Media Plan
          </DialogTitle>
          <DialogDescription>
            Upload your existing media plan and we'll auto-detect the structure
          </DialogDescription>
        </DialogHeader>
        
        {/* Progress Indicator */}
        <div className="flex items-center gap-2 px-2 py-3">
          {(['upload', 'review', 'confirm', 'success'] as const).map((s, idx) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors",
                step === s 
                  ? "bg-primary text-primary-foreground" 
                  : step === 'success' || (['upload', 'review', 'confirm'].indexOf(step) > idx)
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              )}>
                {step === 'success' || (['upload', 'review', 'confirm'].indexOf(step) > idx) ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  idx + 1
                )}
              </div>
              <span className={cn(
                "text-xs hidden sm:inline",
                step === s ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {s === 'upload' ? 'Upload' : s === 'review' ? 'Review' : s === 'confirm' ? 'Confirm' : 'Done'}
              </span>
              {idx < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground/50 hidden sm:inline" />}
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
                  Detecting channels, months, and metrics
                </p>
              </div>
              <Progress value={66} className="w-48 mx-auto" />
            </div>
          )}
          
          {/* Step: Review */}
          {step === 'review' && detected && result && (
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
                  <p className="text-xs text-muted-foreground">Months Found</p>
                  <p className="text-sm font-medium">{result.months.length}</p>
                </div>
                <div className="p-3 rounded-lg border border-border bg-card/50">
                  <p className="text-xs text-muted-foreground">Confidence</p>
                  <p className="text-sm font-medium">{Math.round(detected.confidence * 100)}%</p>
                </div>
              </div>
              
              {/* Warnings */}
              {(detected.warnings.length > 0 || result.warnings.length > 0) && (
                <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/10">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <AlertTitle className="text-yellow-600">Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="text-xs space-y-1 mt-2">
                      {[...detected.warnings, ...result.warnings].map((w, i) => (
                        <li key={i}>• {w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Channel Mappings */}
              <div>
                <h4 className="text-sm font-medium mb-2">Channel Mappings</h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Source Column</TableHead>
                        <TableHead className="text-xs">Maps To</TableHead>
                        <TableHead className="text-xs w-24">Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detected.channelMappings.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">
                            No channels detected. Using default allocations.
                          </TableCell>
                        </TableRow>
                      ) : (
                        detected.channelMappings.map((m, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-mono">{m.sourceColumn}</TableCell>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-1">
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                {m.targetChannelName}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={m.confidence >= 0.9 ? 'default' : m.confidence >= 0.7 ? 'secondary' : 'outline'}
                                className="text-xs"
                              >
                                {Math.round(m.confidence * 100)}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              
              {/* Preview Data */}
              <div>
                <h4 className="text-sm font-medium mb-2">Data Preview</h4>
                <div className="border rounded-lg overflow-hidden">
                  <ScrollArea className="h-48">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs">Month</TableHead>
                          <TableHead className="text-xs text-right">Budget</TableHead>
                          <TableHead className="text-xs text-right">Channels</TableHead>
                          <TableHead className="text-xs text-right">GGR</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.months.map((m, i) => (
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
                              €{m.budget.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {m.channels.filter(c => c.allocationPct > 0).length} active
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">
                              {result.months[i] ? '—' : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}
          
          {/* Step: Success */}
          {step === 'success' && result && (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <p className="text-lg font-medium">Import Successful!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.months.length} months of data have been imported
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                <div className="p-3 rounded-lg border border-border bg-card/50">
                  <p className="text-2xl font-bold text-primary">
                    €{result.months.reduce((s, m) => s + m.budget, 0).toLocaleString()}
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
          
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={resetWizard}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Another File
              </Button>
              <Button onClick={() => setStep('confirm')}>
                Continue
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          
          {step === 'confirm' && result && (
            <>
              <Button variant="outline" onClick={() => setStep('review')}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleConfirmImport} disabled={!result.success}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Import {result.months.length} Months
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
