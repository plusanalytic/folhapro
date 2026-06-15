import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * cleanupPointAdjustments
 *
 * Busca TODOS os IDs de ajustes de ponto ativos no Tangerino e compara
 * com os registros gravados no banco local. Qualquer registro no banco
 * cujo tangerino_id NÃO exista mais na API é excluído.
 *
 * Deve ser chamado com autenticação admin ou via automação agendada
 * (nesse caso o payload pode incluir { scheduled: true }).
 */

const TANGERINO_AUTH = 'Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=';
const PAGE_SIZE = 500; // maior page size reduz o número de chamadas à API
const now = new Date();
const SINCE = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime(); // últimos 3 meses dinâmicos
const FETCH_TIMEOUT_MS = 30000; // 30s por requisição

async function fetchPage(page) {
  const url = `https://api.tangerino.com.br/api/employer/adjustment/find-all?lastUpdate=${SINCE}&page=${page}&size=${PAGE_SIZE}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'accept': 'application/json;charset=UTF-8',
        'Authorization': TANGERINO_AUTH,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Tangerino API error ${res.status}: ${text}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllTangerinoIds() {
  const ids = new Set();
  let page = 1;
  let totalFromApi = null;

  while (true) {
    const data = await fetchPage(page);

    let items = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data.content) {
      items = data.content;
      if (totalFromApi === null) totalFromApi = data.totalElements ?? null;
    } else if (data.data) {
      items = data.data;
      if (totalFromApi === null) totalFromApi = data.total ?? null;
    } else {
      const arrKey = Object.keys(data).find(k => Array.isArray(data[k]));
      if (arrKey) {
        items = data[arrKey];
        if (totalFromApi === null) totalFromApi = data.totalElements ?? data.total ?? null;
      }
    }

    if (items.length === 0) break;
    for (const item of items) {
      if (item.id) ids.add(Number(item.id));
    }
    if (totalFromApi !== null && ids.size >= totalFromApi) break;
    if (items.length < PAGE_SIZE) break;
    page++;
    // pequeno delay para não sobrecarregar a API do Tangerino
    await new Promise(r => setTimeout(r, 300));
  }

  return ids;
}

async function fetchAllLocalRecords(base44) {
  const records = [];
  const CHUNK = 2000;
  let offset = 0;
  while (true) {
    const chunk = await base44.asServiceRole.entities.PointAdjustment.list('tangerino_id', CHUNK, offset);
    records.push(...chunk);
    if (chunk.length < CHUNK) break;
    offset += CHUNK;
  }
  return records;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Permite chamada autenticada de admin OU agendada (sem usuário)
    const body = await req.json().catch(() => ({}));

    console.log('[cleanup] Iniciando limpeza de ajustes de ponto...');

    // 1. Busca todos os IDs ativos no Tangerino
    console.log('[cleanup] Buscando IDs do Tangerino...');
    const tangerinoIds = await fetchAllTangerinoIds();
    console.log(`[cleanup] Total de IDs ativos no Tangerino: ${tangerinoIds.size}`);

    // 2. Busca todos os registros locais
    console.log('[cleanup] Buscando registros locais...');
    const localRecords = await fetchAllLocalRecords(base44);
    console.log(`[cleanup] Total de registros no banco: ${localRecords.length}`);

    // 3. Identifica os registros órfãos — compara apenas os registros locais
    // cujo last_update >= SINCE (mesma janela usada para buscar no Tangerino)
    const sinceISO = new Date(SINCE).toISOString();
    const toDelete = localRecords.filter(r => {
      const tid = Number(r.tangerino_id);
      if (!tid) return false;
      if (tangerinoIds.has(tid)) return false;
      // Só considera órfão se o last_update está dentro da janela buscada
      return r.last_update && r.last_update >= sinceISO;
    });

    console.log(`[cleanup] Registros órfãos identificados: ${toDelete.length}`);

    if (toDelete.length === 0) {
      return Response.json({
        success: true,
        tangerino_active: tangerinoIds.size,
        local_total: localRecords.length,
        deleted: 0,
        message: 'Nenhum registro órfão encontrado.',
      });
    }

    // 4. Coleta employee_ids afetados ANTES de deletar
    const affectedEmployeeIds = new Set(toDelete.map(r => r.employee_id).filter(Boolean));

    // 5. Deleta os órfãos em lotes
    const BATCH = 50;
    let deleted = 0;
    let errors = 0;

    for (let i = 0; i < toDelete.length; i += BATCH) {
      const batch = toDelete.slice(i, i + BATCH);
      for (const record of batch) {
        try {
          await base44.asServiceRole.entities.PointAdjustment.delete(record.id);
          deleted++;
        } catch (e) {
          errors++;
          console.error(`[cleanup] Erro ao deletar ${record.id} (tangerino_id=${record.tangerino_id}): ${e.message}`);
        }
      }
    }

    console.log(`[cleanup] Concluído. Deletados: ${deleted}, Erros: ${errors}`);

    // 6. Aciona recálculo de descontos de faltas para os colaboradores afetados
    if (affectedEmployeeIds.size > 0) {
      console.log(`[cleanup] Acionando recálculo para ${affectedEmployeeIds.size} colaborador(es) afetados...`);
      try {
        await base44.asServiceRole.functions.invoke('recalcAbsenceDiscounts', { scheduled: true, full: true });
        console.log('[cleanup] Recálculo acionado com sucesso.');
      } catch (e) {
        console.error('[cleanup] Erro ao acionar recálculo:', e.message);
      }
    }

    return Response.json({
      success: true,
      tangerino_active: tangerinoIds.size,
      local_total: localRecords.length,
      orphans_found: toDelete.length,
      deleted,
      errors,
      recalc_triggered: affectedEmployeeIds.size > 0,
    });

  } catch (error) {
    console.error('[cleanup] Erro geral:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});