import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { employee_id, tangerino_id } = await req.json();
    if (!employee_id || !tangerino_id) {
      return Response.json({ error: 'employee_id e tangerino_id são obrigatórios' }, { status: 400 });
    }

    // Tenta primeiro buscar colaborador ativo
    let re = null;
    for (const showFired of [0, 1]) {
      const apiRes = await fetch(
        `https://api.tangerino.com.br/api/employer/employee/find-all?showFired=${showFired}&size=1000`,
        { headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH } }
      );
      if (!apiRes.ok) continue;
      const raw = await apiRes.json();
      const list = Array.isArray(raw) ? raw : (raw.content ?? []);
      const found = list.find(e => String(e.id) === String(tangerino_id));
      if (found) { re = found; break; }
    }

    if (!re) {
      return Response.json({ error: `Colaborador com tangerinoId ${tangerino_id} não encontrado na API.` }, { status: 404 });
    }

    // Extrai apenas o local atual (workplaceList retornado pela API)
    const workplaceList = (re.workplaceList ?? [])
      .map(w => String(w.id ?? ''))
      .filter(Boolean);

    await base44.asServiceRole.entities.Employee.update(employee_id, { workplace_list: workplaceList });

    return Response.json({ success: true, workplace_list: workplaceList, count: workplaceList.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});