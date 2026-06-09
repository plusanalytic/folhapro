import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

// ─── Retorna Set de feriados para um ano (MM-DD) ──────────────────────────────
function getHolidaysForYear(year) {
  const holidays = new Set(FIXED_HOLIDAYS);
  const easter = calcEaster(year);
  // Sexta-Feira Santa (2 dias antes da Páscoa)
  const goodFriday = new Date(easter); goodFriday.setDate(easter.getDate() - 2);
  // Corpus Christi (60 dias após a Páscoa)
  const corpusChristi = new Date(easter); corpusChristi.setDate(easter.getDate() + 60);
  // Carnaval — Terça-Feira Gorda (47 dias antes da Páscoa) — opcional, muitos contratos não contam
  // const carnival = new Date(easter); carnival.setDate(easter.getDate() - 47);

  const fmt = (d) => `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  holidays.add(fmt(goodFriday));
  holidays.add(fmt(corpusChristi));
  return holidays;
}

// ─── Dias úteis (Seg–Sáb por padrão, ou Seg–Sex se includeSat=false) ─────────
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

// ─── Dias úteis VR (Seg–Sex, excl. feriados) ─────────────────────────────────
function calcVRWorkingDays(yearMonth) {
  const [yr, mo] = yearMonth.split('-').map(Number);
  const holidays = getHolidaysForYear(yr);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(yr, mo - 1, d).getDay();
    if (dow === 0 || dow === 6) continue; // exclui sábado e domingo
    const mmdd = `${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidays.has(mmdd)) continue;
    count++;
  }
  return count;
}

// ─── Dias úteis MEI (Seg–Sex) separados por quinzena ─────────────────────────
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

// ─── INSS automático CLT Moto (tabela progressiva 2026) ──────────────────────
function calcAutoINSS(salaryBase) {
  // Tabela progressiva 2026 (simplificada em pct + deducao fixa)
  if (salaryBase <= 1518.00) return { pct: 7.5,  discount: 0 };
  if (salaryBase <= 2793.88) return { pct: 9,    discount: 22.77 };
  if (salaryBase <= 4190.83) return { pct: 12,   discount: 106.59 };
  if (salaryBase <= 8157.41) return { pct: 14,   discount: 190.37 };
  return                            { pct: 14,   discount: 190.37 }; // teto
}

// ─── Cálculo ESCRITÓRIO ───────────────────────────────────────────────────────
function calcEscritorio(entry) {
  const piso       = entry.base_salary || 0;
  const extraBonus = entry.extra_bonus || 0;
  const mealVoucher = Math.round((entry.meal_voucher_day_value || 0) * (entry.meal_voucher_days || 0) * 100) / 100;
  const transportVoucher = Math.round((entry.transport_voucher_day_value || 0) * (entry.transport_voucher_days || 0) * 100) / 100;
  const mealVoucherDiscount = Math.round(mealVoucher * ((entry.meal_voucher_discount_pct || 0) / 100) * 100) / 100;
  const transportVoucherDiscount = Math.round(transportVoucher * ((entry.transport_voucher_discount_pct || 0) / 100) * 100) / 100;
  const inssPct     = entry.inss_pct || 0;
  const inssGross   = Math.round(piso * (inssPct / 100) * 100) / 100;
  const inssDeduction = entry.inss_deduction || 0;
  const inssNet     = Math.max(0, Math.round((inssGross - inssDeduction) * 100) / 100);
  const totalDescConvencao = transportVoucherDiscount + mealVoucherDiscount + inssNet;
  const liquidoConvencao   = piso + mealVoucher - totalDescConvencao;
  const foodVoucher    = entry.food_voucher || 0;
  const bonus          = entry.bonus || 0;
  const attendanceBonus = entry.attendance_bonus || 0;
  const birthdayBonus  = entry.birthday_bonus || 0;
  const fgts = Math.round(piso * 0.08 * 100) / 100;
  const grossTotal = piso + mealVoucher + extraBonus;
  const netTotal   = liquidoConvencao + extraBonus;
  const split = entry.first_period_split ?? 0.5;
  const firstBase  = Math.round(netTotal * split * 100) / 100;
  const secondBase = Math.round(netTotal * (1 - split) * 100) / 100;
  const firstPeriodNet  = firstBase  - (entry.first_period_advance || 0) - (entry.first_period_discount || 0) - (entry.absence_discount_first || 0);
  const secondPeriodNet = secondBase + foodVoucher + bonus + attendanceBonus + birthdayBonus - (entry.second_period_discount || 0) - (entry.absence_discount_second || 0);
  return {
    meal_voucher: mealVoucher, transport_voucher: transportVoucher,
    inss: inssGross, inss_net: inssNet, inss_deduction: inssDeduction,
    transport_voucher_discount: transportVoucherDiscount, meal_voucher_discount: mealVoucherDiscount,
    gross_total: Math.round(grossTotal * 100) / 100,
    net_total: Math.round(netTotal * 100) / 100,
    fgts, irrf: 0,
    first_period_base: firstBase, second_period_base: secondBase,
    first_period_net: Math.round(firstPeriodNet * 100) / 100,
    second_period_net: Math.round(secondPeriodNet * 100) / 100,
  };
}

// ─── Cálculo MOTOCICLISTA CLT ─────────────────────────────────────────────────
function calcCLTMoto(entry) {
  const baseSalary  = entry.base_salary || 0;
  const mealVoucher = Math.round((entry.meal_voucher_day_value || 0) * (entry.meal_voucher_days || 0) * 100) / 100;
  // km_bonus_qty e km_bonus_value zerados → km_bonus = 0
  const kmBonus     = Math.round((entry.km_bonus_qty || 0) * (entry.km_bonus_value || 0) * 100) / 100;
  const unionContrib = entry.union_contribution_value != null ? (entry.union_contribution_value || 0) : 35;
  const mealVoucherDiscount = Math.round(mealVoucher * ((entry.meal_voucher_discount_pct || 0) / 100) * 100) / 100;
  const lifeInsurance = entry.life_insurance || 0;
  const grossTotal    = baseSalary + (entry.motorcycle_rental || 0) + mealVoucher + (entry.hazard_pay || 0);
  const inssBase      = baseSalary + (entry.hazard_pay || 0);
  let inss = 0;
  if (entry.inss_pct != null && entry.inss_pct > 0) {
    inss = Math.round(inssBase * (entry.inss_pct / 100) * 100) / 100;
  }
  const inssDiscount = Math.min(entry.inss_discount || 0, inss);
  const inssNet      = Math.max(0, inss - inssDiscount);
  const fgts         = Math.round(baseSalary * 0.08 * 100) / 100;
  const netTotal     = grossTotal - inssNet - unionContrib - mealVoucherDiscount - lifeInsurance;
  const split        = entry.first_period_split ?? 0.5;
  const firstBase    = Math.round(netTotal * split * 100) / 100;
  const secondBase   = Math.round(netTotal * (1 - split) * 100) / 100;

  const fullDays   = entry.full_month_contract_working_days || 1;
  const workedDays = entry.contract_working_days || fullDays;
  const foodEff    = Math.round((entry.food_voucher || 0) / fullDays * workedDays * 100) / 100;
  const costEff    = Math.round((entry.cost_allowance || 0) / fullDays * workedDays * 100) / 100;
  // extras variáveis são todos zerados no clone
  const cltExtra   = (entry.delivery_bonus || 0) + (entry.delivery_target_bonus || 0) + (entry.attendance_bonus || 0) + (entry.route_sp_bonus || 0) + (entry.overtime || 0);

  const firstPeriodNet  = firstBase  - (entry.first_period_advance || 0) - (entry.first_period_discount || 0) - (entry.absence_discount_first || 0);
  const secondPeriodNet = secondBase + foodEff + kmBonus + costEff - (entry.second_period_discount || 0) - (entry.absence_discount_second || 0) + cltExtra;

  return {
    km_bonus: kmBonus, meal_voucher: mealVoucher,
    inss, inss_net: inssNet, fgts, irrf: 0,
    union_contribution: unionContrib, meal_voucher_discount: mealVoucherDiscount,
    gross_total: Math.round(grossTotal * 100) / 100,
    net_total: Math.round(netTotal * 100) / 100,
    first_period_base: firstBase, second_period_base: secondBase,
    first_period_net: Math.round(firstPeriodNet * 100) / 100,
    second_period_net: Math.round(secondPeriodNet * 100) / 100,
  };
}

// ─── Cálculo MEI ──────────────────────────────────────────────────────────────
function calcMei(entry) {
  const valorBase       = entry.base_salary || 0;
  const diasMes         = entry.working_days_month || 1;
  const diasTrabalhados = entry.working_days_worked || diasMes;
  const remuneracao     = Math.round((valorBase / diasMes) * diasTrabalhados * 100) / 100;
  // km_bonus_qty e km_bonus_value zerados → km_bonus = 0
  const kmBonus         = Math.round((entry.km_bonus_qty || 0) * (entry.km_bonus_value || 0) * 100) / 100;
  const costAllowance   = entry.cost_allowance || 0;
  const motoRental      = entry.motorcycle_rental || 0;
  const bonus           = entry.bonus || 0;
  const overtime        = entry.overtime || 0;
  const otherBenefits   = entry.other_benefits || 0;
  const foodVoucher     = entry.food_voucher || 0;
  const lifeInsurance   = entry.life_insurance || 0;
  const grossTotal      = remuneracao + kmBonus + motoRental + otherBenefits;
  const netTotal        = grossTotal;
  const diasQ1          = entry.working_days_first || 0;
  const diasQ2          = entry.working_days_second || 0;
  const totalQDias      = diasQ1 + diasQ2 || 1;
  const splitFirst      = diasQ1 / totalQDias;
  const firstBase       = Math.round(netTotal * splitFirst * 100) / 100;
  const secondBase      = Math.round(netTotal * (1 - splitFirst) * 100) / 100;
  const firstPeriodNet  = firstBase  - lifeInsurance - (entry.first_period_advance || 0) - (entry.first_period_discount || 0);
  const secondPeriodNet = secondBase + foodVoucher + kmBonus + costAllowance + bonus + overtime - (entry.second_period_discount || 0);
  return {
    km_bonus: kmBonus,
    gross_total: Math.round(grossTotal * 100) / 100,
    net_total: Math.round(netTotal * 100) / 100,
    first_period_base: firstBase, second_period_base: secondBase,
    first_period_split: splitFirst,
    first_period_net: Math.round(firstPeriodNet * 100) / 100,
    second_period_net: Math.round(secondPeriodNet * 100) / 100,
  };
}

// ─── Cálculo SÓCIO (Pró-Labore) ───────────────────────────────────────────────
function calcProLabore(entry) {
  const proLaboreBase  = entry.base_salary || 0;
  const quotaAdjust    = entry.quota_adjustment || 0;
  const birthdayBonus  = entry.birthday_bonus || 0;
  const profitDist     = entry.profit_distribution || 0;
  const medicalPlan    = entry.medical_plan || 0;
  const otherDiscounts = entry.other_discounts || 0;
  const inssPct        = (entry.inss_pct != null && entry.inss_pct > 0) ? entry.inss_pct / 100 : 0;
  const inss           = inssPct > 0 ? Math.round(proLaboreBase * inssPct * 100) / 100 : 0;
  const grossTotal     = Math.round((proLaboreBase + quotaAdjust) * 100) / 100;
  const irrf           = entry.irrf != null ? entry.irrf : 0;
  const netLabore      = Math.round((grossTotal - inss - irrf) * 100) / 100;
  const split          = entry.first_period_split ?? 0.5;
  const firstBase      = Math.round(netLabore * split * 100) / 100;
  const secondBase     = Math.round((netLabore - firstBase) * 100) / 100;
  const firstPeriodNet  = Math.round((firstBase  - (entry.first_period_discount || 0)) * 100) / 100;
  const secondPeriodNet = Math.round((secondBase + profitDist + birthdayBonus + medicalPlan - otherDiscounts - (entry.second_period_discount || 0)) * 100) / 100;
  return {
    gross_total: grossTotal, inss, irrf,
    net_total: netLabore,
    first_period_base: firstBase, second_period_base: secondBase,
    first_period_net: firstPeriodNet,
    second_period_net: secondPeriodNet,
  };
}

// ─── Retry com backoff exponencial ───────────────────────────────────────────
async function updateWithRetry(base44, entityName, id, data, maxRetries = 4) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await base44.asServiceRole.entities[entityName].update(id, data);
      return;
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      const delay = Math.min(300 * Math.pow(2, attempt), 3000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function createWithRetry(base44, entityName, data, maxRetries = 4) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await base44.asServiceRole.entities[entityName].create(data);
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      const delay = Math.min(300 * Math.pow(2, attempt), 3000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { target_month, company_id, employee_id } = await req.json();
    if (!target_month) return Response.json({ error: 'target_month is required' }, { status: 400 });

    // Mês anterior
    const [year, month] = target_month.split('-').map(Number);
    const prevDate   = new Date(year, month - 2, 1);
    const prev_month = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const prevFilter = { reference_month: prev_month };
    if (company_id)  prevFilter.company_id  = company_id;
    if (employee_id) prevFilter.employee_id = employee_id;

    const [prevEntries, allEmployees, allJobRoles, allWorkplaces, targetCashOuts, existingEntries] = await Promise.all([
      base44.asServiceRole.entities.PayrollEntry.filter(prevFilter, null, 5000),
      base44.asServiceRole.entities.Employee.list(null, 5000),
      base44.asServiceRole.entities.JobRole.list(null, 5000),
      base44.asServiceRole.entities.Workplace.list(null, 5000),
      base44.asServiceRole.entities.CashOut.filter({ reference_month: target_month }, null, 5000),
      base44.asServiceRole.entities.PayrollEntry.filter({ reference_month: target_month }, null, 5000),
    ]);

    if (!prevEntries || prevEntries.length === 0) {
      return Response.json({ cloned: 0, message: `Nenhum lançamento encontrado em ${prev_month}` });
    }

    const empMap      = {};
    for (const e of allEmployees)  empMap[e.id] = e;
    const jobRoleMap  = {};
    for (const jr of allJobRoles)  if (jr.tangerino_id) jobRoleMap[String(jr.tangerino_id)] = jr;
    const workplaceMap = {};
    for (const w of allWorkplaces) if (w.tangerino_id) workplaceMap[String(w.tangerino_id)] = w;
    const existingMap = {};
    const closedEntryKeys = new Set();
    for (const e of existingEntries) {
      const key = `${e.employee_id}_${e.company_id}`;
      existingMap[key] = e.id;
      if (e.status === 'closed') closedEntryKeys.add(key);
    }

    function isFiredBeforeMonth(emp) {
      if (!emp || emp.is_active !== false) return false;
      if (!emp.termination_date) return false;
      return emp.termination_date.slice(0, 7) < target_month;
    }

    function isEsporadico(emp) {
      return emp && emp.contract_type === 'ESPORADICO';
    }

    function hasBirthdayInMonth(emp) {
      if (!emp || !emp.birth_date) return false;
      return emp.birth_date.slice(5, 7) === target_month.slice(5, 7);
    }

    let cloned = 0, skipped = 0, skippedFired = 0, skippedClosed = 0;
    const errors = [];

    for (const prev of prevEntries) {
      const emp = empMap[prev.employee_id];

      if (isFiredBeforeMonth(emp))                    { skippedFired++;   continue; }
      if (isEsporadico(emp))                          { skipped++;        continue; }
      const entryKey = `${prev.employee_id}_${prev.company_id}`;
      if (closedEntryKeys.has(entryKey))              { skippedClosed++; continue; }

      // CashOuts do mês alvo para este colaborador
      const empCashOuts = targetCashOuts.filter(c =>
        c.employee_id === prev.employee_id && c.deduct_from_payroll
      );
      const first_discounts  = empCashOuts
        .filter(c => c.period === 'first')
        .map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));
      const second_discounts = empCashOuts
        .filter(c => c.period === 'second')
        .map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));

      const first_period_discount  = first_discounts.reduce((s, d) => s + (d.amount || 0), 0);
      const second_period_discount = second_discounts.reduce((s, d) => s + (d.amount || 0), 0);

      const empJRTangeId = emp ? String(emp.job_role_tangerino_id) : null;
      const empJobRole   = empJRTangeId ? jobRoleMap[empJRTangeId] : null;
      const payrollType  = empJobRole?.payroll_type;

      const empWorkplaceList = emp?.workplace_list || [];
      const workplace = empWorkplaceList.length > 0
        ? workplaceMap[String(empWorkplaceList[0])]
        : null;

      // Campos base — variáveis zeradas (KM, bônus, extras, aniversário, hora extra)
      const baseEntry = {
        employee_id: prev.employee_id,
        company_id:  prev.company_id,
        reference_month: target_month,
        status: 'open',
        participation: prev.participation,
        first_period_advance:      0,
        first_period_base_locked:  false,
        first_period_split:       0.5,
        absence_discount:         0,
        absence_discount_first:   0,
        absence_discount_second:  0,
        absence_discounts:        null,
        absences_days:            0,
        mei_absences_first:       0,
        mei_absences_second:      0,
        first_discounts,
        second_discounts,
        first_period_discount,
        second_period_discount,
        // ── Campos variáveis zerados ──────────────────────────────────────────
        bonus:                0,
        overtime:             0,
        birthday_bonus:       0,
        delivery_bonus:       0,
        delivery_target_bonus:0,
        attendance_bonus:     0,
        route_sp_bonus:       0,
        km_bonus_qty:         0,
        km_bonus_value:       0,
        km_bonus:             0,
        notes: '',
      };

      let newEntry;

      // ── ESCRITÓRIO ────────────────────────────────────────────────────────
      if (payrollType === 'ESCRITORIO') {
        const baseSalary = (emp && emp.base_salary > 0) ? emp.base_salary : (prev.base_salary || 0);
        // INSS: recalculado — pct copiado, dedução recalculada pela tabela progressiva 2026
        const inssPct = prev.inss_pct || 0;
        const inssGross = Math.round(baseSalary * (inssPct / 100) * 100) / 100;
        // Dedução progressiva: valor da tabela para a faixa
        let inssDeduction = 0;
        if (baseSalary <= 1518.00)      inssDeduction = 0;
        else if (baseSalary <= 2793.88) inssDeduction = Math.round((baseSalary * 0.09 - baseSalary * 0.075) * 100) / 100;
        else if (baseSalary <= 4190.83) inssDeduction = 0; // simplificado: usa valor salvo anterior se disponível
        // Na prática para Escritório o inss_deduction não é progressivo — mantém o anterior
        inssDeduction = prev.inss_deduction || 0;

        // Desconto VR (%): mantido do mês anterior (percentual de convenção coletiva, não muda mês a mês)
        const mvDiscountPct = prev.meal_voucher_discount_pct || 0;
        // Desconto VT (%): idem
        const vtDiscountPct = prev.transport_voucher_discount_pct || 0;

        const entryData = {
          ...baseEntry,
          base_salary:                    baseSalary,
          extra_bonus:                    prev.extra_bonus || 0,
          meal_voucher_day_value:         prev.meal_voucher_day_value || 0,
          meal_voucher_days:              prev.meal_voucher_days || 0,
          meal_voucher_discount_pct:      mvDiscountPct,
          transport_voucher_day_value:    prev.transport_voucher_day_value || 0,
          transport_voucher_days:         prev.transport_voucher_days || 0,
          transport_voucher_discount_pct: vtDiscountPct,
          food_voucher:                   prev.food_voucher || 0,
          inss_pct:                       inssPct,
          inss_deduction:                 inssDeduction,
          dental_plan:                    prev.dental_plan || 0,
          life_insurance:                 prev.life_insurance || 0,
          working_days_month:             30,
          // Bonificações de Produtividade e Presença: usa defaults do local de trabalho (não clona do mês anterior)
          bonus:                          (workplace && workplace.escritorio_bonus_default > 0) ? workplace.escritorio_bonus_default : 0,
          attendance_bonus:               (workplace && workplace.escritorio_attendance_bonus_default > 0) ? workplace.escritorio_attendance_bonus_default : 0,
        };
        // Aniversário
        if (hasBirthdayInMonth(emp)) {
          entryData.birthday_bonus = 200;
        }
        const calc = calcEscritorio(entryData);
        newEntry = { ...entryData, ...calc };
      }

      // ── MOTOCICLISTA CLT ──────────────────────────────────────────────────
      else if (payrollType === 'MOTOCICLISTA_CLT') {
        const includeSat = !workplace || workplace.work_schedule !== 'seg_sex';
        const fullMonthDays = calcWorkingDays(target_month, includeSat);
        // VR conta apenas Seg-Sex, excluindo feriados (independente da escala de contrato)
        const vrDays = calcVRWorkingDays(target_month);

        const cltMotoBaseSalary = (workplace && workplace.clt_moto_base_salary_default > 0)
          ? workplace.clt_moto_base_salary_default
          : (prev.clt_moto_base_salary || prev.base_salary || 0);
        const mvDayValue = (workplace && workplace.clt_moto_meal_voucher_day_value_default > 0)
          ? workplace.clt_moto_meal_voucher_day_value_default
          : (prev.meal_voucher_day_value || 0);
        const foodVoucher = (workplace && workplace.clt_moto_food_voucher_default > 0)
          ? workplace.clt_moto_food_voucher_default
          : (prev.food_voucher || 0);
        const motoRental = (workplace && workplace.clt_moto_motorcycle_rental_default > 0)
          ? workplace.clt_moto_motorcycle_rental_default
          : (prev.motorcycle_rental || 0);

        const mealVoucher = Math.round(mvDayValue * vrDays * 100) / 100;

        // Periculosidade: SEMPRE recalculada como 30% do salário efetivo
        const effectiveSalary = cltMotoBaseSalary;
        const hazardPay = Math.round(effectiveSalary * 0.3 * 100) / 100;

        // INSS: SEMPRE recalculado pela tabela progressiva sobre (salário + periculosidade)
        const { pct: inssPct, discount: inssDiscount } = calcAutoINSS(effectiveSalary + hazardPay);

        // Desconto VR (%): recalculado — mantém o percentual do mês anterior (convenção)
        const mvDiscountPct = prev.meal_voucher_discount_pct || 0;
        const mealVoucherDiscount = Math.round(mealVoucher * (mvDiscountPct / 100) * 100) / 100;

        const unionContribValue = prev.union_contribution_value > 0
          ? prev.union_contribution_value
          : Math.round(effectiveSalary * 0.02 * 100) / 100;

        const entryData = {
          ...baseEntry,
          base_salary:                      cltMotoBaseSalary,
          clt_moto_base_salary:             cltMotoBaseSalary,
          clt_moto_worked_days:             30,
          clt_moto_effective_salary:        effectiveSalary,
          full_month_contract_working_days: fullMonthDays,
          contract_working_days:            fullMonthDays,
          working_days_month:               30,
          meal_voucher_day_value:           mvDayValue,
          meal_voucher_days:                vrDays,
          meal_voucher:                     Math.round((mealVoucher - mealVoucherDiscount) * 100) / 100,
          meal_voucher_discount_pct:        mvDiscountPct,
          meal_voucher_discount:            mealVoucherDiscount,
          food_voucher:                     foodVoucher,
          motorcycle_rental:                motoRental,
          cost_allowance:                   prev.cost_allowance || 50,
          // Periculosidade: recalculada
          hazard_pay:                       hazardPay,
          // INSS: recalculado
          inss_pct:                         inssPct,
          inss_discount:                    inssDiscount,
          union_contribution_value:         unionContribValue,
          life_insurance:                   prev.life_insurance || 17.50,
          transport_voucher:                prev.transport_voucher || 0,
          other_benefits:                   prev.other_benefits || 0,
        };

        const calc = calcCLTMoto(entryData);
        newEntry = { ...entryData, ...calc, inss: calc.inss_net, union_contribution: calc.union_contribution };
      }

      // ── MOTOCICLISTA MEI ──────────────────────────────────────────────────
      else if (payrollType === 'MOTOCICLISTA_MEI') {
        const { first: wdFirst, second: wdSecond, total: wdTotal } = calcMeiWorkingDaysByPeriod(target_month);

        const entryData = {
          ...baseEntry,
          base_salary:         prev.base_salary || 0,
          working_days_month:  wdTotal,
          working_days_worked: wdTotal,
          working_days_first:  wdFirst,
          working_days_second: wdSecond,
          food_voucher:        prev.food_voucher || 0,
          cost_allowance:      prev.cost_allowance || 500,
          motorcycle_rental:   prev.motorcycle_rental || 0,
          life_insurance:      prev.life_insurance || 0,
          other_benefits:      prev.other_benefits || 0,
        };

        const calc = calcMei(entryData);
        newEntry = { ...entryData, ...calc, inss: 0, irrf: 0, fgts: 0, pj_retention: 0 };
      }

      // ── SÓCIO (Pró-Labore) ────────────────────────────────────────────────
      else if (payrollType === 'SOCIO') {
        const bBonus = hasBirthdayInMonth(emp) ? 200 : 0;
        const entryData = {
          ...baseEntry,
          base_salary:         prev.base_salary || 0,
          quota_adjustment:    prev.quota_adjustment || 0,
          profit_distribution: prev.profit_distribution || 0,
          medical_plan:        prev.medical_plan || 0,
          other_discounts:     0,
          inss_pct:            prev.inss_pct ?? 11,
          irrf:                prev.irrf ?? 0,
          birthday_bonus:      bBonus,
          working_days_month:  30,
          working_days_worked: 30,
        };
        const calc = calcProLabore(entryData);
        newEntry = { ...entryData, ...calc };
      }

      // ── Tipo desconhecido — cópia simples sem cálculo ─────────────────────
      else {
        const EXCLUDE = ['id','created_date','updated_date','created_by',
          'reference_month','status','notes','first_period_advance',
          'first_period_base_locked','gross_total','net_total',
          'first_period_base','second_period_base','first_period_net','second_period_net',
          'clt_moto_effective_salary','absence_discount','absence_discounts',
          'absence_discount_first','absence_discount_second','absences_days'];
        newEntry = { ...baseEntry };
        for (const [k, v] of Object.entries(prev)) {
          if (!EXCLUDE.includes(k)) newEntry[k] = v;
        }
      }

      // Persiste
      try {
        const existingId = existingMap[entryKey];
        if (existingId) {
          await updateWithRetry(base44, 'PayrollEntry', existingId, newEntry);
        } else {
          await createWithRetry(base44, 'PayrollEntry', newEntry);
        }
        cloned++;
      } catch (err) {
        errors.push({ employee_id: prev.employee_id, error: err.message });
      }
      await new Promise(r => setTimeout(r, 80));
    }

    return Response.json({
      cloned, skipped, skippedFired, skippedClosed, errors, prev_month, target_month,
      message: `${cloned} lançamento(s) clonado(s) de ${prev_month} para ${target_month}.${skippedClosed > 0 ? ` ${skippedClosed} não clonado(s) por estarem fechados.` : ''}${skippedFired > 0 ? ` ${skippedFired} ignorado(s) por demissão.` : ''}${errors.length > 0 ? ` ${errors.length} erro(s).` : ''}`,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});