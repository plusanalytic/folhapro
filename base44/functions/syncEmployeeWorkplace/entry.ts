import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { employee_id, tangerino_id } = await req.json();
    if (!employee_id || !tangerino_id) {
      return Response.json({ error: 'employee_id e tangerino_id são obrigatórios' }, { status: 400 });
    }

    // Endpoint /find retorna workplaceList completa (todos os locais do colaborador)
    const apiRes = await fetch(
      `https://api.tangerino.com.br/api/employer/employee/find?tangerinoId=${tangerino_id}`,
      { headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH } }
    );

    if (!apiRes.ok) {
      return Response.json({ error: `Tangerino API error: ${apiRes.status}` }, { status: 500 });
    }

    const re = await apiRes.json();

    if (!re || !re.id) {
      return Response.json({ error: `Colaborador com tangerinoId ${tangerino_id} não encontrado.` }, { status: 404 });
    }

    // Extrai TODOS os locais de trabalho ativos
    const workplaceList = (re.workplaceList ?? [])
      .map(w => String(w.id ?? ''))
      .filter(Boolean);

    await base44.asServiceRole.entities.Employee.update(employee_id, { workplace_list: workplaceList });

    return Response.json({ success: true, workplace_list: workplaceList, count: workplaceList.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});