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

    // Buscar folhas atuais
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

      // Usar first_period_net do snapshot como base original (é o valor que foi efetivamente pago)
      const snapFirstBase = snap.first_period_base ?? snap.first_period_net ?? 0;
      const currFirstBase = entry.first_period_base ?? 0;

      if (snapFirstBase === 0) continue; // Não há base de referência no snapshot, pula
      
      const diff = r(snapFirstBase - currFirstBase);
      if (Math.abs(diff) < 0.001) continue; // Sem diferença, pula

      // Lógica correta:
      // 1. Restaurar first_period_base para o valor do snapshot
      // 2. NÃO ALTERAR first_period_net (já foi pago!)
      // 3. Adicionar APENAS a diferença na second_period_base e second_period_net
      const newFirstBase = snapFirstBase;
      const newSecondBase = r((entry.second_period_base ?? 0) + diff);
      const newSecondNet = r((entry.second_period_net ?? 0) + diff);

      await base44.asServiceRole.entities.PayrollEntry.update(entry.id, {
        first_period_base: newFirstBase,
        second_period_base: newSecondBase,
        second_period_net: newSecondNet,
        // first_period_net: NÃO ALTERAR — primeira quinzena já foi paga
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
        old_second_net: entry.second_period_net ?? 0,
        new_second_net: newSecondNet,
      });
    }

    return Response.json({ success: true, fixedCount, details });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});