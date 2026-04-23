import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_TOKEN = "ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Buscar cargos na API do Tangerino
    const res = await fetch("https://api.tangerino.com.br/api/employer/job-role/find-all?size=100", {
      headers: {
        "accept": "application/json;charset=UTF-8",
        "Authorization": TANGERINO_TOKEN,
      }
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: `Tangerino error ${res.status}: ${text}` }, { status: 500 });
    }

    const data = await res.json();
    // A resposta pode ser array direto ou { content: [...] }
    const roles = Array.isArray(data) ? data : (data.content ?? data.data ?? []);

    // Buscar cargos já salvos localmente
    const existing = await base44.asServiceRole.entities.JobRole.list();
    const byTangerinoId = {};
    for (const r of existing) {
      if (r.tangerino_id) byTangerinoId[String(r.tangerino_id)] = r;
    }

    let created = 0, updated = 0, failed = 0;

    for (const role of roles) {
      const tid = String(role.id ?? role.jobRoleId ?? '');
      const name = role.description ?? role.name ?? '';
      if (!name) continue;

      const payload = {
        tangerino_id: tid,
        name: name,
        description: role.description ?? '',
        is_active: role.active ?? role.isActive ?? true,
      };

      try {
        if (byTangerinoId[tid]) {
          await base44.asServiceRole.entities.JobRole.update(byTangerinoId[tid].id, payload);
          updated++;
        } else {
          await base44.asServiceRole.entities.JobRole.create(payload);
          created++;
        }
      } catch (e) {
        console.error(`Falhou para cargo "${name}": ${e.message}`);
        failed++;
      }
    }

    return Response.json({ success: true, total: roles.length, created, updated, failed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});