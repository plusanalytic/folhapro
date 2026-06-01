import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Printer } from 'lucide-react';
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

  const empWithPos = { ...employee, position: employee.position || jobRoleName };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>Recibo — {employee.name} — {getMonthName(referenceMonth)}</DialogTitle>
            <Button onClick={handlePrint} className="gap-2 shrink-0">
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </Button>
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