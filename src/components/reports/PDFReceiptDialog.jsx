import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Printer, Download } from 'lucide-react';
import { getMonthName } from '@/lib/payrollCalculations';
import { base44 } from '@/api/base44Client';
import ProLaboreReceiptContent from './ProLaboreReceiptContent';
import EsporadicoReceiptContent from './EsporadicoReceiptContent';
import { HoleriteContent, MeiHoleriteContent, EscritorioHoleriteContent } from './ReceiptContents';
import { buildMergedPayrollEntry } from '@/lib/buildMergedPayrollEntry';

export default function PDFReceiptDialog({ employee, entry, referenceMonth, onClose, company, payrollType, jobRoleName }) {
  const printRef = useRef();
  const [mergedEntry, setMergedEntry] = useState(entry);
  const [paymentStatus, setPaymentStatus] = useState(null);

  useEffect(() => {
    buildMergedPayrollEntry(employee, entry, payrollType).then(({ mergedEntry, paymentStatus: ps }) => {
      setMergedEntry(mergedEntry);
      setPaymentStatus(ps);
    });
  }, [employee.id, referenceMonth]);

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head>
      <title>Recibo — ${employee.name} — ${getMonthName(referenceMonth)}</title>
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: Arial, sans-serif; background: #fff; }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } @page { margin: 0; } }
      </style></head><body>${content}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };

  const handleDownload = async () => {
    setDownloading(true);
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    const container = printRef.current;
    const canvas = await html2canvas(container, {
      scale: 1.5, useCORS: true, backgroundColor: '#ffffff',
      logging: false, width: 794, windowWidth: 794,
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.88);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height / canvas.width) * pdfW;
    if (imgH <= pageH) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH);
    } else {
      const scale = pageH / imgH;
      const scaledW = pdfW * scale;
      pdf.addImage(imgData, 'JPEG', (pdfW - scaledW) / 2, 0, scaledW, pageH);
    }
    pdf.save(`Recibo_${employee.name.replace(/\s+/g, '_')}_${referenceMonth}.pdf`);
    setDownloading(false);
  };

  const [downloading, setDownloading] = useState(false);
  const empWithPos = { ...employee, position: employee.position || jobRoleName };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>Recibo — {employee.name} — {getMonthName(referenceMonth)}</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handleDownload} disabled={downloading} variant="outline" className="gap-2 shrink-0">
                <Download className="w-4 h-4" /> {downloading ? 'Gerando...' : 'Baixar PDF'}
              </Button>
              <Button onClick={handlePrint} className="gap-2 shrink-0">
                <Printer className="w-4 h-4" /> Imprimir / PDF
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div ref={printRef} className="overflow-auto bg-white">
          {payrollType === 'ESCRITORIO'
            ? <EscritorioHoleriteContent employee={empWithPos} entry={mergedEntry} month={referenceMonth} company={company} paymentStatus={paymentStatus} />
            : payrollType === 'MOTOCICLISTA_MEI'
              ? <MeiHoleriteContent employee={empWithPos} entry={mergedEntry} month={referenceMonth} company={company} paymentStatus={paymentStatus} />
              : payrollType === 'SOCIO'
                ? <ProLaboreReceiptContent employee={empWithPos} entry={mergedEntry} month={referenceMonth} company={company} paymentStatus={paymentStatus} />
                : payrollType === 'ESPORADICO'
                  ? <EsporadicoReceiptContent employee={empWithPos} entry={mergedEntry} month={referenceMonth} company={company} paymentStatus={paymentStatus} />
                  : <HoleriteContent employee={empWithPos} entry={mergedEntry} month={referenceMonth} company={company} paymentStatus={paymentStatus} />
          }
        </div>
      </DialogContent>
    </Dialog>
  );
}