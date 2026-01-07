import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { ChannelMonthConfig, MonthData, GlobalPlanSettings, ProgressionPattern } from '@/hooks/use-multi-month-store';
import { ChannelCategory } from '@/lib/mediaplan-data';
import {
  ChannelFamily,
  BuyingModel,
  ChannelTypeConfig,
  FAMILY_INFO,
  inferChannelFamily,
  inferBuyingModel
} from '@/types/channel';

// ========== CONSTANTS ==========

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_ROWS = 10000;
const MAX_COLUMNS = 100;
const MAX_BUDGET_VALUE = 100_000_000; // 100 million
const MIN_BUDGET_VALUE = 0;
const MAX_PERCENTAGE = 100;
const MIN_PERCENTAGE = 0;

// ========== VALIDATION SCHEMAS ==========

const numericValueSchema = z.number()
  .min(MIN_BUDGET_VALUE, 'Value cannot be negative')
  .max(MAX_BUDGET_VALUE, 'Value exceeds maximum allowed');

const percentageSchema = z.number()
  .min(MIN_PERCENTAGE, 'Percentage cannot be negative')
  .max(MAX_PERCENTAGE, 'Percentage cannot exceed 100');

const parsedMonthDataSchema = z.object({
  label: z.string().max(100),
  monthIndex: z.number().int().min(0).max(24),
  isSoftLaunch: z.boolean(),
  budget: numericValueSchema,
  channels: z.record(z.string(), numericValueSchema),
  metrics: z.object({
    ggr: numericValueSchema.optional(),
    conversions: z.number().int().min(0).max(1_000_000).optional(),
    cac: numericValueSchema.optional(),
    roas: z.number().min(-1000).max(1000).optional(),
    cpm: numericValueSchema.optional(),
    ctr: percentageSchema.optional(),
  }).optional(),
  opex: z.object({
    bonuses: numericValueSchema.optional(),
    platformFees: numericValueSchema.optional(),
    paymentProcessing: numericValueSchema.optional(),
  }).optional(),
});

// ========== TYPES ==========

export type FileFormat = 'csv' | 'xlsx' | 'json';
export type DataStructure = 'row-based' | 'column-based' | 'monthly-summary' | 'pivot' | 'annual-totals';
export type ImportGranularity = 'monthly' | 'annual';

export interface ChannelMapping {
  sourceColumn: string;
  targetChannelId: string;
  targetChannelName: string;
  confidence: number;
}

export interface ColumnIssue {
  id: string;
  sourceColumn: string;
  issueType: 'unmapped' | 'low-confidence' | 'duplicate';
  message: string;
  suggestedMapping?: string;
  resolved: boolean;
}

export interface CellIssue {
  column: string;
  message: string;
  originalValue: string;
  issueType: 'invalid-number' | 'missing-required' | 'out-of-range' | 'date-parse';
  suggestedValue?: number;
  resolved: boolean;
  resolvedValue?: number | null;
}

export interface DirtyRow {
  rowIndex: number;
  rawData: string[];
  issues: CellIssue[];
}

export interface ValidationReport {
  totalRows: number;
  cleanRows: number;
  dirtyRows: DirtyRow[];
  columnIssues: ColumnIssue[];
  healableFields: number;
}

export interface DetectedStructure {
  format: FileFormat;
  structure: DataStructure;
  granularity: ImportGranularity;
  confidence: number;
  headerRow: number;
  dataStartRow: number;
  monthColumns: string[];
  channelMappings: ChannelMapping[];
  metricMappings: Record<string, string>;
  warnings: string[];
  rawData: string[][];
  parsedMonths: ParsedMonthData[];
  detectedCurrency: string | null;
  currencyConfidence: number;
  validationReport: ValidationReport;
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

export const CHANNEL_DISPLAY_NAMES: Record<string, string> = {
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
  if (typeof value === 'number') {
    // Clamp to valid bounds
    return Math.max(MIN_BUDGET_VALUE, Math.min(MAX_BUDGET_VALUE, value));
  }

  // Sanitize string - only allow numbers, decimal point, minus sign
  const cleaned = value.toString()
    .replace(/[€$£¥₹,\s]/g, '')
    .replace(/\(([^)]+)\)/, '-$1') // Handle negative in parentheses
    .replace(/%$/, '') // Remove trailing %
    .replace(/[^0-9.\-]/g, ''); // Remove any other non-numeric characters

  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  // Clamp to valid bounds
  return Math.max(MIN_BUDGET_VALUE, Math.min(MAX_BUDGET_VALUE, num));
}

function sanitizeString(value: string): string {
  if (!value || typeof value !== 'string') return '';
  // Remove potentially dangerous characters, limit length
  return value
    .replace(/[<>'"&\\]/g, '')
    .trim()
    .slice(0, 200);
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

// ========== FILE VALIDATION ==========

export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_FILE_SIZE_MB}MB limit. Please use a smaller file.`
    };
  }

  // Check file extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['csv', 'txt', 'xlsx', 'xls', 'json'];
  if (!ext || !allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file format. Please use: ${allowedExtensions.join(', ')}`
    };
  }

  return { valid: true };
}

function validateParsedData(data: string[][]): { valid: boolean; error?: string } {
  if (!Array.isArray(data)) {
    return { valid: false, error: 'Invalid data structure' };
  }

  if (data.length > MAX_ROWS) {
    return {
      valid: false,
      error: `File contains too many rows (${data.length}). Maximum allowed: ${MAX_ROWS}`
    };
  }

  if (data.some(row => Array.isArray(row) && row.length > MAX_COLUMNS)) {
    return {
      valid: false,
      error: `File contains too many columns. Maximum allowed: ${MAX_COLUMNS}`
    };
  }

  return { valid: true };
}

// ========== FILE PARSING ==========

export async function parseFile(file: File): Promise<string[][]> {
  // Validate file before parsing
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const ext = file.name.split('.').pop()?.toLowerCase();

  let data: string[][];

  if (ext === 'csv' || ext === 'txt') {
    data = await parseCSV(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    data = await parseExcel(file);
  } else if (ext === 'json') {
    data = await parseJSON(file);
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }

  // Validate parsed data
  const dataValidation = validateParsedData(data);
  if (!dataValidation.valid) {
    throw new Error(dataValidation.error);
  }

  return data;
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
        // Limit parsing options to prevent resource exhaustion
        const workbook = XLSX.read(data, {
          type: 'array',
          sheetRows: MAX_ROWS, // Limit rows read
          cellFormula: false, // Don't evaluate formulas
          cellHTML: false, // Don't parse HTML
        });

        if (workbook.SheetNames.length === 0) {
          reject(new Error('Excel file contains no sheets'));
          return;
        }

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

        // Sanitize all string values and convert to strings
        const sanitizedData = (jsonData as unknown[][]).map(row =>
          Array.isArray(row) ? row.map(cell =>
            typeof cell === 'string' ? sanitizeString(cell) : String(cell ?? '')
          ) : []
        );

        resolve(sanitizedData);
      } catch (err) {
        reject(new Error('Failed to parse Excel file. The file may be corrupted or in an unsupported format.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

async function parseJSON(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;

        // Basic size check for JSON content
        if (content.length > MAX_FILE_SIZE_BYTES) {
          reject(new Error('JSON content exceeds maximum allowed size'));
          return;
        }

        const json = JSON.parse(content);

        // Validate structure depth to prevent deeply nested objects
        const maxDepth = 10;
        const checkDepth = (obj: unknown, depth: number): boolean => {
          if (depth > maxDepth) return false;
          if (typeof obj !== 'object' || obj === null) return true;
          return Object.values(obj).every(v => checkDepth(v, depth + 1));
        };

        if (!checkDepth(json, 0)) {
          reject(new Error('JSON structure is too deeply nested'));
          return;
        }

        // Handle structured JSON format
        if (json.plan?.months) {
          const months = json.plan.months;

          if (!Array.isArray(months) || months.length > MAX_ROWS) {
            reject(new Error('Invalid or too many months in JSON'));
            return;
          }

          const headers = ['Month', ...Object.keys(months[0]?.channels || {}), 'GGR', 'CAC', 'ROAS'];
          const rows = months.map((m: { month: string; channels?: Record<string, number>; kpis?: { ggr?: number; cac?: number; roas?: number } }) => [
            sanitizeString(String(m.month || '')),
            ...Object.values(m.channels || {}).map(v => String(parseNumber(v))),
            String(parseNumber(m.kpis?.ggr)),
            String(parseNumber(m.kpis?.cac)),
            String(parseNumber(m.kpis?.roas)),
          ]);
          resolve([headers, ...rows]);
        } else if (Array.isArray(json)) {
          if (json.length > MAX_ROWS) {
            reject(new Error(`JSON array exceeds maximum rows (${MAX_ROWS})`));
            return;
          }

          // Array of objects
          const headers = Object.keys(json[0] || {}).slice(0, MAX_COLUMNS);
          const rows = json.map((row: Record<string, unknown>) =>
            headers.map(h => sanitizeString(String(row[h] ?? '')))
          );
          resolve([headers, ...rows]);
        } else {
          reject(new Error('Unrecognized JSON structure. Expected array or {plan: {months: []}} format.'));
        }
      } catch (err) {
        reject(new Error('Failed to parse JSON file. Please check the file format.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// ========== STRUCTURE DETECTION (GALAXY BRAIN EDITION) ==========

import { parse, isValid, startOfMonth } from 'date-fns';

/**
 * Enhanced Date Parser
 * Handles: "Jan-26", "January 2026", "01/01/2026", "2026-01-01"
 */
function parseFlexibleDate(value: string): Date | null {
  if (!value || typeof value !== 'string') return null;
  const clean = value.trim();

  // Try common formats
  const formats = [
    'MMM-yy',       // Jan-26
    'MMM yyyy',     // Jan 2026
    'MMMM yyyy',    // January 2026
    'yyyy-MM-dd',   // 2026-01-01
    'yyyy-MM',      // 2026-01
    'MM/dd/yyyy',   // 01/01/2026
    'd-MMM-yy',     // 1-Jan-26
    'MMM',          // Jan (implicit current year)
    'MMMM',         // January (implicit current year)
  ];

  for (const fmt of formats) {
    const datum = parse(clean, fmt, new Date());
    if (isValid(datum)) return startOfMonth(datum);
  }

  // Fallback: JS Date parser for really generic stuff
  const fallback = new Date(clean);
  if (isValid(fallback)) return startOfMonth(fallback);

  return null;
}

/**
 * Step 1: The "Anchor" Scan
 * Finds the true header row by scoring rows based on keywords.
 */
function findHeaderRow(rawData: string[][]): { rowIndex: number; score: number } {
  let bestRow = 0;
  let bestScore = -1;

  // Scan first 20 rows
  const limit = Math.min(rawData.length, 20);

  for (let i = 0; i < limit; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    let score = 0;
    const rowStr = row.join(' ').toLowerCase();

    // 1. Month/Date Keywords (+1)
    if (/month|date|period|time/.test(rowStr)) score += 2; // Higher weight for Time

    // 2. Financial Keywords (+1)
    if (/budget|spend|cost|total|amount/.test(rowStr)) score += 1;

    // 3. Metric Keywords (+1)
    if (/revenue|roas|conv|ggr|sales/.test(rowStr)) score += 1;

    // Penalty for too many empty cells (metadata rows)
    const emptyCount = row.filter(c => !c || c.trim() === '').length;
    if (emptyCount > row.length / 2) score -= 1;

    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  console.log(`[Import] Header Row Detected: Index ${bestRow} (Score: ${bestScore})`);
  return { rowIndex: bestRow, score: bestScore };
}

/**
 * Step 2: Column Fingerprinting
 * Maps columns in the detected header row to our internal keys.
 */
function fingerprintColumns(headerRow: string[], rawDataBelow: string[][]): Record<string, number> {
  const map: Record<string, number> = {};

  // 1. Scan Header Text
  headerRow.forEach((cell, idx) => {
    const val = String(cell).toLowerCase().trim();

    // Core
    if (!map['month'] && /month|date|period/.test(val)) { map['month'] = idx; return; }
    if (!map['budget'] && /budget|planned|target/.test(val)) { map['budget'] = idx; return; }

    // Metrics
    if (/spend|cost|actuals/.test(val)) { map['gross_spend'] = idx; return; }
    if (/revenue|sales|ggr/.test(val)) { map['revenue'] = idx; return; }
    if (/conversions|ftds|signups/.test(val)) { map['conversions'] = idx; return; }

    // Channels (Fuzzy Match)
    const channelMatch = matchChannel(val);
    if (channelMatch) {
      map[`channel_${channelMatch.channelId}`] = idx;
    }
  });

  // 2. Force Month Scan (Crucial Fallback)
  // If no "Month" header found, look at Column 0 data
  if (map['month'] === undefined) {
    console.log("[Import] No 'Month' header found. Scanning Column 0 data...");
    let validDates = 0;
    const checkLimit = Math.min(rawDataBelow.length, 5);

    for (let i = 0; i < checkLimit; i++) {
      if (parseFlexibleDate(String(rawDataBelow[i][0]))) validDates++;
    }

    if (validDates > 0) {
      console.log("[Import] Column 0 looks like dates. FORCING 'month' = 0");
      map['month'] = 0;
    }
  }

  console.log("[Import] Column Map:", map);
  return map;
}

/**
 * Main Detection Function (Refactored)
 */
export function detectStructure(rawData: string[][], fileName: string): DetectedStructure {
  console.log("[Import] Raw Data Preview (First 5 Rows):", rawData.slice(0, 5));

  const format: FileFormat = fileName.endsWith('.json') ? 'json' :
    fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ? 'xlsx' : 'csv';

  // Step 1: Find Anchor
  const { rowIndex: headerRowIndex } = findHeaderRow(rawData);
  const headerRow = rawData[headerRowIndex];

  // Step 2: Fingerprint Columns
  const dataRows = rawData.slice(headerRowIndex + 1);
  const colMap = fingerprintColumns(headerRow, dataRows);

  // Step 3: Vertical Data Extraction
  // We'll simulate the "extraction" here to generate the preview/parsed data
  // In a real "import", we'd do this later, but for the wizard we need 'parsedMonths' now.

  const parsedMonths: ParsedMonthData[] = [];
  const warnings: string[] = [];

  if (colMap['month'] === undefined) {
    warnings.push("Could not locate a 'Month' column. Please ensure one column contains dates.");
  }

  let monthIndex = 0;

  dataRows.forEach((row, idx) => {
    // Basic validity check
    if (!row || row.length === 0) return;

    // Check for Summary Rows (Ignore "Total", "Grand Total")
    const firstCell = String(row[0]).toLowerCase();
    if (firstCell.includes('total') || firstCell.includes('average')) return;

    // Parse Date
    const dateVal = colMap['month'] !== undefined ? String(row[colMap['month']]) : null;
    if (!dateVal) return;

    const date = parseFlexibleDate(dateVal);
    if (!date) return; // Skip invalid dates

    // Extract Core Metrics
    const budget = colMap['budget'] !== undefined ? parseNumber(row[colMap['budget']]) : 0;
    const spend = colMap['gross_spend'] !== undefined ? parseNumber(row[colMap['gross_spend']]) : 0;
    const revenue = colMap['revenue'] !== undefined ? parseNumber(row[colMap['revenue']]) : 0;
    const conversions = colMap['conversions'] !== undefined ? parseNumber(row[colMap['conversions']]) : 0;

    // Extract Channels
    const channels: Record<string, number> = {};
    Object.entries(colMap).forEach(([key, colIdx]) => {
      if (key.startsWith('channel_')) {
        const channelId = key.replace('channel_', '');
        channels[channelId] = parseNumber(row[colIdx]);
      }
    });

    // Label Generation
    const label = date.toLocaleString('en-US', { month: 'short', year: '2-digit' });

    parsedMonths.push({
      label,
      monthIndex: monthIndex++,
      isSoftLaunch: label.toLowerCase().includes('soft') || idx === 0 && budget < 1000, // Heuristic
      budget,
      channels,
      metrics: {
        conversions,
        ggr: revenue,
        roas: spend > 0 ? revenue / spend : 0,
      }
    });
  });

  // Re-construct Channel Mappings for UI
  const channelMappings: ChannelMapping[] = [];
  Object.entries(colMap).forEach(([key, colIdx]) => {
    if (key.startsWith('channel_')) {
      const channelId = key.replace('channel_', '');
      channelMappings.push({
        sourceColumn: headerRow[colIdx],
        targetChannelId: channelId,
        targetChannelName: CHANNEL_DISPLAY_NAMES[channelId],
        confidence: 1.0 // We matched it
      });
    }
  });

  console.log(`[Import] Extracted ${parsedMonths.length} valid months.`);

  return {
    format,
    structure: 'row-based', // We forced vertical extraction
    granularity: 'monthly',
    confidence: parsedMonths.length > 0 ? 0.9 : 0.2, // High confidence if we got months
    headerRow: headerRowIndex,
    dataStartRow: headerRowIndex + 1,
    monthColumns: ['(Vertical)'], // Placeholder
    channelMappings,
    metricMappings: {},
    warnings,
    rawData,
    parsedMonths,
    detectedCurrency: detectCurrencyFromData(rawData).detected,
    currencyConfidence: detectCurrencyFromData(rawData).confidence,
    validationReport: buildValidationReport(rawData, headerRowIndex + 1, channelMappings)
  };
}
// Currency detection helper
function detectCurrencyFromData(rawData: string[][]): { detected: string | null; confidence: number } {
  const currencyPatterns: Record<string, RegExp> = {
    'EUR': /€|EUR/i,
    'USD': /\$|USD/i,
    'GBP': /£|GBP/i,
    'CHF': /CHF/i,
    'JPY': /¥|JPY/i,
  };

  const counts: Record<string, number> = {};
  let totalNumeric = 0;

  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    const row = rawData[i];
    if (!row) continue;
    for (const cell of row) {
      if (!cell || typeof cell !== 'string' || !/\d/.test(cell)) continue;
      totalNumeric++;
      for (const [code, pattern] of Object.entries(currencyPatterns)) {
        if (pattern.test(cell)) {
          counts[code] = (counts[code] || 0) + 1;
        }
      }
    }
  }

  let maxCount = 0;
  let detected: string | null = null;
  for (const [code, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      detected = code;
    }
  }

  return {
    detected,
    confidence: totalNumeric > 0 ? Math.min(maxCount / totalNumeric, 1) : 0,
  };
}

// Validation report builder
function buildValidationReport(
  rawData: string[][],
  dataStartRow: number,
  channelMappings: ChannelMapping[]
): ValidationReport {
  const dirtyRows: DirtyRow[] = [];
  const columnIssues: ColumnIssue[] = [];
  let healableFields = 0;

  // Check for unmapped columns (low confidence)
  channelMappings.forEach((mapping, idx) => {
    if (mapping.confidence < 0.7) {
      columnIssues.push({
        id: `col-${idx}`,
        sourceColumn: mapping.sourceColumn,
        issueType: 'low-confidence',
        message: `Low confidence match (${Math.round(mapping.confidence * 100)}%)`,
        suggestedMapping: mapping.targetChannelId,
        resolved: false,
      });
    }
  });

  // Check data rows for issues
  rawData.slice(dataStartRow).forEach((row, rowIdx) => {
    if (!row || row.length === 0) return;

    const issues: CellIssue[] = [];

    row.forEach((cell, colIdx) => {
      if (colIdx === 0) return; // Skip first column (usually labels)

      const cellStr = String(cell || '').trim();

      // Check for non-numeric values in data cells
      if (cellStr && !/^[\d.,\-+€$£¥%\s()]+$/.test(cellStr) && cellStr.toLowerCase() !== 'tbd' && cellStr !== '-') {
        // Not a pure number - could be text like "TBD"
        if (/tbd|pending|n\/a|null/i.test(cellStr)) {
          issues.push({
            column: `Column ${colIdx + 1}`,
            message: `Found placeholder "${cellStr}" - needs a numeric value`,
            originalValue: cellStr,
            issueType: 'invalid-number',
            suggestedValue: 0,
            resolved: false,
          });
          healableFields++;
        }
      }
    });

    if (issues.length > 0) {
      dirtyRows.push({
        rowIndex: dataStartRow + rowIdx,
        rawData: row,
        issues,
      });
    }
  });

  return {
    totalRows: rawData.length - dataStartRow,
    cleanRows: rawData.length - dataStartRow - dirtyRows.length,
    dirtyRows,
    columnIssues,
    healableFields,
  };
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

    // Identify all unique channel IDs (Defaults + Detected)
    const allChannelIds = Array.from(new Set([
      ...Object.keys(CHANNEL_DEFAULTS),
      ...Object.keys(pm.channels)
    ]));

    // Build channel configs with polymorphic type fields
    const channels: ChannelMonthConfig[] = allChannelIds.map(channelId => {
      const spend = pm.channels[channelId] || 0;
      const allocationPct = totalBudget > 0 ? (spend / totalBudget) * 100 : 0;
      const defaults = CHANNEL_DEFAULTS[channelId] || {
        category: 'paid', // Fallback to 'paid' as 'other' is not valid
        cpm: 10,
        ctr: 1.0,
        cr: 2.0,
        roas: 1.5
      };

      const channelName = CHANNEL_DISPLAY_NAMES[channelId] || channelId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      // Infer family and buying model from channel name
      const family = inferChannelFamily(channelName);
      const buyingModel = inferBuyingModel(channelName, family);

      // Build type config with appropriate defaults
      const typeConfig: ChannelTypeConfig = {
        family,
        buyingModel,
        cpm: defaults.cpm,
        ctr: defaults.ctr,
        cr: defaults.cr,
        // Set model-specific defaults
        ...(buyingModel === 'flat_fee' && { fixedCost: spend || 1000, estFtds: 5 }),
        ...(buyingModel === 'retainer' && { fixedCost: spend || 1000, estTraffic: 5000, cr: defaults.cr }),
        ...(buyingModel === 'cpa' && { targetCpa: 50, targetFtds: 10 }),
        ...(buyingModel === 'unit_based' && { unitCount: 4, costPerUnit: 500, estReachPerUnit: 50000, ctr: defaults.ctr, cr: defaults.cr }),
      };

      return {
        channelId,
        name: channelName,
        category: defaults.category,
        allocationPct,
        cpm: defaults.cpm,
        ctr: defaults.ctr,
        cr: defaults.cr,
        roas: defaults.roas,
        impressionMode: channelId.includes('influencer') || channelId === 'affiliate-listing' ? 'FIXED' : 'CPM',
        fixedImpressions: 100000,
        locked: false,
        // NEW: Polymorphic fields
        family,
        buyingModel,
        typeConfig,
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
