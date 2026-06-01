import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getMonthName } from './payrollCalculations';
import { buildMergedPayrollEntry } from './buildMergedPayrollEntry';
import ProLaboreReceiptContent from '../components/reports/ProLaboreReceiptContent';
import EsporadicoReceiptContent from '../components/reports/EsporadicoReceiptContent';
import { HoleriteContent, MeiHoleriteContent, EscritorioHoleriteContent } from '../components/reports/ReceiptContents';

export async function printReceiptDirect({ employee, entry, referenceMonth, company, payrollType, jobRoleName }) {
  const empWithPos = { ...employee, position: employee.position || jobRoleName };
  const { mergedEntry, paymentStatus } = await buildMergedPayrollEntry(employee, entry, payrollType);

  const Component =
    payrollType === 'ESCRITORIO' ? EscritorioHoleriteContent
    : payrollType === 'MOTOCICLISTA_MEI' ? MeiHoleriteContent
    : payrollType === 'SOCIO' ? ProLaboreReceiptContent
    : payrollType === 'ESPORADICO' ? EsporadicoReceiptContent
    : HoleriteContent;

  const html = renderToStaticMarkup(
    createElement(Component, {
      employee: empWithPos,
      entry: mergedEntry,
      month: referenceMonth,
      company,
      paymentStatus,
    })
  );

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head>
    <title>Recibo \u2014 ${employee.name} \u2014 ${getMonthName(referenceMonth)}</title>
    <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: Arial, sans-serif; background: #fff; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } @page { margin: 0; } }
    </style></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 300);
}