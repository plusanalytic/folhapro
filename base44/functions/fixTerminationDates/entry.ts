import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

function tsToDate(ts) {
  if (!ts) return '';
  return new Date(ts).toISOString().split('T')[0];
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Busca apenas demitidos do Tangerino (fired=true)
    const apiRes = await fetch(`https://api.tangerino.com.br/api/employer/employee/find-all?showFired=1&size=1000`, {
      headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH },
    });
    if (!apiRes.ok) return Response.json({ error: `Tangerino API error: ${apiRes.status}` }, { status: 500 });

    const raw = await apiRes.json();
    const allEmployees = Array.isArray(raw) ? raw : (raw.content || []);

    // Filtra apenas os demitidos
    const firedEmployees = allEmployees.filter(re => re.fired === true || re.status !== 0);

    // Busca colaboradores locais
    const localEmployees = await base44.asServiceRole.entities.Employee.list();

    // Mapeia tangerino_id -> employee local
    const localByTangerinoId = {};
    for (const e of localEmployees) {
      if (!e.tangerino_id) continue;
      const tid = String(e.tangerino_id);
      if (!localByTangerinoId[tid] || new Date(e.created_date) < new Date(localByTangerinoId[tid].created_date)) {
        localByTangerinoId[tid] = e;
      }
    }

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const details = [];

    for (const re of firedEmployees) {
      const tangerinoId = String(re.id ?? '');
      if (!tangerinoId) continue;

      const local = localByTangerinoId[tangerinoId];
      if (!local) { skipped++; continue; }

      // Usa resignationDate como data de demissão correta
      const correctTerminationDate = tsToDate(re.resignationDate);

      // Só atualiza se a data estiver errada
      if (local.termination_date === correctTerminationDate) { skipped++; continue; }

      try {
        await base44.asServiceRole.entities.Employee.update(local.id, {
          termination_date: correctTerminationDate,
          is_active: false,
        });
        details.push({ name: re.name, old: local.termination_date, new: correctTerminationDate });
        updated++;
      } catch (err) {
        console.error(`Falhou para ${re.name} (${tangerinoId}):`, err.message);
        failed++;
      }

      await sleep(200);
    }

    return Response.json({
      success: true,
      fired_from_api: firedEmployees.length,
      updated,
      skipped,
      failed,
      details,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});