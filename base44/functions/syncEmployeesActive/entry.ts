import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Sincroniza colaboradores ATIVOS (showFired=0) do Tangerino
// Pode ser chamada via botão (com auth de usuário) ou via automação (service role via payload interno)

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, retries = 5, baseDelay = 1200) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err?.message?.includes('429') || err?.message?.includes('Rate limit');
      if (is429 && attempt < retries - 1) {
        await sleep(baseDelay * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

function tsToDate(ts) {
  if (!ts) return '';
  return new Date(ts).toISOString().split('T')[0];
}

async function doSync(serviceRole) {
  // Busca colaboradores ativos na API
  const apiRes = await fetch(
    `https://api.tangerino.com.br/api/employer/employee/find-all?showFired=0&size=1000`,
    { headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH } }
  );
  if (!apiRes.ok) throw new Error(`Tangerino API error: ${apiRes.status}`);

  const raw = await apiRes.json();
  const remoteEmployees = Array.isArray(raw) ? raw : (raw.content || []);

  // Pausa após chamada à API
  await sleep(600);

  const [localCompanies, localEmployees] = await Promise.all([
    serviceRole.entities.Company.list(),
    serviceRole.entities.Employee.list(),
  ]);

  const companyByTangerinoId = {};
  for (const c of localCompanies) {
    if (c.tangerino_id) companyByTangerinoId[String(c.tangerino_id)] = c;
  }

  // Mapeia tangerino_id -> registro mais antigo (canônico, evita duplicatas)
  const localByTangerinoId = {};
  for (const e of localEmployees) {
    if (!e.tangerino_id) continue;
    const tid = String(e.tangerino_id);
    if (!localByTangerinoId[tid] || new Date(e.created_date) < new Date(localByTangerinoId[tid].created_date)) {
      localByTangerinoId[tid] = e;
    }
  }

  let created = 0, updated = 0, failed = 0;

  for (const re of remoteEmployees) {
    const tangerinoId = String(re.id ?? '');
    if (!tangerinoId) continue;

    const companyTangerinoId = String(re.company?.id ?? '');
    const workplaceList = (re.workplaceList ?? []).map(w => String(w.id ?? '')).filter(Boolean);
    const jobRoleTangerinoId = re.jobRoleDTO?.id ? String(re.jobRoleDTO.id) : '';

    const payload = {
      tangerino_id: tangerinoId,
      name: re.name ?? '',
      email: re.email ?? '',
      cpf_cnpj: re.cpf ?? re.document ?? '',
      pis: re.pis ?? '',
      gender: re.gender ?? '',
      admission_date: tsToDate(re.admissionDate),
      birth_date: tsToDate(re.birthDate),
      contract_type: re.contractType === 'PJ' ? 'PJ' : 'CLT',
      company_id: companyByTangerinoId[companyTangerinoId]?.id ?? '',
      tangerino_company_id: companyTangerinoId,
      is_active: true,
      termination_date: '',
      termination_reason: '',
      base_salary: re.salary ?? re.baseSalary ?? 0,
      position: re.jobRoleDTO?.description ?? re.jobRoleDTO?.name ?? re.position ?? '',
      job_role_tangerino_id: jobRoleTangerinoId,
      workplace_list: workplaceList,
    };

    try {
      const existing = localByTangerinoId[tangerinoId];
      if (existing) {
        await withRetry(() => serviceRole.entities.Employee.update(existing.id, payload));
        updated++;
      } else {
        await withRetry(() => serviceRole.entities.Employee.create(payload));
        created++;
      }
    } catch (err) {
      console.error(`[syncEmployeesActive] Falhou ${re.name} (${tangerinoId}):`, err.message);
      failed++;
    }

    await sleep(350);
  }

  return { created, updated, failed, total: remoteEmployees.length };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Aceita tanto chamada de usuário admin quanto de automação (sem usuário)
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[syncEmployeesActive] Iniciando sincronização de ativos...');
    const result = await doSync(base44.asServiceRole);
    console.log('[syncEmployeesActive] Concluído:', result);

    return Response.json({ success: true, type: 'active', ...result });
  } catch (error) {
    console.error('[syncEmployeesActive] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});