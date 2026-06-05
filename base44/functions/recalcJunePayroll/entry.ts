import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Feriados nacionais fixos (MM-DD) ────────────────────────────────────────
const FIXED_HOLIDAYS = new Set(['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25']);

// ─── Cálculo da Páscoa (algoritmo de Butcher/Oudin) ──────────────────────────
function calcEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getHolidaysForYear(year) {
  const holidays = new Set(FIXED_HOLIDAYS);
  const easter = calcEaster(year);
  const fmt = (d) => `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const goodFriday = new Date(easter); goodFriday.setDate(easter.getDate() - 2);
  holidays.add(fmt(goodFriday));
  const corpusChristi = new Date(easter); corpusChristi.setDate(easter.getDate() + 60);
  holidays.add(fmt(corpusChristi));
  return holidays;
}

// Dias úteis Seg-Sáb excl. feriados (contrato CLT Moto)
function calcWorkingDays(yearMonth, includeSat = true) {
  const [yr, mo] = yearMonth.split('-').map(Number);
  const holidays = getHolidaysForYear(yr);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(yr, mo - 1, d).getDay();
    if (dow === 0) continue;
    if (!includeSat && dow === 6) continue;
    const mmdd = `${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidays.has(mmdd)) continue;
    count++;
  }
  return count;
}

// Dias úteis VR: apenas Seg-Sex, excl. feriados
function calcVRWorkingDays(yearMonth) {
  const [yr, mo] = yearMonth.split('-').map(Number);
  const holidays = getHolidaysForYear(yr);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(yr, mo - 1, d).getDay();
    if (dow === 0 || dow === 6) continue;
    const mmdd = `${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidays.has(mmdd)) continue;
    count++;
  }
  return count;
}

// Dias úteis MEI (Seg-Sex) por quinzena
function calcMeiWorkingDaysByPeriod(yearMonth) {
  const [yr, mo] = yearMonth.split('-').map(Number);
  const holidays = getHolidaysForYear(yr);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  let first = 0, second = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(yr, mo - 1, d).getDay();
    if (dow === 0 || dow === 6) continue;
    const mmdd = `${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidays.has(mmdd)) continue;
    if (d <= 15) first++; else second++;
  }
  return { first, second, total: first + second };
}

const r = (v) => Math.round((v ?? 0) * 100) / 100;

// INSS progressivo 2026
function calcAutoINSS(salaryBase) {
  if (salaryBase <= 1518.00) return { pct: 7.5,  discount: 0 };
  if (salaryBase <= 2793.88) return { pct: 9,    discount: 22.77 };
  if (salaryBase <= 4190.83) return { pct: 12,   discount: 106.59 };
  return                            { pct: 14,   discount: 190.37 };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const TARGET_MONTH = '2026-06';

    const allEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ reference_month: TARGET_MONTH }, null, 5000);
    await new Promise(r => setTimeout(r, 300));
    const allEmployees = await base44.asServiceRole.entities.Employee.list(null, 5000);
    await new Promise(r => setTimeout(r, 300));
    const allJobRoles = await base44.asServiceRole.entities.JobRole.list(null, 5000);
    await new Promise(r => setTimeout(r, 300));
    const allWorkplaces = await base44.asServiceRole.entities.Workplace.list(null, 5000);

    const empMap = {};
    for (const e of allEmployees) empMap[e.id] = e;
    const jobRoleMap = {};
    for (const jr of allJobRoles) if (jr.tangerino_id) jobRoleMap[String(jr.tangerino_id)] = jr;
    const workplaceMap = {};
    for (const w of allWorkplaces) if (w.tangerino_id) workplaceMap[String(w.tangerino_id)] = w;

    // Valores corretos para junho 2026
    const vrDays = calcVRWorkingDays(TARGET_MONTH);           // Seg-Sex excl. feriados (para VR)
    const meiPeriods = calcMeiWorkingDaysByPeriod(TARGET_MONTH);

    let updated = 0, skipped = 0;
    const details = [];

    for (const entry of allEntries) {
      // Não alterar folhas fechadas (primeira quinzena paga)
      if (entry.first_period_base_locked === true) {
        skipped++;
        continue;
      }

      const emp = empMap[entry.employee_id];
      if (!emp) { skipped++; continue; }

      const empJRTangeId = emp.job_role_tangerino_id ? String(emp.job_role_tangerino_id) : null;
      const empJobRole = empJRTangeId ? jobRoleMap[empJRTangeId] : null;
      const payrollType = empJobRole?.payroll_type;

      const empWorkplaceList = emp.workplace_list || [];
      const workplace = empWorkplaceList.length > 0 ? workplaceMap[String(empWorkplaceList[0])] : null;

      let updateData = null;

      // ── MOTOCICLISTA CLT ──────────────────────────────────────────────────
      if (payrollType === 'MOTOCICLISTA_CLT') {
        const includeSat = !workplace || workplace.work_schedule !== 'seg_sex';
        const fullMonthDays = calcWorkingDays(TARGET_MONTH, includeSat);

        // Só recalcula se o valor atual estiver diferente (evita reprocessar entradas já corretas)
        if (entry.full_month_contract_working_days === fullMonthDays && entry.meal_voucher_days === vrDays) {
          skipped++;
          continue;
        }

        const mvDayValue = entry.meal_voucher_day_value || 0;
        const mealVoucher = r(mvDayValue * vrDays);
        const mvDiscountPct = entry.meal_voucher_discount_pct || 0;
        const mealVoucherDiscount = r(mealVoucher * (mvDiscountPct / 100));
        const mealVoucherNet = r(mealVoucher - mealVoucherDiscount);

        const cltMotoBaseSalary = entry.clt_moto_base_salary || entry.base_salary || 0;
        const hazardPay = r(cltMotoBaseSalary * 0.3);
        const { pct: inssPct, discount: inssDiscount } = calcAutoINSS(cltMotoBaseSalary + hazardPay);

        const grossTotal = r(cltMotoBaseSalary + (entry.motorcycle_rental || 0) + mealVoucher + hazardPay);
        const inssBase = cltMotoBaseSalary + hazardPay;
        const inss = r(inssBase * (inssPct / 100) - inssDiscount);
        const inssNet = Math.max(0, inss);
        const unionContrib = entry.union_contribution_value || 0;
        const lifeInsurance = entry.life_insurance || 0;

        const netTotal = r(grossTotal - inssNet - unionContrib - mealVoucherDiscount - lifeInsurance);
        const split = entry.first_period_split ?? 0.5;
        const firstBase = r(netTotal * split);
        const secondBase = r(netTotal * (1 - split));

        const fullDays = fullMonthDays || 1;
        const contractDays = entry.contract_working_days === entry.full_month_contract_working_days
          ? fullMonthDays  // mês cheio → usa novo fullMonthDays
          : entry.contract_working_days; // parcial → mantém dias trabalhados reais
        const foodEff = r((entry.food_voucher || 0) / fullDays * (contractDays || fullDays));
        const costEff = r((entry.cost_allowance || 0) / fullDays * (contractDays || fullDays));

        const firstPeriodNet = r(firstBase - (entry.first_period_advance || 0) - (entry.first_period_discount || 0) - (entry.absence_discount_first || 0));
        const secondPeriodNet = r(secondBase + foodEff + (entry.km_bonus || 0) + costEff - (entry.second_period_discount || 0) - (entry.absence_discount_second || 0));

        updateData = {
          full_month_contract_working_days: fullMonthDays,
          contract_working_days: contractDays,
          meal_voucher_days: vrDays,
          meal_voucher: mealVoucherNet,
          meal_voucher_discount: mealVoucherDiscount,
          hazard_pay: hazardPay,
          inss_pct: inssPct,
          inss_discount: inssDiscount,
          gross_total: grossTotal,
          net_total: netTotal,
          first_period_base: firstBase,
          second_period_base: secondBase,
          first_period_net: firstPeriodNet,
          second_period_net: secondPeriodNet,
        };
      }

      // ── MOTOCICLISTA MEI ──────────────────────────────────────────────────
      else if (payrollType === 'MOTOCICLISTA_MEI') {
        if (entry.working_days_month === meiPeriods.total && entry.working_days_first === meiPeriods.first) {
          skipped++;
          continue;
        }

        const valorBase = entry.base_salary || 0;
        const diasMes = meiPeriods.total || 1;
        const diasTrabalhados = entry.working_days_worked === entry.working_days_month
          ? meiPeriods.total
          : entry.working_days_worked;
        const remuneracao = r((valorBase / diasMes) * diasTrabalhados);
        const grossTotal = r(remuneracao + (entry.km_bonus || 0) + (entry.motorcycle_rental || 0) + (entry.other_benefits || 0));
        const netTotal = grossTotal;
        const diasQ1 = meiPeriods.first;
        const diasQ2 = meiPeriods.second;
        const totalQDias = diasQ1 + diasQ2 || 1;
        const splitFirst = diasQ1 / totalQDias;
        const firstBase = r(netTotal * splitFirst);
        const secondBase = r(netTotal * (1 - splitFirst));
        const firstPeriodNet = r(firstBase - (entry.life_insurance || 0) - (entry.first_period_advance || 0) - (entry.first_period_discount || 0));
        const secondPeriodNet = r(secondBase + (entry.food_voucher || 0) + (entry.km_bonus || 0) + (entry.cost_allowance || 0) + (entry.bonus || 0) + (entry.overtime || 0) - (entry.second_period_discount || 0));

        updateData = {
          working_days_month: meiPeriods.total,
          working_days_worked: diasTrabalhados,
          working_days_first: meiPeriods.first,
          working_days_second: meiPeriods.second,
          gross_total: grossTotal,
          net_total: netTotal,
          first_period_base: firstBase,
          second_period_base: secondBase,
          first_period_split: splitFirst,
          first_period_net: firstPeriodNet,
          second_period_net: secondPeriodNet,
        };
      }

      if (!updateData) { skipped++; continue; }

      // Retry com backoff em caso de rate limit
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await base44.asServiceRole.entities.PayrollEntry.update(entry.id, updateData);
          break;
        } catch (err) {
          if (attempt === 4) throw err;
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
      updated++;
      details.push({ employee_id: entry.employee_id, payroll_type: payrollType });
      await new Promise(r => setTimeout(r, 200));
    }

    return Response.json({
      success: true,
      updated,
      skipped,
      target_month: TARGET_MONTH,
      vr_days: vrDays,
      mei_days: meiPeriods,
      details,
      message: `${updated} folha(s) de ${TARGET_MONTH} recalculada(s) com feriados corretos. ${skipped} ignorada(s).`,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});