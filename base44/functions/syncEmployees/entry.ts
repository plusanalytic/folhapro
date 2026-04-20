import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";

function tsToDate(ts) {
  if (!ts) return '';
  return new Date(ts).toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Busca colaboradores do Tangerino
    const response = await fetch("https://employer.tangerino.com.br/employee/find-all", {
      headers: {
        'accept': 'application/json;charset=UTF-8',
        'Authorization': TANGERINO_AUTH,
      },
    });

    if (!response.ok) {
      return Response.json({ error: `Tangerino API error: ${response.status}` }, { status: 500 });
    }

    const raw = await response.json();
    const remoteEmployees = Array.isArray(raw)
      ? raw
      : (raw.content || raw.data || raw.employees || raw.items || []);

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

    // Mapeia tangerino_id -> employee local
    const localByTangerinoId = {};
    for (const e of localEmployees) {
      if (e.tangerino_id) localByTangerinoId[String(e.tangerino_id)] = e;
    }

    let created = 0;
    let updated = 0;

    for (const re of remoteEmployees) {
      const tangerinoId = String(re.id ?? '');
      if (!tangerinoId) continue;

      const companyTangerinoId = String(re.company?.id ?? '');
      const localCompany = companyByTangerinoId[companyTangerinoId];

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
        position: re.jobRoleDTO?.name ?? re.position ?? '',
      };

      const existing = localByTangerinoId[tangerinoId];
      if (existing) {
        await base44.asServiceRole.entities.Employee.update(existing.id, payload);
        updated++;
      } else {
        await base44.asServiceRole.entities.Employee.create(payload);
        created++;
      }
    }

    return Response.json({
      success: true,
      synced: created + updated,
      created,
      updated,
      total_from_api: remoteEmployees.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});