/**
 * Corrige entradas processadas pela versão ANTIGA de applyUnionContribAdjustment
 * que incorretamente alterava net_total (subtraindo 1.05).
 *
 * Esta função restaura APENAS o net_total para o valor original do snapshot,
 * mantendo as demais alterações (union_contribution_value, second_period_net).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function updateWithRetry(entities, id, data, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await entities.PayrollEntry.update(id, data);
    } catch (err) {
      const isRateLimit = err?.status === 429 || (err?.message ?? '').toLowerCase().includes('rate');
      if (isRateLimit && attempt < maxRetries - 1) {
        await sleep(500 * Math.pow(2, attempt));
      } else {
        throw err;
      }
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { ruleId } = await req.json();
    if (!ruleId) return Response.json({ error: 'ruleId obrigatório' }, { status: 400 });

    const rule = await base44.asServiceRole.entities.ReadjustmentRule.get(ruleId);
    if (!rule) return Response.json({ error: 'Regra não encontrada' }, { status: 404 });

    const unionSnapshot = rule.union_contrib_snapshot ?? [];
    if (unionSnapshot.length === 0) {
      return Response.json({ error: 'Snapshot não encontrado. Nada a corrigir.' }, { status: 400 });
    }

    // Filtra apenas entradas do snapshot que têm net_total salvo (processadas pela versão antiga)
    const entriesWithNetTotal = unionSnapshot.filter(s => s.net_total != null && s.net_total > 0);
    if (entriesWithNetTotal.length === 0) {
      return Response.json({
        success: true,
        fixedCount: 0,
        message: 'Nenhuma entrada com net_total incorreto encontrada. Entradas já estão corretas.',
      });
    }

    let fixedCount = 0;
    for (let i = 0; i < entriesWithNetTotal.length; i++) {
      const snap = entriesWithNetTotal[i];

      // Restaura net_total para o valor original (antes da contribuição assistencial)
      // NÃO altera union_contribution_value, union_contribution, nem second_period_net
      // (essas alterações são corretas e devem ser mantidas)
      await updateWithRetry(base44.asServiceRole.entities, snap.id, {
        net_total: snap.net_total,
      });

      fixedCount++;
      if (fixedCount % 5 === 0) await sleep(300);
    }

    return Response.json({
      success: true,
      fixedCount,
      message: `net_total corrigido em ${fixedCount} folha(s). Os valores de segunda quinzena e contribuição assistencial foram mantidos.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});