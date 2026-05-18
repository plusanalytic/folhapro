import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { tangerino_id } = await req.json();

    const apiRes = await fetch(`https://api.tangerino.com.br/api/employer/employee/find-all?showFired=0&size=1000`, {
      headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH },
    });
    const raw = await apiRes.json();
    const all = Array.isArray(raw) ? raw : (raw.content || []);

    const found = all.find(e => String(e.id) === String(tangerino_id));
    if (!found) return Response.json({ error: 'Not found', tangerino_id });

    return Response.json({ employee: found });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});