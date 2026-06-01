import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Corrige folhas de junho: first_period_split=0.5 e meal_voucher_days/meal_voucher corretos
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { reference_month = '2026-06' } = await req.json().catch(() => ({}));

    const [entries, employees, jobRoles, workplaces] = await Promise.all([
      base44.asServiceRole.entities.PayrollEntry.filter({ reference_month }, null, 5000),
      base44.asServiceRole.entities.Employee.list(null, 5000),
      base44.asServiceRole.entities.JobRole.list(null, 5000),
      base44.asServiceRole.entities.Workplace.list(null, 5000),
    ]);

    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
    const jrMap = Object.fromEntries(jobRoles.map(j => [String(j.tangerino_id), j]));
    const wpMap = Object.fromEntries(workplaces.map(w => [String(w.tangerino_id), w]));

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const updateWithRetry = async (id, patch, retries = 4) => {
      for (let i = 0; i < retries; i++) {
        try {
          await base44.asServiceRole.entities.PayrollEntry.update(id, patch);
          return true;
        } catch (err) {
          if (i < retries - 1) await sleep(500 * (i + 1));
          else throw err;
        }
      }
    };

    let updated = 0;
    let errors = [];

    for (const entry of entries) {
      const emp = empMap[entry.employee_id];
      const jr = emp ? jrMap[String(emp.job_role_tangerino_id)] : null;
      const payrollType = jr?.payroll_type;

      const patch = { first_period_split: 0.5 };

      if (payrollType === 'MOTOCICLISTA_CLT') {
        const mvDays = entry.full_month_contract_working_days || entry.contract_working_days || 26;
        const mvDayVal = entry.meal_voucher_day_value || 0;
        const mvDiscPct = entry.meal_voucher_discount_pct || 0;
        const mvGross = Math.round(mvDayVal * mvDays * 100) / 100;
        patch.meal_voucher_days = mvDays;
        patch.meal_voucher = Math.round(mvGross * (1 - mvDiscPct / 100) * 100) / 100;
        patch.meal_voucher_discount = Math.round(mvGross * (mvDiscPct / 100) * 100) / 100;
      } else {
        const mvDays = entry.working_days_month || 30;
        const mvDayVal = entry.meal_voucher_day_value || 0;
        const mvDiscPct = entry.meal_voucher_discount_pct || 0;
        if (mvDayVal > 0 && mvDays > 0) {
          const mvGross = Math.round(mvDayVal * mvDays * 100) / 100;
          patch.meal_voucher_days = mvDays;
          patch.meal_voucher = Math.round(mvGross * (1 - mvDiscPct / 100) * 100) / 100;
          patch.meal_voucher_discount = Math.round(mvGross * (mvDiscPct / 100) * 100) / 100;
        }
      }

      try {
        await updateWithRetry(entry.id, patch);
        updated++;
      } catch (err) {
        errors.push({ id: entry.id, error: err.message });
      }
      await sleep(200);
    }

    return Response.json({ updated, errors, total: entries.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});