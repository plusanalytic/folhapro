import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

function tsToDate(ts) {
  if (!ts) return '';
  return new Date(ts).toISOString().split('T')[0];
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Requisição com retry automático em caso de rate limit (429)
async function withRetry(fn, retries = 5, delay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err?.message?.includes('429') || err?.message?.includes('Rate limit');
      if (is429 && attempt < retries - 1) {
        await sleep(delay * (attempt + 1)); // backoff crescente
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

    // Busca todos os colaboradores do Tangerino
    const apiRes = await fetch(`https://employer.tangerino.com.br/employee/find-all?page=0&size=300`, {
      headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH },
    });
    if (!apiRes.ok) return Response.json({ error: `Tangerino API error: ${apiRes.status}` }, { status: 500 });

    const raw = await apiRes.json();
    const remoteEmployees = Array.isArray(raw) ? raw : (raw.content || []);

    // Busca empresas e colaboradores locais
    const [localCompanies, localEmployees] = await Promise.all([
      base44.asServiceRole.entities.Company.list(),
      base44.asServiceRole.entities.Employee.list(),
    ]);

    // Mapeia tangerino_id -> company local
    const companyByTangerinoId = {};
    for (const c of localCompanies) {
      if (c.tangerino_id) companyByTangerinoId[String(c.tangerino_id)] = c;
    }

    // Mapeia tangerino_id -> employee local (mantém apenas o mais antigo por ID)
    const localByTangerinoId = {};
    for (const e of localEmployees) {
      if (!e.tangerino_id) continue;
      const tid = String(e.tangerino_id);
      if (!localByTangerinoId[tid]) {
        localByTangerinoId[tid] = e;
      } else {
        if (new Date(e.created_date) < new Date(localByTangerinoId[tid].created_date)) {
          localByTangerinoId[tid] = e;
        }
      }
    }

    let created = 0;
    let updated = 0;
    let failed = 0;

    // Processa UM por vez com pausa entre cada um para evitar rate limit
    for (const re of remoteEmployees) {
      const tangerinoId = String(re.id ?? '');
      if (!tangerinoId) continue;

      const companyTangerinoId = String(re.company?.id ?? '');
      const localCompany = companyByTangerinoId[companyTangerinoId];

      const workplaceList = (re.workplaceList ?? [])
        .map(w => String(w.id ?? ''))
        .filter(Boolean);

      const payload = {
        tangerino_id: tangerinoId,
        name: re.name ?? '',
        email: re.email ?? '',
        cpf_cnpj: re.cpf ?? re.document ?? '',
        pis: re.pis ?? '',
        gender: re.gender ?? '',
        admission_date: tsToDate(re.admissionDate ?? re.effectiveDate),
        birth_date: tsToDate(re.birthDate),
        contract_type: re.contractType === 'PJ' ? 'PJ' : 'CLT',
        company_id: localCompany?.id ?? '',
        tangerino_company_id: companyTangerinoId,
        is_active: re.fired === false || re.status === 0,
        base_salary: re.salary ?? re.baseSalary ?? 0,
        position: re.jobRoleDTO?.description ?? re.jobRoleDTO?.name ?? re.position ?? '',
        workplace_list: workplaceList,
      };

      try {
        const existing = localByTangerinoId[tangerinoId];
        if (existing) {
          await withRetry(() => base44.asServiceRole.entities.Employee.update(existing.id, payload));
          updated++;
        } else {
          await withRetry(() => base44.asServiceRole.entities.Employee.create(payload));
          created++;
        }
      } catch (err) {
        console.error(`Falhou para ${re.name} (${tangerinoId}):`, err.message);
        failed++;
      }

      // Pausa de 150ms entre cada registro para respeitar o rate limit
      await sleep(150);
    }

    return Response.json({
      success: true,
      synced: created + updated,
      created,
      updated,
      failed,
      total_from_api: remoteEmployees.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});