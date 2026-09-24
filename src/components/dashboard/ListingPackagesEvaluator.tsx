import React, { useState, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, TrendingDown, Coins, Users, Percent, Award,
  AlertTriangle, Info, CheckCircle, Activity, Layers, ArrowRight, Sparkles, Clock, Calendar, Upload, Database, ChevronDown, ChevronUp, Loader2, Image as ImageIcon,
  Clipboard, Printer, X
} from 'lucide-react';

interface PackageConfig {
  name: string;
  cost: number;
  delayMonths: number;
  boostMultiplier: number;
  boostDurationMonths: number;
  crLiftPct: number;
  promoClicks: number;
  color: string;
  borderColor: string;
  badgeBg: string;
  textGlow: string;
}

const DEFAULT_PACKAGES: PackageConfig[] = [
  {
    name: 'Basic',
    cost: 0,
    delayMonths: 9.0, // 6-12 months (avg 9)
    boostMultiplier: 1.0,
    boostDurationMonths: 0,
    crLiftPct: 0,
    promoClicks: 0,
    color: 'from-slate-600 to-slate-800',
    borderColor: 'border-slate-800',
    badgeBg: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    textGlow: 'text-slate-400'
  },
  {
    name: 'Plus',
    cost: 2500,
    delayMonths: 1.5, // up to 45 days
    boostMultiplier: 1.3, // top 50 boost
    boostDurationMonths: 0.5, // 2 weeks
    crLiftPct: 0,
    promoClicks: 0,
    color: 'from-blue-600 to-blue-800',
    borderColor: 'border-blue-500/30',
    badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    textGlow: 'text-blue-400'
  },
  {
    name: 'Advanced',
    cost: 3500,
    delayMonths: 0.7, // up to 21 days
    boostMultiplier: 1.8, // top 25 boost
    boostDurationMonths: 1.0, // 1 month
    crLiftPct: 10, // Highlight 2 weeks
    promoClicks: 800, // Twitter + Telegram
    color: 'from-indigo-600 to-indigo-800',
    borderColor: 'border-indigo-500/40',
    badgeBg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    textGlow: 'text-indigo-400'
  },
  {
    name: 'Ultimate',
    cost: 6000,
    delayMonths: 0.2, // up to 7 days
    boostMultiplier: 2.5, // top 15 boost
    boostDurationMonths: 1.0, // 1 month
    crLiftPct: 20, // Highlight 1 month + news + newsletter
    promoClicks: 2500, // Twitter + Telegram + News + Newsletter
    color: 'from-amber-600 to-purple-800',
    borderColor: 'border-amber-500/50',
    badgeBg: 'bg-gradient-to-r from-amber-500/10 to-purple-500/10 text-amber-400 border-amber-500/30',
    textGlow: 'text-amber-400'
  }
];

// Screenshot 1: Nov 2024 Launch Phase Mock Data
const NOV_2024_MOCK = [
  { source: 'BFC (Basic Featured)', clicks: 94, regs: 25, ftds: 13, deposits: 1081.07 },
  { source: 'freak (Promo Highlight)', clicks: 72, regs: 11, ftds: 8, deposits: 1511.76 },
  { source: 'NFSB (Geo Target)', clicks: 17, regs: 3, ftds: 1, deposits: 10.00 },
  { source: 'mama (Promo Content)', clicks: 11, regs: 4, ftds: 3, deposits: 123.00 },
  { source: 'lists (Basic Unpaid)', clicks: 3, regs: 0, ftds: 0, deposits: 0 },
  { source: 'mate (Basic Unpaid)', clicks: 3, regs: 0, ftds: 0, deposits: 0 },
  { source: 'BFCem (Newsletter Blast)', clicks: 1, regs: 1, ftds: 0, deposits: 0 },
  { source: 'spin (Basic Unpaid)', clicks: 1, regs: 0, ftds: 0, deposits: 0 },
  { source: 'Other Organic Placements', clicks: 244, regs: 48, ftds: 20, deposits: 2573.35 }
];

// Screenshot 2: Aug 2025 Scale Phase Mock Data
const AUG_2025_MOCK = [
  { source: 'chipy (Main Web Page)', clicks: 5376, regs: 2648, ftds: 41, deposits: 12854.89 },
  { source: 'nsb (Partner Placement)', clicks: 2819, regs: 1261, ftds: 17, deposits: 2637.69 },
  { source: 'mate (Partner Placement)', clicks: 1903, regs: 818, ftds: 17, deposits: 3960.67 },
  { source: 'chipyEM (Newsletter Blast)', clicks: 1291, regs: 368, ftds: 3, deposits: 341.58 },
  { source: 'lists (Basic Unpaid)', clicks: 561, regs: 221, ftds: 5, deposits: 372.44 },
  { source: 'freak (Promo Highlight)', clicks: 554, regs: 98, ftds: 8, deposits: 1224.67 },
  { source: 'glab (High Roller Lobby)', clicks: 441, regs: 209, ftds: 4, deposits: 2513.43 },
  { source: 'mama (Promo Content)', clicks: 140, regs: 33, ftds: 5, deposits: 543.29 },
  { source: 'nsbEM (Newsletter Blast)', clicks: 14, regs: 6, ftds: 1, deposits: 216.14 },
  { source: 'EUltimate (Ultimate Placement)', clicks: 8, regs: 3, ftds: 3, deposits: 207.16 },
  { source: 'Other Placements', clicks: 130, regs: 13, ftds: 1, deposits: 31.13 }
];

interface ListingPackagesEvaluatorProps {
  baseClicks: number;
  baseClickToReg: number;
  baseRegToFtd: number;
  avgDeposit: number;
  monthlyGgrPerPlayer: number;
  churnRate: number;
  marginLeakagePct: number;
  cpaAmount: number;
  revSharePct: number;
  cplAmount: number;
  isTieredRevShare: boolean;
  setClicks: (clicks: number) => void;
  setClickToReg: (cr: number) => void;
  setRegToFtd: (cr: number) => void;
  setAvgDeposit: (deposit: number) => void;
}

export const ListingPackagesEvaluator: React.FC<ListingPackagesEvaluatorProps> = ({
  baseClicks,
  baseClickToReg,
  baseRegToFtd,
  avgDeposit,
  monthlyGgrPerPlayer,
  churnRate,
  marginLeakagePct,
  cpaAmount,
  revSharePct,
  cplAmount,
  isTieredRevShare,
  setClicks,
  setClickToReg,
  setRegToFtd,
  setAvgDeposit
}) => {
  const { format: formatCurrency } = useCurrency();
  const [packages, setPackages] = useState<PackageConfig[]>(DEFAULT_PACKAGES);
  const [chartMetric, setChartMetric] = useState<'profit' | 'clicks' | 'ftds'>('profit');

  // Upload Wizard UI state
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  // OCR Parsing States
  const [isParsingImage, setIsParsingImage] = useState<boolean>(false);
  const [imageParseError, setImageParseError] = useState<string | null>(null);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [activeFileCount, setActiveFileCount] = useState<number>(0);

  const [importedData, setImportedData] = useState<{
    name: string;
    clicks: number;
    regs: number;
    ftds: number;
    deposits: number;
    sources: { source: string; clicks: number; regs: number; ftds: number; deposits: number }[];
  } | null>(null);

  // Load standard template or reset
  const handleReset = () => {
    setPackages(JSON.parse(JSON.stringify(DEFAULT_PACKAGES)));
    setImportedData(null);
    setImagePreviews([]);
    setImageParseError(null);
  };

  // Update a specific package config field
  const updatePackageField = (index: number, field: keyof PackageConfig, value: any) => {
    setPackages(prev => prev.map((pkg, i) => i === index ? { ...pkg, [field]: value } : pkg));
  };

  // Load Mock Template datasets based on screenshots
  const loadPresetTemplate = (type: 'nov_2024' | 'aug_2025') => {
    setImagePreviews([]);
    setImageParseError(null);
    if (type === 'nov_2024') {
      setImportedData({
        name: 'Screenshot Preset (Nov 2024 - Launch)',
        clicks: 446,
        regs: 92,
        ftds: 45,
        deposits: 5299.18,
        sources: NOV_2024_MOCK
      });
    } else {
      setImportedData({
        name: 'Screenshot Preset (Aug 2025 - Scaled)',
        clicks: 13237,
        regs: 5696,
        ftds: 105,
        deposits: 24903.09,
        sources: AUG_2025_MOCK
      });
    }
  };

  // Custom CSV Parsing using PapaParse
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImagePreviews([]);
    setImageParseError(null);

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[];
        let totalClicks = 0;
        let totalRegs = 0;
        let totalFtds = 0;
        let totalDeposits = 0;
        const parsedSources: typeof NOV_2024_MOCK = [];

        rows.forEach(row => {
          const source = row['Tracking Code'] || row['Marketing Source'] || row['source'] || row['Media Item'] || 'Unknown';
          const clicks = Number(row['Unique Visitors'] || row['Uniq Clicks'] || row['clicks'] || row['Clicks'] || row['UNIQ CLICKS'] || 0);
          const regs = Number(row['Registrations'] || row['Reg. Count'] || row['regs'] || row['Regs'] || row['REG. COUNT'] || 0);
          const ftds = Number(row['FTD'] || row['FTD Count'] || row['ftds'] || row['Ftds'] || row['FTD COUNT'] || 0);
          
          let depositsVal = 0;
          const rawDeposits = row['Deposits'] || row['deposits'] || row['Deposits'] || row['DEPOSITS'] || 0;
          if (typeof rawDeposits === 'string') {
            depositsVal = Number(rawDeposits.replace(/[^0-9.-]/g, ''));
          } else {
            depositsVal = Number(rawDeposits);
          }

          if (clicks > 0 || regs > 0 || ftds > 0 || depositsVal > 0) {
            totalClicks += clicks;
            totalRegs += regs;
            totalFtds += ftds;
            totalDeposits += depositsVal;

            parsedSources.push({
              source,
              clicks,
              regs,
              ftds,
              deposits: depositsVal
            });
          }
        });

        if (totalClicks > 0) {
          setImportedData({
            name: file.name,
            clicks: totalClicks,
            regs: totalRegs,
            ftds: totalFtds,
            deposits: totalDeposits,
            sources: parsedSources
          });
        }
      }
    });
  };

  // Image upload and Parallel Multimodal OCR parsing using Vercel AI SDK + Gemini
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsParsingImage(true);
    setImageParseError(null);
    setImportedData(null);
    setActiveFileCount(files.length);

    // Create image preview URLs
    const previewUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      previewUrls.push(URL.createObjectURL(files[i]));
    }
    setImagePreviews(previewUrls);

    // Map each file to an AI parser promise
    const parsePromises = Array.from(files).map((file) => {
      return new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64String = reader.result as string;
          const base64Data = base64String.split(',')[1];
          const mimeType = file.type;

          try {
            const apiKey = (import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY || "").trim();
            if (!apiKey) {
              throw new Error("Missing Google API Key. Please configure VITE_GOOGLE_GENERATIVE_AI_API_KEY in your .env.local file to enable image parsing.");
            }

            const google = createGoogleGenerativeAI({ apiKey });

            const prompt = `
              You are an expert iGaming data analyst.
              Your task is to scan this screenshot of an affiliate performance report table and extract all metrics.
              Identify:
              - Unique Visitors or Unique Clicks (we refer to these as 'clicks')
              - Registrations or Registration Count (we refer to these as 'regs')
              - First Time Depositors (FTDs or FTD Count)
              - Deposit amounts (parse currency symbols like €, $, £ and extract numbers)
              
              Also extract the breakdown by individual tracking codes or marketing sources (e.g. chipy, nsb, lists, freak, glab, etc.).
              
              You MUST output your response as a single, valid JSON block in this exact structure:
              \`\`\`json
              {
                "clicks": 13237,
                "regs": 5696,
                "ftds": 105,
                "deposits": 24903.09,
                "sources": [
                  { "source": "chipy", "clicks": 5376, "regs": 2648, "ftds": 41, "deposits": 12854.89 },
                  ...
                ]
              }
              \`\`\`
              
              Do not add any text outside of the JSON block. Output ONLY the JSON block.
            `;

            const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
            let lastError = null;
            let success = false;
            let text = "";

            for (const modelId of modelsToTry) {
              try {
                const result = await generateText({
                  model: google(modelId),
                  messages: [
                    {
                      role: 'user',
                      content: [
                        { type: 'text', text: prompt },
                        { type: 'image', image: base64Data, mimeType }
                      ]
                    }
                  ]
                });
                text = result.text;
                success = true;
                break;
              } catch (err: any) {
                console.warn(`ListingPackagesEvaluator OCR: ${modelId} failed:`, err.message);
                lastError = err;
                if (err.message?.includes("401") || err.message?.includes("API key")) throw err;
              }
            }

            if (!success) {
              throw lastError || new Error("All models failed");
            }

            const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*?}/);
            if (jsonMatch) {
              const rawJson = jsonMatch[1] || jsonMatch[0];
              const parsed = JSON.parse(rawJson.trim());
              resolve(parsed);
            } else {
              reject(new Error("Could not extract structured JSON block from model response. Ensure columns are visible."));
            }

          } catch (err: any) {
            reject(err);
          }
        };

        reader.onerror = () => reject(new Error("Failed to read image file."));
        reader.readAsDataURL(file);
      });
    });

    // Run all image parser promises in parallel
    Promise.all(parsePromises)
      .then((results) => {
        let aggregatedClicks = 0;
        let aggregatedRegs = 0;
        let aggregatedFtds = 0;
        let aggregatedDeposits = 0;
        
        // Consolidate identical tracking placements across files
        const sourcesMap = new Map<string, { clicks: number; regs: number; ftds: number; deposits: number }>();

        results.forEach((parsed) => {
          aggregatedClicks += Number(parsed.clicks || 0);
          aggregatedRegs += Number(parsed.regs || 0);
          aggregatedFtds += Number(parsed.ftds || 0);
          aggregatedDeposits += Number(parsed.deposits || 0);

          if (Array.isArray(parsed.sources)) {
            parsed.sources.forEach((src: any) => {
              const name = String(src.source || 'Unknown').trim();
              const c = Number(src.clicks || 0);
              const r = Number(src.regs || 0);
              const f = Number(src.ftds || 0);
              const d = Number(src.deposits || 0);

              const existing = sourcesMap.get(name);
              if (existing) {
                sourcesMap.set(name, {
                  clicks: existing.clicks + c,
                  regs: existing.regs + r,
                  ftds: existing.ftds + f,
                  deposits: existing.deposits + d
                });
              } else {
                sourcesMap.set(name, { clicks: c, regs: r, ftds: f, deposits: d });
              }
            });
          }
        });

        const consolidatedSources = Array.from(sourcesMap.entries()).map(([source, metrics]) => ({
          source,
          ...metrics
        }));

        setImportedData({
          name: `${files.length} Report Screenshots Combined`,
          clicks: aggregatedClicks,
          regs: aggregatedRegs,
          ftds: aggregatedFtds,
          deposits: aggregatedDeposits,
          sources: consolidatedSources
        });
      })
      .catch((err: any) => {
        console.error("Multi-Image Aggregator Error:", err);
        setImageParseError(err.message || "Failed to scan one or more screenshots. Ensure tables are clear.");
      })
      .finally(() => {
        setIsParsingImage(false);
      });
  };

  // Apply parsed metrics to animate sliders
  const applyImportedMetrics = () => {
    if (!importedData) return;
    
    const calculatedCr1 = importedData.clicks > 0 ? (importedData.regs / importedData.clicks) * 100 : baseClickToReg;
    const calculatedCr2 = importedData.regs > 0 ? (importedData.ftds / importedData.regs) * 100 : baseRegToFtd;
    const calculatedAvgDeposit = importedData.ftds > 0 ? (importedData.deposits / importedData.ftds) : avgDeposit;
    
    // Animate parent state hooks
    setClicks(importedData.clicks);
    setClickToReg(Number(calculatedCr1.toFixed(1)));
    setRegToFtd(Number(calculatedCr2.toFixed(1)));
    setAvgDeposit(Number(calculatedAvgDeposit.toFixed(0)));

    setIsWizardOpen(false); // Close panel on success
  };

  // 12-Month Projection calculations for each package
  const packageProjections = useMemo(() => {
    return packages.map((pkg, index) => {
      let cumulativeFTDs = 0;
      let activePlayerPool: { monthAcquired: number; count: number }[] = [];
      const monthlyData = [];

      let totalClicks12m = 0;
      let totalFtds12m = 0;
      let totalGgr12m = 0;
      let totalNgr12m = 0;
      let totalCommissionsPaid12m = 0;
      let cumulativeOperatorProfit = 0;

      const getTieredRevShareRate = (ftdCount: number) => {
        if (ftdCount <= 10) return 25;
        if (ftdCount <= 30) return 30;
        if (ftdCount <= 50) return 35;
        return 40;
      };

      let idealFtds12m = 0;
      let idealNgr12m = 0;
      let idealActivePool: { monthAcquired: number; count: number }[] = [];
      
      const normalLtvNgr = (monthlyGgrPerPlayer * Math.min(24, Math.round(100 / (churnRate || 1)))) * ((100 - marginLeakagePct) / 100);

      for (let month = 1; month <= 12; month++) {
        // --- 1. Ideal Path (No Launch Delay) ---
        const idealClicks = baseClicks;
        const idealFtds = Math.round(idealClicks * (baseClickToReg / 100) * (baseRegToFtd / 100));
        idealFtds12m += idealFtds;
        idealActivePool.push({ monthAcquired: month, count: idealFtds });
        
        let idealActiveCount = 0;
        idealActivePool = idealActivePool.map(cohort => {
          const monthsActive = month - cohort.monthAcquired + 1;
          const active = cohort.count * Math.pow(1 - (churnRate / 100), monthsActive - 1);
          idealActiveCount += active;
          return cohort;
        });
        const idealGgr = idealActiveCount * monthlyGgrPerPlayer;
        idealNgr12m += idealGgr * ((100 - marginLeakagePct) / 100);

        // --- 2. Actual Path (With Launch Delay & Boosts) ---
        const tStart = month - 1 - pkg.delayMonths;
        const tEnd = month - pkg.delayMonths;
        const fActive = Math.max(0, Math.min(1, tEnd) - Math.max(0, tStart));

        let clicksThisMonth = 0;
        let conversionsLiftFactor = 1.0;

        if (fActive > 0) {
          const fBoost = Math.max(0, Math.min(pkg.boostDurationMonths, tEnd) - Math.max(0, tStart));
          const fNormal = fActive - fBoost;

          clicksThisMonth = baseClicks * (fBoost * pkg.boostMultiplier + fNormal * 1.0);

          const firstActiveMonth = Math.ceil(pkg.delayMonths);
          if (month === firstActiveMonth) {
            clicksThisMonth += pkg.promoClicks;
          }

          const crLiftMultiplier = 1 + (pkg.crLiftPct / 100);
          const boostedCr = baseClickToReg * crLiftMultiplier;
          const normalCr = baseClickToReg;
          const avgClickToReg = (fBoost * boostedCr + fNormal * normalCr) / fActive;

          const boostedRegToFtd = baseRegToFtd * crLiftMultiplier;
          const normalRegToFtd = baseRegToFtd;
          const avgRegToFtd = (fBoost * boostedRegToFtd + fNormal * normalRegToFtd) / fActive;

          conversionsLiftFactor = (avgClickToReg / baseClickToReg) * (avgRegToFtd / baseRegToFtd);
        }

        const ftdsThisMonth = fActive > 0 ? Math.round(clicksThisMonth * (baseClickToReg / 100) * (baseRegToFtd / 100) * conversionsLiftFactor) : 0;

        totalClicks12m += clicksThisMonth;
        totalFtds12m += ftdsThisMonth;
        
        if (ftdsThisMonth > 0) {
          activePlayerPool.push({ monthAcquired: month, count: ftdsThisMonth });
        }

        let totalActiveThisMonth = 0;
        activePlayerPool = activePlayerPool.map(cohort => {
          const monthsActive = month - cohort.monthAcquired + 1;
          const activeCount = cohort.count * Math.pow(1 - (churnRate / 100), monthsActive - 1);
          totalActiveThisMonth += activeCount;
          return { ...cohort, currentActive: activeCount };
        }).filter(c => c.currentActive > 0.1);

        const monthlyGGR = totalActiveThisMonth * monthlyGgrPerPlayer;
        const monthlyNGR = monthlyGGR * ((100 - marginLeakagePct) / 100);

        totalGgr12m += monthlyGGR;
        totalNgr12m += monthlyNGR;

        const monthlyCplCost = ftdsThisMonth * cplAmount;
        const currentRevShareRate = isTieredRevShare ? getTieredRevShareRate(ftdsThisMonth) : revSharePct;
        const monthlyRsCost = monthlyNGR * (currentRevShareRate / 100);
        const monthlyCpaCost = ftdsThisMonth * cpaAmount;

        const monthlyCommissions = monthlyCplCost + monthlyRsCost + monthlyCpaCost;
        totalCommissionsPaid12m += monthlyCommissions;

        const packageOutflow = (month === 1) ? pkg.cost : 0;
        const netCashflow = monthlyNGR - monthlyCommissions - packageOutflow;
        cumulativeOperatorProfit += netCashflow;

        monthlyData.push({
          month: `M${month}`,
          clicks: Math.round(clicksThisMonth),
          ftds: ftdsThisMonth,
          ngr: Math.round(monthlyNGR),
          profit: Math.round(cumulativeOperatorProfit),
          commissions: Math.round(monthlyCommissions),
          outflow: Math.round(packageOutflow + monthlyCommissions),
        });
      }

      const totalCost = pkg.cost + totalCommissionsPaid12m;
      const roi = totalCost > 0 ? (cumulativeOperatorProfit / totalCost) * 100 : 0;

      let breakEven = null;
      for (let i = 0; i < monthlyData.length; i++) {
        if (monthlyData[i].profit > 0) {
          breakEven = i + 1;
          break;
        }
      }

      const lostFtds = Math.max(0, idealFtds12m - totalFtds12m);
      const opportunityCostRev = lostFtds * normalLtvNgr;

      return {
        pkg,
        index,
        monthlyData,
        totalClicks: totalClicks12m,
        totalFtds: totalFtds12m,
        totalGgr: totalGgr12m,
        totalNgr: totalNgr12m,
        totalCommissions: totalCommissionsPaid12m,
        totalCost,
        netProfit: cumulativeOperatorProfit,
        roi,
        breakEven,
        opportunityCostRev,
        lostFtds
      };
    });
  }, [packages, baseClicks, baseClickToReg, baseRegToFtd, monthlyGgrPerPlayer, churnRate, marginLeakagePct, cpaAmount, revSharePct, cplAmount, isTieredRevShare]);

  // Combine monthly projections for the chart
  const chartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => `M${i + 1}`);
    return months.map((m, idx) => {
      const dataPoint: any = { month: m };
      packageProjections.forEach(proj => {
        const monthVal = proj.monthlyData[idx];
        if (chartMetric === 'profit') {
          dataPoint[proj.pkg.name] = monthVal.profit;
        } else if (chartMetric === 'clicks') {
          dataPoint[proj.pkg.name] = monthVal.clicks;
        } else if (chartMetric === 'ftds') {
          dataPoint[proj.pkg.name] = monthVal.ftds;
        }
      });
      return dataPoint;
    });
  }, [packageProjections, chartMetric]);

  // Determine the "Genie's Choice" (Highest Net Profit or ROI)
  const bestPackage = useMemo(() => {
    let best = packageProjections[0];
    packageProjections.forEach(proj => {
      if (proj.netProfit > best.netProfit) {
        best = proj;
      }
    });
    return best;
  }, [packageProjections]);

  const copyMarkdownReport = () => {
    const baselineCr = (baseClickToReg * baseRegToFtd / 100).toFixed(2);
    const baselineLtv = monthlyGgrPerPlayer * Math.min(24, Math.round(100 / (churnRate || 1)));
    const normalLtvNgr = baselineLtv * ((100 - marginLeakagePct) / 100);
    
    let textStr = `# EXECUTIVE MEDIA LISTING PACKAGE AUDIT REPORT\n`;
    textStr += `*Generated dynamically from Budget Genie - Affiliate Deal Evaluator*\n\n`;
    
    textStr += `## Baseline Assumptions\n`;
    textStr += `- **Baseline Monthly Clicks**: ${baseClicks.toLocaleString()}\n`;
    textStr += `- **Conversion Funnel**: Click-to-Reg: ${baseClickToReg}% | Reg-to-FTD: ${baseRegToFtd}% (Blended: ${baselineCr}%)\n`;
    textStr += `- **Player LTV (NGR)**: ${formatCurrency(normalLtvNgr)} (GGR: ${formatCurrency(baselineLtv)} | Churn: ${churnRate}%)\n`;
    textStr += `- **Current Contract Model**: ${cpaAmount > 0 ? `${formatCurrency(cpaAmount)} CPA` : ''} ${revSharePct > 0 ? `+ ${revSharePct}% RS` : ''} ${cplAmount > 0 ? `+ ${formatCurrency(cplAmount)} CPL` : ''}\n\n`;
    
    textStr += `## Side-by-Side Package Comparison (12 Months)\n\n`;
    textStr += `| Metric | ${packages.map(p => p.name + ' Tier').join(' | ')} |\n`;
    textStr += `| :--- | ${packages.map(() => ':---:').join(' | ')} |\n`;
    
    textStr += `| **Upfront Fee** | ${packageProjections.map(p => p.pkg.cost === 0 ? '€0' : formatCurrency(p.pkg.cost)).join(' | ')} |\n`;
    textStr += `| **Launch Delay** | ${packageProjections.map(p => p.pkg.delayMonths.toFixed(1) + ' Months').join(' | ')} |\n`;
    textStr += `| **12M Clicks** | ${packageProjections.map(p => Math.round(p.totalClicks).toLocaleString()).join(' | ')} |\n`;
    textStr += `| **12M FTDs** | ${packageProjections.map(p => p.totalFtds).join(' | ')} |\n`;
    textStr += `| **Opportunity Cost** | ${packageProjections.map(p => '-' + formatCurrency(p.opportunityCostRev)).join(' | ')} |\n`;
    textStr += `| **12M Net Profit** | ${packageProjections.map(p => formatCurrency(p.netProfit)).join(' | ')} |\n`;
    textStr += `| **Operator ROI** | ${packageProjections.map(p => p.roi.toFixed(0) + '%').join(' | ')} |\n`;
    textStr += `| **Break-Even Month** | ${packageProjections.map(p => p.breakEven ? 'Month ' + p.breakEven : 'Never').join(' | ')} |\n\n`;
    
    textStr += `## Executive Summary & Verdict\n`;
    if (bestPackage) {
      textStr += `Our audit recommends selecting the **${bestPackage.pkg.name} Tier**.\n\n`;
      textStr += `- **Why**: Over 12 months, this tier yields **${formatCurrency(bestPackage.netProfit)}** in net operator profit with an ROI of **${bestPackage.roi.toFixed(0)}%**.\n`;
      if (bestPackage.pkg.delayMonths > 0) {
        textStr += `- **Launch Delay Cost**: The ${bestPackage.pkg.delayMonths.toFixed(1)} month delay cost you **${formatCurrency(bestPackage.opportunityCostRev)}** in lost potential revenue (Opportunity Cost), but this is offset by the package's exposure boosts.\n`;
      }
      textStr += `- **Action Item**: Upfront sponsorship fees pay off heavily by bypassing launch queues and compounding cohort revenue early.\n`;
    }
    
    navigator.clipboard.writeText(textStr);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  return (
    <div className="space-y-6 text-white animate-fade-in">
      
      {/* SECTION HEADER & CONTROL BUTTONS */}
      <Card className="bg-slate-900/40 backdrop-blur-xl border border-indigo-500/10">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Layers className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-bold text-white tracking-tight">Affiliate Media Listing Packages Evaluator</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Evaluate upfront tenancy package fees side-by-side. Calculate how launch delays and exposure boosts impact your cumulative GGR and ROI.
              </p>
            </div>
            
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsReportOpen(true)}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)] border border-emerald-500/20"
              >
                <Award className="h-3.5 w-3.5" />
                Generate Executive Report
              </button>
              
              <button
                onClick={() => setIsWizardOpen(!isWizardOpen)}
                className="px-3 py-1.5 rounded-md bg-indigo-650 hover:bg-indigo-700 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 shadow-[0_0_12px_rgba(99,102,241,0.2)] border border-indigo-500/20"
              >
                <Database className="h-3.5 w-3.5" />
                {isWizardOpen ? 'Hide Importer' : 'Real-World Performance Importer'}
                {isWizardOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              
              <button
                onClick={handleReset}
                className="px-3 py-1.5 rounded-md bg-slate-950 hover:bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors"
              >
                Reset to Green Tree Presets
              </button>
            </div>
          </div>
          
          <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-md mt-4 flex items-center justify-between gap-4 flex-wrap text-xs text-indigo-300/90">
            <span className="flex items-center gap-1.5">
              <Info className="h-4 w-4 text-indigo-400 shrink-0" />
              <strong>Shared Quality Baseline:</strong> Baseline clicks: <span className="font-mono text-white">{baseClicks.toLocaleString()}</span> | CR: <span className="font-mono text-white">{(baseClickToReg * baseRegToFtd / 100).toFixed(2)}%</span> | LTV: <span className="font-mono text-white">{formatCurrency(monthlyGgrPerPlayer * Math.min(24, Math.round(100 / (churnRate || 1))))}</span> | Churn: <span className="font-mono text-white">{churnRate}%</span>
            </span>
            <span className="font-semibold text-indigo-400 font-mono">
              Deal: {cpaAmount > 0 ? `${formatCurrency(cpaAmount)} CPA` : ''} {revSharePct > 0 ? `+ ${revSharePct}% RS` : ''} {cplAmount > 0 ? `+ ${formatCurrency(cplAmount)} CPL` : ''}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* REAL-WORLD DATA IMPORT WIZARD PANEL */}
      {isWizardOpen && (
        <Card className="bg-slate-900/70 border border-indigo-500/30 backdrop-blur-xl animate-slide-in relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-sky-500 to-purple-500"></div>
          
          {/* Visual Loading Overlay for AI Image parsing */}
          {isParsingImage && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-white">Genie AI OCR Scanning {activeFileCount} Screenshots...</p>
                <p className="text-xs text-slate-400 max-w-md">Running OCR extraction in parallel. Consolidating click counts, registrations, and deposits.</p>
              </div>
            </div>
          )}

          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5">
              <Database className="h-4.5 w-4.5 text-indigo-400" />
              Real-World Affiliate Performance Log & Screenshot Importer
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Drag-and-drop CSV logs, load preset screenshot templates, or upload multiple screenshot images to parse and aggregate affiliate report metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Section: Inputs & Loaders */}
              <div className="lg:col-span-4 space-y-4">
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Preloaded screenshot data</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadPresetTemplate('nov_2024')}
                      className="flex-1 px-2.5 py-2 rounded bg-slate-950 hover:bg-slate-900 border border-slate-800 text-[11px] font-medium text-slate-300 transition-colors flex flex-col items-center gap-1"
                    >
                      <span className="text-[10px] text-slate-500">Preset 1</span>
                      <strong className="text-indigo-400">Nov 2024 Launch</strong>
                    </button>
                    <button
                      onClick={() => loadPresetTemplate('aug_2025')}
                      className="flex-1 px-2.5 py-2 rounded bg-slate-950 hover:bg-slate-900 border border-slate-800 text-[11px] font-medium text-slate-300 transition-colors flex flex-col items-center gap-1"
                    >
                      <span className="text-[10px] text-slate-500">Preset 2</span>
                      <strong className="text-indigo-400">Aug 2025 Scale</strong>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Upload CSV files</span>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-16 border border-dashed border-slate-800 hover:border-indigo-500/50 rounded-lg flex flex-col items-center justify-center p-2 bg-slate-950/40 transition-colors group text-center"
                    >
                      <Upload className="h-4.5 w-4.5 text-slate-500 group-hover:text-indigo-400 mb-1" />
                      <span className="text-[10px] font-semibold text-slate-300 group-hover:text-white">CSV Log</span>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleCsvUpload} 
                        accept=".csv" 
                        className="hidden" 
                      />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Upload Screenshots</span>
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      className="w-full h-16 border border-dashed border-slate-800 hover:border-indigo-500/50 rounded-lg flex flex-col items-center justify-center p-2 bg-slate-950/40 transition-colors group text-center"
                    >
                      <ImageIcon className="h-4.5 w-4.5 text-slate-500 group-hover:text-indigo-400 mb-1" />
                      <span className="text-[10px] font-semibold text-slate-300 group-hover:text-white">Multiple Images</span>
                      <input 
                        type="file" 
                        ref={imageInputRef} 
                        onChange={handleImageUpload} 
                        accept="image/*" 
                        multiple 
                        className="hidden" 
                      />
                    </button>
                  </div>
                </div>

                {imageParseError && (
                  <div className="p-2.5 rounded bg-red-500/5 border border-red-500/20 text-[10px] text-red-400 leading-normal flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                    <span>{imageParseError}</span>
                  </div>
                )}

                {importedData && (
                  <button
                    onClick={applyImportedMetrics}
                    className="w-full py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-xs font-bold text-white transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] flex items-center justify-center gap-1.5"
                  >
                    <Activity className="h-4 w-4 animate-pulse" />
                    Apply Performance to Sliders
                  </button>
                )}
              </div>

              {/* Middle Section: Calculated Baselines */}
              <div className="lg:col-span-4 bg-slate-950 border border-slate-850 rounded-lg p-4 flex flex-col justify-between relative overflow-hidden">
                {imagePreviews.length > 0 && (
                  <div className="absolute top-2 right-2 flex gap-1 z-20 max-w-[120px] overflow-x-auto custom-scrollbar p-0.5 bg-slate-950/80 rounded border border-slate-900">
                    {imagePreviews.map((url, i) => (
                      <img 
                        key={i}
                        src={url} 
                        alt={`Upload preview ${i + 1}`} 
                        className="h-6 w-9 object-cover rounded border border-slate-800 hover:scale-250 transition-transform origin-top-right cursor-zoom-in shrink-0"
                        title={`Screenshot ${i + 1} Preview`}
                      />
                    ))}
                  </div>
                )}
                
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3">Calculated Yield Metrics</span>
                  {importedData ? (
                    <div className="space-y-3 font-mono">
                      <div className="flex justify-between border-b border-slate-900 pb-1.5">
                        <span className="text-slate-400 text-xs font-sans">Active Source:</span>
                        <span className="text-indigo-300 text-xs text-right truncate max-w-[140px]">{importedData.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs font-sans">Total Clicks:</span>
                        <span className="text-white text-xs">{importedData.clicks.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs font-sans">Click-to-Reg CR:</span>
                        <span className="text-white text-xs">{(importedData.clicks > 0 ? (importedData.regs / importedData.clicks) * 100 : 0).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs font-sans">Reg-to-FTD CR:</span>
                        <span className="text-white text-xs">{(importedData.regs > 0 ? (importedData.ftds / importedData.regs) * 100 : 0).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-xs font-sans">Avg Player Deposit:</span>
                        <span className="text-emerald-400 text-xs">{formatCurrency(importedData.ftds > 0 ? (importedData.deposits / importedData.ftds) : 0)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t border-slate-900 pt-2 text-sm">
                        <span className="text-slate-300 font-sans">Total Deposits:</span>
                        <span className="text-white">{formatCurrency(importedData.deposits)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-xs py-8 text-center leading-normal">
                      No dataset loaded yet. Load a template or upload multiple screenshots to aggregate metrics.
                    </div>
                  )}
                </div>
                {importedData && (
                  <p className="text-[10px] text-slate-500 leading-normal mt-3 bg-slate-900/50 p-2 rounded">
                    💡 Clicking **"Apply"** will automatically configure the global baseline clicks, CRs, and deposit sizes. The estimations below will adjust dynamically to reflect this aggregated traffic value.
                  </p>
                )}
              </div>

              {/* Right Section: Mapped Placements List */}
              <div className="lg:col-span-4 bg-slate-950 border border-slate-850 rounded-lg p-4 flex flex-col h-full max-h-[220px]">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Consolidated placements</span>
                <div className="overflow-y-auto flex-1 custom-scrollbar text-xs">
                  {importedData ? (
                    <table className="w-full text-left font-mono">
                      <thead>
                        <tr className="text-slate-500 text-[10px] border-b border-slate-900">
                          <th className="pb-1 font-sans">Source</th>
                          <th className="pb-1 text-right font-sans">Clicks</th>
                          <th className="pb-1 text-right font-sans">FTD</th>
                          <th className="pb-1 text-right font-sans">Deposits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importedData.sources.map((src, i) => (
                          <tr key={i} className="border-b border-slate-900/50 hover:bg-slate-900/30">
                            <td className="py-1 max-w-[120px] truncate text-slate-300 font-sans">{src.source}</td>
                            <td className="py-1 text-right text-slate-400">{src.clicks}</td>
                            <td className="py-1 text-right text-indigo-300">{src.ftds}</td>
                            <td className="py-1 text-right text-emerald-400">{src.deposits > 0 ? formatCurrency(src.deposits, true) : '€0'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500 text-center leading-normal py-8">
                      Select data to view consolidated tracking code conversions.
                    </div>
                  )}
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      )}

      {/* GENIE'S RECOMMENDATION BOARD */}
      {bestPackage && (
        <Card className="border border-amber-500/30 bg-gradient-to-r from-amber-500/5 via-amber-500/10 to-indigo-500/5 relative overflow-hidden shadow-[0_0_15px_rgba(245,158,11,0.1)]">
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full filter blur-3xl -translate-y-24 translate-x-24"></div>
          <CardContent className="pt-6 relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-amber-500 text-slate-950 flex items-center gap-1 w-fit animate-pulse">
                <Sparkles className="h-3 w-3" />
                Genie's Choice Recommendation
              </span>
              <h4 className="text-xl font-bold text-white">
                Purchase the <span className="text-amber-400 font-extrabold">{bestPackage.pkg.name} Tier</span> Package Deal
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                Evaluating launch delay, click multipliers, and upfront listing fees shows the <strong className="text-white">{bestPackage.pkg.name} package</strong> generates the highest 12-month net profit of <strong className="text-emerald-400 font-mono">{formatCurrency(bestPackage.netProfit)}</strong> (ROI: <strong className="text-amber-400 font-mono">{bestPackage.roi.toFixed(0)}%</strong>). 
                {bestPackage.pkg.delayMonths > 0.5 && ` Even with an upfront fee of ${formatCurrency(bestPackage.pkg.cost)}, its early launch timeline avoids the massive opportunity cost of waiting months to go live.`}
                {bestPackage.pkg.delayMonths <= 0.5 && ` Getting live in ${Math.round(bestPackage.pkg.delayMonths * 30)} days combined with the ${bestPackage.pkg.boostMultiplier}x traffic boost offsets the listing fee and drives break-even by Month ${bestPackage.breakEven || 'N/A'}.`}
              </p>
            </div>
            
            <div className="flex gap-4 border-l border-white/10 pl-6 shrink-0 font-mono">
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider">Projected Profit</p>
                <p className="text-2xl font-bold text-emerald-400">{formatCurrency(bestPackage.netProfit)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wider">Operator ROI</p>
                <p className="text-2xl font-bold text-amber-400">{bestPackage.roi.toFixed(0)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* THE 4 PACKAGES CONFIGURATION GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {packages.map((pkg, idx) => {
          const proj = packageProjections[idx];
          return (
            <Card key={pkg.name} className={`bg-slate-950 border ${pkg.borderColor} transition-all duration-300 relative overflow-hidden flex flex-col`}>
              <div className={`h-1.5 bg-gradient-to-r ${pkg.color}`}></div>
              
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-white">{pkg.name} Tier</CardTitle>
                  <CardDescription className="text-xs text-slate-400">Package Details</CardDescription>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${pkg.badgeBg}`}>
                  {pkg.cost === 0 ? 'FREE' : formatCurrency(pkg.cost)}
                </span>
              </CardHeader>
              
              <CardContent className="space-y-4 flex-1">
                
                {/* 1. Cost Input */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Coins className="h-3 w-3" /> Upfront Cost
                    </span>
                    <span className="font-mono text-white">{formatCurrency(pkg.cost)}</span>
                  </div>
                  <Slider
                    min={0} max={25000} step={250}
                    value={[pkg.cost]}
                    onValueChange={(val) => updatePackageField(idx, 'cost', val[0])}
                  />
                </div>

                {/* 2. Upload Delay Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Go-Live Delay
                    </span>
                    <span className={`font-mono ${pkg.delayMonths > 4 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {pkg.delayMonths.toFixed(1)} months
                    </span>
                  </div>
                  <Slider
                    min={0} max={12} step={0.1}
                    value={[pkg.delayMonths]}
                    onValueChange={(val) => updatePackageField(idx, 'delayMonths', val[0])}
                  />
                  <div className="text-[9px] text-slate-500 flex justify-between">
                    <span>Live now</span>
                    <span>1 yr delay</span>
                  </div>
                </div>

                {/* 3. Boost Multiplier Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Traffic Boost
                    </span>
                    <span className="font-mono text-indigo-400">{pkg.boostMultiplier.toFixed(1)}x clicks</span>
                  </div>
                  <Slider
                    min={1.0} max={5.0} step={0.1}
                    value={[pkg.boostMultiplier]}
                    onValueChange={(val) => updatePackageField(idx, 'boostMultiplier', val[0])}
                  />
                </div>

                {/* 4. Boost Duration Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Boost Duration
                    </span>
                    <span className="font-mono text-indigo-400">{pkg.boostDurationMonths.toFixed(1)} months</span>
                  </div>
                  <Slider
                    min={0} max={12} step={0.5}
                    value={[pkg.boostDurationMonths]}
                    onValueChange={(val) => updatePackageField(idx, 'boostDurationMonths', val[0])}
                  />
                </div>

                {/* 5. CR Lift Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Percent className="h-3 w-3" /> Trust CR Lift
                    </span>
                    <span className="font-mono text-emerald-400">+{pkg.crLiftPct}% CR</span>
                  </div>
                  <Slider
                    min={0} max={100} step={5}
                    value={[pkg.crLiftPct]}
                    onValueChange={(val) => updatePackageField(idx, 'crLiftPct', val[0])}
                  />
                </div>

                {/* 6. Promo Spike Clicks Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Promo Spike Clicks
                    </span>
                    <span className="font-mono text-amber-400">+{pkg.promoClicks.toLocaleString()}</span>
                  </div>
                  <Slider
                    min={0} max={10000} step={100}
                    value={[pkg.promoClicks]}
                    onValueChange={(val) => updatePackageField(idx, 'promoClicks', val[0])}
                  />
                </div>

                {/* Output Metrics Inside Card */}
                <div className="pt-3 border-t border-slate-900 text-xs font-mono space-y-1 text-slate-400">
                  <div className="flex justify-between">
                    <span>12M FTDs:</span>
                    <span className="text-white font-bold">{proj?.totalFtds}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>12M Net Profit:</span>
                    <span className={`font-bold ${proj?.netProfit > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {formatCurrency(proj?.netProfit || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Operator ROI:</span>
                    <span className="text-amber-400 font-bold">{proj?.roi.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Break-even:</span>
                    <span className="text-indigo-400 font-bold">
                      {proj?.breakEven ? `Month ${proj.breakEven}` : 'Never'}
                    </span>
                  </div>
                </div>

              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* COMPARISON CHART & OPPORTUNITY COST OF DELAY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* CUMULATIVE PROFIT LINE CHART (8 COLS) */}
        <Card className="lg:col-span-8 bg-slate-950 border border-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-200">12-Month Trend Projections</CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Track how traffic multiplier overrides, launch timelines, and upfront package fees shape your cumulative yield.
                </CardDescription>
              </div>
              <div className="flex bg-slate-900 border border-slate-850 p-0.5 rounded-md text-xs">
                <button
                  onClick={() => setChartMetric('profit')}
                  className={`px-3 py-1 rounded transition-colors ${chartMetric === 'profit' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Operator Profit
                </button>
                <button
                  onClick={() => setChartMetric('clicks')}
                  className={`px-3 py-1 rounded transition-colors ${chartMetric === 'clicks' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Monthly Clicks
                </button>
                <button
                  onClick={() => setChartMetric('ftds')}
                  className={`px-3 py-1 rounded transition-colors ${chartMetric === 'ftds' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  FTD Cohorts
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickFormatter={(val) => chartMetric === 'profit' ? formatCurrency(val, true) : val.toLocaleString()}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b' }}
                    labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                    itemStyle={{ fontSize: 12 }}
                    formatter={(value: any, name: any) => [
                      chartMetric === 'profit' ? formatCurrency(Number(value)) : Number(value).toLocaleString(),
                      name
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  
                  {packages.map((pkg, idx) => {
                    const strokeColor = idx === 0 ? '#94a3b8' : idx === 1 ? '#3b82f6' : idx === 2 ? '#6366f1' : '#f59e0b';
                    return (
                      <Line
                        key={pkg.name}
                        name={pkg.name}
                        type="monotone"
                        dataKey={pkg.name}
                        stroke={strokeColor}
                        strokeWidth={bestPackage?.pkg.name === pkg.name ? 3 : 1.8}
                        dot={{ r: bestPackage?.pkg.name === pkg.name ? 3 : 1 }}
                        activeDot={{ r: 5 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* DELAY OPPORTUNITY COST & LOST FTDs (4 COLS) */}
        <Card className="lg:col-span-4 bg-slate-950 border border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-200">Opportunity Cost of Launch Delays</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              The financial and player yield lost during the upload phase before the listing goes live.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {packageProjections.map((proj) => {
              const displayLostPercent = Math.min(100, Math.round((proj.opportunityCostRev / (proj.totalNgr || 1)) * 100));
              return (
                <div key={proj.pkg.name} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-300 font-semibold">{proj.pkg.name} ({proj.pkg.delayMonths.toFixed(1)}m delay)</span>
                    <span className="text-red-400 font-bold">-{formatCurrency(proj.opportunityCostRev)}</span>
                  </div>
                  
                  {/* Progress/Drain bar */}
                  <div className="h-2 w-full bg-slate-900 border border-slate-850 rounded-full overflow-hidden">
                    <div 
                      style={{ width: `${displayLostPercent}%` }} 
                      className="h-full bg-gradient-to-r from-red-600 to-rose-400"
                    />
                  </div>
                  
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>Lost FTDs: -{proj.lostFtds}</span>
                    <span>{displayLostPercent}% of Potential Yield</span>
                  </div>
                </div>
              );
            })}
            
            <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg text-[10px] text-red-300/80 leading-relaxed">
              <AlertTriangle className="inline-block h-3.5 w-3.5 mr-1 text-red-400 -translate-y-0.5" />
              <strong>Opportunity Cost Leakage:</strong> A long launch delay represents weeks of zero traffic. Basic packages might cost €0 in listing fees, but waiting 9 months leaks valuable early cohort player compounding. Often, paying an upfront fee to go live instantly is significantly cheaper.
            </div>
          </CardContent>
        </Card>

      </div>

      {/* DETAILED MATRIX TABLE */}
      <Card className="bg-slate-950 border border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-200">Listing Package Comparison Matrix</CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Side-by-side technical breakdown of listing parameters, traffic yields, and total net margin projections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-900 text-slate-400 bg-slate-900/30">
                  <th className="py-2.5 px-3">Listing Package Tier</th>
                  <th className="py-2.5 px-3 text-right">Listing Fee</th>
                  <th className="py-2.5 px-3 text-right">Launch Delay</th>
                  <th className="py-2.5 px-3 text-right">12M Clicks</th>
                  <th className="py-2.5 px-3 text-right">12M FTDs</th>
                  <th className="py-2.5 px-3 text-right">12M NGR</th>
                  <th className="py-2.5 px-3 text-right">Total Outflow (Cost)</th>
                  <th className="py-2.5 px-3 text-right font-bold text-white">12M Net Profit</th>
                  <th className="py-2.5 px-3 text-right">Operator ROI</th>
                </tr>
              </thead>
              <tbody>
                {packageProjections.map((proj) => {
                  const isBest = bestPackage?.pkg.name === proj.pkg.name;
                  return (
                    <tr 
                      key={proj.pkg.name} 
                      className={`border-b border-slate-900 hover:bg-slate-900/30 transition-colors font-mono ${isBest ? 'bg-indigo-600/5 text-white font-semibold' : 'text-slate-300'}`}
                    >
                      <td className="py-3 px-3 text-left font-sans flex items-center gap-1.5">
                        {isBest ? (
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_#fbbf24]"></span>
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-800"></span>
                        )}
                        {proj.pkg.name} {isBest && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-sans">Best</span>}
                      </td>
                      <td className="py-3 px-3 text-right">{proj.pkg.cost === 0 ? '€0' : formatCurrency(proj.pkg.cost)}</td>
                      <td className="py-3 px-3 text-right">{proj.pkg.delayMonths.toFixed(1)}m</td>
                      <td className="py-3 px-3 text-right">{Math.round(proj.totalClicks).toLocaleString()}</td>
                      <td className="py-3 px-3 text-right">{proj.totalFtds}</td>
                      <td className="py-3 px-3 text-right text-emerald-400">{formatCurrency(proj.totalNgr)}</td>
                      <td className="py-3 px-3 text-right text-rose-400">{formatCurrency(proj.totalCost)}</td>
                      <td className={`py-3 px-3 text-right text-base font-bold ${proj.netProfit > 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                        {formatCurrency(proj.netProfit)}
                      </td>
                      <td className={`py-3 px-3 text-right font-bold ${proj.roi > 100 ? 'text-emerald-400' : proj.roi > 0 ? 'text-amber-400' : 'text-rose-500'}`}>
                        {proj.roi.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* EXECUTIVE REPORT MODAL */}
      {isReportOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto no-print">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            
            {/* Printable Area Wrapper */}
            <div id="printable-executive-report" className="p-6 md:p-8 space-y-6 bg-slate-900 text-white rounded-xl">
              
              {/* PRINT ONLY STYLING */}
              <style>{`
                @media print {
                  body {
                    background: white !important;
                    color: black !important;
                  }
                  #printable-executive-report {
                    background: white !important;
                    color: black !important;
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    padding: 0 !important;
                    margin: 0 !important;
                  }
                  .no-print {
                    display: none !important;
                  }
                  .print-border {
                    border-color: #d1d5db !important;
                  }
                  .print-text-dark {
                    color: #111827 !important;
                  }
                  .print-text-muted {
                    color: #4b5563 !important;
                  }
                  .print-bg-light {
                    background-color: #f3f4f6 !important;
                    border: 1px solid #e5e7eb !important;
                  }
                  .print-badge {
                    border: 1px solid #000 !important;
                    color: #000 !important;
                    background: none !important;
                  }
                }
              `}</style>

              {/* REPORT HEADER */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-4 gap-4 print-border">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 print-badge">
                      <Award className="h-5 w-5" />
                    </span>
                    <h2 className="text-xl font-bold tracking-tight text-white print-text-dark">Executive Media Listing Package Audit</h2>
                  </div>
                  <p className="text-xs text-slate-400 print-text-muted">
                    Generated on {new Date().toLocaleDateString()} | Confidential Media Budget Report
                  </p>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <button
                    onClick={copyMarkdownReport}
                    className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5 border border-slate-700"
                  >
                    {copiedSuccess ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                        Copied Markdown!
                      </>
                    ) : (
                      <>
                        <Clipboard className="h-3.5 w-3.5 text-slate-400" />
                        Copy for Slack/Email
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-3 py-1.5 rounded-md bg-indigo-650 hover:bg-indigo-700 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 shadow-[0_0_12px_rgba(99,102,241,0.2)] border border-indigo-500/20"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print / Save PDF
                  </button>
                  <button
                    onClick={() => setIsReportOpen(false)}
                    className="p-1.5 rounded-md bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* AUDIT SUMMARY & VERDICT */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 space-y-3 print-bg-light">
                  <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-1.5 print-text-dark">
                    <Sparkles className="h-4 w-4" />
                    Strategic Audit Verdict
                  </h3>
                  {bestPackage ? (
                    <div className="space-y-2 text-xs leading-relaxed text-slate-300 print-text-dark">
                      <p>
                        Based on the uploaded performance parameters, we recommend procuring the <strong className="text-white font-bold print-text-dark">{bestPackage.pkg.name} Tier</strong>. Over a 12-month period, this package delivers the highest cumulative performance value, yielding <strong className="text-emerald-450 font-bold print-text-dark">{formatCurrency(bestPackage.netProfit)}</strong> in net profit with an overall ROI of <strong className="text-emerald-450 font-bold print-text-dark">{bestPackage.roi.toFixed(0)}%</strong>.
                      </p>
                      <p>
                        {bestPackage.pkg.delayMonths > 0 ? (
                          <>
                            While the package features a launch delay of <strong className="text-white print-text-dark">{bestPackage.pkg.delayMonths.toFixed(1)} months</strong> (costing the brand <strong className="text-red-400 print-text-dark">{formatCurrency(bestPackage.opportunityCostRev)}</strong> in raw opportunity cost), its exposure boosts and traffic lift multiplier represent the most efficient conversion engine.
                          </>
                        ) : (
                          <>
                            The immediate launch (0-delay) ensures that user cohort acquisition begins in Month 1, allowing maximum time to recover upfront media expenses and maximize early LTV growth.
                          </>
                        )}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No package data available to compute recommendations.</p>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-850 space-y-3 print-bg-light">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider print-text-dark">Baseline Media Quality</h3>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between border-b border-slate-900 pb-1 print-border">
                      <span className="text-slate-500 print-text-muted font-sans">Monthly Clicks</span>
                      <span className="text-white font-semibold print-text-dark">{baseClicks.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900 pb-1 print-border">
                      <span className="text-slate-500 print-text-muted font-sans">Blended CR</span>
                      <span className="text-white font-semibold print-text-dark">{(baseClickToReg * baseRegToFtd / 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900 pb-1 print-border">
                      <span className="text-slate-500 print-text-muted font-sans">Player Value (LTV)</span>
                      <span className="text-emerald-400 font-semibold print-text-dark">
                        {formatCurrency(monthlyGgrPerPlayer * Math.min(24, Math.round(100 / (churnRate || 1))) * ((100 - marginLeakagePct) / 100))}
                      </span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-slate-500 print-text-muted font-sans">Deal Model</span>
                      <span className="text-indigo-450 font-semibold print-text-dark font-sans text-[10px] text-right truncate max-w-[120px]">
                        {cpaAmount > 0 ? `${formatCurrency(cpaAmount)} CPA` : ''} {revSharePct > 0 ? `+${revSharePct}% RS` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* COMPARISON MATRIX SCORECARD */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-350 print-text-dark">Side-by-Side Performance Scorecard</h3>
                <div className="border border-slate-800 rounded-lg overflow-hidden print-border">
                  <table className="w-full text-xs font-mono text-left">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 print-bg-light print-border print-text-dark font-bold">
                        <th className="py-2.5 px-3 font-sans">Package Tier</th>
                        {packageProjections.map((p) => (
                          <th key={p.pkg.name} className="py-2.5 px-3 text-right font-sans">{p.pkg.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-850 hover:bg-slate-900/10 print-border print-text-dark">
                        <td className="py-2 px-3 font-sans font-semibold text-slate-400 print-text-muted">Listing Sponsorship Fee</td>
                        {packageProjections.map((p) => (
                          <td key={p.pkg.name} className="py-2 px-3 text-right text-white print-text-dark">
                            {p.pkg.cost === 0 ? '€0' : formatCurrency(p.pkg.cost)}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-850 hover:bg-slate-900/10 print-border print-text-dark">
                        <td className="py-2 px-3 font-sans font-semibold text-slate-400 print-text-muted">Go-Live Launch Delay</td>
                        {packageProjections.map((p) => (
                          <td key={p.pkg.name} className="py-2 px-3 text-right text-white print-text-dark">
                            {p.pkg.delayMonths.toFixed(1)} months
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-850 hover:bg-slate-900/10 print-border print-text-dark">
                        <td className="py-2 px-3 font-sans font-semibold text-slate-400 print-text-muted">Traffic Exposure Boost</td>
                        {packageProjections.map((p) => (
                          <td key={p.pkg.name} className="py-2 px-3 text-right text-white print-text-dark">
                            {p.pkg.boostMultiplier}x clicks ({p.pkg.boostDurationMonths}m)
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-850 hover:bg-slate-900/10 print-border print-text-dark">
                        <td className="py-2 px-3 font-sans font-semibold text-slate-400 print-text-muted">Compounded 12M FTDs</td>
                        {packageProjections.map((p) => (
                          <td key={p.pkg.name} className="py-2 px-3 text-right text-indigo-400 print-text-dark">
                            {p.totalFtds}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-850 hover:bg-slate-900/10 print-border print-text-dark">
                        <td className="py-2 px-3 font-sans font-semibold text-slate-400 print-text-muted">Launch Delay Opportunity Cost</td>
                        {packageProjections.map((p) => (
                          <td key={p.pkg.name} className="py-2 px-3 text-right text-red-400 print-text-dark">
                            -{formatCurrency(p.opportunityCostRev)}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-850 hover:bg-slate-900/10 print-border print-text-dark">
                        <td className="py-2 px-3 font-sans font-semibold text-slate-400 print-text-muted">Break-even Month</td>
                        {packageProjections.map((p) => (
                          <td key={p.pkg.name} className="py-2 px-3 text-right text-white print-text-dark">
                            {p.breakEven ? `Month ${p.breakEven}` : 'Never'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-850 hover:bg-slate-900/10 print-border print-text-dark">
                        <td className="py-2 px-3 font-sans font-semibold text-slate-400 print-text-muted">Total 12M Outflow (Cost)</td>
                        {packageProjections.map((p) => (
                          <td key={p.pkg.name} className="py-2 px-3 text-right text-slate-300 print-text-dark">
                            {formatCurrency(p.totalCost)}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-850 hover:bg-slate-900/10 print-border print-text-dark font-bold">
                        <td className="py-2 px-3 font-sans font-bold text-slate-300 print-text-dark">12M Net Cashflow Profit</td>
                        {packageProjections.map((p) => (
                          <td key={p.pkg.name} className={`py-2 px-3 text-right text-sm ${p.netProfit > 0 ? 'text-emerald-400' : 'text-rose-500'} print-text-dark`}>
                            {formatCurrency(p.netProfit)}
                          </td>
                        ))}
                      </tr>
                      <tr className="hover:bg-slate-900/10 print-text-dark font-bold">
                        <td className="py-2 px-3 font-sans font-bold text-slate-300 print-text-dark">Brand ROI</td>
                        {packageProjections.map((p) => (
                          <td key={p.pkg.name} className={`py-2 px-3 text-right text-sm ${p.roi > 0 ? 'text-emerald-400' : 'text-rose-500'} print-text-dark`}>
                            {p.roi.toFixed(0)}%
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* REPORT FOOTER & SIGN OFF */}
              <div className="border-t border-slate-800 pt-4 flex flex-col md:flex-row justify-between items-center text-[10px] text-slate-500 gap-2 print-border">
                <span>Budget Genie Affiliate Deal Evaluator &copy; 2026</span>
                <span className="italic">Verify and adjust contract constraints dynamically in the sandbox workspace.</span>
              </div>
            </div>
            
            {/* Close modal for screen view */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-3 no-print">
              <button
                onClick={() => setIsReportOpen(false)}
                className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
};
