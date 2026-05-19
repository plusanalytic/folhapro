import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { ruleId } = await req.json();
    if (!ruleId) return Response.json({ error: 'ruleId obrigatório' }, { status: 400 });

    const rule = await base44.asServiceRole.entities.ReadjustmentRule.get(ruleId);
    if (!rule) return Response.json({ error: 'Regra não encontrada' }, { status: 404 });
    if (rule.status !== 'applied') return Response.json({ error: 'Reajuste não está aplicado' }, { status: 400 });

    const snapshot = rule.affected_payroll_entries_snapshot ?? [];
    if (snapshot.length === 0) return Response.json({ error: 'Snapshot vazio — não é possível reverter' }, { status: 400 });

    let revertedCount = 0;
    for (const original of snapshot) {
      const { id, created_date, updated_date, created_by, ...fields } = original;
      await base44.asServiceRole.entities.PayrollEntry.update(id, fields);
      revertedCount++;
    }

    await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, {
      status: 'reverted',
      reverted_date: new Date().toISOString(),
    });

    return Response.json({ success: true, revertedCount });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});