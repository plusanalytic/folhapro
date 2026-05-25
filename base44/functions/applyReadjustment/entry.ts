import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function r(v) { return Math.round((v ?? 0) * 100) / 100; }

function computeNewEntry(entry, rule, applyToSecondOnly) {
  const cltMotoBase = entry.clt_moto_base_salary ?? 0;
  const cltMotoDays = Number(entry.clt_moto_worked_days ?? 30);
  const cltMotoEffective = entry.clt_moto_effective_salary
    ?? (cltMotoBase > 0 ? r((cltMotoBase / 30) * cltMotoDays) : (entry.base_salary ?? 0));

  const fullMonthDays = entry.full_month_contract_working_days ?? 0;
  const contractDays  = entry.contract_working_days ?? 0;
  const motoRatio = fullMonthDays > 0 ? contractDays / fullMonthDays : 1;

  const salaryFactor = 1 + (rule.effective_salary_pct ?? 0) / 100;
  const motoFactor   = 1 + (rule.motorcycle_rental_pct ?? 0) / 100;
  const foodFactor   = 1 + (rule.food_voucher_day_value_pct ?? 0) / 100;
  const mealFactor   = 1 + (rule.meal_voucher_day_value_pct ?? 0) / 100;
  const hazardPct    = (rule.hazard_pay_pct_on_salary ?? 30) / 100;

  const newEffSalary      = r(cltMotoEffective * salaryFactor);
  const newCltMotoBase    = r(cltMotoBase * salaryFactor);
  const newHazardPay      = r(newEffSalary * hazardPct);
  const newMotoRentalFull = r((entry.motorcycle_rental ?? 0) * motoFactor);
  const newMotoRentalEff  = r(newMotoRentalFull * motoRatio);
  const newFoodVFull      = r((entry.food_voucher ?? 0) * foodFactor);
  const newFoodVEff       = r(newFoodVFull * motoRatio);
  const newMealVDayValue  = r((entry.meal_voucher_day_value ?? 0) * mealFactor);
  const newMealVoucher    = r(newMealVDayValue * (entry.meal_voucher_days ?? 0));

  const inssPct        = (entry.inss_pct ?? 0) / 100;
  const inssBaseNew    = newEffSalary + newHazardPay;
  const inssGrossNew   = r(inssBaseNew * inssPct);
  const inssDiscount   = Math.min(entry.inss_discount ?? 0, inssGrossNew);
  const inssNetNew     = Math.max(0, r(inssGrossNew - inssDiscount));
  const unionContrib   = entry.union_contribution_value ?? 35;
  const lifeIns        = entry.life_insurance ?? 0;
  const mealVDiscount  = r(newMealVoucher * ((entry.meal_voucher_discount_pct ?? 0) / 100));

  const newGrossTotal = r(newEffSalary + newMotoRentalEff + newMealVoucher + newHazardPay);
  const newNetTotal   = r(newGrossTotal - inssNetNew - unionContrib - mealVDiscount - lifeIns);

  const origNetTotal = entry.net_total ?? 0;
  const splitFirst   = entry.first_period_split ?? 0.5;

  const kmBonus    = r((entry.km_bonus_qty ?? 0) * (entry.km_bonus_value ?? 0));
  const costAllow  = r((entry.cost_allowance ?? 0) * motoRatio);
  const absSecond  = entry.absence_discount_second ?? 0;
  const secDiscount= entry.second_period_discount ?? 0;

  let newFirstPeriodNet, newSecondPeriodNet, newFirstBase, newSecondBase, newSplit, baseLocked;

  if (applyToSecondOnly) {
    // 1ª quinzena já foi paga — congela base e net da 1ª, toda diferença vai para a 2ª
    const oldFirstBase = entry.first_period_base ?? r(origNetTotal * splitFirst);
    newFirstBase       = oldFirstBase;
    newSecondBase      = r(newNetTotal - oldFirstBase);
    newSplit           = newNetTotal > 0 ? oldFirstBase / newNetTotal : splitFirst;
    newFirstPeriodNet  = entry.first_period_net ?? 0;
    const retroativo   = r(newNetTotal - origNetTotal);
    newSecondPeriodNet = r((entry.second_period_net ?? 0) + retroativo);
    baseLocked         = true;
  } else {
    // Distribui proporcionalmente entre as quinzenas
    newFirstBase  = r(newNetTotal * splitFirst);
    newSecondBase = r(newNetTotal - newFirstBase);
    newSplit      = splitFirst;
    const firstAdv   = entry.first_period_advance ?? 0;
    const absFirst   = entry.absence_discount_first ?? 0;
    const firstDiscountTotal = (entry.first_discounts ?? []).reduce((s, d) => d.type === 'credit' ? s - (d.amount||0) : s + (d.amount||0), 0);
    const secondDiscountTotal = (entry.second_discounts ?? []).reduce((s, d) => d.type === 'credit' ? s - (d.amount||0) : s + (d.amount||0), 0);
    newFirstPeriodNet  = r(newFirstBase - firstAdv - firstDiscountTotal - absFirst);
    newSecondPeriodNet = r(newSecondBase + newFoodVEff + kmBonus + costAllow - (entry.second_period_discount ?? secondDiscountTotal) - absSecond);
    baseLocked         = false;
  }

  return {
    clt_moto_base_salary:    newCltMotoBase,
    clt_moto_effective_salary: newEffSalary,
    hazard_pay:              newHazardPay,
    motorcycle_rental:       newMotoRentalFull,
    food_voucher:            newFoodVFull,
    meal_voucher_day_value:  newMealVDayValue,
    inss:                    inssGrossNew,
    inss_discount:           inssDiscount,
    gross_total:             newGrossTotal,
    net_total:               newNetTotal,
    first_period_base:       newFirstBase,
    second_period_base:      newSecondBase,
    first_period_split:      newSplit,
    first_period_net:        newFirstPeriodNet,
    second_period_net:       newSecondPeriodNet,
    first_period_base_locked: baseLocked,
    _new_base_salary:        newCltMotoBase,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { ruleId, applyToSecondOnly = false } = await req.json();
    if (!ruleId) return Response.json({ error: 'ruleId obrigatório' }, { status: 400 });

    const rule = await base44.asServiceRole.entities.ReadjustmentRule.get(ruleId);
    if (!rule) return Response.json({ error: 'Regra não encontrada' }, { status: 404 });
    if (rule.status === 'applied') return Response.json({ error: 'Reajuste já aplicado' }, { status: 400 });

    const allEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ reference_month: rule.reference_month });

    let entries = [];
    if (rule.readjustment_scope === 'employee' && rule.employee_id) {
      entries = allEntries.filter(e => e.employee_id === rule.employee_id && (e.clt_moto_base_salary ?? 0) > 0);
    } else if (rule.readjustment_scope === 'payroll_type' && rule.payroll_type) {
      const [jobRoles, allEmployees] = await Promise.all([
        base44.asServiceRole.entities.JobRole.list(),
        base44.asServiceRole.entities.Employee.filter({ is_active: true }),
      ]);
      const matchingRoles = jobRoles.filter(jr => jr.payroll_type === rule.payroll_type);
      const roleIds = new Set(matchingRoles.map(jr => String(jr.tangerino_id)).filter(Boolean));
      const relevantEmployeeIds = new Set(
        allEmployees
          .filter(e =>
            e.job_role_tangerino_id &&
            roleIds.has(String(e.job_role_tangerino_id)) &&
            (!rule.company_id || e.company_id === rule.company_id)
          )
          .map(e => e.id)
      );
      entries = allEntries.filter(e => relevantEmployeeIds.has(e.employee_id) && (e.clt_moto_base_salary ?? 0) > 0);
    } else {
      entries = allEntries.filter(e => (e.clt_moto_base_salary ?? 0) > 0);
    }

    if (entries.length === 0) {
      return Response.json({ error: 'Nenhuma folha encontrada para o escopo selecionado' }, { status: 400 });
    }

    const snapshot = entries.map(e => ({ ...e }));

    let updatedCount = 0;
    for (const entry of entries) {
      const newFields = computeNewEntry(entry, rule, applyToSecondOnly);
      const { _new_base_salary, ...entryFields } = newFields;

      await base44.asServiceRole.entities.PayrollEntry.update(entry.id, entryFields);

      if (_new_base_salary > 0 && entry.employee_id) {
        await base44.asServiceRole.entities.Employee.update(entry.employee_id, { base_salary: _new_base_salary });
      }

      updatedCount++;
    }

    await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, {
      status: 'applied',
      applied_date: new Date().toISOString(),
      affected_entries_count: updatedCount,
      affected_payroll_entries_snapshot: snapshot,
    });

    return Response.json({ success: true, updatedCount });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});