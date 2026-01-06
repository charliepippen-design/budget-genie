import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { ChannelMonthConfig, MonthData, GlobalPlanSettings, ProgressionPattern } from '@/hooks/use-multi-month-store';
import { ChannelCategory } from '@/lib/mediaplan-data';

// ========== TYPES ==========

export type FileFormat = 'csv' | 'xlsx' | 'json';
export type DataStructure = 'row-based' | 'column-based' | 'monthly-summary' | 'pivot';

export interface ChannelMapping {
  sourceColumn: string;
  targetChannelId: string;
  targetChannelName: string;
  confidence: number;
}

export interface DetectedStructure {
  format: FileFormat;
  structure: DataStructure;
  confidence: number;
  headerRow: number;
  dataStartRow: number;
  monthColumns: string[];
  channelMappings: ChannelMapping[];
  metricMappings: Record<string, string>;
  warnings: string[];
  rawData: string[][];
  parsedMonths: ParsedMonthData[];
}

export interface ParsedMonthData {
  label: string;
  monthIndex: number;
  isSoftLaunch: boolean;
  budget: number;
  channels: Record<string, number>;
  metrics: {
    ggr?: number;
    conversions?: number;
    cac?: number;
    roas?: number;
    cpm?: number;
    ctr?: number;
  };
  opex?: {
    bonuses?: number;
    platformFees?: number;
    paymentProcessing?: number;
  };
}

export interface ImportResult {
  success: boolean;
  months: MonthData[];
  globalSettings: Partial<GlobalPlanSettings>;
  progressionPattern: ProgressionPattern;
  includeSoftLaunch: boolean;
  planningMonths: number;
  startMonth: string;
  warnings: string[];
  errors: string[];
}

// ========== CHANNEL ALIASES FOR FUZZY MATCHING ==========

const CHANNEL_ALIASES: Record<string, string[]> = {
  'seo-tech': ['tech audit', 'tech', 'on-page', 'seo audit', 'technical seo', 'on page'],
  'seo-content': ['content', 'content production', 'content creation', 'blog', 'articles'],
  'seo-backlinks': ['backlinks', 'guest posts', 'link building', 'outreach', 'links'],
  'paid-native': ['native ads', 'native', 'crypto ads', 'adult/crypto', 'native advertising', 'adult ads'],
  'paid-push': ['push', 'push notifications', 'push notif', 'push notify'],
  'paid-programmatic': ['display', 'display ads', 'programmatic', 'banners', 'programmatic display'],
  'paid-retargeting': ['retargeting', 'retarget', 'remarketing', 'pixel', 'remarket'],
  'affiliate-listing': ['listing fees', 'affiliate listing', 'fixed fees', 'listing', 'fixed listing'],
  'affiliate-cpa': ['cpa', 'affiliate commission', 'cpa commission', 'affiliate cpa', 'commission'],
  'influencer-retainers': ['retainers', 'monthly retainers', 'influencer retainers', 'influencer monthly'],
  'influencer-funds': ['play funds', 'play funds balance', 'bonus balance', 'play money', 'influencer funds'],
};

const CHANNEL_DEFAULTS: Record<string, { category: ChannelCategory; cpm: number; ctr: number; cr: number; roas: number }> = {
  'seo-tech': { category: 'seo', cpm: 2.5, ctr: 0.8, cr: 2.5, roas: 3.2 },
  'seo-content': { category: 'seo', cpm: 1.8, ctr: 1.2, cr: 2.5, roas: 4.5 },
  'seo-backlinks': { category: 'seo', cpm: 3.5, ctr: 0.5, cr: 2.5, roas: 2.8 },
  'paid-native': { category: 'paid', cpm: 4.2, ctr: 0.35, cr: 2.5, roas: 1.8 },
  'paid-push': { category: 'paid', cpm: 1.2, ctr: 2.5, cr: 2.5, roas: 2.2 },
  'paid-programmatic': { category: 'paid', cpm: 5.5, ctr: 0.15, cr: 2.5, roas: 1.5 },
  'paid-retargeting': { category: 'paid', cpm: 8.0, ctr: 1.8, cr: 2.5, roas: 4.2 },
  'affiliate-listing': { category: 'affiliate', cpm: 15.0, ctr: 3.5, cr: 2.5, roas: 2.0 },
  'affiliate-cpa': { category: 'affiliate', cpm: 25.0, ctr: 4.2, cr: 2.5, roas: 3.5 },
  'influencer-retainers': { category: 'influencer', cpm: 12.0, ctr: 1.5, cr: 2.5, roas: 2.5 },
  'influencer-funds': { category: 'influencer', cpm: 10.0, ctr: 2.0, cr: 2.5, roas: 3.0 },
};

const CHANNEL_DISPLAY_NAMES: Record<string, string> = {
  'seo-tech': 'SEO - Tech Audit',
  'seo-content': 'SEO - Content',
  'seo-backlinks': 'SEO - Backlinks',
  'paid-native': 'Paid - Native Ads',
  'paid-push': 'Paid - Push',
  'paid-programmatic': 'Paid - Display',
  'paid-retargeting': 'Paid - Retargeting',
  'affiliate-listing': 'Affiliate - Listing',
  'affiliate-cpa': 'Affiliate - CPA',
  'influencer-retainers': 'Influencer - Retainers',
  'influencer-funds': 'Influencer - Play Funds',
};

const METRIC_ALIASES: Record<string, string[]> = {
  'ggr': ['ggr', 'revenue', 'gross gaming revenue', 'total revenue', 'sales', 'turnover'],
  'conversions': ['ftds', 'conversions', 'new players', 'sign-ups', 'registrations', 'ftd', 'first time depositors'],
  'cac': ['cac', 'blended cac', 'cost per acquisition', 'cpa', 'cost/acq'],
  'roas': ['roas', 'return on ad spend', 'roi', 'revenue/spend'],
  'cpm': ['cpm', 'cost per 1000', 'cost per thousand', 'cost/1000'],
  'ctr': ['ctr', 'click through rate', 'click rate', '% click', 'clickrate'],
  'bonuses': ['bonuses', 'bonus cost', 'player bonuses', 'bonus'],
  'platformFees': ['platform fees', 'game fees', 'platform cost', 'platform'],
  'paymentProcessing': ['payment processing', 'payment fees', 'processing', 'payment'],
};

const MONTH_PATTERNS = [
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  /^(january|february|march|april|may|june|july|august|september|october|november|december)/i,
  /^month\s*(\d+)/i,
  /^m(\d+)/i,
  /^soft\s*launch/i,
  /^\d{4}-\d{2}/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}/,
];

// ========== UTILITY FUNCTIONS ==========

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

function fuzzyMatch(input: string, targets: string[]): { match: string; confidence: number } | null {
  const normalized = input.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  
  let bestMatch: string | null = null;
  let bestScore = 0;
  
  for (const target of targets) {
    const targetNorm = target.toLowerCase().trim();
    
    // Exact match
    if (normalized === targetNorm || normalized.includes(targetNorm) || targetNorm.includes(normalized)) {
      return { match: target, confidence: 1.0 };
    }
    
    // Levenshtein distance
    const distance = levenshteinDistance(normalized, targetNorm);
    const maxLen = Math.max(normalized.length, targetNorm.length);
    const similarity = 1 - distance / maxLen;
    
    if (similarity > bestScore && similarity > 0.5) {
      bestScore = similarity;
      bestMatch = target;
    }
  }
  
  return bestMatch ? { match: bestMatch, confidence: bestScore } : null;
}

function matchChannel(input: string): { channelId: string; confidence: number } | null {
  const normalized = input.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  
  for (const [channelId, aliases] of Object.entries(CHANNEL_ALIASES)) {
    for (const alias of aliases) {
      if (normalized === alias || normalized.includes(alias) || alias.includes(normalized)) {
        return { channelId, confidence: 1.0 };
      }
    }
    
    const fuzzy = fuzzyMatch(normalized, aliases);
    if (fuzzy && fuzzy.confidence > 0.7) {
      return { channelId, confidence: fuzzy.confidence };
    }
  }
  
  return null;
}

function matchMetric(input: string): string | null {
  const normalized = input.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  
  for (const [metricId, aliases] of Object.entries(METRIC_ALIASES)) {
    for (const alias of aliases) {
      if (normalized === alias || normalized.includes(alias)) {
        return metricId;
      }
    }
  }
  
  return null;
}

function parseNumber(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  // Remove currency symbols, commas, spaces
  const cleaned = value.toString()
    .replace(/[€$£¥₹,\s]/g, '')
    .replace(/\(([^)]+)\)/, '-$1') // Handle negative in parentheses
    .replace(/%$/, ''); // Remove trailing %
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function isMonthHeader(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  return MONTH_PATTERNS.some(pattern => pattern.test(value.trim()));
}

function parseMonthLabel(value: string, index: number): { label: string; isSoftLaunch: boolean } {
  const trimmed = value.trim().toLowerCase();
  const isSoftLaunch = trimmed.includes('soft') || trimmed.includes('launch') || index === 0 && trimmed.includes('0');
  
  // Try to extract a proper month label
  const monthMatch = trimmed.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
  const yearMatch = trimmed.match(/20\d{2}/);
  
  if (monthMatch) {
    const monthName = monthMatch[0].charAt(0).toUpperCase() + monthMatch[0].slice(1).toLowerCase();
    const fullMonth = new Date(Date.parse(monthName + ' 1, 2024')).toLocaleString('en-US', { month: 'long' });
    const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();
    return { label: `${fullMonth} ${year}${isSoftLaunch ? ' (Soft Launch)' : ''}`, isSoftLaunch };
  }
  
  return { label: value, isSoftLaunch };
}

// ========== FILE PARSING ==========

export async function parseFile(file: File): Promise<string[][]> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  
  if (ext === 'csv' || ext === 'txt') {
    return parseCSV(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    return parseExcel(file);
  } else if (ext === 'json') {
    return parseJSON(file);
  }
  
  throw new Error(`Unsupported file format: ${ext}`);
}

async function parseCSV(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (results) => {
        resolve(results.data as string[][]);
      },
      error: reject,
    });
  });
}

async function parseExcel(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
        resolve(jsonData as string[][]);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function parseJSON(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        
        // Handle structured JSON format
        if (json.plan?.months) {
          const months = json.plan.months;
          const headers = ['Month', ...Object.keys(months[0]?.channels || {}), 'GGR', 'CAC', 'ROAS'];
          const rows = months.map((m: { month: string; channels?: Record<string, number>; kpis?: { ggr?: number; cac?: number; roas?: number } }) => [
            m.month,
            ...Object.values(m.channels || {}),
            m.kpis?.ggr || 0,
            m.kpis?.cac || 0,
            m.kpis?.roas || 0,
          ]);
          resolve([headers, ...rows]);
        } else if (Array.isArray(json)) {
          // Array of objects
          const headers = Object.keys(json[0] || {});
          const rows = json.map((row: Record<string, unknown>) => headers.map(h => String(row[h] ?? '')));
          resolve([headers, ...rows]);
        } else {
          reject(new Error('Unrecognized JSON structure'));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ========== STRUCTURE DETECTION ==========

export function detectStructure(rawData: string[][], fileName: string): DetectedStructure {
  const format: FileFormat = fileName.endsWith('.json') ? 'json' : 
                             fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ? 'xlsx' : 'csv';
  
  const warnings: string[] = [];
  let structure: DataStructure = 'row-based';
  let confidence = 0.5;
  let headerRow = 0;
  let dataStartRow = 1;
  
  // Find header row (first row with text, no numbers only)
  for (let i = 0; i < Math.min(5, rawData.length); i++) {
    const row = rawData[i];
    if (row && row.some(cell => cell && typeof cell === 'string' && cell.trim().length > 0)) {
      const hasMonthHeaders = row.some(cell => isMonthHeader(String(cell)));
      const hasChannelNames = row.some(cell => matchChannel(String(cell)) !== null);
      
      if (hasMonthHeaders || hasChannelNames) {
        headerRow = i;
        dataStartRow = i + 1;
        break;
      }
    }
  }
  
  const headerRowData = rawData[headerRow] || [];
  
  // Detect structure type
  const monthColumnsInHeader = headerRowData.filter(cell => isMonthHeader(String(cell))).length;
  const channelColumnsInHeader = headerRowData.filter(cell => matchChannel(String(cell)) !== null).length;
  
  // Check first column for channel names (row-based)
  const firstColumnChannels = rawData.slice(dataStartRow).filter(row => 
    row && row[0] && matchChannel(String(row[0])) !== null
  ).length;
  
  // Check first column for month names (pivot)
  const firstColumnMonths = rawData.slice(dataStartRow).filter(row =>
    row && row[0] && isMonthHeader(String(row[0]))
  ).length;
  
  if (monthColumnsInHeader >= 2 && firstColumnChannels >= 3) {
    structure = 'row-based';
    confidence = 0.9;
  } else if (channelColumnsInHeader >= 3 && firstColumnMonths >= 2) {
    structure = 'pivot';
    confidence = 0.9;
  } else if (monthColumnsInHeader >= 2) {
    structure = 'monthly-summary';
    confidence = 0.7;
  } else if (firstColumnChannels >= 3) {
    structure = 'column-based';
    confidence = 0.7;
  }
  
  // Build month columns
  const monthColumns: string[] = [];
  if (structure === 'row-based' || structure === 'monthly-summary') {
    headerRowData.forEach((cell, idx) => {
      if (isMonthHeader(String(cell))) {
        monthColumns.push(String(cell));
      }
    });
  } else if (structure === 'pivot') {
    rawData.slice(dataStartRow).forEach(row => {
      if (row && row[0] && isMonthHeader(String(row[0]))) {
        monthColumns.push(String(row[0]));
      }
    });
  }
  
  if (monthColumns.length === 0) {
    // Fallback: look for any column that could be months
    headerRowData.slice(1).forEach((cell, idx) => {
      const val = String(cell).trim();
      if (val && !matchChannel(val) && !matchMetric(val)) {
        monthColumns.push(val);
      }
    });
    if (monthColumns.length > 0) {
      warnings.push('Could not detect month headers automatically. Using column headers as months.');
    }
  }
  
  // Build channel mappings
  const channelMappings: ChannelMapping[] = [];
  const seenChannels = new Set<string>();
  
  if (structure === 'row-based' || structure === 'monthly-summary') {
    rawData.slice(dataStartRow).forEach(row => {
      if (row && row[0]) {
        const match = matchChannel(String(row[0]));
        if (match && !seenChannels.has(match.channelId)) {
          seenChannels.add(match.channelId);
          channelMappings.push({
            sourceColumn: String(row[0]),
            targetChannelId: match.channelId,
            targetChannelName: CHANNEL_DISPLAY_NAMES[match.channelId],
            confidence: match.confidence,
          });
        }
      }
    });
  } else if (structure === 'pivot') {
    headerRowData.slice(1).forEach(cell => {
      const match = matchChannel(String(cell));
      if (match && !seenChannels.has(match.channelId)) {
        seenChannels.add(match.channelId);
        channelMappings.push({
          sourceColumn: String(cell),
          targetChannelId: match.channelId,
          targetChannelName: CHANNEL_DISPLAY_NAMES[match.channelId],
          confidence: match.confidence,
        });
      }
    });
  }
  
  // Low confidence warnings
  channelMappings.forEach(m => {
    if (m.confidence < 0.8) {
      warnings.push(`Low confidence match: "${m.sourceColumn}" → "${m.targetChannelName}" (${Math.round(m.confidence * 100)}%)`);
    }
  });
  
  // Build metric mappings
  const metricMappings: Record<string, string> = {};
  
  const allCells = structure === 'row-based' || structure === 'monthly-summary'
    ? rawData.slice(dataStartRow).map(row => String(row?.[0] || ''))
    : headerRowData.map(cell => String(cell));
  
  allCells.forEach(cell => {
    const metric = matchMetric(cell);
    if (metric && !metricMappings[metric]) {
      metricMappings[metric] = cell;
    }
  });
  
  // Parse months
  const parsedMonths = parseMonthsFromData(rawData, structure, headerRow, dataStartRow, monthColumns, channelMappings, metricMappings);
  
  if (parsedMonths.length === 0) {
    warnings.push('No months could be parsed from the data.');
  }
  
  return {
    format,
    structure,
    confidence,
    headerRow,
    dataStartRow,
    monthColumns,
    channelMappings,
    metricMappings,
    warnings,
    rawData,
    parsedMonths,
  };
}

function parseMonthsFromData(
  rawData: string[][],
  structure: DataStructure,
  headerRow: number,
  dataStartRow: number,
  monthColumns: string[],
  channelMappings: ChannelMapping[],
  metricMappings: Record<string, string>
): ParsedMonthData[] {
  const months: ParsedMonthData[] = [];
  const headerRowData = rawData[headerRow] || [];
  
  if (structure === 'row-based' || structure === 'monthly-summary') {
    // Months are columns, channels are rows
    monthColumns.forEach((monthCol, monthIdx) => {
      const colIdx = headerRowData.findIndex(cell => String(cell) === monthCol);
      if (colIdx === -1) return;
      
      const { label, isSoftLaunch } = parseMonthLabel(monthCol, monthIdx);
      const monthData: ParsedMonthData = {
        label,
        monthIndex: monthIdx,
        isSoftLaunch,
        budget: 0,
        channels: {},
        metrics: {},
      };
      
      // Extract channel values
      rawData.slice(dataStartRow).forEach(row => {
        if (!row || !row[0]) return;
        const cellValue = parseNumber(row[colIdx]);
        const channelKey = String(row[0]).toLowerCase().trim();
        
        // Check if it's a channel
        const channelMatch = channelMappings.find(m => 
          m.sourceColumn.toLowerCase().trim() === channelKey
        );
        if (channelMatch) {
          monthData.channels[channelMatch.targetChannelId] = cellValue;
          return;
        }
        
        // Check if it's a metric
        const metricMatch = matchMetric(channelKey);
        if (metricMatch && metricMatch in metricMappings || Object.values(metricMappings).some(v => v.toLowerCase() === channelKey)) {
          if (metricMatch === 'ggr' || channelKey.includes('ggr') || channelKey.includes('revenue')) {
            monthData.metrics.ggr = cellValue;
          } else if (metricMatch === 'cac' || channelKey.includes('cac')) {
            monthData.metrics.cac = cellValue;
          } else if (metricMatch === 'roas' || channelKey.includes('roas')) {
            monthData.metrics.roas = cellValue;
          } else if (metricMatch === 'conversions' || channelKey.includes('ftd')) {
            monthData.metrics.conversions = cellValue;
          }
        }
        
        // Check for total budget row
        if (channelKey.includes('total') && channelKey.includes('budget')) {
          monthData.budget = cellValue;
        }
      });
      
      // Calculate budget from channel sum if not found
      if (monthData.budget === 0) {
        monthData.budget = Object.values(monthData.channels).reduce((sum, v) => sum + v, 0);
      }
      
      months.push(monthData);
    });
  } else if (structure === 'pivot') {
    // Months are rows, channels are columns
    rawData.slice(dataStartRow).forEach((row, rowIdx) => {
      if (!row || !row[0] || !isMonthHeader(String(row[0]))) return;
      
      const { label, isSoftLaunch } = parseMonthLabel(String(row[0]), rowIdx);
      const monthData: ParsedMonthData = {
        label,
        monthIndex: rowIdx,
        isSoftLaunch,
        budget: 0,
        channels: {},
        metrics: {},
      };
      
      headerRowData.forEach((header, colIdx) => {
        if (colIdx === 0) return;
        const cellValue = parseNumber(row[colIdx]);
        const headerStr = String(header).toLowerCase().trim();
        
        // Check if it's a channel
        const channelMatch = channelMappings.find(m =>
          m.sourceColumn.toLowerCase().trim() === headerStr
        );
        if (channelMatch) {
          monthData.channels[channelMatch.targetChannelId] = cellValue;
          return;
        }
        
        // Check if it's a metric
        if (headerStr.includes('ggr') || headerStr.includes('revenue')) {
          monthData.metrics.ggr = cellValue;
        } else if (headerStr.includes('cac') || headerStr.includes('cpa')) {
          monthData.metrics.cac = cellValue;
        } else if (headerStr.includes('roas') || headerStr.includes('roi')) {
          monthData.metrics.roas = cellValue;
        } else if (headerStr.includes('ftd') || headerStr.includes('conversion')) {
          monthData.metrics.conversions = cellValue;
        }
      });
      
      // Calculate budget
      monthData.budget = Object.values(monthData.channels).reduce((sum, v) => sum + v, 0);
      
      months.push(monthData);
    });
  }
  
  return months;
}

// ========== IMPORT CONVERSION ==========

export function convertToMonthData(
  parsedMonths: ParsedMonthData[],
  channelMappings: ChannelMapping[]
): ImportResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  if (parsedMonths.length === 0) {
    errors.push('No month data could be extracted from the file.');
    return {
      success: false,
      months: [],
      globalSettings: {},
      progressionPattern: 'custom',
      includeSoftLaunch: false,
      planningMonths: 6,
      startMonth: new Date().toISOString().slice(0, 7),
      warnings,
      errors,
    };
  }
  
  const includeSoftLaunch = parsedMonths.some(m => m.isSoftLaunch);
  const planningMonths = parsedMonths.filter(m => !m.isSoftLaunch).length || parsedMonths.length;
  
  // Detect start month from first month label
  let startMonth = new Date().toISOString().slice(0, 7);
  const firstLabel = parsedMonths[0]?.label || '';
  const monthMatch = firstLabel.match(/(january|february|march|april|may|june|july|august|september|october|november|december)/i);
  const yearMatch = firstLabel.match(/20\d{2}/);
  if (monthMatch && yearMatch) {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthNum = monthNames.findIndex(m => m === monthMatch[1].toLowerCase()) + 1;
    startMonth = `${yearMatch[0]}-${monthNum.toString().padStart(2, '0')}`;
  }
  
  // Convert to MonthData
  const months: MonthData[] = parsedMonths.map((pm, idx) => {
    const totalBudget = pm.budget || Object.values(pm.channels).reduce((sum, v) => sum + v, 0);
    
    // Build channel configs
    const channels: ChannelMonthConfig[] = Object.keys(CHANNEL_DEFAULTS).map(channelId => {
      const spend = pm.channels[channelId] || 0;
      const allocationPct = totalBudget > 0 ? (spend / totalBudget) * 100 : 0;
      const defaults = CHANNEL_DEFAULTS[channelId];
      
      return {
        channelId,
        name: CHANNEL_DISPLAY_NAMES[channelId],
        category: defaults.category,
        allocationPct,
        cpm: defaults.cpm,
        ctr: defaults.ctr,
        cr: defaults.cr,
        roas: defaults.roas,
        impressionMode: channelId.includes('influencer') || channelId === 'affiliate-listing' ? 'FIXED' : 'CPM',
        fixedImpressions: 100000,
        locked: false,
      };
    });
    
    return {
      id: `month-${idx}`,
      label: pm.label,
      monthIndex: idx,
      isSoftLaunch: pm.isSoftLaunch,
      budget: totalBudget,
      budgetMultiplier: 1.0,
      budgetLocked: false,
      spendMultiplier: null,
      cpmOverride: null,
      ctrBump: null,
      channels,
      useGlobalChannels: false,
    };
  });
  
  // Detect progression pattern
  const budgets = months.map(m => m.budget);
  const progressionPattern = detectProgressionPattern(budgets);
  
  // Calculate global settings
  const avgBudget = budgets.reduce((a, b) => a + b, 0) / budgets.length;
  const growthRates = budgets.slice(1).map((b, i) => budgets[i] > 0 ? ((b - budgets[i]) / budgets[i]) * 100 : 0);
  const avgGrowthRate = growthRates.length > 0 ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length : 0;
  
  const globalSettings: Partial<GlobalPlanSettings> = {
    baseMonthlyBudget: Math.round(avgBudget),
    growthRate: Math.round(avgGrowthRate),
    growthType: 'linear',
  };
  
  // Add warnings for missing data
  const channelsWithData = new Set(parsedMonths.flatMap(m => Object.keys(m.channels)));
  const missingChannels = Object.keys(CHANNEL_DEFAULTS).filter(c => !channelsWithData.has(c));
  if (missingChannels.length > 0) {
    warnings.push(`No data found for channels: ${missingChannels.map(c => CHANNEL_DISPLAY_NAMES[c]).join(', ')}. Using 0% allocation.`);
  }
  
  return {
    success: true,
    months,
    globalSettings,
    progressionPattern,
    includeSoftLaunch,
    planningMonths,
    startMonth,
    warnings,
    errors,
  };
}

function detectProgressionPattern(budgets: number[]): ProgressionPattern {
  if (budgets.length < 2) return 'flat';
  
  const changes = budgets.slice(1).map((b, i) => b - budgets[i]);
  const allSame = changes.every(c => Math.abs(c) < budgets[0] * 0.05);
  
  if (allSame) return 'flat';
  
  const allIncreasing = changes.every(c => c > 0);
  const allDecreasing = changes.every(c => c < 0);
  
  if (allIncreasing) {
    // Check if exponential (accelerating) or linear
    const ratios = budgets.slice(1).map((b, i) => budgets[i] > 0 ? b / budgets[i] : 1);
    const ratioVariance = Math.max(...ratios) - Math.min(...ratios);
    return ratioVariance < 0.1 ? 'exponential' : 'linear';
  }
  
  if (allDecreasing) {
    // First high then declining
    if (budgets[0] > budgets[budgets.length - 1] * 1.5) {
      return 'aggressive-launch';
    }
    return 'inverse-u';
  }
  
  // Mixed - check for U-shape
  const mid = Math.floor(budgets.length / 2);
  const firstHalfDecreasing = budgets.slice(0, mid).every((b, i) => i === 0 || b <= budgets[i - 1]);
  const secondHalfIncreasing = budgets.slice(mid).every((b, i) => i === 0 || b >= budgets[mid + i - 1]);
  
  if (firstHalfDecreasing && secondHalfIncreasing) {
    return 'u-shaped';
  }
  
  return 'custom';
}

// ========== MAIN IMPORT FUNCTION ==========

export async function importMediaPlan(file: File): Promise<{
  detected: DetectedStructure;
  result: ImportResult;
}> {
  const rawData = await parseFile(file);
  const detected = detectStructure(rawData, file.name);
  const result = convertToMonthData(detected.parsedMonths, detected.channelMappings);
  
  return { detected, result };
}
