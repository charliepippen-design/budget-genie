import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCurrency } from '@/contexts/CurrencyContext';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Coins, Users, Percent, Award, 
  AlertTriangle, Info, CheckCircle, Activity, Layers, ArrowRight, Sparkles 
} from 'lucide-react';
import { ListingPackagesEvaluator } from './ListingPackagesEvaluator';
import { calculateLifetimeGgrWithChurn } from '@/lib/plan-math';

interface Preset {
  name: string;
  description: string;
  clicks: number;
  clickToReg: number;
  regToFtd: number;
  avgDeposit: number;
  monthlyGgrPerPlayer: number;
  churnRate: number;
  bonusPct: number;
  adminFeePct: number;
  payFeePct: number;
  taxPct: number;
  cpaAmount: number;
  revSharePct: number;
  tenancyFee: number;
  bonusCapPct: number;
  cplAmount: number;
  isCpaCapped: boolean;
  cpaCapLimit: number;
  kpiGuarantee: number;
  shortfallRefundPct: number;
}

const PRESETS: Record<string, Preset> = {
  latamCasino: {
    name: "LatAm Volume (Casino)",
    description: "High click volume, moderate conversion rates, lower average deposit sizes but highly active players with high bonus dependency and minimal gaming tax.",
    clicks: 30000,
    clickToReg: 8,
    regToFtd: 12,
    avgDeposit: 25,
    monthlyGgrPerPlayer: 35,
    churnRate: 22,
    bonusPct: 45,
    adminFeePct: 15,
    payFeePct: 6,
    taxPct: 3,
    cpaAmount: 40,
    revSharePct: 35,
    tenancyFee: 0,
    bonusCapPct: 100,
    cplAmount: 0,
    isCpaCapped: false,
    cpaCapLimit: 20,
    kpiGuarantee: 0,
    shortfallRefundPct: 50,
  },
  regulatedEuSportsbook: {
    name: "Regulated EU Sportsbook",
    description: "Moderate clicks, high conversion rates, sports betting GGR per player with heavy taxation (e.g. UK/Germany) and high compliance cost.",
    clicks: 15000,
    clickToReg: 5,
    regToFtd: 25,
    avgDeposit: 60,
    monthlyGgrPerPlayer: 70,
    churnRate: 15,
    bonusPct: 25,
    adminFeePct: 18,
    payFeePct: 3,
    taxPct: 19,
    cpaAmount: 180,
    revSharePct: 30,
    tenancyFee: 1500,
    bonusCapPct: 30,
    cplAmount: 0,
    isCpaCapped: false,
    cpaCapLimit: 20,
    kpiGuarantee: 0,
    shortfallRefundPct: 50,
  },
  highRollerVip: {
    name: "High-Roller Casino VIP",
    description: "Extremely low traffic volume but exceptionally qualified players who deposit massive amounts, generate very high GGR, and stay retained longer.",
    clicks: 2000,
    clickToReg: 2,
    regToFtd: 35,
    avgDeposit: 500,
    monthlyGgrPerPlayer: 750,
    churnRate: 8,
    bonusPct: 15,
    adminFeePct: 10,
    payFeePct: 2,
    taxPct: 5,
    cpaAmount: 450,
    revSharePct: 45,
    tenancyFee: 5000,
    bonusCapPct: 100,
    cplAmount: 0,
    isCpaCapped: false,
    cpaCapLimit: 20,
    kpiGuarantee: 0,
    shortfallRefundPct: 50,
  },
  standardHybrid: {
    name: "Standard Hybrid Deal",
    description: "A balanced benchmark deal model with healthy organic user behavior and balanced hybrid payout split.",
    clicks: 10000,
    clickToReg: 6,
    regToFtd: 15,
    avgDeposit: 45,
    monthlyGgrPerPlayer: 55,
    churnRate: 18,
    bonusPct: 30,
    adminFeePct: 15,
    payFeePct: 4,
    taxPct: 10,
    cpaAmount: 100,
    revSharePct: 25,
    tenancyFee: 0,
    bonusCapPct: 100,
    cplAmount: 0,
    isCpaCapped: false,
    cpaCapLimit: 20,
    kpiGuarantee: 0,
    shortfallRefundPct: 50,
  }
};

export const AffiliateDealEvaluator: React.FC = () => {
  const { format: formatCurrency } = useCurrency();
  const [viewMode, setViewMode] = useState<'contract' | 'packages'>('contract');
  const [activeTab, setActiveTab] = useState<'traffic' | 'deductions' | 'deal'>('traffic');
  const [selectedPreset, setSelectedPreset] = useState<string>('standardHybrid');

  // Interactive Sliders State (Defaults loaded from Standard Hybrid Preset)
  const [clicks, setClicks] = useState<number>(10000);
  const [clickToReg, setClickToReg] = useState<number>(6); // %
  const [regToFtd, setRegToFtd] = useState<number>(15); // %
  const [avgDeposit, setAvgDeposit] = useState<number>(45);
  const [monthlyGgrPerPlayer, setMonthlyGgrPerPlayer] = useState<number>(55);
  const [churnRate, setChurnRate] = useState<number>(18); // %
  
  // Deductions State
  const [bonusPct, setBonusPct] = useState<number>(30); // % of GGR
  const [adminFeePct, setAdminFeePct] = useState<number>(15); // % of GGR
  const [payFeePct, setPayFeePct] = useState<number>(4); // % of GGR
  const [taxPct, setTaxPct] = useState<number>(10); // % of GGR
  const [bonusCapPct, setBonusCapPct] = useState<number>(100); // % of GGR (Bonus Cap)

  // Deal Setup State
  const [cpaAmount, setCpaAmount] = useState<number>(100);
  const [revSharePct, setRevSharePct] = useState<number>(25);
  const [tenancyFee, setTenancyFee] = useState<number>(0);
  const [isTieredRevShare, setIsTieredRevShare] = useState<boolean>(false);

  // Advanced Contract Conditions State
  const [cplAmount, setCplAmount] = useState<number>(0);
  const [isCpaCapped, setIsCpaCapped] = useState<boolean>(false);
  const [cpaCapLimit, setCpaCapLimit] = useState<number>(20);
  const [kpiGuarantee, setKpiGuarantee] = useState<number>(0);
  const [shortfallRefundPct, setShortfallRefundPct] = useState<number>(50);

  // Graph Overlays visibility state
  const [showCustomAffiliate, setShowCustomAffiliate] = useState<boolean>(true);
  const [showCustomOperator, setShowCustomOperator] = useState<boolean>(true);
  const [showCpaAffiliate, setShowCpaAffiliate] = useState<boolean>(false);
  const [showRsAffiliate, setShowRsAffiliate] = useState<boolean>(false);
  const [showHybridAffiliate, setShowHybridAffiliate] = useState<boolean>(false);
  const [showTenancyAffiliate, setShowTenancyAffiliate] = useState<boolean>(false);

  // Apply Preset
  const handleApplyPreset = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const p = PRESETS[presetKey];
    if (p) {
      setClicks(p.clicks);
      setClickToReg(p.clickToReg);
      setRegToFtd(p.regToFtd);
      setAvgDeposit(p.avgDeposit);
      setMonthlyGgrPerPlayer(p.monthlyGgrPerPlayer);
      setChurnRate(p.churnRate);
      setBonusPct(p.bonusPct);
      setAdminFeePct(p.adminFeePct);
      setPayFeePct(p.payFeePct);
      setTaxPct(p.taxPct);
      setBonusCapPct(p.bonusCapPct ?? 100);
      setCpaAmount(p.cpaAmount);
      setRevSharePct(p.revSharePct);
      setTenancyFee(p.tenancyFee);
      setIsTieredRevShare(false); // Reset to flat when switching presets
      setCplAmount(p.cplAmount ?? 0);
      setIsCpaCapped(p.isCpaCapped ?? false);
      setCpaCapLimit(p.cpaCapLimit ?? 20);
      setKpiGuarantee(p.kpiGuarantee ?? 0);
      setShortfallRefundPct(p.shortfallRefundPct ?? 50);
    }
  };

  // CORE IGAMING MATHEMATICAL CALCULATIONS
  const ftdsPerMonth = useMemo(() => {
    return Math.round(clicks * (clickToReg / 100) * (regToFtd / 100));
  }, [clicks, clickToReg, regToFtd]);

  // Player retention: Lifespan in months is 1 / Churn, capped at 24 months for planning realism
  const avgLifespanMonths = useMemo(() => {
    if (churnRate <= 0) return 24;
    return Math.min(24, Math.round(100 / churnRate));
  }, [churnRate]);

  // Effective Bonus % (Capped)
  const effectiveBonusPct = useMemo(() => {
    return Math.min(bonusPct, bonusCapPct);
  }, [bonusPct, bonusCapPct]);

  // Margin Leakage %
  const marginLeakagePct = useMemo(() => {
    return effectiveBonusPct + adminFeePct + payFeePct + taxPct;
  }, [effectiveBonusPct, adminFeePct, payFeePct, taxPct]);

  // Net Gaming Revenue (NGR) per player over their lifetime (churn-decayed)
  const lifetimeGgrPerPlayer = useMemo(() => {
    return calculateLifetimeGgrWithChurn(monthlyGgrPerPlayer, churnRate, avgLifespanMonths);
  }, [monthlyGgrPerPlayer, churnRate, avgLifespanMonths]);

  const lifetimeNgrPerPlayer = useMemo(() => {
    const leakageFactor = (100 - marginLeakagePct) / 100;
    return lifetimeGgrPerPlayer * leakageFactor;
  }, [lifetimeGgrPerPlayer, marginLeakagePct]);

  // Cohort Dynamic Calculations over 12 Months
  // In a recurring model: We acquire 'ftdsPerMonth' new players EVERY MONTH.
  // We track the cumulative GGR, NGR, and Deal Costs.
  const cohortProjections = useMemo(() => {
    let cumulativeFTDs = 0;
    let activePlayerPool: { monthAcquired: number; count: number }[] = [];
    const monthlyData = [];

    let totalGGR = 0;
    let totalNGR = 0;

    // For deal comparisons
    let customAffiliateCumulative = 0;
    let customOperatorCumulative = 0;

    let cpaAffiliateCumulative = 0;
    let cpaOperatorCumulative = 0;

    let rsAffiliateCumulative = 0;
    let rsOperatorCumulative = 0;

    let hybridAffiliateCumulative = 0;
    let hybridOperatorCumulative = 0;

    let tenancyAffiliateCumulative = 0;
    let tenancyOperatorCumulative = 0;

    // Accumulators for Custom Deal breakout details
    let totalCplPaid = 0;
    let totalCpaPaid = 0;
    let totalTenancyPaid = 0;
    let totalRefundReclaimed = 0;
    let totalRsPaid = 0;

    // Standard Benchmarks for comparison
    const benchmarkCPARate = cpaAmount > 0 ? cpaAmount : 150;
    const benchmarkRSRate = revSharePct > 0 ? revSharePct : 35;
    
    // Tiered RevShare Logic based on monthly FTD count
    const getTieredRevShareRate = (ftdCount: number) => {
      if (ftdCount <= 10) return 25;
      if (ftdCount <= 30) return 30;
      if (ftdCount <= 50) return 35;
      return 40;
    };

    const currentRevShareRate = isTieredRevShare ? getTieredRevShareRate(ftdsPerMonth) : revSharePct;
    const registrationsPerMonth = Math.round(clicks * (clickToReg / 100));

    for (let month = 1; month <= 12; month++) {
      // 1. Acquire new FTDs
      cumulativeFTDs += ftdsPerMonth;
      activePlayerPool.push({ monthAcquired: month, count: ftdsPerMonth });

      // 2. Calculate active players and decay previous ones
      let totalActiveThisMonth = 0;
      activePlayerPool = activePlayerPool.map(cohort => {
        const monthsActive = month - cohort.monthAcquired + 1;
        // Apply churn decay: count = FTDs * (1 - churnRate%)^(monthsActive - 1)
        const activeCount = cohort.count * Math.pow(1 - (churnRate / 100), monthsActive - 1);
        totalActiveThisMonth += activeCount;
        return { ...cohort, currentActive: activeCount };
      }).filter(c => c.currentActive > 0.1); // drop negligible cohorts

      // 3. Financial calculations for this month
      const monthlyGGR = totalActiveThisMonth * monthlyGgrPerPlayer;
      const monthlyNGR = monthlyGGR * ((100 - marginLeakagePct) / 100);

      totalGGR += monthlyGGR;
      totalNGR += monthlyNGR;

      // 4. Calculate Payouts for CUSTOM DEAL
      // a. CPL Cost
      const monthlyCplCost = registrationsPerMonth * cplAmount;
      // b. Capped CPA Cost
      const cappedFtds = isCpaCapped ? Math.min(ftdsPerMonth, cpaCapLimit) : ftdsPerMonth;
      const monthlyCpaCost = cappedFtds * cpaAmount;
      // c. Tenancy KPI Shortfall Refund
      const shortfall = Math.max(0, kpiGuarantee - ftdsPerMonth);
      const monthlyRefund = kpiGuarantee > 0 ? (tenancyFee * (shortfall / kpiGuarantee) * (shortfallRefundPct / 100)) : 0;
      // d. RevShare Cost
      const customRsPayout = monthlyNGR * (currentRevShareRate / 100);

      // Sum of payouts this month
      const customMonthlyPayout = monthlyCplCost + monthlyCpaCost + tenancyFee - monthlyRefund + customRsPayout;

      // Accumulate breakouts
      totalCplPaid += monthlyCplCost;
      totalCpaPaid += monthlyCpaCost;
      totalTenancyPaid += tenancyFee;
      totalRefundReclaimed += monthlyRefund;
      totalRsPaid += customRsPayout;

      customAffiliateCumulative += customMonthlyPayout;
      customOperatorCumulative += (monthlyNGR - customMonthlyPayout);

      // 5. Calculate Payouts for Benchmarks
      // Pure CPA Deal (Benchmark CPA amount per FTD, no RS, no tenancy)
      const cpaPayout = ftdsPerMonth * benchmarkCPARate;
      cpaAffiliateCumulative += cpaPayout;
      cpaOperatorCumulative += (monthlyNGR - cpaPayout);

      // Pure RevShare Deal (Benchmark RS % of NGR, no CPA, no tenancy)
      const rsPayout = monthlyNGR * (benchmarkRSRate / 100);
      rsAffiliateCumulative += rsPayout;
      rsOperatorCumulative += (monthlyNGR - rsPayout);

      // Hybrid Deal ($80 CPA + 20% RevShare, no tenancy)
      const hybridPayout = (ftdsPerMonth * 80) + (monthlyNGR * 0.20);
      hybridAffiliateCumulative += hybridPayout;
      hybridOperatorCumulative += (monthlyNGR - hybridPayout);

      // Tenancy Deal ($3000 monthly tenancy fee only, no CPA, no RS)
      const tenancyPayout = 3000;
      tenancyAffiliateCumulative += tenancyPayout;
      tenancyOperatorCumulative += (monthlyNGR - tenancyPayout);

      monthlyData.push({
        month: `Month ${month}`,
        activePlayers: Math.round(totalActiveThisMonth),
        ggr: Math.round(monthlyGGR),
        ngr: Math.round(monthlyNGR),
        // Custom Deal Accumulations
        affiliateEarnings: Math.round(customAffiliateCumulative),
        operatorProfit: Math.round(customOperatorCumulative),
        // Benchmarks for Comparison
        cpaAffiliate: Math.round(cpaAffiliateCumulative),
        rsAffiliate: Math.round(rsAffiliateCumulative),
        hybridAffiliate: Math.round(hybridAffiliateCumulative),
        tenancyAffiliate: Math.round(tenancyAffiliateCumulative),
      });
    }

    return {
      monthlyData,
      totalGGR,
      totalNGR,
      customDeal: {
        affiliateEarnings: customAffiliateCumulative,
        operatorProfit: customOperatorCumulative,
        effectiveCpa: ftdsPerMonth > 0 ? (customAffiliateCumulative / (ftdsPerMonth * 12)) : 0,
        effectiveRevShare: totalNGR > 0 ? (customAffiliateCumulative / totalNGR) * 100 : 0,
        operatorRoi: customAffiliateCumulative > 0 ? (customOperatorCumulative / customAffiliateCumulative) * 100 : 0,
        totalCplPaid,
        totalCpaPaid,
        totalTenancyPaid,
        totalRefundReclaimed,
        totalRsPaid
      },
      cpaDeal: {
        affiliateEarnings: cpaAffiliateCumulative,
        operatorProfit: cpaOperatorCumulative,
        effectiveCpa: benchmarkCPARate,
        effectiveRevShare: totalNGR > 0 ? (cpaAffiliateCumulative / totalNGR) * 100 : 0,
        operatorRoi: cpaAffiliateCumulative > 0 ? (cpaOperatorCumulative / cpaAffiliateCumulative) * 100 : 0
      },
      rsDeal: {
        affiliateEarnings: rsAffiliateCumulative,
        operatorProfit: rsOperatorCumulative,
        effectiveCpa: ftdsPerMonth > 0 ? (rsAffiliateCumulative / (ftdsPerMonth * 12)) : 0,
        effectiveRevShare: benchmarkRSRate,
        operatorRoi: rsAffiliateCumulative > 0 ? (rsOperatorCumulative / rsAffiliateCumulative) * 100 : 0
      },
      hybridDeal: {
        affiliateEarnings: hybridAffiliateCumulative,
        operatorProfit: hybridOperatorCumulative,
        effectiveCpa: ftdsPerMonth > 0 ? (hybridAffiliateCumulative / (ftdsPerMonth * 12)) : 0,
        effectiveRevShare: totalNGR > 0 ? (hybridAffiliateCumulative / totalNGR) * 100 : 0,
        operatorRoi: hybridAffiliateCumulative > 0 ? (hybridOperatorCumulative / hybridAffiliateCumulative) * 100 : 0
      },
      tenancyDeal: {
        affiliateEarnings: tenancyAffiliateCumulative,
        operatorProfit: tenancyOperatorCumulative,
        effectiveCpa: ftdsPerMonth > 0 ? (tenancyAffiliateCumulative / (ftdsPerMonth * 12)) : 0,
        effectiveRevShare: totalNGR > 0 ? (tenancyAffiliateCumulative / totalNGR) * 100 : 0,
        operatorRoi: tenancyAffiliateCumulative > 0 ? (tenancyOperatorCumulative / tenancyAffiliateCumulative) * 100 : 0
      }
    };
  }, [ftdsPerMonth, clicks, clickToReg, monthlyGgrPerPlayer, marginLeakagePct, churnRate, cpaAmount, revSharePct, tenancyFee, isTieredRevShare, cplAmount, isCpaCapped, cpaCapLimit, kpiGuarantee, shortfallRefundPct]);

  // Find the first month where the cumulative operator net profit becomes positive (Break-even month)
  const breakEvenMonth = useMemo(() => {
    const data = cohortProjections.monthlyData;
    for (let i = 0; i < data.length; i++) {
      if (data[i].operatorProfit > 0) {
        return i + 1; // Month is 1-indexed
      }
    }
    return null;
  }, [cohortProjections]);

  // Deductions Waterfall Data for waterfall chart
  const deductionsChartData = useMemo(() => {
    const totalGgr12m = cohortProjections.totalGGR;
    const bonusVal = totalGgr12m * (effectiveBonusPct / 100);
    const adminVal = totalGgr12m * (adminFeePct / 100);
    const payVal = totalGgr12m * (payFeePct / 100);
    const taxVal = totalGgr12m * (taxPct / 100);
    const ngrVal = cohortProjections.totalNGR;
    const customAffiliateVal = cohortProjections.customDeal.affiliateEarnings;
    const customOperatorVal = cohortProjections.customDeal.operatorProfit;

    return [
      { name: 'Gross GGR', value: Math.round(totalGgr12m), fill: '#6366f1' },
      { name: 'Player Bonuses', value: Math.round(-bonusVal), fill: '#f43f5e' },
      { name: 'Admin Fees', value: Math.round(-adminVal), fill: '#f59e0b' },
      { name: 'Tax / Levies', value: Math.round(-taxVal), fill: '#ea580c' },
      { name: 'Payment Fees', value: Math.round(-payVal), fill: '#dc2626' },
      { name: 'Net NGR', value: Math.round(ngrVal), fill: '#10b981' },
      { name: 'Affiliate Share', value: Math.round(-customAffiliateVal), fill: '#a855f7' },
      { name: 'Operator Profit', value: Math.round(customOperatorVal), fill: '#06b6d4' }
    ];
  }, [cohortProjections, effectiveBonusPct, adminFeePct, payFeePct, taxPct]);

  // Qualitative Analysis (War Room Rules Engine)
  const dealInsights = useMemo(() => {
    const insights = {
      affiliateStatus: 'neutral' as 'success' | 'warning' | 'error',
      affiliateText: '',
      operatorStatus: 'neutral' as 'success' | 'warning' | 'error',
      operatorText: '',
      cashflowRisk: 'low' as 'low' | 'medium' | 'high',
      recommendation: ''
    };

    // Calculate metrics
    const userNgrRatio = cohortProjections.totalNGR / (cohortProjections.totalGGR || 1);
    const playerLtvNgr = lifetimeNgrPerPlayer;
    const customAffEarning = cohortProjections.customDeal.affiliateEarnings;
    const customOpProfit = cohortProjections.customDeal.operatorProfit;

    // 1. Churn / Active Months Influence
    if (churnRate > 25) {
      insights.affiliateStatus = 'warning';
      insights.affiliateText = `High Churn (${churnRate}%): Players churn rapidly, yielding a short lifespan of ~${avgLifespanMonths} months. RevShare values will decay fast. Pushing for high CPA or a hybrid with upfront Tenancy is highly recommended to guarantee revenue.`;
      
      insights.operatorStatus = 'success';
      insights.operatorText = "High Churn favors the Operator if the deal is RevShare, as it caps the long-term payouts. However, if paying a high CPA, you will suffer severe losses because players churn before generating enough GGR to cover the CPA.";
    } else if (churnRate < 12) {
      insights.affiliateStatus = 'success';
      insights.affiliateText = `Low Churn (${churnRate}%): Excellent player retention (~${avgLifespanMonths} months). Players generate a high LTV of ${formatCurrency(lifetimeGgrPerPlayer)} GGR. A RevShare-focused or Hybrid deal is highly lucrative, promising compounding recurring earnings.`;

      insights.operatorStatus = 'warning';
      insights.operatorText = "Low churn means players have high long-term value. Paying a high RevShare % over their lifespan will lead to massive cumulative payouts. A flat CPA deal is much cheaper for you in the long run.";
    } else {
      insights.affiliateText = "Stable player retention. Standard hybrid options (CPA + RevShare) offer a balanced hedge against cashflow delay and performance uncertainty.";
      insights.operatorText = "Normal churn levels. Standard Hybrid deal structures are highly manageable and keep risks aligned.";
    }

    // 2. Margin Leakage / Deduction Impact
    if (marginLeakagePct > 55) {
      insights.affiliateStatus = 'error';
      insights.affiliateText += ` Critical Margin Leakage (${marginLeakagePct}%): Operator deductions are extreme (Bonuses: ${bonusPct}%, Admin: ${adminFeePct}%). Net Gaming Revenue (NGR) is less than 45% of GGR. RevShare deals are severely diluted. Take a CPA-heavy deal or negotiate a GGR-based payout!`;
    }

    // 2b. Negotiated Bonus Cap Impact
    if (bonusPct > bonusCapPct) {
      const savedLeakage = bonusPct - bonusCapPct;
      insights.affiliateStatus = 'success';
      insights.affiliateText += ` Negotiated Bonus Cap is ACTIVE: The contract cap of ${bonusCapPct}% overrides the player bonus rate of ${bonusPct}%, reclaiming ${savedLeakage}% of GGR back into NGR. Your commissions are protected from excessive promo dilution.`;
    }

    // 2c. CPL & CPA Capping & KPI Shortfall Refunds Insights
    if (cplAmount > 0) {
      insights.affiliateText += ` [CPL ACTIVE]: Receiving a registration fee of ${formatCurrency(cplAmount)} per sign-up. This guarantees ${formatCurrency(cohortProjections.customDeal.totalCplPaid)} in earnings regardless of player conversions.`;
      insights.operatorText += ` [CPL WARNING]: Paying registration fees of ${formatCurrency(cplAmount)} CPL (totaling ${formatCurrency(cohortProjections.customDeal.totalCplPaid)}). If lead quality or reg-to-deposit rate drops, this is a pure cash sink.`;
    }

    if (isCpaCapped) {
      if (ftdsPerMonth > cpaCapLimit) {
        const excess = ftdsPerMonth - cpaCapLimit;
        const loss = excess * cpaAmount * 12;
        insights.affiliateStatus = 'warning';
        insights.affiliateText += ` [CPA CAPPED]: You are delivering ${ftdsPerMonth} FTDs/mo but capped at ${cpaCapLimit} FTDs. You are losing out on ${formatCurrency(loss)} in annual CPA payouts. Negotiate a higher cap limit.`;
        insights.operatorText += ` [CPA CAP BENEFIT]: Cap of ${cpaCapLimit} FTDs/mo is successfully limiting your exposure. You get ${ftdsPerMonth} FTDs but only pay for ${cpaCapLimit}, saving ${formatCurrency(loss)} annually.`;
      } else {
        insights.affiliateText += ` [CPA CAP ACTIVE]: Cap is set at ${cpaCapLimit} FTDs/mo, but current monthly FTDs (${ftdsPerMonth}) are within the cap. No payout loss yet.`;
      }
    }

    if (kpiGuarantee > 0 && tenancyFee > 0) {
      if (ftdsPerMonth < kpiGuarantee) {
        const shortfall = kpiGuarantee - ftdsPerMonth;
        insights.affiliateStatus = 'error';
        insights.affiliateText += ` [KPI SHORTFALL]: You failed to meet the guaranteed target of ${kpiGuarantee} FTDs/mo (delivered: ${ftdsPerMonth}, shortfall: ${shortfall}). This triggers a refund reclamation, reducing your tenancy earnings by ${formatCurrency(cohortProjections.customDeal.totalRefundReclaimed)} over 12 months.`;
        insights.operatorStatus = 'success';
        insights.operatorText += ` [KPI REFUND TRIGGERED]: Affiliate missed the ${kpiGuarantee} FTD guarantee by ${shortfall} FTDs. Proportional refund reclaimed: ${formatCurrency(cohortProjections.customDeal.totalRefundReclaimed)} over 12 months.`;
      } else {
        insights.affiliateText += ` [KPI GUARANTEE MET]: You are delivering ${ftdsPerMonth} FTDs, exceeding the ${kpiGuarantee} FTD guarantee. Prepayment tenancy fee is fully protected.`;
        insights.operatorText += ` [KPI GUARANTEE MET]: Affiliate delivered ${ftdsPerMonth} FTDs, meeting the ${kpiGuarantee} FTD guarantee limit. Full tenancy fee remains payable.`;
      }
    }

    // 3. Cashflow Risk & Operator ROI
    const monthsToCoverTenancy = tenancyFee > 0 && ftdsPerMonth > 0 ? (tenancyFee / (ftdsPerMonth * lifetimeNgrPerPlayer * 0.5)) : 0;
    if (tenancyFee > 3000 && ftdsPerMonth < 20) {
      insights.cashflowRisk = 'high';
      insights.operatorStatus = 'error';
      insights.operatorText += ` High upfront Tenancy (${formatCurrency(tenancyFee)}) for low FTD volume creates a severe cashflow drain. It will take approximately ${Math.ceil(monthsToCoverTenancy)} months of GGR from these players to cover the listing cost alone.`;
    } else if (cpaAmount > 200 && lifetimeNgrPerPlayer < cpaAmount) {
      insights.cashflowRisk = 'high';
      insights.operatorStatus = 'error';
      insights.operatorText += ` CPA (${formatCurrency(cpaAmount)}) exceeds Player lifetime NGR (${formatCurrency(playerLtvNgr)}). You are buying players at a loss. Immediate adjustments needed!`;
    } else if (customOpProfit < 0) {
      insights.cashflowRisk = 'high';
      insights.operatorStatus = 'error';
      insights.operatorText = "CRITICAL: The current deal terms result in a net loss for the Operator over 12 months. Affiliate payouts and deductions exceed total NGR.";
    } else if (cohortProjections.customDeal.operatorRoi > 150) {
      insights.operatorStatus = 'success';
      if (insights.operatorStatus !== 'error') {
        insights.operatorText = `Excellent deal profitability! Projected 12-month Operator ROI is ${cohortProjections.customDeal.operatorRoi.toFixed(0)}%. Highly sustainable.`;
      }
    }

    // Recommendation synthesis
    if (playerLtvNgr > cpaAmount * 2 && marginLeakagePct < 40) {
      insights.recommendation = "Affiliate: Go for RevShare or Hybrid. Operator: Push for CPA.";
    } else if (playerLtvNgr < cpaAmount || marginLeakagePct > 50) {
      insights.recommendation = "Affiliate: Secure CPA or Upfront Tenancy. Operator: Push for RevShare to transfer performance risk.";
    } else {
      insights.recommendation = `A balanced Hybrid deal (e.g. ${formatCurrency(100)} CPA + 20% RevShare) satisfies both parties' cashflow and margin requirements.`;
    }

    return insights;
  }, [cohortProjections, lifetimeNgrPerPlayer, lifetimeGgrPerPlayer, churnRate, avgLifespanMonths, marginLeakagePct, bonusPct, bonusCapPct, adminFeePct, taxPct, payFeePct, cpaAmount, revSharePct, tenancyFee, ftdsPerMonth, formatCurrency, cplAmount, isCpaCapped, cpaCapLimit, kpiGuarantee, shortfallRefundPct]);

  return (
    <div className="space-y-6 animate-fade-in text-white p-1">
      {/* 1. TOP HEADER & PRESETS CONTROL */}
      <Card className="bg-slate-900/40 backdrop-blur-xl border border-indigo-500/10">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Sparkles className="h-5 w-5" />
                </span>
                <h2 className="text-xl font-bold tracking-tight text-white">iGaming Affiliate Deal Evaluator</h2>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Configure traffic conversions, iGaming platform leakages, and contract terms to stress-test your deals.
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-400">Market Profile Preset:</Label>
              <select
                value={selectedPreset}
                onChange={(e) => handleApplyPreset(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="latamCasino">LatAm Casino (High Volume, Low Tax)</option>
                <option value="regulatedEuSportsbook">Regulated EU Sportsbook (High Tax)</option>
                <option value="highRollerVip">High-Roller VIP (High Value, SEO)</option>
                <option value="standardHybrid">Standard Hybrid Deal (Balanced)</option>
              </select>
            </div>
          </div>
          
          <p className="text-xs text-indigo-300/80 bg-indigo-500/5 border border-indigo-500/10 rounded-md p-3 mt-4">
            <Info className="inline-block h-3.5 w-3.5 mr-1.5 -translate-y-0.5" />
            <strong>Preset Profile Context:</strong> {PRESETS[selectedPreset]?.description}
          </p>
        </CardContent>
      </Card>

      {/* View Mode Toggle */}
      <div className="flex bg-slate-950 border border-slate-800 p-1 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setViewMode('contract')}
          className={`px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-2 ${viewMode === 'contract' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Award className="h-4 w-4" />
          Contract Payout Model
        </button>
        <button
          type="button"
          onClick={() => setViewMode('packages')}
          className={`px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-2 ${viewMode === 'packages' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Layers className="h-4 w-4" />
          Listing Packages Model
        </button>
      </div>

      {viewMode === 'contract' ? (
        <>
          {/* 2. DYNAMIC KPI BLOCKS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-950 border border-slate-800/80 card-shadow">
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Monthly acquired FTDs</p>
              <h3 className="text-xl font-bold text-white font-mono mt-0.5">{ftdsPerMonth}</h3>
              <p className="text-[10px] text-slate-500">from {clicks.toLocaleString()} clicks</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-950 border border-slate-800/80 card-shadow">
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-orange-500/10 text-orange-400">
              <Percent className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">GGR-to-NGR Leakage</p>
              <h3 className="text-xl font-bold text-white font-mono mt-0.5">{marginLeakagePct}%</h3>
              <p className="text-[10px] text-red-400/80 font-mono">Net NGR: {(100 - marginLeakagePct)}% of GGR</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-950 border border-slate-800/80 card-shadow">
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Lifetime GGR / NGR</p>
              <h3 className="text-xl font-bold text-white font-mono mt-0.5">
                {formatCurrency(lifetimeGgrPerPlayer)} / <span className="text-emerald-400">{formatCurrency(lifetimeNgrPerPlayer)}</span>
              </h3>
              <p className="text-[10px] text-slate-500">per player over {avgLifespanMonths} months</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-950 border border-slate-800/80 card-shadow">
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Custom Deal 12M ROI</p>
              <h3 className={`text-xl font-bold font-mono mt-0.5 ${cohortProjections.customDeal.operatorRoi > 100 ? 'text-green-400' : cohortProjections.customDeal.operatorRoi > 0 ? 'text-yellow-400' : 'text-rose-500'}`}>
                {cohortProjections.customDeal.operatorRoi.toFixed(0)}%
              </h3>
              <p className="text-[10px] text-slate-500">Operator Profit / Affiliate Cost</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. MAIN WORKSPACE: CONFIG ON LEFT, OUTPUT ON RIGHT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: INTERACTIVE SLIDERS (5 COLS) */}
        <Card className="lg:col-span-5 bg-slate-950 border border-slate-800 flex flex-col h-full">
          <CardHeader className="pb-3 border-b border-slate-900">
            <div className="flex border-b border-slate-800 pb-1">
              <button
                onClick={() => setActiveTab('traffic')}
                className={`flex-1 text-center py-2 text-xs font-semibold rounded-t-md transition-colors ${activeTab === 'traffic' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'}`}
              >
                1. Traffic & Quality
              </button>
              <button
                onClick={() => setActiveTab('deductions')}
                className={`flex-1 text-center py-2 text-xs font-semibold rounded-t-md transition-colors ${activeTab === 'deductions' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'}`}
              >
                2. GGR Deductions
              </button>
              <button
                onClick={() => setActiveTab('deal')}
                className={`flex-1 text-center py-2 text-xs font-semibold rounded-t-md transition-colors ${activeTab === 'deal' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'}`}
              >
                3. Deal Payout Config
              </button>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 pt-4 space-y-5">
            
            {/* TAB 1: TRAFFIC & PLAYER QUALITY */}
            {activeTab === 'traffic' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Monthly Traffic (Clicks)</span>
                    <span className="font-mono text-indigo-400">{clicks.toLocaleString()}</span>
                  </div>
                  <Slider 
                    min={500} max={100000} step={500} 
                    value={[clicks]} 
                    onValueChange={(val) => setClicks(val[0])}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Click-to-Registration CR</span>
                    <span className="font-mono text-indigo-400">{clickToReg.toFixed(1)}%</span>
                  </div>
                  <Slider 
                    min={0.5} max={40} step={0.5} 
                    value={[clickToReg]} 
                    onValueChange={(val) => setClickToReg(val[0])}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Registration-to-FTD (Deposit) CR</span>
                    <span className="font-mono text-indigo-400">{regToFtd.toFixed(1)}%</span>
                  </div>
                  <Slider 
                    min={1} max={70} step={0.5} 
                    value={[regToFtd]} 
                    onValueChange={(val) => setRegToFtd(val[0])}
                  />
                </div>

                <hr className="border-slate-900" />

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Average Player Initial Deposit</span>
                    <span className="font-mono text-indigo-400">{formatCurrency(avgDeposit)}</span>
                  </div>
                  <Slider 
                    min={10} max={1000} step={5} 
                    value={[avgDeposit]} 
                    onValueChange={(val) => setAvgDeposit(val[0])}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Monthly GGR (Gross Gaming Rev) per player</span>
                    <span className="font-mono text-indigo-400">{formatCurrency(monthlyGgrPerPlayer)}</span>
                  </div>
                  <Slider 
                    min={5} max={1500} step={5} 
                    value={[monthlyGgrPerPlayer]} 
                    onValueChange={(val) => setMonthlyGgrPerPlayer(val[0])}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Player Churn Rate (Monthly Churn)</span>
                    <span className="font-mono text-indigo-400 text-red-400">{churnRate}%</span>
                  </div>
                  <Slider 
                    min={2} max={100} step={1} 
                    value={[churnRate]} 
                    onValueChange={(val) => setChurnRate(val[0])}
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Low Churn = Long Life</span>
                    <span>High Churn = Churn Out Fast</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: DEDUCTIONS (MARGIN LEAKAGE) */}
            {activeTab === 'deductions' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      Player Bonus/Promos % of GGR
                      <Info className="h-3 w-3 text-slate-500" title="Includes free spins, deposit matches, cashbacks. Subtracted before NGR." />
                    </span>
                    <span className="font-mono text-red-400">{bonusPct}%</span>
                  </div>
                  <Slider 
                    min={0} max={70} step={1} 
                    value={[bonusPct]} 
                    onValueChange={(val) => setBonusPct(val[0])}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      Negotiated Bonus Cap
                      <Info className="h-3 w-3 text-slate-500" title="Caps the maximum player bonus deductions the operator can deduct from GGR. 100% = Uncapped." />
                    </span>
                    <span className="font-mono text-indigo-400">
                      {bonusCapPct === 100 ? 'Uncapped' : `${bonusCapPct}%`}
                    </span>
                  </div>
                  <Slider 
                    min={10} max={100} step={1} 
                    value={[bonusCapPct]} 
                    onValueChange={(val) => setBonusCapPct(val[0])}
                  />
                  {bonusPct > bonusCapPct && (
                    <p className="text-[10px] text-emerald-400 font-mono mt-1 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Cap active: Saving {bonusPct - bonusCapPct}% GGR leakage
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      Admin / Platform Royalties
                      <Info className="h-3 w-3 text-slate-500" title="Platform royalties paid to suppliers (EveryMatrix, Evolution, etc.) deducted from wagers." />
                    </span>
                    <span className="font-mono text-red-400">{adminFeePct}%</span>
                  </div>
                  <Slider 
                    min={0} max={40} step={1} 
                    value={[adminFeePct]} 
                    onValueChange={(val) => setAdminFeePct(val[0])}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Gaming Tax & Duties %</span>
                    <span className="font-mono text-red-400">{taxPct}%</span>
                  </div>
                  <Slider 
                    min={0} max={45} step={0.5} 
                    value={[taxPct]} 
                    onValueChange={(val) => setTaxPct(val[0])}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Payment Processing & Fees %</span>
                    <span className="font-mono text-red-400">{payFeePct}%</span>
                  </div>
                  <Slider 
                    min={0} max={15} step={0.5} 
                    value={[payFeePct]} 
                    onValueChange={(val) => setPayFeePct(val[0])}
                  />
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2 mt-2">
                  <h4 className="text-xs font-semibold text-white">NGR Structure Logic</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    In iGaming, affiliates are paid RevShare on <strong className="text-white">Net Gaming Revenue (NGR)</strong>, not Gross. The standard formula is:
                  </p>
                  <p className="text-xs font-mono text-indigo-300 bg-slate-950 p-2 rounded text-center">
                    NGR = GGR - Bonuses - Admin - Taxes - Processing
                  </p>
                  <p className="text-[10px] text-slate-500">
                    High bonuses and market taxes directly leak the value of a RevShare deal for the partner.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 3: DEAL PAYOUT OPTIONS */}
            {activeTab === 'deal' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">CPA (Cost per Acquisition / Depositing User)</span>
                    <span className="font-mono text-indigo-400">{formatCurrency(cpaAmount)}</span>
                  </div>
                  <Slider 
                    min={0} max={1000} step={10} 
                    value={[cpaAmount]} 
                    onValueChange={(val) => setCpaAmount(val[0])}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Revenue Share Percentage</span>
                    <span className="font-mono text-indigo-400">{revSharePct}%</span>
                  </div>
                  <Slider 
                    min={0} max={60} step={1} 
                    value={[revSharePct]} 
                    onValueChange={(val) => setRevSharePct(val[0])}
                    disabled={isTieredRevShare}
                  />
                </div>

                <div className="flex items-center justify-between p-2 bg-slate-900 rounded-lg">
                  <div className="space-y-0.5">
                    <Label className="text-xs text-white">Tiered RevShare</Label>
                    <p className="text-[10px] text-slate-500">Tiered share based on monthly FTD count (0-10: 25%, 11-30: 30%, 31-50: 35%, 51+: 40%)</p>
                  </div>
                  <Switch 
                    checked={isTieredRevShare} 
                    onCheckedChange={setIsTieredRevShare} 
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300">Tenancy / Flat Listing Fee (Monthly)</span>
                    <span className="font-mono text-indigo-400">{formatCurrency(tenancyFee)}</span>
                  </div>
                  <Slider 
                    min={0} max={25000} step={250} 
                    value={[tenancyFee]} 
                    onValueChange={(val) => setTenancyFee(val[0])}
                  />
                </div>

                <hr className="border-slate-900" />
                <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider block">Advanced Contract Conditions</span>

                {/* CPL Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      CPL (Cost Per Lead / Registration)
                      <Info className="h-3 w-3 text-slate-500" title="Payout per registration, regardless of deposit status." />
                    </span>
                    <span className="font-mono text-indigo-400">{formatCurrency(cplAmount)}</span>
                  </div>
                  <Slider 
                    min={0} max={50} step={0.5} 
                    value={[cplAmount]} 
                    onValueChange={(val) => setCplAmount(val[0])}
                  />
                </div>

                {/* CPA Cap Switch & Slider */}
                <div className="space-y-3 p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-xs text-white">FTD Test Cap / Scope Cap</Label>
                      <p className="text-[10px] text-slate-500">Capping the maximum paid CPA players per month</p>
                    </div>
                    <Switch 
                      checked={isCpaCapped} 
                      onCheckedChange={setIsCpaCapped} 
                    />
                  </div>
                  {isCpaCapped && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">CPA Cap Limit (FTDs/mo)</span>
                        <span className="font-mono text-indigo-400">{cpaCapLimit} FTDs</span>
                      </div>
                      <Slider 
                        min={5} max={500} step={5} 
                        value={[cpaCapLimit]} 
                        onValueChange={(val) => setCpaCapLimit(val[0])}
                      />
                    </div>
                  )}
                </div>

                {/* KPI Guarantee & Shortfall Refund */}
                <div className="space-y-3 p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                  <span className="text-[11px] font-semibold text-white block">Prepayment KPI Guarantee</span>
                  
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Target FTDs Guarantee</span>
                      <span className="font-mono text-indigo-400">{kpiGuarantee > 0 ? `${kpiGuarantee} FTDs` : "No Guarantee"}</span>
                    </div>
                    <Slider 
                      min={0} max={100} step={5} 
                      value={[kpiGuarantee]} 
                      onValueChange={(val) => setKpiGuarantee(val[0])}
                    />
                  </div>

                  {kpiGuarantee > 0 && tenancyFee > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Shortfall Refund Rate</span>
                        <span className="font-mono text-red-400">{shortfallRefundPct}%</span>
                      </div>
                      <Slider 
                        min={0} max={100} step={5} 
                        value={[shortfallRefundPct]} 
                        onValueChange={(val) => setShortfallRefundPct(val[0])}
                      />
                      <p className="text-[10px] text-slate-500">
                        Refund of Tenancy fee proportional to missed FTD target.
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-4 border border-indigo-500/10 bg-indigo-500/5 rounded-lg">
                  <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Calculated Deal Structure</span>
                  <div className="mt-2 text-sm text-slate-200 leading-normal">
                    {tenancyFee > 0 && <span>{formatCurrency(tenancyFee)} / mo tenancy</span>}
                    {tenancyFee > 0 && (cplAmount > 0 || cpaAmount > 0 || revSharePct > 0) && <span> + </span>}
                    {cplAmount > 0 && <span>{formatCurrency(cplAmount)} CPL</span>}
                    {cplAmount > 0 && (cpaAmount > 0 || revSharePct > 0) && <span> + </span>}
                    {cpaAmount > 0 && (
                      <span>
                        {formatCurrency(cpaAmount)} CPA
                        {isCpaCapped && <span className="text-[10px] text-slate-400 ml-1"> (capped at {cpaCapLimit} FTDs)</span>}
                      </span>
                    )}
                    {cpaAmount > 0 && revSharePct > 0 && <span> + </span>}
                    {revSharePct > 0 && (
                      <span>
                        {isTieredRevShare ? "Tiered RevShare" : `${revSharePct}% RevShare`}
                      </span>
                    )}
                    {kpiGuarantee > 0 && (
                      <span className="text-[10px] text-indigo-300 block mt-1 font-semibold">
                        🔒 KPI target: {kpiGuarantee} FTDs ({shortfallRefundPct}% shortfall refund rate)
                      </span>
                    )}
                    {tenancyFee === 0 && cplAmount === 0 && cpaAmount === 0 && revSharePct === 0 && (
                      <span className="text-red-400 font-semibold">No Payout Configured!</span>
                    )}
                  </div>

                  {/* 12M Projections Breakdown list */}
                  {(cplAmount > 0 || tenancyFee > 0 || cpaAmount > 0 || revSharePct > 0) && (
                    <div className="mt-3 pt-3 border-t border-indigo-500/20 text-xs space-y-1.5 text-slate-400">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 block">Projected 12M Breakout Payments</span>
                      <div className="flex justify-between">
                        <span>Total CPL Paid:</span>
                        <span className="font-mono text-slate-200">{formatCurrency(cohortProjections.customDeal.totalCplPaid)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total CPA Paid:</span>
                        <span className="font-mono text-slate-200">
                          {formatCurrency(cohortProjections.customDeal.totalCpaPaid)}
                          {isCpaCapped && <span className="text-[9px] text-indigo-400 ml-1">(Capping active)</span>}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Tenancy paid:</span>
                        <span className="font-mono text-slate-200">{formatCurrency(cohortProjections.customDeal.totalTenancyPaid)}</span>
                      </div>
                      {cohortProjections.customDeal.totalRefundReclaimed > 0 && (
                        <div className="flex justify-between text-emerald-400">
                          <span>KPI Refund Reclaimed:</span>
                          <span className="font-mono">-{formatCurrency(cohortProjections.customDeal.totalRefundReclaimed)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Total RevShare Paid:</span>
                        <span className="font-mono text-slate-200">{formatCurrency(cohortProjections.customDeal.totalRsPaid)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Operator Payback & Break-Even Timeline */}
                <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-lg space-y-3">
                  <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Operator Payback & Break-Even Timeline
                  </span>
                  
                  {breakEvenMonth ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 font-semibold">Break-Even achieved: Month {breakEvenMonth}</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[10px] animate-pulse">
                          Profit Phase
                        </span>
                      </div>
                      
                      {/* Timeline Graphic */}
                      <div className="relative pt-2 pb-4">
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-900">
                          {/* Pre-break-even area (red/indigo) */}
                          <div 
                            style={{ width: `${(breakEvenMonth - 1) / 12 * 100}%` }} 
                            className="h-full bg-indigo-500/20"
                          />
                          {/* Post-break-even area (glowing emerald) */}
                          <div 
                            style={{ width: `${(13 - breakEvenMonth) / 12 * 100}%` }} 
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                          />
                        </div>
                        {/* Glowing indicator needle */}
                        <div 
                          style={{ left: `${(breakEvenMonth - 0.5) / 12 * 100}%` }}
                          className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-white border border-emerald-500 shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                          <span className="text-[9px] text-white font-mono mt-0.5 font-bold">M{breakEvenMonth}</span>
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-slate-400 leading-relaxed pt-1.5">
                        Accumulated NGR from players exceeds your custom deal payouts starting from Month {breakEvenMonth}. ROI is positive in subsequent months.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-rose-400 font-semibold">No Break-Even within 12 Months</span>
                        <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 font-mono text-[10px]">
                          Deficit Warning
                        </span>
                      </div>
                      
                      {/* Timeline Graphic for deficit */}
                      <div className="h-2 w-full bg-slate-950 rounded-full border border-slate-900 overflow-hidden">
                        <div className="h-full w-full bg-gradient-to-r from-rose-950 to-rose-700/40" />
                      </div>
                      
                      <p className="text-[10px] text-slate-400 leading-relaxed pt-1">
                        ⚠️ Operator payout liabilities exceed player NGR yield for the entire first year. You will operate this traffic channel at a net loss of <strong className="text-rose-400 font-mono">{formatCurrency(Math.abs(cohortProjections.customDeal.operatorProfit))}</strong>. Adjust tenancy fees or CPA rate down!
                      </p>
                    </div>
                  )}
                </div>

                {/* 12-Month Affiliate Commission Mix */}
                <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-lg space-y-3">
                  <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider flex items-center gap-1.5">
                    <Coins className="h-3.5 w-3.5" />
                    12-Month Affiliate Commission Mix
                  </span>

                  {(() => {
                    const cpl = Math.max(0, cohortProjections.customDeal.totalCplPaid);
                    const cpa = Math.max(0, cohortProjections.customDeal.totalCpaPaid);
                    const tenancy = Math.max(0, cohortProjections.customDeal.totalTenancyPaid - cohortProjections.customDeal.totalRefundReclaimed);
                    const rs = Math.max(0, cohortProjections.customDeal.totalRsPaid);
                    const total = cpl + cpa + tenancy + rs;

                    if (total === 0) {
                      return (
                        <div className="text-center py-4 text-xs text-slate-500">
                          No payments projected. Move sliders in Tab 3 to configure deal.
                        </div>
                      );
                    }

                    const pCpl = (cpl / total) * 100;
                    const pCpa = (cpa / total) * 100;
                    const pTenancy = (tenancy / total) * 100;
                    const pRs = (rs / total) * 100;

                    return (
                      <div className="space-y-3">
                        {/* Stacked bar */}
                        <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-900">
                          {cpl > 0 && (
                            <div 
                              style={{ width: `${pCpl}%` }} 
                              className="h-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]" 
                              title={`CPL: ${pCpl.toFixed(0)}%`}
                            />
                          )}
                          {cpa > 0 && (
                            <div 
                              style={{ width: `${pCpa}%` }} 
                              className="h-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]" 
                              title={`CPA: ${pCpa.toFixed(0)}%`}
                            />
                          )}
                          {tenancy > 0 && (
                            <div 
                              style={{ width: `${pTenancy}%` }} 
                              className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" 
                              title={`Tenancy: ${pTenancy.toFixed(0)}%`}
                            />
                          )}
                          {rs > 0 && (
                            <div 
                              style={{ width: `${pRs}%` }} 
                              className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" 
                              title={`RevShare: ${pRs.toFixed(0)}%`}
                            />
                          )}
                        </div>

                        {/* Legends with percentages */}
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                          {cpl > 0 && (
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_4px_#a855f7]"></span>
                              <span>CPL Lead: <strong className="text-white font-mono">{pCpl.toFixed(0)}%</strong></span>
                            </div>
                          )}
                          {cpa > 0 && (
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <span className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_4px_#0ea5e9]"></span>
                              <span>CPA Acq: <strong className="text-white font-mono">{pCpa.toFixed(0)}%</strong></span>
                            </div>
                          )}
                          {tenancy > 0 && (
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_#10b981]"></span>
                              <span>Listing Fee: <strong className="text-white font-mono">{pTenancy.toFixed(0)}%</strong></span>
                            </div>
                          )}
                          {rs > 0 && (
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_4px_#f59e0b]"></span>
                              <span>RevShare: <strong className="text-white font-mono">{pRs.toFixed(0)}%</strong></span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

              </div>
            )}
            
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: OUTPUTS & GRAPHS (7 COLS) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* STATS MATRIX & DEAL COMPARISONS */}
          <Card className="bg-slate-950 border border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200">12-Month Calendar Window Comparison Matrix</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                12-month calendar window projection (Note: Month 1 cohort captures 12 months tenure, while Month 12 captures 1 month; full cohort lifetime values continue into Year 2).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-400 bg-slate-900/30">
                      <th className="py-2.5 px-3">Contract Deal Type</th>
                      <th className="py-2.5 px-3 text-right">Affiliate Earnings</th>
                      <th className="py-2.5 px-3 text-right">Operator Net</th>
                      <th className="py-2.5 px-3 text-right">Effective CPA</th>
                      <th className="py-2.5 px-3 text-right">Operator ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* CUSTOM DEAL */}
                    <tr className="border-b border-indigo-500/20 bg-indigo-500/5 font-semibold text-white">
                      <td className="py-3 px-3 flex items-center gap-1.5 text-indigo-300">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                        Custom Config Deal
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-indigo-300">{formatCurrency(cohortProjections.customDeal.affiliateEarnings)}</td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-400">{formatCurrency(cohortProjections.customDeal.operatorProfit)}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatCurrency(cohortProjections.customDeal.effectiveCpa)}</td>
                      <td className="py-3 px-3 text-right font-mono text-indigo-300">{cohortProjections.customDeal.operatorRoi.toFixed(0)}%</td>
                    </tr>
                    {/* CPA BENCHMARK */}
                    <tr className="border-b border-slate-900 text-slate-300 hover:bg-slate-900/20">
                      <td className="py-2.5 px-3">Pure CPA (Benchmark {formatCurrency(cpaAmount > 0 ? cpaAmount : 150)})</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(cohortProjections.cpaDeal.affiliateEarnings)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-500">{formatCurrency(cohortProjections.cpaDeal.operatorProfit)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(cohortProjections.cpaDeal.effectiveCpa)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{cohortProjections.cpaDeal.operatorRoi.toFixed(0)}%</td>
                    </tr>
                    {/* REVSHARE BENCHMARK */}
                    <tr className="border-b border-slate-900 text-slate-300 hover:bg-slate-900/20">
                      <td className="py-2.5 px-3">Pure RevShare (Benchmark {revSharePct > 0 ? revSharePct : 35}%)</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(cohortProjections.rsDeal.affiliateEarnings)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-500">{formatCurrency(cohortProjections.rsDeal.operatorProfit)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(cohortProjections.rsDeal.effectiveCpa)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{cohortProjections.rsDeal.operatorRoi.toFixed(0)}%</td>
                    </tr>
                    {/* HYBRID BENCHMARK */}
                    <tr className="border-b border-slate-900 text-slate-300 hover:bg-slate-900/20">
                      <td className="py-2.5 px-3">Hybrid ({formatCurrency(80)} CPA + 20% RS)</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(cohortProjections.hybridDeal.affiliateEarnings)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-500">{formatCurrency(cohortProjections.hybridDeal.operatorProfit)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(cohortProjections.hybridDeal.effectiveCpa)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{cohortProjections.hybridDeal.operatorRoi.toFixed(0)}%</td>
                    </tr>
                    {/* FLAT TENANCY BENCHMARK */}
                    <tr className="border-b border-slate-900 text-slate-300 hover:bg-slate-900/20">
                      <td className="py-2.5 px-3">Pure Flat Fee ({formatCurrency(3000)}/mo tenancy)</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(cohortProjections.tenancyDeal.affiliateEarnings)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-500">{formatCurrency(cohortProjections.tenancyDeal.operatorProfit)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatCurrency(cohortProjections.tenancyDeal.effectiveCpa)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{cohortProjections.tenancyDeal.operatorRoi.toFixed(0)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* CUMULATIVE EARNINGS PROJECTION GRAPH */}
          <Card className="bg-slate-950 border border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200">12-Month Cumulative Projections (Custom Deal vs. Benchmarks)</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Visualizing affiliate cash payout vs operator net profit over time. Toggle overlays to identify the exact crossover points.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Curve Selection Toggles */}
              <div className="flex flex-wrap gap-2 pt-1 pb-3 mb-3 border-b border-slate-900 text-xs">
                <button
                  onClick={() => setShowCustomAffiliate(!showCustomAffiliate)}
                  className={`px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${showCustomAffiliate ? 'bg-purple-500/10 border-purple-500/50 text-purple-300' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7]"></span>
                  Custom Affiliate
                </button>
                <button
                  onClick={() => setShowCustomOperator(!showCustomOperator)}
                  className={`px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${showCustomOperator ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#06b6d4]"></span>
                  Custom Operator
                </button>
                <button
                  onClick={() => setShowCpaAffiliate(!showCpaAffiliate)}
                  className={`px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${showCpaAffiliate ? 'bg-rose-500/10 border-rose-500/50 text-rose-300' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f43f5e]"></span>
                  Pure CPA Benchmark (Affiliate)
                </button>
                <button
                  onClick={() => setShowRsAffiliate(!showRsAffiliate)}
                  className={`px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${showRsAffiliate ? 'bg-amber-500/10 border-amber-500/50 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]"></span>
                  Pure RevShare Benchmark (Affiliate)
                </button>
                <button
                  onClick={() => setShowHybridAffiliate(!showHybridAffiliate)}
                  className={`px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${showHybridAffiliate ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></span>
                  Hybrid Benchmark (Affiliate)
                </button>
                <button
                  onClick={() => setShowTenancyAffiliate(!showTenancyAffiliate)}
                  className={`px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${showTenancyAffiliate ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6366f1]"></span>
                  Tenancy Benchmark (Affiliate)
                </button>
              </div>

              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={cohortProjections.monthlyData}
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={11}
                      tickFormatter={(val) => formatCurrency(val, true)} 
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b' }}
                      labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                      itemStyle={{ fontSize: 12 }}
                      formatter={(value: any) => [formatCurrency(Number(value)), '']}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    
                    {showCustomAffiliate && (
                      <Line 
                        name="Custom Affiliate Earnings" 
                        type="monotone" 
                        dataKey="affiliateEarnings" 
                        stroke="#a855f7" 
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                    {showCustomOperator && (
                      <Line 
                        name="Custom Operator Net Profit" 
                        type="monotone" 
                        dataKey="operatorProfit" 
                        stroke="#06b6d4" 
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                    {showCpaAffiliate && (
                      <Line 
                        name="Benchmark CPA (Affiliate)" 
                        type="monotone" 
                        dataKey="cpaAffiliate" 
                        stroke="#f43f5e" 
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    )}
                    {showRsAffiliate && (
                      <Line 
                        name="Benchmark RevShare (Affiliate)" 
                        type="monotone" 
                        dataKey="rsAffiliate" 
                        stroke="#f59e0b" 
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    )}
                    {showHybridAffiliate && (
                      <Line 
                        name="Benchmark Hybrid (Affiliate)" 
                        type="monotone" 
                        dataKey="hybridAffiliate" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    )}
                    {showTenancyAffiliate && (
                      <Line 
                        name="Benchmark Tenancy (Affiliate)" 
                        type="monotone" 
                        dataKey="tenancyAffiliate" 
                        stroke="#6366f1" 
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* DEDUCTIONS WATERFALL CHART (REPLACED WITH JAW-DROPPING NEON FLOW DIAGRAM) */}
          <Card className="bg-slate-950 border border-slate-800 overflow-hidden relative">
            <style>{`
              @keyframes flow-left-to-right {
                to {
                  stroke-dashoffset: -32;
                }
              }
              .flow-line {
                stroke-dasharray: 6 12;
                animation: flow-left-to-right 1.5s linear infinite;
              }
              .glow-effect {
                filter: drop-shadow(0 0 4px currentColor);
              }
              .node-hover {
                transition: all 0.2s ease-in-out;
              }
              .node-hover:hover {
                fill-opacity: 0.15;
                stroke-width: 2.5px;
              }
            `}</style>
            <CardHeader className="pb-2 relative z-10">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                <Layers className="h-4.5 w-4.5 text-indigo-400" />
                12-Month Animated Neon GGR-to-NGR Flow Diagram
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Visualizing GGR split, leakages, and contract payouts in real-time. Neon flows represent transaction volumes.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2 relative">
              <div className="w-full overflow-x-auto select-none">
                <div className="min-w-[620px] h-[290px] flex items-center justify-center">
                  <svg viewBox="0 0 650 290" className="w-full h-full text-slate-200">
                    <defs>
                      {/* Glow Filter */}
                      <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>

                      {/* Gradients */}
                      <linearGradient id="ggrToBonus" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#f43f5e" />
                      </linearGradient>
                      <linearGradient id="ggrToAdmin" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#f59e0b" />
                      </linearGradient>
                      <linearGradient id="ggrToTax" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#ea580c" />
                      </linearGradient>
                      <linearGradient id="ggrToPay" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#dc2626" />
                      </linearGradient>
                      <linearGradient id="ggrToNgr" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                      <linearGradient id="ngrToAffiliate" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                      <linearGradient id="ngrToOperator" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>

                    {/* DYNAMIC VALUE MATH */}
                    {(() => {
                      const totalGgr = cohortProjections.totalGGR || 1;
                      const bonusVal = totalGgr * (effectiveBonusPct / 100);
                      const adminVal = totalGgr * (adminFeePct / 100);
                      const payVal = totalGgr * (payFeePct / 100);
                      const taxVal = totalGgr * (taxPct / 100);
                      const ngrVal = cohortProjections.totalNGR;
                      const affiliateVal = cohortProjections.customDeal.affiliateEarnings;
                      const operatorVal = cohortProjections.customDeal.operatorProfit;

                      // Helper to compute stroke widths
                      const getThickness = (v: number) => {
                        const pct = Math.abs(v) / totalGgr;
                        return Math.max(1.5, Math.round(pct * 22));
                      };

                      const tBonus = getThickness(bonusVal);
                      const tAdmin = getThickness(adminVal);
                      const tTax = getThickness(taxVal);
                      const tPay = getThickness(payVal);
                      const tNgr = getThickness(ngrVal);
                      const tAffiliate = getThickness(affiliateVal);
                      const tOperator = getThickness(operatorVal);

                      // Helper to render dual lines (colored flow + animated dash overlay)
                      const renderLink = (startX: number, startY: number, endX: number, endY: number, strokeWidth: number, gradId: string, glowColor: string) => {
                        const cpX = (startX + endX) / 2;
                        const pathD = `M ${startX} ${startY} C ${cpX} ${startY}, ${cpX} ${endY}, ${endX} ${endY}`;
                        return (
                          <g key={`${startX}-${startY}-${gradId}`}>
                            {/* Base colored line */}
                            <path 
                              d={pathD} 
                              fill="none" 
                              stroke={`url(#${gradId})`} 
                              strokeWidth={strokeWidth} 
                              strokeOpacity={0.25} 
                            />
                            {/* Glow highlighting line */}
                            <path 
                              d={pathD} 
                              fill="none" 
                              stroke={`url(#${gradId})`} 
                              strokeWidth={Math.min(strokeWidth, 4)} 
                              strokeOpacity={0.5} 
                              filter="url(#neonGlow)"
                            />
                            {/* Moving flow particles */}
                            <path 
                              d={pathD} 
                              fill="none" 
                              stroke={glowColor} 
                              strokeWidth={Math.max(1, Math.min(strokeWidth * 0.4, 2.5))} 
                              strokeOpacity={0.8} 
                              className="flow-line glow-effect"
                              style={{ color: glowColor }}
                            />
                          </g>
                        );
                      };

                      return (
                        <>
                          {/* LINKS / FLOW LINES */}
                          {renderLink(90, 145, 280, 42.5, tBonus, 'ggrToBonus', '#f43f5e')}
                          {renderLink(90, 145, 280, 82.5, tAdmin, 'ggrToAdmin', '#f59e0b')}
                          {renderLink(90, 145, 280, 122.5, tTax, 'ggrToTax', '#ea580c')}
                          {renderLink(90, 145, 280, 162.5, tPay, 'ggrToPay', '#dc2626')}
                          {renderLink(90, 145, 280, 235, tNgr, 'ggrToNgr', '#10b981')}
                          
                          {renderLink(380, 235, 540, 202.5, tAffiliate, 'ngrToAffiliate', '#a855f7')}
                          {renderLink(380, 235, 540, 262.5, tOperator, 'ngrToOperator', '#06b6d4')}

                          {/* NODES / LABELS */}
                          
                          {/* Node 1: Gross GGR */}
                          <g transform="translate(10, 120)">
                            <rect 
                              width="80" height="50" rx="8" 
                              fill="#020617" stroke="#6366f1" strokeWidth="1.5" 
                              className="node-hover" fillOpacity="0.05"
                            />
                            <text x="40" y="20" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="bold">GROSS GGR</text>
                            <text x="40" y="38" textAnchor="middle" fill="#6366f1" fontSize="11" fontWeight="bold" className="font-mono">
                              {formatCurrency(totalGgr, true)}
                            </text>
                          </g>

                          {/* Node 2: Player Bonuses */}
                          <g transform="translate(280, 25)">
                            <rect 
                              width="100" height="35" rx="6" 
                              fill="#020617" stroke="#f43f5e" strokeWidth="1.2" 
                              className="node-hover" fillOpacity="0.05"
                            />
                            <text x="50" y="14" textAnchor="middle" fill="#f43f5e" fontSize="8" fontWeight="bold">
                              Bonuses {bonusPct > bonusCapPct ? `(Capped ${bonusCapPct}%)` : `(${bonusPct}%)`}
                            </text>
                            <text x="50" y="26" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="medium" className="font-mono">
                              -{formatCurrency(bonusVal, true)}
                            </text>
                          </g>

                          {/* Node 3: Admin Fees */}
                          <g transform="translate(280, 65)">
                            <rect 
                              width="100" height="35" rx="6" 
                              fill="#020617" stroke="#f59e0b" strokeWidth="1.2" 
                              className="node-hover" fillOpacity="0.05"
                            />
                            <text x="50" y="14" textAnchor="middle" fill="#f59e0b" fontSize="8" fontWeight="bold">Admin Fee ({adminFeePct}%)</text>
                            <text x="50" y="26" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="medium" className="font-mono">
                              -{formatCurrency(adminVal, true)}
                            </text>
                          </g>

                          {/* Node 4: Gaming Tax */}
                          <g transform="translate(280, 105)">
                            <rect 
                              width="100" height="35" rx="6" 
                              fill="#020617" stroke="#ea580c" strokeWidth="1.2" 
                              className="node-hover" fillOpacity="0.05"
                            />
                            <text x="50" y="14" textAnchor="middle" fill="#ea580c" fontSize="8" fontWeight="bold">Gaming Tax ({taxPct}%)</text>
                            <text x="50" y="26" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="medium" className="font-mono">
                              -{formatCurrency(taxVal, true)}
                            </text>
                          </g>

                          {/* Node 5: Payment Processing */}
                          <g transform="translate(280, 145)">
                            <rect 
                              width="100" height="35" rx="6" 
                              fill="#020617" stroke="#dc2626" strokeWidth="1.2" 
                              className="node-hover" fillOpacity="0.05"
                            />
                            <text x="50" y="14" textAnchor="middle" fill="#dc2626" fontSize="8" fontWeight="bold">Payment Fee ({payFeePct}%)</text>
                            <text x="50" y="26" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="medium" className="font-mono">
                              -{formatCurrency(payVal, true)}
                            </text>
                          </g>

                          {/* Node 6: Net NGR */}
                          <g transform="translate(280, 215)">
                            <rect 
                              width="100" height="40" rx="8" 
                              fill="#020617" stroke="#10b981" strokeWidth="1.5" 
                              className="node-hover" fillOpacity="0.05"
                            />
                            <text x="50" y="15" textAnchor="middle" fill="#10b981" fontSize="9" fontWeight="bold">Retained Net Gaming Rev</text>
                            <text x="50" y="31" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold" className="font-mono">
                              {formatCurrency(ngrVal, true)}
                            </text>
                          </g>

                          {/* Node 7: Affiliate Share */}
                          <g transform="translate(540, 185)">
                            <rect 
                              width="100" height="35" rx="6" 
                              fill="#020617" stroke="#a855f7" strokeWidth="1.2" 
                              className="node-hover" fillOpacity="0.05"
                            />
                            <text x="50" y="14" textAnchor="middle" fill="#a855f7" fontSize="8" fontWeight="bold">Partner Share</text>
                            <text x="50" y="26" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="bold" className="font-mono">
                              {formatCurrency(affiliateVal, true)}
                            </text>
                          </g>

                          {/* Node 8: Operator Net Share */}
                          <g transform="translate(540, 245)">
                            <rect 
                              width="100" height="35" rx="6" 
                              fill="#020617" stroke="#06b6d4" strokeWidth="1.2" 
                              className="node-hover" fillOpacity="0.05"
                            />
                            <text x="50" y="14" textAnchor="middle" fill="#06b6d4" fontSize="8" fontWeight="bold">Operator Profit</text>
                            <text x="50" y="26" textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="bold" className="font-mono">
                              {formatCurrency(operatorVal, true)}
                            </text>
                          </g>
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. WAR ROOM STRATEGIC INSIGHTS */}
          <Card className="bg-slate-900/50 border border-indigo-500/10 overflow-hidden">
            <CardHeader className="pb-2 bg-indigo-500/5 border-b border-indigo-500/10">
              <div className="flex items-center gap-2 text-indigo-400">
                <Award className="h-4.5 w-4.5" />
                <h4 className="text-xs font-bold uppercase tracking-wider">War Room Deal Evaluation Panel</h4>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Affiliate Advisor */}
                <div className="space-y-1.5 p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    {dealInsights.affiliateStatus === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : dealInsights.affiliateStatus === 'warning' ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                    )}
                    Affiliate Partner Perspective
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{dealInsights.affiliateText}</p>
                </div>

                {/* Operator Advisor */}
                <div className="space-y-1.5 p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    {dealInsights.operatorStatus === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                    )}
                    Casino/Sportsbook Operator Perspective
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{dealInsights.operatorText}</p>
                </div>

              </div>

              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-900 rounded-lg">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Deal Recommendation</span>
                  <p className="text-xs font-semibold text-indigo-300">{dealInsights.recommendation}</p>
                </div>
                <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-400">
                  Cashflow Risk: <span className={`font-semibold capitalize ${dealInsights.cashflowRisk === 'high' ? 'text-red-400' : dealInsights.cashflowRisk === 'medium' ? 'text-amber-400' : 'text-emerald-400'}`}>{dealInsights.cashflowRisk}</span>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
        </>
      ) : (
        <ListingPackagesEvaluator
          baseClicks={clicks}
          baseClickToReg={clickToReg}
          baseRegToFtd={regToFtd}
          avgDeposit={avgDeposit}
          monthlyGgrPerPlayer={monthlyGgrPerPlayer}
          churnRate={churnRate}
          marginLeakagePct={marginLeakagePct}
          cpaAmount={cpaAmount}
          revSharePct={revSharePct}
          cplAmount={cplAmount}
          isTieredRevShare={isTieredRevShare}
          setClicks={setClicks}
          setClickToReg={setClickToReg}
          setRegToFtd={setRegToFtd}
          setAvgDeposit={setAvgDeposit}
        />
      )}
    </div>
  );
};
