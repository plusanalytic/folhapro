/**
 * Fonte única de verdade para montar o mergedEntry de um recibo de folha.
 * Usado tanto pelo PDFReceiptDialog (individual) quanto pelo BulkPDFDialog (lote).
 * Qualquer alteração aqui reflete automaticamente nos dois.
 */
import { calculateEscritorioPayroll } from '@/lib/payrollCalculations';
import { absenceDiscountByPeriod } from '@/components/payroll/AbsenceDiscountsTable';
import { base44 } from '@/api/base44Client';

export async function buildMergedPayrollEntry(employee, entry, payrollType) {
  const [cashOuts, allPA, payStatuses] = await Promise.all([
    base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: entry.reference_month }),
    base44.entities.PointAdjustment.filter({ employee_id: employee.id }),
    base44.entities.PaymentStatus.filter({ payroll_entry_id: entry.id }),
  ]);

  const paymentStatus = payStatuses?.[0] ?? null;
  const pointAdjustments = allPA.filter(a => (a.start_date || '').startsWith(entry.reference_month));

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

  let mergedEntry;

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
    mergedEntry = {
      ...entry,
      first_discounts: firstDiscounts, second_discounts: secondDiscounts,
      first_period_discount: firstTotal, second_period_discount: secondTotal,
      absence_discount_first: absenceFirst, absence_discount_second: absenceSecond,
      absence_discount: absenceFirst + absenceSecond,
      first_period_net: calcEsc.first_period_net, second_period_net: calcEsc.second_period_net,
      _pointAdjustments: pointAdjustments,
    };
  } else if (payrollType === 'MOTOCICLISTA_MEI') {
    const diasQ1    = entry?.working_days_first  ?? 0;
    const diasQ2    = entry?.working_days_second ?? 0;
    const totalDias = diasQ1 + diasQ2 || 1;
    const grossTotal = entry?.gross_total ?? 0;
    const firstBase  = entry?.first_period_base  != null ? entry.first_period_base  : Math.round(grossTotal * (diasQ1 / totalDias) * 100) / 100;
    const secondBase = entry?.second_period_base != null ? entry.second_period_base : Math.round(grossTotal * (diasQ2 / totalDias) * 100) / 100;
    const foodVoucher = entry?.food_voucher ?? 0;
    const lifeIns     = entry?.life_insurance ?? 0;
    const firstAdv    = entry?.first_period_advance ?? 0;
    const kmBonus     = entry?.km_bonus ?? Math.round(((entry?.km_bonus_qty||0)*(entry?.km_bonus_value||0))*100)/100;
    const costAllow   = entry?.cost_allowance ?? 0;
    mergedEntry = {
      ...entry,
      first_discounts: firstDiscounts, second_discounts: secondDiscounts,
      first_period_discount: firstTotal, second_period_discount: secondTotal,
      first_period_base: firstBase, second_period_base: secondBase,
      first_period_net:  Math.round((firstBase - lifeIns - firstAdv - firstTotal) * 100) / 100,
      second_period_net: Math.round((secondBase + kmBonus + costAllow + foodVoucher - secondTotal) * 100) / 100,
      _pointAdjustments: pointAdjustments,
    };
  } else {
    // CLT Moto / Demais CLT / ESPORADICO / SOCIO
    // Usa os valores salvos no banco — first_period_net/second_period_net já incluem todos os descontos.
    const isCLTMoto = payrollType === 'MOTOCICLISTA_CLT';
    const fullMonthDays = entry?.full_month_contract_working_days ?? 0;
    const contractDays  = entry?.contract_working_days ?? 0;
    const motoRatio     = (isCLTMoto && fullMonthDays > 0) ? contractDays / fullMonthDays : 1;
    const effFoodVoucher   = Math.round((entry?.food_voucher   ?? 0) * motoRatio * 100) / 100;
    const effCostAllowance = Math.round((entry?.cost_allowance ?? 0) * motoRatio * 100) / 100;
    const effMotoRental    = Math.round((entry?.motorcycle_rental ?? 0) * motoRatio * 100) / 100;
    mergedEntry = {
      ...entry,
      absence_discount_first:  absenceFirst,
      absence_discount_second: absenceSecond,
      first_discounts:  firstDiscounts,
      second_discounts: secondDiscounts,
      food_voucher: effFoodVoucher,
      cost_allowance: effCostAllowance,
      motorcycle_rental: effMotoRental,
      _pointAdjustments: pointAdjustments,
    };
  }

  return { mergedEntry, paymentStatus };
}