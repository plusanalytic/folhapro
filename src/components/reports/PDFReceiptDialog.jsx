import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Printer } from 'lucide-react';
import { getMonthName, calculatePayroll, calculateEscritorioPayroll } from '@/lib/payrollCalculations';
import { absenceDiscountByPeriod } from '@/components/payroll/AbsenceDiscountsTable';
import { base44 } from '@/api/base44Client';
import ProLaboreReceiptContent from './ProLaboreReceiptContent';
import EsporadicoReceiptContent from './EsporadicoReceiptContent';
import { HoleriteContent, MeiHoleriteContent, EscritorioHoleriteContent } from './ReceiptContents';

export default function PDFReceiptDialog({ employee, entry, referenceMonth, onClose, company, payrollType, jobRoleName }) {
  const printRef = useRef();
  const [mergedEntry, setMergedEntry] = useState(entry);
  const [paymentStatus, setPaymentStatus] = useState(null);

  useEffect(() => {
    Promise.all([
      base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: referenceMonth }),
      base44.entities.PointAdjustment.filter({ employee_id: employee.id }),
      base44.entities.PaymentStatus.filter({ payroll_entry_id: entry.id }),
    ]).then(([cashOuts, allPA, payStatuses]) => {
      setPaymentStatus(payStatuses?.[0] ?? null);
      const pointAdjustments = allPA.filter(a => (a.start_date || '').startsWith(referenceMonth));
      // Apenas descontar no PDF se estiver marcado "Descontar do colaborador"
      const toDeduct = cashOuts.filter(c => c.deduct_from_payroll);
      const firstFromCash  = toDeduct.filter(c => c.period === 'first').map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));
      const secondFromCash = toDeduct.filter(c => c.period === 'second').map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));
      const savedFirst  = (entry?.first_discounts  ?? []).filter(x => !x.fromCashOut);
      const savedSecond = (entry?.second_discounts ?? []).filter(x => !x.fromCashOut);
      const firstDiscounts  = [...savedFirst,  ...firstFromCash];
      const secondDiscounts = [...savedSecond, ...secondFromCash];
      const firstTotal  = firstDiscounts.reduce((s, x) => x.type === 'credit' ? s - (x.amount || 0) : s + (x.amount || 0), 0);
      const secondTotal = secondDiscounts.reduce((s, x) => x.type === 'credit' ? s - (x.amount || 0) : s + (x.amount || 0), 0);
      const absenceMap = entry?.absence_discounts ?? {};
      const { first: absenceFirst, second: absenceSecond } = absenceDiscountByPeriod(absenceMap);

      if (payrollType === 'ESCRITORIO') {
        const calcEsc = calculateEscritorioPayroll({
          base_salary: entry?.base_salary ?? 0,
          meal_voucher_day_value: entry?.meal_voucher_day_value ?? 0,
          meal_voucher_days: entry?.meal_voucher_days ?? 0,
          meal_voucher_discount_pct: entry?.meal_voucher_discount_pct ?? 0,
          transport_voucher_day_value: entry?.transport_voucher_day_value ?? 0,
          transport_voucher_days: entry?.transport_voucher_days ?? 0,
          transport_voucher_discount_pct: entry?.transport_voucher_discount_pct ?? 0,
          inss_pct: entry?.inss_pct ?? 0,
          inss_deduction: entry?.inss_deduction ?? 0,
          dental_plan: entry?.dental_plan ?? 0,
          food_voucher: entry?.food_voucher ?? 0,
          bonus: entry?.bonus ?? 0,
          birthday_bonus: entry?.birthday_bonus ?? 0,
          absence_discount_first: absenceFirst,
          absence_discount_second: absenceSecond,
          first_period_advance: entry?.first_period_advance ?? 0,
          first_period_discount: firstTotal,
          second_period_discount: secondTotal,
          first_period_split: entry?.first_period_split ?? 0.5,
        });
        setMergedEntry({
          ...entry,
          first_discounts: firstDiscounts, second_discounts: secondDiscounts,
          first_period_discount: firstTotal, second_period_discount: secondTotal,
          absence_discount_first: absenceFirst, absence_discount_second: absenceSecond,
          absence_discount: absenceFirst + absenceSecond,
          first_period_net: calcEsc.first_period_net, second_period_net: calcEsc.second_period_net,
          _pointAdjustments: pointAdjustments,
        });
      } else if (payrollType === 'MOTOCICLISTA_MEI') {
        const diasQ1     = entry?.working_days_first  ?? 0;
        const diasQ2     = entry?.working_days_second ?? 0;
        const totalDias  = diasQ1 + diasQ2 || 1;
        const grossTotal = entry?.gross_total ?? 0;
        const firstBase  = entry?.first_period_base  != null ? entry.first_period_base  : Math.round(grossTotal * (diasQ1 / totalDias) * 100) / 100;
        const secondBase = entry?.second_period_base != null ? entry.second_period_base : Math.round(grossTotal * (diasQ2 / totalDias) * 100) / 100;
        const foodVoucher = entry?.food_voucher ?? 0;
        const lifeIns     = entry?.life_insurance ?? 0;
        const firstAdv    = entry?.first_period_advance ?? 0;
        const kmBonus     = entry?.km_bonus ?? Math.round(((entry?.km_bonus_qty||0)*(entry?.km_bonus_value||0))*100)/100;
        const costAllow   = entry?.cost_allowance ?? 0;
        setMergedEntry({
          ...entry,
          first_discounts: firstDiscounts, second_discounts: secondDiscounts,
          first_period_discount: firstTotal, second_period_discount: secondTotal,
          first_period_base: firstBase, second_period_base: secondBase,
          first_period_net:  Math.round((firstBase - lifeIns - firstAdv - firstTotal) * 100) / 100,
          second_period_net: Math.round((secondBase + kmBonus + costAllow + foodVoucher - secondTotal) * 100) / 100,
          _pointAdjustments: pointAdjustments,
        });
      } else {
        // CLT Moto: usa EXCLUSIVAMENTE os valores salvos no banco.
        // first_period_net/second_period_net já incluem todos os descontos do ultimo save.
        const isCLTMotoPayroll = payrollType === 'MOTOCICLISTA_CLT';
        const fullMonthDays = entry?.full_month_contract_working_days ?? 0;
        const contractDays  = entry?.contract_working_days ?? 0;
        const motoRatio     = (isCLTMotoPayroll && fullMonthDays > 0) ? contractDays / fullMonthDays : 1;
        const effFoodVoucher   = Math.round((entry?.food_voucher   ?? 0) * motoRatio * 100) / 100;
        const effCostAllowance = Math.round((entry?.cost_allowance ?? 0) * motoRatio * 100) / 100;
        const effMotoRental    = Math.round((entry?.motorcycle_rental ?? 0) * motoRatio * 100) / 100;
        // Recalcula os totais de faltas por quinzena a partir do mapa detalhado (absence_discounts)
        const absenceMap = entry?.absence_discounts ?? {};
        const { first: absenceFirst, second: absenceSecond } = absenceDiscountByPeriod(absenceMap);

        setMergedEntry({
          ...entry,
          absence_discount_first:  absenceFirst,
          absence_discount_second: absenceSecond,
          first_discounts:  entry?.first_discounts  ?? [],
          second_discounts: entry?.second_discounts ?? [],
          food_voucher: effFoodVoucher,
          cost_allowance: effCostAllowance,
          motorcycle_rental: effMotoRental,
          _pointAdjustments: pointAdjustments,
        });
      }
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