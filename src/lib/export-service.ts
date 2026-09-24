import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ChannelWithMetrics, BlendedMetrics } from '@/hooks/use-media-plan-store';

interface ExportPdfOptions {
  projectName: string;
  channels: ChannelWithMetrics[];
  blended: BlendedMetrics;
  symbol: string;
  brandName?: string;
  brandColor?: string;
  notes?: string;
  includeSummary: boolean;
  includeChannels: boolean;
}

export function exportToCsv(channels: ChannelWithMetrics[], symbol: string) {
  const headers = [
    'Channel Name',
    'Category',
    'Buying Model',
    'Allocation %',
    `Spend (${symbol})`,
    'Price',
    'Impressions',
    'Clicks',
    'CTR %',
    'Conversions (FTD)',
    `CPA (${symbol})`,
    `Revenue (${symbol})`,
    'ROAS'
  ];

  const rows = channels.map(ch => [
    ch.name,
    ch.category,
    ch.buyingModel,
    `${ch.allocationPct.toFixed(1)}%`,
    ch.metrics.spend.toFixed(0),
    ch.metrics.effectivePrice.toFixed(2),
    ch.metrics.impressions.toFixed(0),
    ch.metrics.clicks.toFixed(0),
    `${ch.metrics.effectiveCtr.toFixed(2)}%`,
    ch.metrics.conversions.toFixed(0),
    ch.metrics.cpa ? ch.metrics.cpa.toFixed(0) : 'N/A',
    ch.metrics.revenue.toFixed(0),
    `${ch.metrics.roas.toFixed(2)}x`
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `MediaPlan_Export_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToPdf(options: ExportPdfOptions) {
  const {
    projectName,
    channels,
    blended,
    symbol,
    brandName = 'MediaPlan Pro',
    brandColor = '#4f46e5',
    notes = '',
    includeSummary,
    includeChannels
  } = options;

  const doc = new jsPDF();
  let currentY = 15;

  // Primary color helper
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 79, g: 70, b: 229 }; // default indigo
  };
  const rgb = hexToRgb(brandColor);

  // 1. BRAND HEADER BAND
  doc.setFillColor(rgb.r, rgb.g, rgb.b);
  doc.rect(0, 0, 210, 25, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(brandName.toUpperCase(), 15, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('MEDIA ACQUISITION BUDGET SCALER REPORT', 210 - 15, 16, { align: 'right' });

  currentY = 38;

  // 2. PROJECT META
  doc.setTextColor(50, 50, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(projectName, 15, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 210 - 15, currentY, { align: 'right' });

  currentY += 12;

  // 3. EXECUTIVE SUMMARY
  if (includeSummary) {
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(248, 250, 252);
    doc.rect(15, currentY, 180, 28, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(rgb.r, rgb.g, rgb.b);
    doc.text('EXECUTIVE PLAN METRICS Summary', 20, currentY + 6);

    // Summary columns
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');

    doc.text('TOTAL SPEND', 22, currentY + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`${symbol}${blended.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 22, currentY + 22);

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('PROJECTED FTDs', 70, currentY + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(blended.totalConversions.toLocaleString(undefined, { maximumFractionDigits: 0 }), 70, currentY + 22);

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('BLENDED CPA', 115, currentY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(blended.blendedCpa ? `${symbol}${blended.blendedCpa.toFixed(0)}` : 'N/A', 115, currentY + 22);

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('PROJECTED ROAS', 158, currentY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${blended.blendedRoas.toFixed(2)}x`, 158, currentY + 22);

    currentY += 38;
  }

  // 4. NOTES / CUSTOM COMMENTS
  if (notes.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('PLAN NOTES & ASSUMPTIONS', 15, currentY);
    
    currentY += 4;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    const splitNotes = doc.splitTextToSize(notes, 180);
    doc.text(splitNotes, 15, currentY);
    
    currentY += (splitNotes.length * 4) + 8;
  }

  // 5. DETAILED CHANNELS TABLE
  if (includeChannels) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('CHANNEL BUDGET ALLOCATION & FORECASTS', 15, currentY);
    
    currentY += 4;

    const tableHeaders = [
      'Channel Name',
      'Category',
      'Model',
      'Alloc %',
      `Spend (${symbol})`,
      'Impressions',
      'Conversions',
      `CPA (${symbol})`,
      'ROAS'
    ];

    const activeChannels = channels.filter(ch => ch.isActive && ch.allocationPct > 0);

    const tableRows = activeChannels.map(ch => [
      ch.name,
      ch.category,
      ch.buyingModel,
      `${ch.allocationPct.toFixed(1)}%`,
      ch.metrics.spend.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      ch.metrics.impressions > 0 ? ch.metrics.impressions.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '--',
      ch.metrics.conversions.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      ch.metrics.cpa ? ch.metrics.cpa.toFixed(0) : 'N/A',
      `${ch.metrics.roas.toFixed(1)}x`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [tableHeaders],
      body: tableRows,
      theme: 'striped',
      headStyles: {
        fillColor: [rgb.r, rgb.g, rgb.b],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [50, 50, 50]
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 28 },
        2: { cellWidth: 15 },
        3: { cellWidth: 15, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 18, halign: 'right' },
        7: { cellWidth: 14, halign: 'right' },
        8: { cellWidth: 14, halign: 'right' }
      },
      margin: { left: 15, right: 15 }
    });
  }

  doc.save(`MediaPlan_Report_${Date.now()}.pdf`);
}
