import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, retries = 5, delay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err?.message?.includes('429') || err?.message?.includes('Rate limit');
      if (is429 && attempt < retries - 1) {
        await sleep(delay * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. Busca todas as páginas de locais de trabalho para obter todos os IDs
    const workplaceIds = [];
    let page = 0;
    const pageSize = 50;

    while (true) {
      const listRes = await fetch(
        `https://api.tangerino.com.br/api/employer/workplace/find-all?page=${page}&size=${pageSize}`,
        { headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH } }
      );
      if (!listRes.ok) return Response.json({ error: `Tangerino API error: ${listRes.status}` }, { status: 500 });

      const raw = await listRes.json();
      const items = Array.isArray(raw) ? raw : (raw.content || raw.data || []);
      const ids = items.map(w => String(w.id ?? '')).filter(Boolean);
      workplaceIds.push(...ids);

      // Para se não há mais páginas
      const totalPages = raw.totalPages ?? (items.length < pageSize ? page + 1 : null);
      if (items.length < pageSize || (totalPages !== null && page + 1 >= totalPages)) break;
      page++;
      await sleep(200);
    }

    // 2. Busca locais locais para comparação
    const localWorkplaces = await base44.asServiceRole.entities.Workplace.list();
    const localByTangerinoId = {};
    for (const w of localWorkplaces) {
      if (w.tangerino_id) localByTangerinoId[String(w.tangerino_id)] = w;
    }

    let created = 0;
    let updated = 0;
    let failed = 0;

    // 3. Busca cada workplace individualmente via find?tangerinoId=..., sequencialmente
    for (const tid of workplaceIds) {
      try {
        const detailRes = await withRetry(async () => {
          const r = await fetch(
            `https://api.tangerino.com.br/api/employer/workplace/find?tangerinoId=${tid}`,
            { headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH } }
          );
          if (r.status === 429) throw new Error('429 Rate limit');
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r;
        });

        const data = await detailRes.json();
        const employees = Array.isArray(data) ? data : (data.content ?? [data]);
        const rw = employees[0] ?? {};

        const payload = {
          tangerino_id: tid,
          name: rw.name ?? rw.description ?? '',
          code: rw.code ?? '',
          address: rw.address ?? rw.street ?? '',
          city: rw.city ?? rw.municipality ?? '',
          state: rw.state ?? rw.uf ?? '',
          cnpj: rw.cnpj ?? rw.document ?? '',
          is_active: rw.active !== false && rw.status !== 1,
        };

        const existing = localByTangerinoId[tid];
        if (existing) {
          await withRetry(() => base44.asServiceRole.entities.Workplace.update(existing.id, payload));
          updated++;
        } else {
          // Verifica novamente no banco antes de criar para evitar duplicidade
          const check = await base44.asServiceRole.entities.Workplace.filter({ tangerino_id: tid });
          if (check && check.length > 0) {
            // Já existe, apenas atualiza e registra no mapa local para próximas iterações
            localByTangerinoId[tid] = check[0];
            await withRetry(() => base44.asServiceRole.entities.Workplace.update(check[0].id, payload));
            updated++;
          } else {
            await withRetry(() => base44.asServiceRole.entities.Workplace.create(payload));
            created++;
            // Registra no mapa para evitar duplicidade em iterações futuras
            localByTangerinoId[tid] = { id: '__new__' };
          }
        }
      } catch (err) {
        console.error(`Falhou para workplace ${tid}:`, err.message);
        failed++;
      }

      // Pausa entre cada registro para respeitar o rate limit
      await sleep(150);
    }

    return Response.json({
      success: true,
      synced: created + updated,
      created,
      updated,
      failed,
      total_from_api: workplaceIds.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});