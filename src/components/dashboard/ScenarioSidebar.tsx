import React from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { Button } from '../../components/ui/button';
import { Zap, TrendingUp, Users } from 'lucide-react';
import { ChannelData, ChannelCategory } from '@/hooks/use-media-plan-store';
import { inferChannelFamily, inferBuyingModel, BuyingModel } from '@/types/channel';

export const ScenarioSidebar: React.FC = () => {
  const { setChannels } = useProjectStore();

  const applyPreset = (type: 'AFFILIATE' | 'GROWTH' | 'BALANCED') => {
    let rawChannels: any[] = [];

    // User defined preset data (Flat structure)
    if (type === 'AFFILIATE') {
      rawChannels = [
        { id: '1', name: 'Affiliate - Top Tier', category: 'Affiliate', buyingModel: 'CPA', price: 45, allocation: 60, baselineMetrics: { conversionRate: 5 } },
        { id: '2', name: 'Paid Search - Brand', category: 'Paid Search', buyingModel: 'CPC', price: 2.50, allocation: 20, baselineMetrics: { conversionRate: 3 } },
        { id: '3', name: 'Retargeting', category: 'Display/Programmatic', buyingModel: 'CPM', price: 8, allocation: 20, baselineMetrics: { ctr: 0.8 } }, // Fixed category 'Paid Media' -> 'Display/Programmatic' to match types
      ];
    } else if (type === 'GROWTH') {
      rawChannels = [
        { id: '1', name: 'Facebook Prospecting', category: 'Paid Social', buyingModel: 'CPM', price: 12, allocation: 50, baselineMetrics: { ctr: 1.2 } }, // Fixed category
        { id: '2', name: 'TikTok Ads', category: 'Paid Social', buyingModel: 'CPM', price: 8, allocation: 30, baselineMetrics: { ctr: 1.5 } }, // Fixed category
        { id: '3', name: 'Paid Search', category: 'Paid Search', buyingModel: 'CPC', price: 3, allocation: 20, baselineMetrics: { conversionRate: 2.5 } },
      ];
    }
    // Add 'BALANCED' logic here (kept empty as per user snippet)

    if (rawChannels.length === 0) return;

    // Adapt to strict ChannelData structure
    const newChannels: ChannelData[] = rawChannels.map(raw => {
      const family = inferChannelFamily(raw.name);
      return {
        id: raw.id,
        name: raw.name,
        category: raw.category as ChannelCategory,
        allocationPct: raw.allocation,
        family: family,
        buyingModel: raw.buyingModel as BuyingModel,
        typeConfig: {
          family: family,
          buyingModel: raw.buyingModel as BuyingModel,
          price: raw.price,
          secondaryPrice: 0,
          baselineMetrics: {
            ctr: 1.0,
            conversionRate: 2.5,
            aov: 150,
            trafficPerUnit: 1000,
            ...raw.baselineMetrics
          }
        },
        locked: false
      };
    });

    setChannels(newChannels);
  };

  return (
    <div className="space-y-6">
      {/* PRESETS CARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" /> Quick Presets
        </h3>
        <div className="space-y-3">
          <Button variant="outline" className="w-full justify-start text-left" onClick={() => applyPreset('AFFILIATE')}>
            <Users className="w-4 h-4 mr-2 text-blue-400" /> Affiliate Dominant
          </Button>
          <Button variant="outline" className="w-full justify-start text-left" onClick={() => applyPreset('GROWTH')}>
            <TrendingUp className="w-4 h-4 mr-2 text-green-400" /> High Growth (Paid Media)
          </Button>
        </div>
      </div>

      {/* Placeholder for Scenario Comparison */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 min-h-[200px] flex items-center justify-center text-slate-500 text-sm">
        Scenario History (Coming Soon)
      </div>
    </div>
  );
};
