import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { ruleId } = await req.json();
    if (!ruleId) return Response.json({ error: 'ruleId obrigatório' }, { status: 400 });

    const rule = await base44.asServiceRole.entities.ReadjustmentRule.get(ruleId);
    if (!rule) return Response.json({ error: 'Regra não encontrada' }, { status: 404 });

    const snapshot = rule.affected_payroll_entries_snapshot ?? [];
    if (snapshot.length === 0) {
      return Response.json({ error: 'Nenhum snapshot encontrado para reversão' }, { status: 400 });
    }

    await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, {
      status: 'applying',
      affected_entries_count: 0,
      progress_total: snapshot.length,
    });

    let revertedCount = 0;
    const BATCH_SIZE = 5;
    const DELAY_MS = 300;

    for (let i = 0; i < snapshot.length; i++) {
      const original = snapshot[i];
      const { id, ...fields } = original;
      await base44.asServiceRole.entities.PayrollEntry.update(id, fields);

      if ((original.clt_moto_base_salary ?? 0) > 0 && original.employee_id) {
        await base44.asServiceRole.entities.Employee.update(original.employee_id, { base_salary: original.clt_moto_base_salary });
      }

      revertedCount++;

      if (revertedCount % BATCH_SIZE === 0) {
        await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, { affected_entries_count: revertedCount });
        await sleep(DELAY_MS);
      }
    }

    await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, {
      status: 'reverted',
      reverted_date: new Date().toISOString(),
      affected_entries_count: revertedCount,
      affected_payroll_entries_snapshot: [],
    });

    return Response.json({ success: true, revertedCount });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});