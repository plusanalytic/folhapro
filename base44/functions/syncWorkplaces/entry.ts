import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiRes = await fetch(`https://api.tangerino.com.br/api/employer/workplace/find-all`, {
      headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH },
    });
    if (!apiRes.ok) return Response.json({ error: `Tangerino API error: ${apiRes.status}` }, { status: 500 });

    const raw = await apiRes.json();
    const remoteWorkplaces = Array.isArray(raw) ? raw : (raw.content || raw.data || []);

    const localWorkplaces = await base44.asServiceRole.entities.Workplace.list();
    const localByTangerinoId = {};
    for (const w of localWorkplaces) {
      if (w.tangerino_id) localByTangerinoId[String(w.tangerino_id)] = w;
    }

    let created = 0;
    let updated = 0;

    for (const rw of remoteWorkplaces) {
      const tid = String(rw.id ?? '');
      if (!tid) continue;

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
        await base44.asServiceRole.entities.Workplace.update(existing.id, payload);
        updated++;
      } else {
        await base44.asServiceRole.entities.Workplace.create(payload);
        created++;
      }
    }

    return Response.json({
      success: true,
      synced: created + updated,
      created,
      updated,
      total_from_api: remoteWorkplaces.length,
      raw_sample: remoteWorkplaces.slice(0, 2), // para debug
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});