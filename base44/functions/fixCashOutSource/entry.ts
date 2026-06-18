import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Processa em lotes: passe { skip: 0 } para começar, depois use o next_skip retornado
// até done=true
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const skip = body.skip ?? 0;
    const batchSize = 50;

    const page = await base44.asServiceRole.entities.CashOut.list('-date', batchSize, skip);

    const toFix = (page || []).filter(c => c.source !== 'cashout');

    let updated = 0;
    for (const record of toFix) {
      await base44.asServiceRole.entities.CashOut.update(record.id, { source: 'cashout' });
      updated++;
      await sleep(100);
    }

    const done = !page || page.length < batchSize;

    return Response.json({
      success: true,
      batch_processed: page?.length ?? 0,
      updated_in_batch: updated,
      next_skip: skip + batchSize,
      done,
      message: done
        ? `Concluído. Lote skip=${skip}: ${updated} atualizado(s).`
        : `Lote skip=${skip} processado: ${updated} atualizado(s). Chame novamente com skip=${skip + batchSize}.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});