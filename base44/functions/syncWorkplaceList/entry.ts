import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Busca todos colaboradores do Tangerino
    const apiRes = await fetch(`https://employer.tangerino.com.br/employee/find-all?page=0&size=300`, {
      headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH },
    });
    if (!apiRes.ok) return Response.json({ error: `Tangerino API error: ${apiRes.status}` }, { status: 500 });

    const raw = await apiRes.json();
    const remoteEmployees = Array.isArray(raw) ? raw : (raw.content || []);

    // Busca colaboradores locais
    const localEmployees = await base44.asServiceRole.entities.Employee.list();

    // Mapeia tangerino_id -> employee local
    const localByTangerinoId = {};
    for (const e of localEmployees) {
      if (e.tangerino_id) localByTangerinoId[String(e.tangerino_id)] = e;
    }

    let updated = 0;
    let skipped = 0;

    const BATCH_SIZE = 20;
    for (let i = 0; i < remoteEmployees.length; i += BATCH_SIZE) {
      const batch = remoteEmployees.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (re) => {
        const tangerinoId = String(re.id ?? '');
        if (!tangerinoId) return;

        const local = localByTangerinoId[tangerinoId];
        if (!local) { skipped++; return; }

        // Armazena apenas os IDs do Tangerino para de-para com entidade Workplace
        const workplaceList = (re.workplaceList ?? []).map(w => w.id).filter(Boolean);

        await base44.asServiceRole.entities.Employee.update(local.id, { workplace_list: workplaceList });
        updated++;
      }));
    }

    return Response.json({ success: true, updated, skipped, total_from_api: remoteEmployees.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});