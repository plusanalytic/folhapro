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

async function updateRuleWithRetry(entities, ruleId, data, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await entities.ReadjustmentRule.update(ruleId, data);
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
      return Response.json({ error: 'Snapshot de contribuição assistencial não encontrado. Nenhuma entrada foi processada.' }, { status: 400 });
    }

    // Suporte a estorno parcial: reverte APENAS as entradas presentes no snapshot incremental
    // (se o processo foi interrompido, só as processadas estão no snapshot)
    const isPartial = !rule.union_contrib_applied || unionSnapshot.length < (rule.union_contrib_progress_total ?? 0);
    const partialLabel = isPartial ? ` (estorno parcial — ${unionSnapshot.length} de ${rule.union_contrib_progress_total ?? '?'} folhas)` : '';

    let revertedCount = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < unionSnapshot.length; i++) {
      const snap = unionSnapshot[i];
      if (!snap.id) continue;

      await updateWithRetry(base44.asServiceRole.entities, snap.id, {
        union_contribution_value: snap.union_contribution_value,
        union_contribution:       snap.union_contribution,
        second_period_net:        snap.second_period_net,
        // first_period_net não foi alterado, não precisa reverter
      });

      revertedCount++;

      if (revertedCount % BATCH_SIZE === 0) {
        await sleep(300);
      }
    }

    await updateRuleWithRetry(base44.asServiceRole.entities, ruleId, {
      union_contrib_applied:          false,
      union_contrib_in_progress:      false,
      union_contrib_reverted_date:    new Date().toISOString(),
      union_contrib_updated_count:    0,
      union_contrib_snapshot:         [],
    });

    return Response.json({ success: true, revertedCount, isPartial, partialLabel });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});