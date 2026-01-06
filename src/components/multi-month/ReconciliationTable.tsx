import { useState, useCallback } from 'react';
import { AlertTriangle, Check, Sparkles, HelpCircle, ChevronDown, ArrowRight, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ValidationReport, DirtyRow, ColumnIssue, CHANNEL_DISPLAY_NAMES } from '@/lib/import-service';

interface ReconciliationTableProps {
  report: ValidationReport;
  onResolve: (updatedReport: ValidationReport) => void;
  onHealData: () => void;
}

type IssueResolution = 'set-zero' | 'use-average' | 'skip-row' | 'manual';

export function ReconciliationTable({ report, onResolve, onHealData }: ReconciliationTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [resolutions, setResolutions] = useState<Record<string, IssueResolution | string>>({});
  
  const pendingIssuesCount = report.dirtyRows.reduce(
    (count, row) => count + row.issues.filter(i => !i.resolved).length, 
    0
  ) + report.columnIssues.filter(i => !i.resolved).length;
  
  const toggleRow = useCallback((rowIndex: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, []);
  
  const handleColumnResolution = useCallback((issueId: string, targetChannelId: string) => {
    const updatedIssues = report.columnIssues.map(issue => {
      if (issue.id === issueId) {
        return { ...issue, suggestedMapping: targetChannelId, resolved: true };
      }
      return issue;
    });
    
    onResolve({
      ...report,
      columnIssues: updatedIssues,
    });
  }, [report, onResolve]);
  
  const handleCellResolution = useCallback((
    rowIndex: number, 
    issueIndex: number, 
    resolution: IssueResolution,
    manualValue?: string
  ) => {
    const key = `${rowIndex}-${issueIndex}`;
    setResolutions(prev => ({ ...prev, [key]: resolution }));
    
    const updatedDirtyRows = report.dirtyRows.map((row, rIdx) => {
      if (rIdx !== rowIndex) return row;
      
      const updatedIssues = row.issues.map((issue, iIdx) => {
        if (iIdx !== issueIndex) return issue;
        
        let resolvedValue: number | null = null;
        switch (resolution) {
          case 'set-zero':
            resolvedValue = 0;
            break;
          case 'use-average':
            resolvedValue = issue.suggestedValue ?? 0;
            break;
          case 'manual':
            resolvedValue = parseFloat(manualValue || '0') || 0;
            break;
          case 'skip-row':
            resolvedValue = null;
            break;
        }
        
        return { ...issue, resolved: true, resolvedValue };
      });
      
      return { ...row, issues: updatedIssues };
    });
    
    onResolve({
      ...report,
      dirtyRows: updatedDirtyRows,
    });
  }, [report, onResolve]);
  
  const successPercentage = report.totalRows > 0 
    ? Math.round((report.cleanRows / report.totalRows) * 100) 
    : 0;
  
  return (
    <div className="space-y-4">
      {/* Header with friendly message */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-accent/10 border border-accent/30">
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-5 w-5 text-accent" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-foreground">
            I successfully read {successPercentage}% of your file
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Let's fix the last {pendingIssuesCount} item{pendingIssuesCount !== 1 ? 's' : ''} together
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-shrink-0"
          onClick={onHealData}
        >
          <Wand2 className="h-4 w-4 mr-1.5" />
          Heal Data
        </Button>
      </div>
      
      {/* Column Mapping Issues */}
      {report.columnIssues.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-warning" />
            Unmapped Columns
          </h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs w-1/3">Found Column</TableHead>
                  <TableHead className="text-xs w-1/3">Map To</TableHead>
                  <TableHead className="text-xs w-1/3">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.columnIssues.map((issue) => (
                  <TableRow key={issue.id} className={cn(issue.resolved && "bg-success/5")}>
                    <TableCell className="text-xs font-mono">
                      "{issue.sourceColumn}"
                    </TableCell>
                    <TableCell>
                      <Select
                        value={issue.suggestedMapping || ''}
                        onValueChange={(value) => handleColumnResolution(issue.id, value)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select channel..." />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                          <SelectItem value="__skip__">
                            <span className="text-muted-foreground">Skip this column</span>
                          </SelectItem>
                          {Object.entries(CHANNEL_DISPLAY_NAMES).map(([id, name]) => (
                            <SelectItem key={id} value={id}>
                              {name as string}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {issue.resolved ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                          <Check className="h-3 w-3 mr-1" />
                          Mapped
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                          Needs mapping
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      
      {/* Row-level Issues */}
      {report.dirtyRows.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Data Issues ({report.dirtyRows.length} rows)
          </h4>
          <ScrollArea className="h-[300px] border rounded-lg">
            <div className="divide-y divide-border">
              {report.dirtyRows.map((row, rowIndex) => (
                <Collapsible 
                  key={rowIndex}
                  open={expandedRows.has(rowIndex)}
                  onOpenChange={() => toggleRow(rowIndex)}
                >
                  <CollapsibleTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors",
                      row.issues.every(i => i.resolved) && "bg-success/5"
                    )}>
                      <ChevronDown className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        expandedRows.has(rowIndex) && "rotate-180"
                      )} />
                      <div className="flex-1">
                        <span className="text-xs font-mono text-muted-foreground">Row {row.rowIndex + 1}</span>
                        <span className="mx-2 text-muted-foreground">•</span>
                        <span className="text-xs">{row.issues.length} issue{row.issues.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {row.issues.map((issue, i) => (
                          <div
                            key={i}
                            className={cn(
                              "w-2 h-2 rounded-full",
                              issue.resolved ? "bg-success" : "bg-warning"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 space-y-2 bg-muted/30">
                      {row.issues.map((issue, issueIndex) => (
                        <div 
                          key={issueIndex} 
                          className={cn(
                            "p-3 rounded-lg border",
                            issue.resolved 
                              ? "bg-success/5 border-success/30" 
                              : "bg-card border-warning/30"
                          )}
                        >
                          <div className="flex items-start gap-2 mb-2">
                            {issue.resolved ? (
                              <Check className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <p className="text-sm">{issue.message}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Column: <span className="font-mono">{issue.column}</span>
                                {issue.originalValue && (
                                  <> • Original: <span className="font-mono">"{issue.originalValue}"</span></>
                                )}
                              </p>
                            </div>
                          </div>
                          
                          {!issue.resolved && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => handleCellResolution(rowIndex, issueIndex, 'set-zero')}
                                    >
                                      Set to 0
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Use 0 for this value</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              {issue.suggestedValue !== undefined && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => handleCellResolution(rowIndex, issueIndex, 'use-average')}
                                      >
                                        Use {issue.suggestedValue.toLocaleString()}
                                        <Badge variant="secondary" className="ml-1.5 text-[10px] px-1">
                                          Estimated
                                        </Badge>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Use calculated/average value</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs text-destructive hover:text-destructive"
                                      onClick={() => handleCellResolution(rowIndex, issueIndex, 'skip-row')}
                                    >
                                      Skip Row
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Exclude this entire row from import</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          )}
                          
                          {issue.resolved && issue.resolvedValue !== null && (
                            <div className="flex items-center gap-2 mt-2 text-xs text-success">
                              <ArrowRight className="h-3 w-3" />
                              Resolved to: <span className="font-mono">{issue.resolvedValue}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
      
      {/* No issues state */}
      {pendingIssuesCount === 0 && report.dirtyRows.length === 0 && report.columnIssues.length === 0 && (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-3">
            <Check className="h-6 w-6 text-success" />
          </div>
          <p className="font-medium">All data looks good!</p>
          <p className="text-sm text-muted-foreground mt-1">No issues found in your file</p>
        </div>
      )}
    </div>
  );
}
