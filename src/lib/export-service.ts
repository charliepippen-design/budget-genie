import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ChannelWithMetrics } from '@/hooks/use-media-plan-store';
import { BUYING_MODEL_INFO, FAMILY_INFO, calculateUnifiedMetrics } from '@/types/channel';

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
      ['Blended CPA', blendedMetrics.blendedCpa ? formatCurrency(blendedMetrics.blendedCpa) : 'N/A'],
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
    doc.text('Channel Breakdown', 14, (doc as any).lastAutoTable.finalY + 15);
    
    const channelHeaders = [
      'Channel',
      'Type',
      'Model',
      'Alloc %',
      'Spend',
      'FTDs',
      'CPA',
      'ROAS',
    ];
    
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
      startY: (doc as any).lastAutoTable.finalY + 20,
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
  options: ExportOptions
): void {
  try {
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
    
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map(cell => `"${cell}"`).join(',')),
      '',
      `"Total Budget","${formatCurrency(totalBudget)}"`,
      `"Blended CPA","${blendedMetrics.blendedCpa ? formatCurrency(blendedMetrics.blendedCpa) : 'N/A'}"`,
      `"Total FTDs","${Math.round(safeNumber(blendedMetrics.totalConversions))}"`,
      `"Projected Revenue","${formatCurrency(safeNumber(blendedMetrics.projectedRevenue))}"`,
      `"Blended ROAS","${safeNumber(blendedMetrics.blendedRoas).toFixed(2)}x"`,
    ].join('\n');
    
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

// ========== PNG EXPORT ==========

export async function exportToPng(): Promise<void> {
  // PNG export requires html2canvas which captures the DOM
  // For now, prompt user to use browser print
  throw new Error('PNG export requires manual capture. Use Ctrl/Cmd + Shift + S to save as image.');
}
