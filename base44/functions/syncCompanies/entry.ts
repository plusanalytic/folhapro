import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TANGERINO_AUTH = "Basic ZjE3N2FlYThiY2I4NDIxN2E3OWRmMGM4Njk4ZTMzYzg6NjU4Y2E4ZGIxOTEzNDJiYmIyZThmYWJkOGFiODMxNjc=";
const TANGERINO_URL = "https://employer.tangerino.com.br/companies";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Busca empresas na API do Tangerino
    const response = await fetch(TANGERINO_URL, {
      method: 'GET',
      headers: {
        'accept': 'application/json;charset=UTF-8',
        'Authorization': TANGERINO_AUTH,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return Response.json({ error: `Tangerino API error: ${response.status} - ${text}` }, { status: 502 });
    }

    const tangerinData = await response.json();

    // Normaliza o array de empresas (API retorna paginação com campo "content")
    const remoteCompanies = Array.isArray(tangerinData)
      ? tangerinData
      : (tangerinData.content || tangerinData.data || tangerinData.companies || tangerinData.items || []);

    if (!remoteCompanies.length) {
      return Response.json({ synced: 0, message: 'Nenhuma empresa retornada pela API.', raw: tangerinData });
    }

    // Busca empresas já cadastradas no banco
    const existing = await base44.asServiceRole.entities.Company.list();
    const existingByTangerinoId = {};
    for (const c of existing) {
      if (c.tangerino_id) existingByTangerinoId[c.tangerino_id] = c;
    }

    let created = 0;
    let skipped = 0;

    for (const rc of remoteCompanies) {
      const tangerinoId = String(rc.id ?? '');
      if (!tangerinoId) continue;

      // Se já existe um cadastro com esse tangerino_id, ignora (não duplica, não atualiza)
      if (existingByTangerinoId[tangerinoId]) {
        skipped++;
        continue;
      }

      const payload = {
        name: rc.socialReason ?? rc.fantasyName ?? rc.descriptionName ?? rc.name ?? '',
        cnpj: rc.cnpj ?? '',
        email: rc.email ?? '',
        phone: rc.phone ?? rc.telefone ?? '',
        address: rc.address ?? rc.endereco ?? '',
        tangerino_id: tangerinoId,
        is_active: rc.active !== undefined ? Boolean(rc.active) : true,
      };

      if (!payload.name) continue;

      await base44.asServiceRole.entities.Company.create(payload);
      created++;
    }

    return Response.json({
      success: true,
      synced: created,
      created,
      skipped,
      total_from_api: remoteCompanies.length,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});