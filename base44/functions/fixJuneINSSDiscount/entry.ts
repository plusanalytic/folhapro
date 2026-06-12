import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Tabela INSS 2026 — progressiva com dedução correta
// Fórmula: INSS = (salário × alíquota%) - dedução
// Fonte: tabela progressiva 2026
function calcAutoINSS(salaryBase) {
  if (salaryBase <= 1518.00) return { pct: 7.5,  discount: 0 };
  if (salaryBase <= 2793.88) return { pct: 9,    discount: 24.32 };
  if (salaryBase <= 4190.83) return { pct: 12,   discount: 111.41 };
  if (salaryBase <= 8157.41) return { pct: 14,   discount: 195.14 };
  return                            { pct: 14,   discount: 195.14 };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    // Busca todas as folhas de junho com payrollType MOTOCICLISTA_CLT (status open = "Lançado")
    const entries = await base44.asServiceRole.entities.PayrollEntry.filter(
      { reference_month: '2026-06' },
      null,
      5000
    );

    // Busca colaboradores e cargos para identificar MOTOCICLISTA_CLT
    const [allEmployees, allJobRoles] = await Promise.all([
      base44.asServiceRole.entities.Employee.list(null, 5000),
      base44.asServiceRole.entities.JobRole.list(null, 5000),
    ]);

    const empMap = {};
    for (const e of allEmployees) empMap[e.id] = e;

    const jobRoleMap = {};
    for (const jr of allJobRoles) if (jr.tangerino_id) jobRoleMap[String(jr.tangerino_id)] = jr;

    let updated = 0, skipped = 0;
    const details = [];

    for (const entry of entries) {
      // Apenas status "open" (Lançado) — não mexe em fechados
      if (entry.status !== 'open') { skipped++; continue; }

      const emp = empMap[entry.employee_id];
      if (!emp) { skipped++; continue; }

      const jrId = emp.job_role_tangerino_id ? String(emp.job_role_tangerino_id) : null;
      const jobRole = jrId ? jobRoleMap[jrId] : null;
      if (!jobRole || jobRole.payroll_type !== 'MOTOCICLISTA_CLT') { skipped++; continue; }

      // Base do INSS = salário efetivo + periculosidade
      const effectiveSalary = entry.clt_moto_effective_salary || entry.base_salary || 0;
      const hazardPay = entry.hazard_pay || 0;
      const inssBase = effectiveSalary + hazardPay;

      const { pct, discount: correctDiscount } = calcAutoINSS(inssBase);

      const currentDiscount = entry.inss_discount || 0;

      // Só atualiza se o valor estiver diferente
      if (Math.abs(currentDiscount - correctDiscount) < 0.01) { skipped++; continue; }

      // Recalcula INSS com o desconto correto
      const inssPct = entry.inss_pct || pct;
      const inssGross = Math.round(inssBase * (inssPct / 100) * 100) / 100;
      const inssNet = Math.max(0, Math.round((inssGross - correctDiscount) * 100) / 100);

      // Recalcula net_total e quinzenas
      const mealVoucher = entry.meal_voucher || 0;
      const mealVoucherDiscount = entry.meal_voucher_discount || 0;
      const unionContrib = entry.union_contribution || 0;
      const lifeInsurance = entry.life_insurance || 0;
      const motorcycleRental = entry.motorcycle_rental || 0;

      const grossTotal = (effectiveSalary) + motorcycleRental + mealVoucher + hazardPay;
      const netTotal = Math.round((grossTotal - inssNet - unionContrib - mealVoucherDiscount - lifeInsurance) * 100) / 100;

      const split = entry.first_period_split ?? 0.5;
      const firstBase = Math.round(netTotal * split * 100) / 100;
      const secondBase = Math.round(netTotal * (1 - split) * 100) / 100;

      const foodVoucher = entry.food_voucher || 0;
      const kmBonus = entry.km_bonus || 0;
      const costAllowance = entry.cost_allowance || 0;
      const firstPeriodNet = Math.round((firstBase - (entry.first_period_advance || 0) - (entry.first_period_discount || 0) - (entry.absence_discount_first || 0)) * 100) / 100;
      const secondPeriodNet = Math.round((secondBase + foodVoucher + kmBonus + costAllowance - (entry.second_period_discount || 0) - (entry.absence_discount_second || 0)) * 100) / 100;

      await base44.asServiceRole.entities.PayrollEntry.update(entry.id, {
        inss_discount: correctDiscount,
        inss: inssNet,
        inss_net: inssNet,
        net_total: netTotal,
        gross_total: Math.round(grossTotal * 100) / 100,
        first_period_base: firstBase,
        second_period_base: secondBase,
        first_period_net: firstPeriodNet,
        second_period_net: secondPeriodNet,
      });

      details.push({
        employee_id: entry.employee_id,
        employee_name: emp.name,
        inss_base: inssBase,
        old_discount: currentDiscount,
        new_discount: correctDiscount,
        old_inss_net: entry.inss || 0,
        new_inss_net: inssNet,
      });
      updated++;
      await new Promise(r => setTimeout(r, 100));
    }

    return Response.json({
      updated,
      skipped,
      details,
      message: `${updated} folha(s) corrigida(s). ${skipped} ignorada(s).`,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});