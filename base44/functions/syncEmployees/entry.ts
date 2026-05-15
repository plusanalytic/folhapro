import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Orquestrador manual: chama ativos primeiro, depois demitidos, com delay entre as duas chamadas.
// Usado pelo botão "Sincronizar Solides" na tela de colaboradores.

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    console.log('[syncEmployees] Iniciando fase 1: ativos...');
    const resActive = await base44.functions.invoke('syncEmployeesActive', {});
    const activeData = resActive.data;
    if (!activeData?.success) throw new Error(activeData?.error || 'Erro na sincronização de ativos');

    console.log('[syncEmployees] Fase 1 concluída. Aguardando antes da fase 2...');
    // Pausa entre as duas chamadas para evitar sobrecarga na API do Tangerino
    await sleep(2000);

    console.log('[syncEmployees] Iniciando fase 2: demitidos...');
    const resFired = await base44.functions.invoke('syncEmployeesFired', {});
    const firedData = resFired.data;
    if (!firedData?.success) throw new Error(firedData?.error || 'Erro na sincronização de demitidos');

    console.log('[syncEmployees] Fase 2 concluída. Sincronização completa.');

    return Response.json({
      success: true,
      // Totais combinados para o dialog de progresso
      created: (activeData.created ?? 0) + (firedData.created ?? 0),
      updated: (activeData.updated ?? 0) + (firedData.updated ?? 0),
      failed: (activeData.failed ?? 0) + (firedData.failed ?? 0),
      total_from_api: (activeData.total ?? 0) + (firedData.total ?? 0),
      // Detalhes por fase
      active: activeData,
      fired: firedData,
    });
  } catch (error) {
    console.error('[syncEmployees] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});