import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { ChannelWithMetrics } from '@/hooks/use-media-plan-store';
import { BUYING_MODEL_INFO, FAMILY_INFO, calculateUnifiedMetrics } from '@/types/channel';
import {
  buildScenarioEnvelope,
  getEfficiencyAlerts,
  type ScenarioEnvelopePoint,
} from '@/lib/planning-insights';
import { type SandboxExportSnapshot } from '@/store/useSandboxStore';

// ========== TYPES ==========

interface ExportOptions {
  currencySymbol: string;
  formatCurrency: (value: number) => string;
}

interface BlendedMetricsData {
  totalSpend: number;
  totalConversions: number;
  blendedCpa: number | null;
  projectedRevenue: number;
  blendedRoas: number;
}

interface ExportAlert {
  channelName: string;
  reason: string;
  severity: 'high' | 'medium';
}

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

// ========== HELPERS ==========

function safeFamilyName(family?: string): string {
  if (!family) return 'Paid Media';
  return FAMILY_INFO[family as keyof typeof FAMILY_INFO]?.name || family;
}

function safeBuyingModelName(buyingModel?: string): string {
  if (!buyingModel) return 'CPM';
  return BUYING_MODEL_INFO[buyingModel as keyof typeof BUYING_MODEL_INFO]?.name || buyingModel;
}

function safeNumber(value: number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || isNaN(value)) return fallback;
  return value;
}

// ========== PDF EXPORT ==========

export function exportToPdf(
  channels: ChannelWithMetrics[],
  totalBudget: number,
  blendedMetrics: BlendedMetricsData,
  options: ExportOptions
): void {
  try {
    const { formatCurrency } = options;
    const doc = new jsPDF();
    const typedDoc = doc as JsPdfWithAutoTable;

    // Title
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text('MediaPlan Pro - Budget Report', 14, 20);

    // Date
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);

    // Summary Section
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text('Summary', 14, 40);

    const summaryData = [
      ['Total Budget', formatCurrency(totalBudget)],
      [
        'Blended CPA',
        blendedMetrics.blendedCpa ? formatCurrency(blendedMetrics.blendedCpa) : 'N/A',
      ],
      ['Total FTDs', Math.round(safeNumber(blendedMetrics.totalConversions)).toLocaleString()],
      ['Projected Revenue', formatCurrency(safeNumber(blendedMetrics.projectedRevenue))],
      ['Blended ROAS', `${safeNumber(blendedMetrics.blendedRoas).toFixed(2)}x`],
    ];

    autoTable(doc, {
      startY: 45,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14 },
      tableWidth: 80,
    });

    // Channel Details Table
    doc.setFontSize(14);
    doc.text('Channel Breakdown', 14, (typedDoc.lastAutoTable?.finalY ?? 45) + 15);

    const channelHeaders = ['Channel', 'Type', 'Model', 'Alloc %', 'Spend', 'FTDs', 'CPA', 'ROAS'];

    const channelRows = channels.map((ch) => {
      // Safely get metrics - use calculated unified metrics if available
      const spend = safeNumber(ch.metrics?.spend);
      const conversions = safeNumber(ch.metrics?.conversions);
      const cpa = ch.metrics?.cpa;
      const roas = safeNumber(ch.metrics?.roas);

      return [
        ch.name || 'Unknown Channel',
        safeFamilyName(ch.family),
        safeBuyingModelName(ch.buyingModel),
        `${safeNumber(ch.allocationPct).toFixed(1)}%`,
        formatCurrency(spend),
        Math.round(conversions).toLocaleString(),
        cpa ? formatCurrency(cpa) : 'N/A',
        `${roas.toFixed(2)}x`,
      ];
    });

    autoTable(doc, {
      startY: (typedDoc.lastAutoTable?.finalY ?? 45) + 20,
      head: [channelHeaders],
      body: channelRows,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 22 },
        2: { cellWidth: 18 },
        3: { cellWidth: 16 },
        4: { cellWidth: 22 },
        5: { cellWidth: 16 },
        6: { cellWidth: 20 },
        7: { cellWidth: 16 },
      },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount} | MediaPlan Pro`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    // Save
    doc.save(`mediaplan-${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (error) {
    console.error('PDF Export Error:', error);
    throw new Error('Failed to generate PDF. Please try again.');
  }
}

// ========== CSV EXPORT ==========

export function exportToCsv(
  channels: ChannelWithMetrics[],
  totalBudget: number,
  blendedMetrics: BlendedMetricsData,
  options: ExportOptions,
  scenarioOutputs: ScenarioEnvelopePoint[] = [],
  efficiencyAlerts: ExportAlert[] = [],
  sandboxSnapshot: SandboxExportSnapshot | null = null
): void {
  try {
    const fallbackScenarios =
      scenarioOutputs.length > 0
        ? scenarioOutputs
        : buildScenarioEnvelope({
            baseLtvPerUser: blendedMetrics.blendedCpa
              ? blendedMetrics.blendedCpa * blendedMetrics.blendedRoas
              : 0,
            conversions: blendedMetrics.totalConversions,
            cpa: blendedMetrics.blendedCpa ?? 0,
            assumptions: {
              churnRate: 0.04,
              cpaMultiplier: 1,
              roasMultiplier: 1,
            },
          });

    const fallbackAlerts =
      efficiencyAlerts.length > 0
        ? efficiencyAlerts
        : getEfficiencyAlerts(channels).map((alert) => ({
            channelName: alert.channelName,
            reason: alert.reason,
            severity: alert.severity,
          }));

    const csvContent = buildCsvContent(
      channels,
      totalBudget,
      blendedMetrics,
      options,
      fallbackScenarios,
      fallbackAlerts,
      sandboxSnapshot
    );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mediaplan-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('CSV Export Error:', error);
    throw new Error('Failed to generate CSV. Please try again.');
  }
}

export function buildCsvContent(
  channels: ChannelWithMetrics[],
  totalBudget: number,
  blendedMetrics: BlendedMetricsData,
  options: ExportOptions,
  scenarioOutputs: ScenarioEnvelopePoint[] = [],
  efficiencyAlerts: ExportAlert[] = [],
  sandboxSnapshot: SandboxExportSnapshot | null = null
): string {
  const { formatCurrency } = options;

  const headers = [
    'Channel',
    'Family',
    'Buying Model',
    'Category',
    'Allocation %',
    'Spend',
    'Impressions',
    'Clicks',
    'FTDs',
    'CPA',
    'Revenue',
    'ROAS',
  ];

  const rows = channels.map((ch) => {
    const spend = safeNumber(ch.metrics?.spend);
    const impressions = safeNumber(ch.metrics?.impressions);
    const clicks = safeNumber(ch.metrics?.clicks);
    const conversions = safeNumber(ch.metrics?.conversions);
    const cpa = ch.metrics?.cpa;
    const revenue = safeNumber(ch.metrics?.revenue);
    const roas = safeNumber(ch.metrics?.roas);

    return [
      ch.name || 'Unknown',
      safeFamilyName(ch.family),
      safeBuyingModelName(ch.buyingModel),
      ch.category || 'other',
      safeNumber(ch.allocationPct).toFixed(2),
      spend.toFixed(2),
      Math.round(impressions).toString(),
      Math.round(clicks).toString(),
      Math.round(conversions).toString(),
      cpa ? cpa.toFixed(2) : 'N/A',
      revenue.toFixed(2),
      roas.toFixed(2),
    ];
  });

  return [
    'Allocation Table',
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    '',
    'Scenario Outputs',
    '"Scenario","Projected LTV/User","Projected Cohort Value","LTV:CAC Ratio"',
    ...scenarioOutputs.map((scenario) =>
      [
        scenario.scenario,
        scenario.projectedLtvPerUser.toFixed(4),
        scenario.projectedCohortValue.toFixed(4),
        scenario.ltvToCac.toFixed(4),
      ]
        .map((cell) => `"${cell}"`)
        .join(',')
    ),
    ...(sandboxSnapshot
      ? [
          '',
          'Sandbox Summary',
          `"Enabled","${sandboxSnapshot.enabled ? 'Yes' : 'No'}"`,
          `"Insight","${sandboxSnapshot.summaryText}"`,
          `"Baseline Spend","${sandboxSnapshot.baselineMetrics.totalSpend.toFixed(2)}"`,
          `"Adjusted Spend","${sandboxSnapshot.adjustedMetrics.totalSpend.toFixed(2)}"`,
          `"Baseline ROI %","${sandboxSnapshot.baselineMetrics.roiPct.toFixed(2)}"`,
          `"Adjusted ROI %","${sandboxSnapshot.adjustedMetrics.roiPct.toFixed(2)}"`,
          '',
          'Sandbox Channel Comparison',
          '"Channel","Group","Baseline Spend","Adjusted Spend","Baseline CPA","Adjusted CPA","Baseline ROAS","Adjusted ROAS","Churn %"',
          ...sandboxSnapshot.channelComparisons.map((channel) =>
            [
              channel.channelName,
              channel.group,
              channel.baselineSpend.toFixed(4),
              channel.adjustedSpend.toFixed(4),
              channel.baselineCpa.toFixed(4),
              channel.adjustedCpa.toFixed(4),
              channel.baselineRoas.toFixed(4),
              channel.adjustedRoas.toFixed(4),
              channel.churnPct.toFixed(2),
            ]
              .map((cell) => `"${cell}"`)
              .join(',')
          ),
          '',
          'Sandbox Scenario Comparison',
          '"Scenario","Baseline Cohort Value","Adjusted Cohort Value","Baseline LTV:CAC","Adjusted LTV:CAC","Baseline ROI %","Adjusted ROI %"',
          ...sandboxSnapshot.scenarioComparisons.map((scenario) =>
            [
              scenario.scenario,
              scenario.baselineProjectedCohortValue.toFixed(4),
              scenario.adjustedProjectedCohortValue.toFixed(4),
              scenario.baselineLtvToCac.toFixed(4),
              scenario.adjustedLtvToCac.toFixed(4),
              scenario.baselineRoiPct.toFixed(4),
              scenario.adjustedRoiPct.toFixed(4),
            ]
              .map((cell) => `"${cell}"`)
              .join(',')
          ),
        ]
      : []),
    '',
    'Efficiency Alerts',
    '"Channel","Severity","Reason"',
    ...efficiencyAlerts.map((alert) =>
      [alert.channelName, alert.severity.toUpperCase(), alert.reason]
        .map((cell) => `"${cell}"`)
        .join(',')
    ),
    '',
    'Summary',
    `"Total Budget","${formatCurrency(totalBudget)}"`,
    `"Blended CPA","${blendedMetrics.blendedCpa ? formatCurrency(blendedMetrics.blendedCpa) : 'N/A'}"`,
    `"Total FTDs","${Math.round(safeNumber(blendedMetrics.totalConversions))}"`,
    `"Projected Revenue","${formatCurrency(safeNumber(blendedMetrics.projectedRevenue))}"`,
    `"Blended ROAS","${safeNumber(blendedMetrics.blendedRoas).toFixed(2)}x"`,
  ].join('\n');
}

export function exportToExcel(
  channels: ChannelWithMetrics[],
  totalBudget: number,
  blendedMetrics: BlendedMetricsData,
  scenarioOutputs: ScenarioEnvelopePoint[] = [],
  efficiencyAlerts: ExportAlert[] = [],
  sandboxSnapshot: SandboxExportSnapshot | null = null
): void {
  try {
    const scenarios =
      scenarioOutputs.length > 0
        ? scenarioOutputs
        : buildScenarioEnvelope({
            baseLtvPerUser: blendedMetrics.blendedCpa
              ? blendedMetrics.blendedCpa * blendedMetrics.blendedRoas
              : 0,
            conversions: blendedMetrics.totalConversions,
            cpa: blendedMetrics.blendedCpa ?? 0,
            assumptions: {
              churnRate: 0.04,
              cpaMultiplier: 1,
              roasMultiplier: 1,
            },
          });

    const alerts =
      efficiencyAlerts.length > 0
        ? efficiencyAlerts
        : getEfficiencyAlerts(channels).map((alert) => ({
            channelName: alert.channelName,
            reason: alert.reason,
            severity: alert.severity,
          }));

    const allocationSheetData = channels.map((channel) => ({
      Channel: channel.name,
      Family: safeFamilyName(channel.family),
      BuyingModel: safeBuyingModelName(channel.buyingModel),
      AllocationPct: Number(channel.allocationPct.toFixed(4)),
      Spend: Number(safeNumber(channel.metrics.spend).toFixed(4)),
      Impressions: Number(safeNumber(channel.metrics.impressions).toFixed(0)),
      Clicks: Number(safeNumber(channel.metrics.clicks).toFixed(0)),
      FTDs: Number(safeNumber(channel.metrics.conversions).toFixed(2)),
      CPA: Number(safeNumber(channel.metrics.cpa).toFixed(4)),
      Revenue: Number(safeNumber(channel.metrics.revenue).toFixed(4)),
      ROAS: Number(safeNumber(channel.metrics.roas).toFixed(4)),
    }));

    const scenarioSheetData = scenarios.map((scenario) => ({
      Scenario: scenario.scenario,
      ProjectedLtvPerUser: Number(scenario.projectedLtvPerUser.toFixed(4)),
      ProjectedCohortValue: Number(scenario.projectedCohortValue.toFixed(4)),
      LtvToCacRatio: Number(scenario.ltvToCac.toFixed(4)),
    }));

    const alertsSheetData = alerts.map((alert) => ({
      Channel: alert.channelName,
      Severity: alert.severity.toUpperCase(),
      Reason: alert.reason,
    }));

    const summarySheetData = [
      { Metric: 'Total Budget', Value: Number(safeNumber(totalBudget).toFixed(4)) },
      {
        Metric: 'Blended CPA',
        Value: blendedMetrics.blendedCpa ? Number(blendedMetrics.blendedCpa.toFixed(4)) : 'N/A',
      },
      {
        Metric: 'Total Conversions',
        Value: Number(safeNumber(blendedMetrics.totalConversions).toFixed(2)),
      },
      {
        Metric: 'Projected Revenue',
        Value: Number(safeNumber(blendedMetrics.projectedRevenue).toFixed(4)),
      },
      { Metric: 'Blended ROAS', Value: Number(safeNumber(blendedMetrics.blendedRoas).toFixed(4)) },
    ];

    const sandboxSummarySheetData = sandboxSnapshot
      ? [
          { Metric: 'Sandbox Enabled', Value: sandboxSnapshot.enabled ? 'Yes' : 'No' },
          { Metric: 'Insight', Value: sandboxSnapshot.summaryText },
          {
            Metric: 'Baseline Spend',
            Value: Number(sandboxSnapshot.baselineMetrics.totalSpend.toFixed(4)),
          },
          {
            Metric: 'Adjusted Spend',
            Value: Number(sandboxSnapshot.adjustedMetrics.totalSpend.toFixed(4)),
          },
          {
            Metric: 'Baseline ROI %',
            Value: Number(sandboxSnapshot.baselineMetrics.roiPct.toFixed(4)),
          },
          {
            Metric: 'Adjusted ROI %',
            Value: Number(sandboxSnapshot.adjustedMetrics.roiPct.toFixed(4)),
          },
        ]
      : [];

    const sandboxChannelsSheetData = sandboxSnapshot
      ? sandboxSnapshot.channelComparisons.map((channel) => ({
          Channel: channel.channelName,
          Group: channel.group,
          BaselineSpend: Number(channel.baselineSpend.toFixed(4)),
          AdjustedSpend: Number(channel.adjustedSpend.toFixed(4)),
          BaselineCpa: Number(channel.baselineCpa.toFixed(4)),
          AdjustedCpa: Number(channel.adjustedCpa.toFixed(4)),
          BaselineRoas: Number(channel.baselineRoas.toFixed(4)),
          AdjustedRoas: Number(channel.adjustedRoas.toFixed(4)),
          ChurnPct: Number(channel.churnPct.toFixed(4)),
        }))
      : [];

    const sandboxScenariosSheetData = sandboxSnapshot
      ? sandboxSnapshot.scenarioComparisons.map((scenario) => ({
          Scenario: scenario.scenario,
          BaselineProjectedCohortValue: Number(scenario.baselineProjectedCohortValue.toFixed(4)),
          AdjustedProjectedCohortValue: Number(scenario.adjustedProjectedCohortValue.toFixed(4)),
          BaselineLtvToCac: Number(scenario.baselineLtvToCac.toFixed(4)),
          AdjustedLtvToCac: Number(scenario.adjustedLtvToCac.toFixed(4)),
          BaselineRoiPct: Number(scenario.baselineRoiPct.toFixed(4)),
          AdjustedRoiPct: Number(scenario.adjustedRoiPct.toFixed(4)),
        }))
      : [];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(allocationSheetData),
      'Allocation Table'
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(scenarioSheetData),
      'Scenario Outputs'
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(alertsSheetData),
      'Efficiency Alerts'
    );
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summarySheetData), 'Summary');

    if (sandboxSnapshot) {
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(sandboxSummarySheetData),
        'Sandbox Summary'
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(sandboxChannelsSheetData),
        'Sandbox Channels'
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(sandboxScenariosSheetData),
        'Sandbox Scenarios'
      );
    }

    XLSX.writeFile(workbook, `mediaplan-${new Date().toISOString().split('T')[0]}.xlsx`);
  } catch (error) {
    console.error('Excel Export Error:', error);
    throw new Error('Failed to generate Excel export. Please try again.');
  }
}

// ========== PNG EXPORT ==========

export async function exportToPng(): Promise<void> {
  // PNG export requires html2canvas which captures the DOM
  // For now, prompt user to use browser print
  throw new Error('PNG export requires manual capture. Use Ctrl/Cmd + Shift + S to save as image.');
}
