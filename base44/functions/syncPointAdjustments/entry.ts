import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = 'Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=';
const PAGE_SIZE = 100;

async function fetchPage(lastUpdate, page) {
  const url = `https://api.tangerino.com.br/api/employer/adjustment/find-all?lastUpdate=${lastUpdate}&page=${page}&size=${PAGE_SIZE}`;
  const res = await fetch(url, {
    headers: {
      'accept': 'application/json;charset=UTF-8',
      'Authorization': TANGERINO_AUTH,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tangerino API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchAllPages(lastUpdate) {
  const allItems = [];
  let page = 1;
  let totalFromApi = null;

  while (true) {
    const data = await fetchPage(lastUpdate, page);

    // Tangerino pode retornar { content, totalElements } ou array direto
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
      // tenta extrair qualquer array no objeto
      const arrKey = Object.keys(data).find(k => Array.isArray(data[k]));
      if (arrKey) {
        items = data[arrKey];
        if (totalFromApi === null) totalFromApi = data.totalElements ?? data.total ?? null;
      }
    }

    if (items.length === 0) break;

    allItems.push(...items);

    // Se já buscamos todos
    if (totalFromApi !== null && allItems.length >= totalFromApi) break;
    if (items.length < PAGE_SIZE) break;

    page++;
  }

  return { items: allItems, total: totalFromApi ?? allItems.length };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    // mode: 'full' = histórico completo, 'daily' = apenas dia anterior
    const mode = body.mode || 'full';

    let lastUpdate;
    if (mode === 'daily') {
      // Dia anterior 00:00:00 UTC
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      lastUpdate = yesterday.getTime();
    } else {
      // Histórico completo: desde 01/01/2020
      lastUpdate = new Date('2020-01-01T00:00:00Z').getTime();
    }

    // Busca todos os ajustes via paginação
    const { items, total } = await fetchAllPages(lastUpdate);

    // Busca IDs já existentes no banco para evitar duplicatas
    const existing = await base44.asServiceRole.entities.PointAdjustment.list();
    const existingIds = new Set(existing.map(e => String(e.tangerino_id)));

    // Busca colaboradores para fazer de-para
    const employees = await base44.asServiceRole.entities.Employee.list();
    const employeeByTangerinoId = {};
    for (const emp of employees) {
      if (emp.tangerino_id) employeeByTangerinoId[String(emp.tangerino_id)] = emp;
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of items) {
      const tangerinoId = String(item.id ?? item.adjustmentId ?? '');
      if (!tangerinoId) { errors++; continue; }

      if (existingIds.has(tangerinoId)) {
        skipped++;
        continue;
      }

      // De-para com colaborador local
      const empTangerinoId = String(item.employeeId ?? item.employee?.id ?? '');
      const localEmployee = employeeByTangerinoId[empTangerinoId];

      const record = {
        tangerino_id: tangerinoId,
        tangerino_employee_id: empTangerinoId,
        employee_id: localEmployee?.id ?? '',
        employee_name: item.employeeName ?? item.employee?.name ?? localEmployee?.name ?? '',
        tangerino_company_id: String(item.companyId ?? item.company?.id ?? ''),
        company_id: localEmployee?.company_id ?? '',
        date: item.date ?? item.adjustmentDate ?? '',
        time: item.time ?? item.adjustmentTime ?? '',
        type: item.type ?? item.adjustmentType ?? '',
        reason: item.reason ?? item.justification ?? '',
        status: item.status ?? '',
        approved_by: item.approvedBy ?? item.approver ?? '',
        raw_data: item,
      };

      try {
        await base44.asServiceRole.entities.PointAdjustment.create(record);
        existingIds.add(tangerinoId);
        created++;
      } catch (e) {
        errors++;
      }
    }

    return Response.json({
      success: true,
      mode,
      total_from_api: total,
      fetched: items.length,
      created,
      skipped,
      errors,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});