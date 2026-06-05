import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const r = (v) => Math.round((v ?? 0) * 100) / 100;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { ruleId, employeeIds } = await req.json();
    if (!ruleId) return Response.json({ error: 'ruleId obrigatório' }, { status: 400 });
    if (!employeeIds || employeeIds.length === 0) {
      return Response.json({ error: 'employeeIds obrigatório' }, { status: 400 });
    }

    const rule = await base44.asServiceRole.entities.ReadjustmentRule.get(ruleId);
    if (!rule) return Response.json({ error: 'Regra não encontrada' }, { status: 404 });

    const snapshot = rule.affected_payroll_entries_snapshot ?? [];
    if (snapshot.length === 0) {
      return Response.json({ error: 'Snapshot não encontrado na regra' }, { status: 400 });
    }

    // Buscar folhas atuais do mês da regra
    const allEntries = await base44.asServiceRole.entities.PayrollEntry.filter({
      reference_month: rule.reference_month,
    });

    // Index snapshot por ID de entrada
    const snapshotById = {};
    for (const s of snapshot) {
      if (s.id) snapshotById[s.id] = s;
    }

    // Filtrar entradas com base bloqueada dos colaboradores selecionados
    const targetEntries = allEntries.filter(e =>
      employeeIds.includes(e.employee_id) && e.first_period_base_locked === true
    );

    let fixedCount = 0;
    const details = [];

    for (const entry of targetEntries) {
      const snap = snapshotById[entry.id];
      if (!snap) continue;

      const snapFirstBase = snap.first_period_base ?? 0;
      const currFirstBase = entry.first_period_base ?? 0;
      const diff = r(snapFirstBase - currFirstBase);

      if (Math.abs(diff) < 0.001) continue; // Sem diferença, pula

      const newFirstBase = snapFirstBase;
      const newSecondBase = r((entry.second_period_base ?? 0) + diff);

      // Recalcular first_period_net mantendo descontos e ausências existentes
      const firstAdv = entry.first_period_advance ?? 0;
      const absFirst = entry.absence_discount_first ?? 0;
      const firstDiscountTotal = (entry.first_discounts ?? []).reduce((s, d) =>
        d.type === 'credit' ? s - (d.amount || 0) : s + (d.amount || 0), 0);
      const newFirstNet = r(newFirstBase - firstAdv - firstDiscountTotal - absFirst);

      // Recalcular second_period_net mantendo descontos e ausências existentes
      const absSecond = entry.absence_discount_second ?? 0;
      const secondDiscountTotal = (entry.second_discounts ?? []).reduce((s, d) =>
        d.type === 'credit' ? s - (d.amount || 0) : s + (d.amount || 0), 0);
      const fullMonthDays = entry.full_month_contract_working_days ?? 0;
      const contractDays = entry.contract_working_days ?? 0;
      const motoRatio = fullMonthDays > 0 ? contractDays / fullMonthDays : 1;
      const kmBonus = r((entry.km_bonus_qty ?? 0) * (entry.km_bonus_value ?? 0));
      const costAllow = r((entry.cost_allowance ?? 0) * motoRatio);
      const foodVEff = r((entry.food_voucher ?? 0) * motoRatio);
      const secondDiscFinal = entry.second_period_discount != null ? entry.second_period_discount : secondDiscountTotal;
      const newSecondNet = r(newSecondBase + foodVEff + kmBonus + costAllow - secondDiscFinal - absSecond);

      await base44.asServiceRole.entities.PayrollEntry.update(entry.id, {
        first_period_base: newFirstBase,
        second_period_base: newSecondBase,
        first_period_net: newFirstNet,
        second_period_net: newSecondNet,
      });

      fixedCount++;
      details.push({
        employee_id: entry.employee_id,
        entry_id: entry.id,
        diff,
        old_first_base: currFirstBase,
        new_first_base: newFirstBase,
        old_second_base: entry.second_period_base ?? 0,
        new_second_base: newSecondBase,
      });
    }

    return Response.json({ success: true, fixedCount, details });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});