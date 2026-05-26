import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const r = (v) => Math.round((v ?? 0) * 100) / 100;
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// Reverte usando matemática inversa quando não há snapshot disponível
function computeRevertedEntry(entry, rule) {
  const salaryFactor = 1 + (rule.effective_salary_pct ?? 0) / 100;
  const motoFactor   = 1 + (rule.motorcycle_rental_pct ?? 0) / 100;
  const foodFactor   = 1 + (rule.food_voucher_day_value_pct ?? 0) / 100;
  const mealFactor   = 1 + (rule.meal_voucher_day_value_pct ?? 0) / 100;
  const hazardPct    = (rule.hazard_pay_pct_on_salary ?? 30) / 100;

  const origEffSalary   = salaryFactor > 0 ? r((entry.clt_moto_effective_salary ?? 0) / salaryFactor) : (entry.clt_moto_effective_salary ?? 0);
  const origBase        = salaryFactor > 0 ? r((entry.clt_moto_base_salary ?? 0) / salaryFactor) : (entry.clt_moto_base_salary ?? 0);
  const origHazard      = r(origEffSalary * hazardPct);
  const origMotoRental  = motoFactor > 0 ? r((entry.motorcycle_rental ?? 0) / motoFactor) : (entry.motorcycle_rental ?? 0);
  const origFoodVoucher = foodFactor > 0 ? r((entry.food_voucher ?? 0) / foodFactor) : (entry.food_voucher ?? 0);
  const origMealDay     = mealFactor > 0 ? r((entry.meal_voucher_day_value ?? 0) / mealFactor) : (entry.meal_voucher_day_value ?? 0);
  const origMealVoucher = r(origMealDay * (entry.meal_voucher_days ?? 0));

  const fullMonthDays = entry.full_month_contract_working_days ?? 0;
  const contractDays  = entry.contract_working_days ?? 0;
  const motoRatio = fullMonthDays > 0 ? contractDays / fullMonthDays : 1;

  const origMotoEff  = r(origMotoRental * motoRatio);
  const origFoodEff  = r(origFoodVoucher * motoRatio);

  const inssPct      = (entry.inss_pct ?? 0) / 100;
  const inssGross    = r((origEffSalary + origHazard) * inssPct);
  const inssDiscount = Math.min(entry.inss_discount ?? 0, inssGross);
  const inssNet      = Math.max(0, r(inssGross - inssDiscount));
  const unionContrib = entry.union_contribution_value ?? 35;
  const lifeIns      = entry.life_insurance ?? 0;
  const mealVDisc    = r(origMealVoucher * ((entry.meal_voucher_discount_pct ?? 0) / 100));

  const origGross = r(origEffSalary + origMotoEff + origMealVoucher + origHazard);
  const origNet   = r(origGross - inssNet - unionContrib - mealVDisc - lifeIns);

  const splitFirst = entry.first_period_split ?? 0.5;
  const origFirstBase  = r(origNet * splitFirst);
  const origSecondBase = r(origNet - origFirstBase);

  const kmBonus   = r((entry.km_bonus_qty ?? 0) * (entry.km_bonus_value ?? 0));
  const costAllow = r((entry.cost_allowance ?? 0) * motoRatio);
  const absSecond = entry.absence_discount_second ?? 0;
  const firstAdv  = entry.first_period_advance ?? 0;
  const absFirst  = entry.absence_discount_first ?? 0;
  const firstDisc  = (entry.first_discounts ?? []).reduce((s, d) => d.type === 'credit' ? s - (d.amount||0) : s + (d.amount||0), 0);
  const secondDisc = (entry.second_discounts ?? []).reduce((s, d) => d.type === 'credit' ? s - (d.amount||0) : s + (d.amount||0), 0);

  const origFirstNet  = r(origFirstBase - firstAdv - firstDisc - absFirst);
  const origSecondNet = r(origSecondBase + origFoodEff + kmBonus + costAllow - (entry.second_period_discount ?? secondDisc) - absSecond);

  return {
    clt_moto_base_salary:      origBase,
    clt_moto_effective_salary: origEffSalary,
    hazard_pay:                origHazard,
    motorcycle_rental:         origMotoRental,
    food_voucher:              origFoodVoucher,
    meal_voucher_day_value:    origMealDay,
    inss:                      inssGross,
    inss_discount:             inssDiscount,
    gross_total:               origGross,
    net_total:                 origNet,
    first_period_base:         origFirstBase,
    second_period_base:        origSecondBase,
    first_period_split:        splitFirst,
    first_period_net:          origFirstNet,
    second_period_net:         origSecondNet,
    first_period_base_locked:  false,
    _orig_base_salary:         origBase,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { ruleId, forceRevertWithMath = false } = await req.json();
    if (!ruleId) return Response.json({ error: 'ruleId obrigatório' }, { status: 400 });

    const rule = await base44.asServiceRole.entities.ReadjustmentRule.get(ruleId);
    if (!rule) return Response.json({ error: 'Regra não encontrada' }, { status: 404 });

    const snapshot = rule.affected_payroll_entries_snapshot ?? [];
    const hasSnapshot = snapshot.length > 0;

    // Permite reverter se: status=applied, status=applying (crash) ou forceRevertWithMath
    if (!forceRevertWithMath && rule.status !== 'applied' && rule.status !== 'applying') {
      return Response.json({ error: 'Reajuste não está aplicado ou em aplicação' }, { status: 400 });
    }

    let revertedCount = 0;
    const BATCH_SIZE = 5;
    const DELAY_MS = 300;

    if (hasSnapshot && !forceRevertWithMath) {
      // ✅ Reversão normal via snapshot
      await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, {
        status: 'applying',
        affected_entries_count: 0,
        progress_total: snapshot.length,
      });

      for (let i = 0; i < snapshot.length; i++) {
        const original = snapshot[i];
        const { id, created_date, updated_date, created_by, ...fields } = original;
        await base44.asServiceRole.entities.PayrollEntry.update(id, fields);

        if ((original.clt_moto_base_salary ?? 0) > 0 && original.employee_id) {
          await base44.asServiceRole.entities.Employee.update(original.employee_id, {
            base_salary: original.clt_moto_base_salary,
          });
        }

        revertedCount++;

        if (revertedCount % BATCH_SIZE === 0) {
          await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, { affected_entries_count: revertedCount });
          await sleep(DELAY_MS);
        }
      }
    } else {
      // ⚠️ Reversão matemática inversa (sem snapshot ou forçada)
      const allEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ reference_month: rule.reference_month });

      let entries = [];
      if (rule.readjustment_scope === 'employee' && rule.employee_id) {
        entries = allEntries.filter(e => e.employee_id === rule.employee_id && (e.clt_moto_base_salary ?? 0) > 0);
      } else if (rule.readjustment_scope === 'payroll_type' && rule.payroll_type) {
        const [jobRoles, allEmployees] = await Promise.all([
          base44.asServiceRole.entities.JobRole.list(),
          base44.asServiceRole.entities.Employee.list(),
        ]);
        const matchingRoles = jobRoles.filter(jr => jr.payroll_type === rule.payroll_type);
        const roleIds = new Set(matchingRoles.map(jr => String(jr.tangerino_id)).filter(Boolean));
        const relevantEmployeeIds = new Set(
          allEmployees
            .filter(e => e.job_role_tangerino_id && roleIds.has(String(e.job_role_tangerino_id)) && (!rule.company_id || e.company_id === rule.company_id))
            .map(e => e.id)
        );
        entries = allEntries.filter(e => relevantEmployeeIds.has(e.employee_id) && (e.clt_moto_base_salary ?? 0) > 0);
      } else {
        entries = allEntries.filter(e => (e.clt_moto_base_salary ?? 0) > 0);
      }

      if (rule.excluded_employee_ids && rule.excluded_employee_ids.length > 0) {
        const excludedSet = new Set(rule.excluded_employee_ids);
        entries = entries.filter(e => !excludedSet.has(e.employee_id));
      }

      await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, {
        status: 'applying',
        affected_entries_count: 0,
        progress_total: entries.length,
      });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const reverted = computeRevertedEntry(entry, rule);
        const { _orig_base_salary, ...fields } = reverted;

        await base44.asServiceRole.entities.PayrollEntry.update(entry.id, fields);

        if (_orig_base_salary > 0 && entry.employee_id) {
          await base44.asServiceRole.entities.Employee.update(entry.employee_id, { base_salary: _orig_base_salary });
        }

        revertedCount++;

        if (revertedCount % BATCH_SIZE === 0) {
          await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, { affected_entries_count: revertedCount });
          await sleep(DELAY_MS);
        }
      }
    }

    await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, {
      status: 'reverted',
      reverted_date: new Date().toISOString(),
      affected_entries_count: revertedCount,
    });

    return Response.json({ success: true, revertedCount });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});