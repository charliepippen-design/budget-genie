import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useBlendedMetrics, useChannelsWithMetrics, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { exportToPdf } from '@/lib/export-service';
import { cn } from '@/lib/utils';
import { FileText, Palette, FileSpreadsheet, Check } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const REPORT_TEMPLATES = [
  {
    id: 'custom',
    name: 'Custom Presentation (Empty)',
    clientName: '',
    color: '#4f46e5',
    notes: '',
    includeSummary: true,
    includeChannels: true,
  },
  {
    id: 'sports',
    name: 'Sports Betting Growth Model',
    clientName: 'SportsBook Acquisition Scaler',
    color: '#0ea5e9', // Sky Blue
    notes: 'Sportsbook acquisition model focused on high-CTR display banner buys and seasonal influencer retargeting. Projections are calibrated based on standard €110 Sportsbook CPA averages.',
    includeSummary: true,
    includeChannels: true,
  },
  {
    id: 'casino',
    name: 'Online Casino High-LTV Plan',
    clientName: 'Casino High-LTV Scaler',
    color: '#6366f1', // Indigo/Violet
    notes: 'Online Casino projection model prioritizing premium affiliate listing positions and content-rich SEO strategies. Calibrated against standard €220 Casino CPA levels to ensure stable player value margins.',
    includeSummary: true,
    includeChannels: true,
  },
  {
    id: 'poker',
    name: 'Poker Retention Strategy',
    clientName: 'iGaming Poker Scale Model',
    color: '#f59e0b', // Amber
    notes: 'Poker volume projection targeting community retention channels, search optimizations, and loyalty retainer schemes. Assumes €140 blended target CPA.',
    includeSummary: true,
    includeChannels: true,
  },
  {
    id: 'bingo',
    name: 'Bingo Volume Launch Plan',
    clientName: 'Bingo Volume Scalability Model',
    color: '#10b981', // Emerald
    notes: 'High-volume social Bingo projection. Relies heavily on display programmatic networks and social referrals. Target CPA set at €70 average.',
    includeSummary: true,
    includeChannels: true,
  }
];

interface ReportBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BRAND_COLORS = [
  { value: '#4f46e5', label: 'Indigo' },
  { value: '#0ea5e9', label: 'Sky Blue' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Rose Red' },
  { value: '#6366f1', label: 'Violet' },
  { value: '#0f172a', label: 'Slate' },
];

export function ReportBuilderModal({ open, onOpenChange }: ReportBuilderModalProps) {
  const { projectName } = useMediaPlanStore();
  const channels = useChannelsWithMetrics();
  const blended = useBlendedMetrics();
  const { symbol } = useCurrency();

  const [templateId, setTemplateId] = useState('custom');
  const [clientName, setClientName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#4f46e5');
  const [customColor, setCustomColor] = useState('');
  const [notes, setNotes] = useState('');
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeChannels, setIncludeChannels] = useState(true);

  const handleTemplateChange = (val: string) => {
    setTemplateId(val);
    const selected = REPORT_TEMPLATES.find(t => t.id === val);
    if (selected) {
      setClientName(selected.clientName);
      setSelectedColor(selected.color);
      setCustomColor('');
      setNotes(selected.notes);
      setIncludeSummary(selected.includeSummary);
      setIncludeChannels(selected.includeChannels);
    }
  };

  const activeColor = customColor || selectedColor;

  const handleGenerate = () => {
    exportToPdf({
      projectName: projectName || 'Media Plan',
      channels,
      blended,
      symbol,
      brandName: clientName || 'MediaPlan Pro',
      brandColor: activeColor,
      notes,
      includeSummary,
      includeChannels
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-lg overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-5 w-5 text-indigo-400" />
            <DialogTitle className="text-lg font-bold">Client Report Builder</DialogTitle>
          </div>
          <DialogDescription className="text-slate-400 text-xs">
            Customize PDF branding, layout structures, and campaign notes before exporting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {/* Report Template Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Report Template Gallery</Label>
            <Select value={templateId} onValueChange={handleTemplateChange}>
              <SelectTrigger className="bg-[#020617] border-slate-700 h-9 text-xs text-white">
                <SelectValue placeholder="Select template..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-800 text-white text-xs">
                {REPORT_TEMPLATES.map((tmpl) => (
                  <SelectItem key={tmpl.id} value={tmpl.id} className="focus:bg-indigo-600 focus:text-white">
                    {tmpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Brand/Client Name */}
          <div className="space-y-1.5">
            <Label htmlFor="client-name" className="text-xs text-slate-300">Client / Organization Name</Label>
            <Input
              id="client-name"
              placeholder="e.g. Acme Casinos Ltd."
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              className="bg-[#020617] border-slate-700 h-9 text-sm text-white"
            />
          </div>

          {/* Color Customization */}
          <div className="space-y-2">
            <Label className="text-xs text-slate-300 flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" /> Color Palette Customizer
            </Label>
            <div className="flex flex-wrap gap-2 items-center">
              {BRAND_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => { setSelectedColor(color.value); setCustomColor(''); }}
                  style={{ backgroundColor: color.value }}
                  className={cn(
                    "h-7 w-7 rounded-full border border-white/10 flex items-center justify-center transition-all hover:scale-110 relative",
                    activeColor === color.value && "ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-900"
                  )}
                  title={color.label}
                >
                  {activeColor === color.value && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
              ))}
              <Input
                type="color"
                value={activeColor}
                onChange={e => setCustomColor(e.target.value)}
                className="h-8 w-12 bg-slate-950 border-slate-800 cursor-pointer p-0.5"
                title="Custom Hex Picker"
              />
            </div>
          </div>

          {/* Notes & Assumptions */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs text-slate-300">Campaign Notes & Planning Assumptions</Label>
            <Textarea
              id="notes"
              placeholder="e.g. CPA estimates are based on current regulatory guidelines in Sweden and baseline CTR projections from Spring campaigns."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="bg-[#020617] border-slate-700 h-20 text-xs leading-relaxed text-white resize-none"
            />
          </div>

          {/* Section Toggles */}
          <div className="space-y-2 border-t border-slate-800/80 pt-3">
            <Label className="text-xs font-semibold text-slate-400">Include Document Modules</Label>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-slate-950/40 hover:bg-slate-950 border border-slate-800/50">
                <input
                  type="checkbox"
                  checked={includeSummary}
                  onChange={e => setIncludeSummary(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                <span className="text-xs text-slate-300 font-medium">Executive Summary</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-slate-950/40 hover:bg-slate-950 border border-slate-800/50">
                <input
                  type="checkbox"
                  checked={includeChannels}
                  onChange={e => setIncludeChannels(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                <span className="text-xs text-slate-300 font-medium">Detailed Channels Table</span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-800/50 pt-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Generate PDF Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
