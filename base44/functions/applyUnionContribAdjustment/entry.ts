import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NEW_VALUE = 36.05;
const OLD_VALUE = 35.00;
const DIFF      = NEW_VALUE - OLD_VALUE; // 1.50

const r = (v) => Math.round((v ?? 0) * 100) / 100;
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { ruleId } = await req.json();
    if (!ruleId) return Response.json({ error: 'ruleId obrigatório' }, { status: 400 });

    const rule = await base44.asServiceRole.entities.ReadjustmentRule.get(ruleId);
    if (!rule) return Response.json({ error: 'Regra não encontrada' }, { status: 404 });
    if (rule.status !== 'applied') return Response.json({ error: 'Reajuste precisa estar com status "applied"' }, { status: 400 });
    if (rule.union_contrib_applied) return Response.json({ error: 'Ajuste de contribuição assistencial já aplicado' }, { status: 400 });

    // Obtém IDs das folhas afetadas pelo reajuste via snapshot
    const snapshot = rule.affected_payroll_entries_snapshot ?? [];
    if (snapshot.length === 0) return Response.json({ error: 'Snapshot de folhas não encontrado na regra' }, { status: 400 });

    const entryIds = snapshot.map(e => e.id).filter(Boolean);

    // Busca as folhas atuais (valores reais em banco, pós-reajuste)
    const allEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ reference_month: rule.reference_month });
    const entries = allEntries.filter(e => entryIds.includes(e.id));

    if (entries.length === 0) return Response.json({ error: 'Nenhuma folha encontrada' }, { status: 400 });

    // Salva mini-snapshot para reversão (somente campos que serão alterados)
    const unionSnapshot = entries.map(e => ({
      id: e.id,
      union_contribution_value: e.union_contribution_value ?? OLD_VALUE,
      union_contribution: e.union_contribution ?? 0,
      second_period_net: e.second_period_net ?? 0,
      net_total: e.net_total ?? 0,
    }));

    await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, {
      union_contrib_snapshot: unionSnapshot,
    });

    let updatedCount = 0;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      await base44.asServiceRole.entities.PayrollEntry.update(entry.id, {
        union_contribution_value: NEW_VALUE,
        union_contribution: NEW_VALUE,
        second_period_net: r((entry.second_period_net ?? 0) - DIFF),
        net_total: r((entry.net_total ?? 0) - DIFF),
      });
      updatedCount++;
      if (updatedCount % 5 === 0) await sleep(300);
    }

    await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, {
      union_contrib_applied: true,
      union_contrib_applied_date: new Date().toISOString(),
      union_contrib_updated_count: updatedCount,
    });

    return Response.json({ success: true, updatedCount, diff: DIFF, newValue: NEW_VALUE });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});