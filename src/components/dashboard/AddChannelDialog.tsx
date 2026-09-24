import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { CATEGORY_INFO, ChannelCategory } from '@/lib/mediaplan-data';
import { BuyingModel, getLikelyModel, inferChannelFamily } from '@/types/channel';
import { useToast } from '@/hooks/use-toast';

interface AddChannelDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddChannelDialog({ trigger, open, onOpenChange }: AddChannelDialogProps) {
  const { addChannel } = useProjectStore();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ChannelCategory>('Display/Programmatic');
  const [model, setModel] = useState<BuyingModel>('CPM');
  const [price, setPrice] = useState(5);

  const activeOpen = open !== undefined ? open : isOpen;
  const activeSetOpen = onOpenChange !== undefined ? onOpenChange : setIsOpen;

  useEffect(() => {
    setModel(getLikelyModel(category));
  }, [category]);

  const handleCreate = () => {
    if (!name.trim()) return;

    const family = inferChannelFamily(name);
    addChannel({
      name,
      category,
      family,
      buyingModel: model,
      typeConfig: {
        family,
        buyingModel: model,
        price,
        baselineMetrics: { ctr: 1.0, conversionRate: 2.5, aov: 100, saturationCeiling: 50000 }
      }
    });

    setName('');
    setPrice(5);
    activeSetOpen(false);

    toast({
      title: "Channel Added",
      description: `"${name}" has been added to your media plan.`,
    });
  };

  return (
    <Dialog open={activeOpen} onOpenChange={activeSetOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Channel</DialogTitle>
          <DialogDescription className="text-slate-400">
            Define acquisition channel characteristics to run calibrated outcomes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name" className="text-slate-300">Name</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Google Search (Non-Brand)"
              className="bg-[#020617] border-slate-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ChannelCategory)}>
              <SelectTrigger className="bg-[#020617] border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border-slate-800 text-white">
                {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key} className="focus:bg-indigo-600 focus:text-white">
                    {info.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="channel-price" className="text-slate-300">Baseline Price (CPM, CPC, or Cost)</Label>
            <Input
              id="channel-price"
              type="number"
              value={price}
              onChange={e => setPrice(parseFloat(e.target.value) || 0)}
              className="bg-[#020617] border-slate-700 text-white font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => activeSetOpen(false)}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Create Channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
