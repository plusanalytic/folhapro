import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Printer, Download } from 'lucide-react';
import { getMonthName } from '@/lib/payrollCalculations';
import { base44 } from '@/api/base44Client';
import ProLaboreReceiptContent from './ProLaboreReceiptContent';
import EsporadicoReceiptContent from './EsporadicoReceiptContent';
import { HoleriteContent, MeiHoleriteContent, EscritorioHoleriteContent, MealVoucherReceiptContent, MotoReceiptContent, FaltasDetailPage, hasFaltasData } from './ReceiptContents';
import { renderMultiPagePDF, getReceiptComponent } from '@/lib/pdfUtils.jsx';
import { buildMergedPayrollEntry } from '@/lib/buildMergedPayrollEntry';

const A4_STYLE = { width: '210mm', padding: '16mm', fontFamily: 'Arial, sans-serif', backgroundColor: '#fff', boxSizing: 'border-box' };
const VRPage = (props) => <div style={A4_STYLE}><MealVoucherReceiptContent {...props} /></div>;
const MotoPage = (props) => <div style={A4_STYLE}><MotoReceiptContent {...props} /></div>;

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

  const handlePrint = async () => {
    setDownloading(true);
    try {
      const MainComp = getReceiptComponent(payrollType);
      const baseProps = { employee: empWithPos, entry: mergedEntry, month: referenceMonth, company, paymentStatus };
      const pages = [{ Component: MainComp, props: { ...baseProps, hideSections: true } }];

      const mealVoucherValue = (mergedEntry?.meal_voucher_day_value ?? 0) * (mergedEntry?.meal_voucher_days ?? 0);
      if (payrollType === 'MOTOCICLISTA_CLT' && mealVoucherValue > 0) {
        pages.push({ Component: VRPage, props: { employee: empWithPos, mealVoucherValue, month: referenceMonth } });
      }
      if ((mergedEntry?.motorcycle_rental ?? 0) > 0 && (payrollType === 'MOTOCICLISTA_CLT' || payrollType === 'MOTOCICLISTA_MEI')) {
        pages.push({ Component: MotoPage, props: { employee: empWithPos, entry: mergedEntry, month: referenceMonth } });
      }
      if (hasFaltasData(mergedEntry)) {
        pages.push({ Component: FaltasDetailPage, props: { entry: mergedEntry, employee: empWithPos, company, month: referenceMonth } });
      }

      const blob = await renderMultiPagePDF(pages);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Recibo_${employee.name.replace(/\s+/g, '_')}_${referenceMonth}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setDownloading(false);
    }
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
              <Button onClick={handlePrint} disabled={downloading} className="gap-2 shrink-0">
                <Printer className="w-4 h-4" /> {downloading ? 'Gerando...' : 'Imprimir PDF'}
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div ref={printRef} className="overflow-auto bg-white -mx-6">
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