import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = 'Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=';
const PAGE_SIZE = 100;

function tsToDate(ts) {
  if (!ts) return '';
  return new Date(ts).toISOString().slice(0, 10);
}

function tsToISO(ts) {
  if (!ts) return '';
  return new Date(ts).toISOString();
}

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
    allItems.push(...items);
    if (totalFromApi !== null && allItems.length >= totalFromApi) break;
    if (items.length < PAGE_SIZE) break;
    page++;
  }

  return { items: allItems, total: totalFromApi ?? allItems.length };
}

function mapRecord(item, employeeByTangerinoId) {
  const emp = item.employeeDTO || {};
  const employer = item.employerDTO || {};
  const reason = item.adjustmentReasonDTO || {};

  const localEmployee = employeeByTangerinoId[String(emp.id)] || null;

  return {
    tangerino_id: item.id,
    full_day: item.fullDay ?? false,
    start_date: tsToDate(item.startDate),
    end_date: tsToDate(item.endDate),
    last_update: tsToISO(item.lastUpdate),
    origem: item.origem ?? '',
    observation: item.observation ?? '',
    status: item.status ?? '',
    save_adjustment: item.saveAdjustment ?? false,
    employee_tangerino_id: emp.id ?? null,
    employee_name: emp.name ?? '',
    employee_email: emp.email ?? '',
    employer_tangerino_id: employer.id ?? null,
    adjustment_reason_id: reason.id ?? null,
    adjustment_reason_description: reason.description ?? '',
    adjustment_reason_allowance: reason.allowance ?? false,
    adjustment_reason_count_as_missing: reason.countAsMissing ?? false,
    adjustment_reason_account_as_absenteeism: reason.accountAsAbsenteeism ?? false,
    employee_id: localEmployee?.id ?? '',
    company_id: localEmployee?.company_id ?? '',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'full';

    let lastUpdate;
    if (mode === 'daily') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      lastUpdate = yesterday.getTime();
    } else {
      lastUpdate = new Date('2020-01-01T00:00:00Z').getTime();
    }

    const { items, total } = await fetchAllPages(lastUpdate);

    // Busca IDs já existentes para deduplicação
    const existing = await base44.asServiceRole.entities.PointAdjustment.list();
    const existingIds = new Set(existing.map(e => Number(e.tangerino_id)));

    // De-para colaboradores locais
    const employees = await base44.asServiceRole.entities.Employee.list();
    const employeeByTangerinoId = {};
    for (const emp of employees) {
      if (emp.tangerino_id) employeeByTangerinoId[String(emp.tangerino_id)] = emp;
    }

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of items) {
      const tid = Number(item.id);
      if (!tid) { errors++; continue; }

      if (existingIds.has(tid)) {
        skipped++;
        continue;
      }

      const record = mapRecord(item, employeeByTangerinoId);

      try {
        await base44.asServiceRole.entities.PointAdjustment.create(record);
        existingIds.add(tid);
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