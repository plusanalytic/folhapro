import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso restrito a administradores' }, { status: 403 });
    }

    const { target_month, company_id } = await req.json();
    if (!target_month) return Response.json({ error: 'target_month is required' }, { status: 400 });

    // Calcula o mês anterior
    const [year, month] = target_month.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prev_month = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const prevFilter = { reference_month: prev_month };
    if (company_id) prevFilter.company_id = company_id;

    const targetFilter = { reference_month: target_month };
    if (company_id) targetFilter.company_id = company_id;

    const [prevEntries, targetEntries] = await Promise.all([
      base44.asServiceRole.entities.PayrollEntry.filter(prevFilter, null, 5000),
      base44.asServiceRole.entities.PayrollEntry.filter(targetFilter, null, 5000),
    ]);

    // Mapa: employee_id + company_id → notes do mês anterior
    const prevNotesMap = {};
    for (const e of prevEntries) {
      if (e.notes) {
        const key = `${e.employee_id}_${e.company_id}`;
        prevNotesMap[key] = e.notes;
      }
    }

    // Mapa: employee_id + company_id → id da folha do mês atual
    const targetMap = {};
    for (const e of targetEntries) {
      const key = `${e.employee_id}_${e.company_id}`;
      targetMap[key] = e.id;
    }

    let updated = 0, skipped = 0;
    const details = [];

    for (const [key, notes] of Object.entries(prevNotesMap)) {
      const targetId = targetMap[key];
      if (!targetId) { skipped++; continue; }

      await base44.asServiceRole.entities.PayrollEntry.update(targetId, { notes });
      details.push({ key, notes });
      updated++;
      await new Promise(r => setTimeout(r, 80));
    }

    return Response.json({
      updated,
      skipped,
      details,
      prev_month,
      target_month,
      message: `${updated} observação(ões) copiada(s) de ${prev_month} para ${target_month}. ${skipped} sem folha correspondente no mês atual.`,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});