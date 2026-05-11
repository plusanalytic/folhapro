import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function tsToDate(ts) {
  if (!ts) return '';
  return new Date(ts).toISOString().split('T')[0];
}

async function doSync(serviceRole) {
  const apiRes = await fetch(
    `https://api.tangerino.com.br/api/employer/employee/find-all?showFired=0&size=1000`,
    { headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH } }
  );
  if (!apiRes.ok) throw new Error(`Tangerino API error: ${apiRes.status}`);

  const raw = await apiRes.json();
  const remoteEmployees = Array.isArray(raw) ? raw : (raw.content || []);

  const [localCompanies, localEmployees] = await Promise.all([
    serviceRole.entities.Company.list(),
    serviceRole.entities.Employee.list(),
  ]);

  const companyByTangerinoId = {};
  for (const c of localCompanies) {
    if (c.tangerino_id) companyByTangerinoId[String(c.tangerino_id)] = c;
  }

  // Mapeia tangerino_id -> registro mais antigo (canônico)
  const localByTangerinoId = {};
  for (const e of localEmployees) {
    if (!e.tangerino_id) continue;
    const tid = String(e.tangerino_id);
    if (!localByTangerinoId[tid] || new Date(e.created_date) < new Date(localByTangerinoId[tid].created_date)) {
      localByTangerinoId[tid] = e;
    }
  }

  const toCreate = [];
  const toUpdate = [];

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

    const existing = localByTangerinoId[tangerinoId];
    if (existing) {
      toUpdate.push({ id: existing.id, ...payload });
    } else {
      toCreate.push(payload);
    }
  }

  // Processar em batches para evitar timeout
  const BATCH = 50;
  let created = 0, updated = 0, failed = 0;

  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH);
    try {
      await serviceRole.entities.Employee.bulkCreate(batch);
      created += batch.length;
    } catch (err) {
      console.error(`[syncEmployeesActive] Erro no batch de criação (${i}-${i + BATCH}):`, err.message);
      failed += batch.length;
    }
    if (i + BATCH < toCreate.length) await sleep(300);
  }

  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    try {
      await Promise.all(batch.map(({ id, ...data }) => serviceRole.entities.Employee.update(id, data)));
      updated += batch.length;
    } catch (err) {
      console.error(`[syncEmployeesActive] Erro no batch de atualização (${i}-${i + BATCH}):`, err.message);
      failed += batch.length;
    }
    if (i + BATCH < toUpdate.length) await sleep(300);
  }

  return { created, updated, failed, total: remoteEmployees.length };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[syncEmployeesActive] Iniciando...');
    const result = await doSync(base44.asServiceRole);
    console.log('[syncEmployeesActive] Concluído:', result);

    return Response.json({ success: true, type: 'active', ...result });
  } catch (error) {
    console.error('[syncEmployeesActive] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});