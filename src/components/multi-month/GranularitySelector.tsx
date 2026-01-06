import { useState } from 'react';
import { Calendar, CalendarDays, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type ImportGranularity = 'monthly' | 'annual';
export type DistributionStrategy = 'even' | 'front-loaded' | 'back-loaded' | 'custom';

interface GranularitySelectorProps {
  granularity: ImportGranularity;
  distribution: DistributionStrategy;
  targetMonths: number;
  onGranularityChange: (granularity: ImportGranularity) => void;
  onDistributionChange: (distribution: DistributionStrategy) => void;
  onTargetMonthsChange: (months: number) => void;
}

export function GranularitySelector({
  granularity,
  distribution,
  targetMonths,
  onGranularityChange,
  onDistributionChange,
  onTargetMonthsChange,
}: GranularitySelectorProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium mb-2 block">Data Granularity</Label>
        <RadioGroup
          value={granularity}
          onValueChange={(v) => onGranularityChange(v as ImportGranularity)}
          className="grid grid-cols-2 gap-3"
        >
          <Label
            htmlFor="monthly"
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
              granularity === 'monthly' 
                ? "border-primary bg-primary/5" 
                : "border-border hover:bg-muted/50"
            )}
          >
            <RadioGroupItem value="monthly" id="monthly" />
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Monthly Detailed</p>
              <p className="text-xs text-muted-foreground">Row-by-row data per month</p>
            </div>
          </Label>
          
          <Label
            htmlFor="annual"
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
              granularity === 'annual' 
                ? "border-primary bg-primary/5" 
                : "border-border hover:bg-muted/50"
            )}
          >
            <RadioGroupItem value="annual" id="annual" />
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Annual Totals</p>
              <p className="text-xs text-muted-foreground">Yearly totals per channel</p>
            </div>
          </Label>
        </RadioGroup>
      </div>
      
      {granularity === 'annual' && (
        <div className="space-y-3 p-4 rounded-lg bg-muted/50 border border-border animate-fade-in">
          <div className="flex items-start gap-2">
            <HelpCircle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Your file contains annual totals. Choose how to distribute across months.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Spread Over</Label>
              <Select
                value={String(targetMonths)}
                onValueChange={(v) => onTargetMonthsChange(parseInt(v))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {[3, 6, 9, 12].map((months) => (
                    <SelectItem key={months} value={String(months)}>
                      {months} months
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs mb-1.5 block">Distribution</Label>
              <Select
                value={distribution}
                onValueChange={(v) => onDistributionChange(v as DistributionStrategy)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="even">Even Split</SelectItem>
                  <SelectItem value="front-loaded">Front-Loaded (Q1 heavy)</SelectItem>
                  <SelectItem value="back-loaded">Back-Loaded (Q4 heavy)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Distribution Preview */}
          <div className="flex items-end gap-0.5 h-8 mt-2">
            {Array.from({ length: targetMonths }).map((_, i) => {
              let height = 100 / targetMonths;
              
              if (distribution === 'front-loaded') {
                height = Math.max(20, 100 - (i * (60 / targetMonths)));
              } else if (distribution === 'back-loaded') {
                height = Math.max(20, 40 + (i * (60 / targetMonths)));
              }
              
              return (
                <div
                  key={i}
                  className="flex-1 bg-primary/60 rounded-t-sm transition-all"
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>M1</span>
            <span>M{targetMonths}</span>
          </div>
        </div>
      )}
    </div>
  );
}
