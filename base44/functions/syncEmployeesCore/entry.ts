import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

export const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

export function tsToDate(ts) {
  if (!ts) return '';
  return new Date(ts).toISOString().split('T')[0];
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function withRetry(fn, retries = 5, delay = 1200) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err?.message?.includes('429') || err?.message?.includes('Rate limit');
      if (is429 && attempt < retries - 1) {
        await sleep(delay * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Busca colaboradores do Tangerino e sincroniza com o banco local.
 * showFired=0 → ativos | showFired=1 → demitidos
 */
export async function syncEmployeesFromApi(showFired, base44ServiceRole) {
  const apiRes = await fetch(
    `https://api.tangerino.com.br/api/employer/employee/find-all?showFired=${showFired}&size=1000`,
    { headers: { 'accept': 'application/json;charset=UTF-8', 'Authorization': TANGERINO_AUTH } }
  );

  if (!apiRes.ok) throw new Error(`Tangerino API error: ${apiRes.status} (showFired=${showFired})`);

  const raw = await apiRes.json();
  const remoteEmployees = Array.isArray(raw) ? raw : (raw.content || []);

  // Aguarda 500ms após busca da API para evitar rate limit
  await sleep(500);

  const [localCompanies, localEmployees] = await Promise.all([
    base44ServiceRole.entities.Company.list(),
    base44ServiceRole.entities.Employee.list(),
  ]);

  // Mapeia tangerino_id -> empresa local
  const companyByTangerinoId = {};
  for (const c of localCompanies) {
    if (c.tangerino_id) companyByTangerinoId[String(c.tangerino_id)] = c;
  }

  // Mapeia tangerino_id -> colaborador local (mais antigo = canônico)
  const localByTangerinoId = {};
  for (const e of localEmployees) {
    if (!e.tangerino_id) continue;
    const tid = String(e.tangerino_id);
    if (!localByTangerinoId[tid]) {
      localByTangerinoId[tid] = e;
    } else if (new Date(e.created_date) < new Date(localByTangerinoId[tid].created_date)) {
      localByTangerinoId[tid] = e;
    }
  }

  let created = 0, updated = 0, failed = 0;

  for (const re of remoteEmployees) {
    const tangerinoId = String(re.id ?? '');
    if (!tangerinoId) continue;

    const companyTangerinoId = String(re.company?.id ?? '');
    const localCompany = companyByTangerinoId[companyTangerinoId];

    const workplaceList = (re.workplaceList ?? [])
      .map(w => String(w.id ?? ''))
      .filter(Boolean);

    const jobRoleTangerinoId = re.jobRoleDTO?.id ? String(re.jobRoleDTO.id) : '';
    const isFired = re.fired === true || re.status !== 0;
    const terminationDate = isFired ? tsToDate(re.resignationDate) : '';
    const terminationReason = re.motivoDemissao ?? '';

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
      company_id: localCompany?.id ?? '',
      tangerino_company_id: companyTangerinoId,
      is_active: !isFired,
      termination_date: terminationDate,
      termination_reason: terminationReason,
      base_salary: re.salary ?? re.baseSalary ?? 0,
      position: re.jobRoleDTO?.description ?? re.jobRoleDTO?.name ?? re.position ?? '',
      job_role_tangerino_id: jobRoleTangerinoId,
      workplace_list: workplaceList,
    };

    try {
      const existing = localByTangerinoId[tangerinoId];
      if (existing) {
        await withRetry(() => base44ServiceRole.entities.Employee.update(existing.id, payload));
        updated++;
      } else {
        await withRetry(() => base44ServiceRole.entities.Employee.create(payload));
        created++;
      }
    } catch (err) {
      console.error(`Falhou para ${re.name} (${tangerinoId}):`, err.message);
      failed++;
    }

    // Pausa entre cada registro para respeitar rate limit
    await sleep(350);
  }

  return { created, updated, failed, total: remoteEmployees.length };
}