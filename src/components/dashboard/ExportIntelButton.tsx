import { useState } from 'react';
import { Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';

const EXPORT_ROOT_ID = 'dashboard-main-capture';

export function ExportIntelButton() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting) return;

    const captureRoot = document.getElementById(EXPORT_ROOT_ID);
    if (!captureRoot) return;

    setIsExporting(true);
    captureRoot.classList.add('print-mode');

    try {
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));

      const canvas = await html2canvas(captureRoot, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#020617',
        logging: false,
      });

      const imageData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imageData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imageData, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
      }

      pdf.save('MediaPlanner_Pro_Strategy.pdf');
    } finally {
      captureRoot.classList.remove('print-mode');
      setIsExporting(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={isExporting}
      className="print-mode-hide cta-glow gap-2 backdrop-blur-md bg-slate-800/50 hover:bg-cyan-900/50 border border-cyan-700/50 text-cyan-50 transition-all shadow-lg"
      type="button"
    >
      <Download className="h-4 w-4" />
      {isExporting ? 'Exporting...' : 'Export Intel'}
    </Button>
  );
}
