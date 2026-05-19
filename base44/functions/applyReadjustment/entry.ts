import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function r(v) { return Math.round((v ?? 0) * 100) / 100; }

function computeNewEntry(entry, rule) {
  const cltMotoBase = entry.clt_moto_base_salary ?? 0;
  const cltMotoDays = Number(entry.clt_moto_worked_days ?? 30);
  const cltMotoEffective = entry.clt_moto_effective_salary
    ?? (cltMotoBase > 0 ? r((cltMotoBase / 30) * cltMotoDays) : (entry.base_salary ?? 0));

  const fullMonthDays = entry.full_month_contract_working_days ?? 0;
  const contractDays = entry.contract_working_days ?? 0;
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

  const origNetTotal    = entry.net_total ?? 0;
  const splitFirst      = entry.first_period_split ?? 0.5;
  const origFirstBase   = r(origNetTotal * splitFirst);
  const origFirstPeriodNet = entry.first_period_net ?? 0;

  const kmBonus       = r((entry.km_bonus_qty ?? 0) * (entry.km_bonus_value ?? 0));
  const costAllow     = r((entry.cost_allowance ?? 0) * motoRatio);
  const absSecond     = entry.absence_discount_second ?? 0;
  const secondDiscount = entry.second_period_discount ?? 0;
  const newFoodEff    = r(newFoodVFull * motoRatio);

  const newSecondPeriodNet = r(newNetTotal - origFirstBase + newFoodEff + kmBonus + costAllow - secondDiscount - absSecond);

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
    first_period_net:        origFirstPeriodNet,
    second_period_net:       newSecondPeriodNet,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { ruleId } = await req.json();
    if (!ruleId) return Response.json({ error: 'ruleId obrigatório' }, { status: 400 });

    const rule = await base44.asServiceRole.entities.ReadjustmentRule.get(ruleId);
    if (!rule) return Response.json({ error: 'Regra não encontrada' }, { status: 404 });
    if (rule.status === 'applied') return Response.json({ error: 'Reajuste já aplicado' }, { status: 400 });

    // Fetch matching entries
    let query = { reference_month: rule.reference_month };
    if (rule.readjustment_scope === 'company' && rule.company_id) query.company_id = rule.company_id;
    if (rule.readjustment_scope === 'employee' && rule.employee_id) query.employee_id = rule.employee_id;

    const allEntries = await base44.asServiceRole.entities.PayrollEntry.filter(query);

    // Only CLT moto entries (have clt_moto_base_salary set > 0)
    const entries = allEntries.filter(e => (e.clt_moto_base_salary ?? 0) > 0);

    if (entries.length === 0) {
      return Response.json({ error: 'Nenhuma folha CLT Moto encontrada para o escopo selecionado' }, { status: 400 });
    }

    // Save snapshot (only essential fields for reversion)
    const snapshot = entries.map(e => ({ id: e.id, ...e }));

    // Apply readjustment to each entry
    let updatedCount = 0;
    for (const entry of entries) {
      const newFields = computeNewEntry(entry, rule);
      await base44.asServiceRole.entities.PayrollEntry.update(entry.id, newFields);
      updatedCount++;
    }

    // Update rule status and save snapshot
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