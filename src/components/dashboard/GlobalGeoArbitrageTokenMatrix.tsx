import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Globe2, Lock, Pencil, Search, Sparkles, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { useGeoMarketProfile, useMediaPlanStore } from '@/hooks/use-media-plan-store';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { GeoTierKey, TOP_IGAMING_GEOS, TIER_LABELS } from '@/lib/geo-market-data';

const TIER_ACCENTS: Record<GeoTierKey, string> = {
  tier1: 'from-sky-500/20 via-cyan-500/10 to-transparent border-sky-400/30',
  tier2: 'from-emerald-500/20 via-teal-500/10 to-transparent border-emerald-400/30',
  tier3: 'from-amber-500/20 via-orange-500/10 to-transparent border-amber-400/30',
};

const TIER_RAILS: Record<GeoTierKey, string> = {
  tier1: '[&_[role=slider]]:border-sky-400 [&_[role=slider]]:bg-sky-500',
  tier2: '[&_[role=slider]]:border-emerald-400 [&_[role=slider]]:bg-emerald-500',
  tier3: '[&_[role=slider]]:border-amber-400 [&_[role=slider]]:bg-amber-500',
};

export function GlobalGeoArbitrageTokenMatrix() {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || theme === 'contrast';
  const activeTiers = useMediaPlanStore((state) => state.activeTiers);
  const activeGeos = useMediaPlanStore((state) => state.activeGeos);
  const setTierAllocation = useMediaPlanStore((state) => state.setTierAllocation);
  const addActiveGeo = useMediaPlanStore((state) => state.addActiveGeo);
  const removeActiveGeo = useMediaPlanStore((state) => state.removeActiveGeo);
  const clearActiveGeos = useMediaPlanStore((state) => state.clearActiveGeos);
  const geoOverrides = useMediaPlanStore((state) => state.geoOverrides);
  const setGeoOverride = useMediaPlanStore((state) => state.setGeoOverride);
  const clearGeoOverride = useMediaPlanStore((state) => state.clearGeoOverride);
  const userStatus = useMediaPlanStore((state) => state.userStatus);
  const geoProfile = useGeoMarketProfile();

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isPremiumMarketModalOpen, setIsPremiumMarketModalOpen] = useState(false);
  const [blockedGeoName, setBlockedGeoName] = useState<string | null>(null);
  const [editingGeoName, setEditingGeoName] = useState<string | null>(null);
  const [draftCpa, setDraftCpa] = useState('');
  const [draftLtv, setDraftLtv] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const availableGeos = useMemo(
    () => TOP_IGAMING_GEOS.filter((geo) => !activeGeos.includes(geo.name)),
    [activeGeos]
  );

  const filteredGeos = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return availableGeos.slice(0, 8);
    }

    return availableGeos
      .filter(
        (geo) =>
          geo.name.toLowerCase().includes(normalized) ||
          geo.code.toLowerCase().includes(normalized) ||
          TIER_LABELS[geo.tier].toLowerCase().includes(normalized)
      )
      .slice(0, 8);
  }, [availableGeos, query]);

  const selectedGeoProfiles = useMemo(
    () => TOP_IGAMING_GEOS.filter((geo) => activeGeos.includes(geo.name)),
    [activeGeos]
  );

  const isDemo = userStatus === 'demo';

  const handleAddGeo = (geoName: string) => {
    const geo = TOP_IGAMING_GEOS.find((entry) => entry.name === geoName);
    if (isDemo && geo && (geo.tier === 'tier1' || geo.tier === 'tier2')) {
      setBlockedGeoName(geo.name);
      setIsPremiumMarketModalOpen(true);
      setIsOpen(false);
      return;
    }

    addActiveGeo(geoName);
    setQuery('');
    setIsOpen(false);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && filteredGeos.length > 0) {
      event.preventDefault();
      handleAddGeo(filteredGeos[0].name);
    }
  };

  const geoOverrideActive = activeGeos.length > 0;

  const getEffectiveGeoValues = (geoName: string) => {
    const geo = TOP_IGAMING_GEOS.find((entry) => entry.name === geoName);
    if (!geo) return { cpa: 0, ltv: 0 };

    const override = geoOverrides[geoName];
    return {
      cpa: override?.cpa ?? geo.baselineCpa,
      ltv: override?.ltv ?? geo.baselineLtv,
    };
  };

  const openGeoEditor = (geoName: string) => {
    const geo = TOP_IGAMING_GEOS.find((entry) => entry.name === geoName);
    if (!geo) return;

    const override = geoOverrides[geoName];
    setDraftCpa(String(override?.cpa ?? geo.baselineCpa));
    setDraftLtv(String(override?.ltv ?? geo.baselineLtv));
    setEditingGeoName(geoName);
  };

  const saveGeoOverride = (geoName: string) => {
    const nextCpa = Number(draftCpa);
    const nextLtv = Number(draftLtv);
    if (!Number.isFinite(nextCpa) || nextCpa <= 0 || !Number.isFinite(nextLtv) || nextLtv <= 0) {
      return;
    }

    setGeoOverride(geoName, {
      cpa: nextCpa,
      ltv: nextLtv,
    });
    setEditingGeoName(null);
  };

  return (
    <section
      className={cn(
        'relative overflow-visible rounded-[28px] border p-6 shadow-[0_24px_80px_rgba(15,23,42,0.16)] transition-colors duration-300',
        isDark
          ? 'border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_28%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(2,6,23,0.94))]'
          : 'border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_28%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(241,245,249,0.98))]'
      )}
    >
      <Dialog open={isPremiumMarketModalOpen} onOpenChange={setIsPremiumMarketModalOpen}>
        <DialogContent className="max-w-md border-slate-700 bg-[linear-gradient(160deg,_#020617,_#0f172a_55%,_#111827)] text-slate-100">
          <DialogHeader className="text-left">
            <DialogTitle className="text-xl font-black tracking-tight text-white">
              Premium Market Access Required
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              {blockedGeoName ?? 'This market'} is part of the premium acquisition universe. Tier 1
              and Tier 2 geos are reserved for Pro Acquisition operators.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-4 text-sm text-slate-200">
            Upgrade to unlock premium market access, advanced CPA compression, and high-value geo
            token routing.
          </div>
          <Button
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700"
            onClick={() => (window.location.href = '/settings')}
          >
            Upgrade to Pro Acquisition
          </Button>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-2xl border',
                isDark ? 'border-sky-400/20 bg-sky-400/10' : 'border-sky-500/20 bg-sky-500/10'
              )}
            >
              <Globe2 className={cn('h-5 w-5', isDark ? 'text-sky-300' : 'text-sky-700')} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-500">
                Global Geo-Arbitrage & Token Matrix
              </p>
              <h2
                className={cn(
                  'text-2xl font-black tracking-tight',
                  isDark ? 'text-slate-50' : 'text-slate-900'
                )}
              >
                Master the CPA-LTV mix before budget hits channels
              </h2>
            </div>
          </div>

          <p
            className={cn(
              'max-w-3xl text-sm leading-6',
              isDark ? 'text-slate-300' : 'text-slate-600'
            )}
          >
            Tier sliders create the blended market baseline. Adding explicit geo tokens overrides
            that blend and pushes country-level CPA and player value through the allocation engine.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:min-w-[420px]">
          <StatChip
            isDark={isDark}
            label="Mode"
            value={geoOverrideActive ? 'Geo Override' : 'Tier Blend'}
          />
          <StatChip
            isDark={isDark}
            label="Blended CPA"
            value={`$${geoProfile.blendedCpa.toFixed(0)}`}
          />
          <StatChip
            isDark={isDark}
            label="Blended LTV"
            value={`$${geoProfile.blendedLtv.toFixed(0)}`}
          />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div
          className={cn(
            'rounded-[24px] border p-5 transition-opacity duration-300',
            isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-white/80',
            geoOverrideActive && 'opacity-60'
          )}
        >
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p
                className={cn(
                  'text-sm font-semibold',
                  isDark ? 'text-slate-100' : 'text-slate-900'
                )}
              >
                Tier Weighting Matrix
              </p>
              <p className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
                Sliders remain mutually exclusive and always sum to 100%.
              </p>
            </div>
            {geoOverrideActive ? (
              <Badge
                variant="outline"
                className={cn(
                  'border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
                  isDark ? 'text-amber-200' : 'text-amber-700'
                )}
              >
                Tokens supersede sliders
              </Badge>
            ) : null}
          </div>

          <div className="space-y-4">
            {(Object.keys(activeTiers) as GeoTierKey[]).map((tierKey) => (
              <div
                key={tierKey}
                className={cn(
                  'rounded-2xl border bg-gradient-to-br p-4',
                  isDark ? 'bg-slate-900/70' : 'bg-slate-50/90',
                  TIER_ACCENTS[tierKey]
                )}
              >
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        isDark ? 'text-slate-100' : 'text-slate-900'
                      )}
                    >
                      {TIER_LABELS[tierKey]}
                    </p>
                    <p className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
                      {tierKey === 'tier1'
                        ? 'Higher CPAs, stronger value density'
                        : tierKey === 'tier2'
                          ? 'Balanced volume and unit economics'
                          : 'Lower acquisition cost, thinner LTV'}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'min-w-[64px] justify-center border-white/10 bg-white/10 px-3 py-1 font-mono text-sm',
                      isDark ? 'text-slate-100' : 'text-slate-800'
                    )}
                  >
                    {activeTiers[tierKey].toFixed(0)}%
                  </Badge>
                </div>

                <Slider
                  value={[activeTiers[tierKey]]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(value) => setTierAllocation(tierKey, value[0] ?? 0)}
                  disabled={geoOverrideActive}
                  className={cn(
                    'w-full [&_[data-orientation=horizontal]]:bg-white/20',
                    TIER_RAILS[tierKey],
                    geoOverrideActive && 'pointer-events-none'
                  )}
                />
              </div>
            ))}
          </div>
        </div>

        <div
          ref={rootRef}
          className={cn(
            'relative rounded-[24px] border p-5',
            isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white/90'
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p
                className={cn(
                  'text-sm font-semibold',
                  isDark ? 'text-slate-100' : 'text-slate-900'
                )}
              >
                Omni-Search Geo Tokens
              </p>
              <p className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
                Search by country, code, or tier. Selected markets override the tier blend.
              </p>
            </div>
            {activeGeos.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearActiveGeos}
                className="h-8 px-3 text-xs"
              >
                Clear All
              </Button>
            ) : null}
          </div>

          <div className="relative mt-5">
            <Search
              className={cn(
                'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
                isDark ? 'text-slate-500' : 'text-slate-400'
              )}
            />
            <Input
              value={query}
              onFocus={() => setIsOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Try Germany, BR, Tier 2..."
              className={cn(
                'pl-10 pr-4',
                isDark
                  ? 'border-slate-700 bg-slate-900/80 text-slate-100 placeholder:text-slate-500'
                  : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
              )}
            />

            {isOpen ? (
              <div
                className={cn(
                  'absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border p-2 shadow-2xl',
                  isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-white'
                )}
              >
                {filteredGeos.length > 0 ? (
                  filteredGeos.map((geo) => (
                    <button
                      key={geo.name}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleAddGeo(geo.name)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors',
                        isDark ? 'hover:bg-slate-900' : 'hover:bg-slate-50'
                      )}
                    >
                      <div>
                        <p
                          className={cn(
                            'text-sm font-semibold',
                            isDark ? 'text-slate-100' : 'text-slate-900'
                          )}
                        >
                          {geo.name}
                        </p>
                        <p className={cn('text-xs', isDark ? 'text-slate-400' : 'text-slate-500')}>
                          {geo.code} • {TIER_LABELS[geo.tier]}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={cn(
                            'text-xs font-semibold',
                            isDark ? 'text-slate-200' : 'text-slate-700'
                          )}
                        >
                          CPA ${geo.baselineCpa}
                        </p>
                        <p
                          className={cn(
                            'text-[11px]',
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          )}
                        >
                          LTV ${geo.baselineLtv}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div
                    className={cn(
                      'px-3 py-6 text-center text-sm',
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    )}
                  >
                    No matching markets left to add.
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {selectedGeoProfiles.length > 0 ? (
              selectedGeoProfiles.map((geo) => {
                const effective = getEffectiveGeoValues(geo.name);

                return (
                  <Badge
                    key={geo.name}
                    variant="outline"
                    className={cn(
                      'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
                      isDark
                        ? 'border-slate-700 bg-slate-900 text-slate-100'
                        : 'border-slate-200 bg-slate-50 text-slate-800'
                    )}
                  >
                    <span>{geo.name}</span>
                    <span
                      className={cn(
                        'font-mono text-[11px]',
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      )}
                    >
                      {geo.code}
                    </span>
                    <span
                      className={cn(
                        'rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                        isDark
                          ? 'border-slate-600 bg-slate-950/70 text-slate-300'
                          : 'border-slate-300 bg-white text-slate-600'
                      )}
                    >
                      CPA ${effective.cpa} · LTV ${effective.ltv}
                    </span>
                    {geoOverrides[geo.name] ? (
                      <span
                        className={cn(
                          'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
                          isDark
                            ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                            : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700'
                        )}
                      >
                        Custom
                      </span>
                    ) : null}
                    <Popover
                      open={editingGeoName === geo.name}
                      onOpenChange={(open) => {
                        if (open) {
                          openGeoEditor(geo.name);
                          return;
                        }
                        setEditingGeoName(null);
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'rounded-full p-0.5 transition-colors',
                            isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'
                          )}
                          aria-label={`Edit ${geo.name} baseline CPA and LTV`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className={cn(
                          'w-72 rounded-xl border p-3',
                          isDark
                            ? 'border-slate-700 bg-slate-950 text-slate-100'
                            : 'border-slate-200 bg-white text-slate-900'
                        )}
                      >
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold">{geo.name} Override</p>
                            <p
                              className={cn(
                                'text-[11px]',
                                isDark ? 'text-slate-400' : 'text-slate-500'
                              )}
                            >
                              Override CPA and LTV inputs used for blended market assumptions.
                            </p>
                          </div>
                          <label className="block text-xs">
                            CPA
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              value={draftCpa}
                              onChange={(event) => setDraftCpa(event.target.value)}
                              className={cn(
                                'mt-1 h-8',
                                isDark
                                  ? 'border-slate-700 bg-slate-900 text-slate-100'
                                  : 'border-slate-300 bg-white text-slate-900'
                              )}
                            />
                          </label>
                          <label className="block text-xs">
                            LTV
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              value={draftLtv}
                              onChange={(event) => setDraftLtv(event.target.value)}
                              className={cn(
                                'mt-1 h-8',
                                isDark
                                  ? 'border-slate-700 bg-slate-900 text-slate-100'
                                  : 'border-slate-300 bg-white text-slate-900'
                              )}
                            />
                          </label>
                          <div className="flex items-center justify-between gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() => {
                                clearGeoOverride(geo.name);
                                setEditingGeoName(null);
                              }}
                            >
                              Reset
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 px-3 text-xs"
                              onClick={() => saveGeoOverride(geo.name)}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <button
                      type="button"
                      onClick={() => removeActiveGeo(geo.name)}
                      className={cn(
                        'rounded-full p-0.5 transition-colors',
                        isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'
                      )}
                      aria-label={`Remove ${geo.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                );
              })
            ) : (
              <div
                className={cn(
                  'flex w-full items-center gap-2 rounded-2xl border border-dashed px-4 py-4 text-sm',
                  isDark ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'
                )}
              >
                <Sparkles className="h-4 w-4" />
                Add one or more countries to move from blended assumptions to exact market
                overrides.
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MiniMetric
              isDark={isDark}
              label="Selected Markets"
              value={String(activeGeos.length)}
            />
            <MiniMetric
              isDark={isDark}
              label="Override Priority"
              value={geoOverrideActive ? 'Specific Geos' : 'Tier Blend'}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function StatChip({ isDark, label, value }: { isDark: boolean; label: string; value: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3',
        isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white/80'
      )}
    >
      <p
        className={cn(
          'text-[11px] uppercase tracking-[0.18em]',
          isDark ? 'text-slate-400' : 'text-slate-500'
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'mt-2 text-lg font-black tracking-tight',
          isDark ? 'text-slate-50' : 'text-slate-900'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MiniMetric({ isDark, label, value }: { isDark: boolean; label: string; value: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3',
        isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50'
      )}
    >
      <p
        className={cn(
          'text-[11px] uppercase tracking-[0.18em]',
          isDark ? 'text-slate-400' : 'text-slate-500'
        )}
      >
        {label}
      </p>
      <p className={cn('mt-2 text-sm font-semibold', isDark ? 'text-slate-100' : 'text-slate-900')}>
        {value}
      </p>
    </div>
  );
}
