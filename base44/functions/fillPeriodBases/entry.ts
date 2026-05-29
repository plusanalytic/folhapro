import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Processa um lote de folhas por vez (evitar rate limit e timeout).
// Chame com { skip: 0 }, depois { skip: N } até pending === 0.
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const batchSize = 30; // registros por chamada
  const skip = body.skip ?? 0;

  // Busca apenas folhas que ainda precisam ser preenchidas
  const allEntries = await base44.asServiceRole.entities.PayrollEntry.list('-created_date', batchSize + 200, skip);
  
  // Filtra apenas as que precisam de update
  const toUpdate = allEntries
    .filter(e => !(e.first_period_base != null && e.first_period_base !== 0 && e.second_period_base != null && e.second_period_base !== 0))
    .slice(0, batchSize);

  let updated = 0;
  let errors = 0;

  for (const entry of toUpdate) {
    const netTotal = entry.net_total ?? 0;
    const split = (entry.first_period_split != null) ? entry.first_period_split : 0.5;
    const firstBase  = Math.round(netTotal * split * 100) / 100;
    const secondBase = Math.round(netTotal * (1 - split) * 100) / 100;

    await new Promise(r => setTimeout(r, 300));

    try {
      await base44.asServiceRole.entities.PayrollEntry.update(entry.id, {
        first_period_base: firstBase,
        second_period_base: secondBase,
      });
      updated++;
    } catch (e) {
      // Retry uma vez após 2s
      await new Promise(r => setTimeout(r, 2000));
      try {
        await base44.asServiceRole.entities.PayrollEntry.update(entry.id, {
          first_period_base: firstBase,
          second_period_base: secondBase,
        });
        updated++;
      } catch (e2) {
        console.error('Falhou entry', entry.id, e2.message);
        errors++;
      }
    }
  }

  // Verifica se ainda há pendentes (para informar se deve chamar novamente)
  const remaining = allEntries.filter(e => !(e.first_period_base != null && e.first_period_base !== 0 && e.second_period_base != null && e.second_period_base !== 0)).length - toUpdate.length;
  const pending = remaining > 0 ? skip + allEntries.length : 0;

  return Response.json({
    success: true,
    updated,
    errors,
    next_skip: pending > 0 ? skip + batchSize : null,
    message: updated > 0
      ? `${updated} folhas atualizadas neste lote.${pending > 0 ? ` Execute novamente com skip=${skip + batchSize}.` : ' Lote concluído!'}`
      : 'Nenhuma folha pendente neste lote.',
  });
});