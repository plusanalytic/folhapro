import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { ruleId } = await req.json();
    if (!ruleId) return Response.json({ error: 'ruleId obrigatório' }, { status: 400 });

    const rule = await base44.asServiceRole.entities.ReadjustmentRule.get(ruleId);
    if (!rule) return Response.json({ error: 'Regra não encontrada' }, { status: 404 });
    if (!rule.union_contrib_applied) return Response.json({ error: 'Ajuste de contribuição assistencial não foi aplicado' }, { status: 400 });

    const unionSnapshot = rule.union_contrib_snapshot ?? [];
    if (unionSnapshot.length === 0) return Response.json({ error: 'Snapshot de contribuição assistencial não encontrado' }, { status: 400 });

    let revertedCount = 0;
    for (let i = 0; i < unionSnapshot.length; i++) {
      const snap = unionSnapshot[i];
      await base44.asServiceRole.entities.PayrollEntry.update(snap.id, {
        union_contribution_value: snap.union_contribution_value,
        union_contribution: snap.union_contribution,
        second_period_net: snap.second_period_net,
        net_total: snap.net_total,
      });
      revertedCount++;
      if (revertedCount % 5 === 0) await sleep(300);
    }

    await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, {
      union_contrib_applied: false,
      union_contrib_reverted_date: new Date().toISOString(),
    });

    return Response.json({ success: true, revertedCount });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});