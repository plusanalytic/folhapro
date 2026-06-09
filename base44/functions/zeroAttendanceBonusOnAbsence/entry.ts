import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const BLOCKED_STATUSES = ['AGENDADO', 'PAGO', 'RESCISÃO', 'DESLIGADO', 'FÉRIAS', 'AFASTADO', 'SALDO NEGATIVO'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Payload da automação de entidade
    const adjustment = body.data;

    if (!adjustment) {
      return Response.json({ skipped: true, reason: 'no data' });
    }

    // Verifica se é uma Falta Não Justificada
    const desc = (adjustment.adjustment_reason_description || '').toUpperCase();
    if (!desc.includes('FALTA NÃO JUSTIFICADA')) {
      return Response.json({ skipped: true, reason: 'not an unjustified absence' });
    }

    const employeeId = adjustment.employee_id;
    if (!employeeId) {
      return Response.json({ skipped: true, reason: 'no employee_id on adjustment' });
    }

    // Determina o mês de referência a partir da start_date do ajuste
    const startDate = adjustment.start_date;
    if (!startDate) {
      return Response.json({ skipped: true, reason: 'no start_date' });
    }
    const referenceMonth = startDate.slice(0, 7); // YYYY-MM

    // Busca a PayrollEntry do colaborador nesse mês
    const entries = await base44.asServiceRole.entities.PayrollEntry.filter({
      employee_id: employeeId,
      reference_month: referenceMonth,
    });

    if (!entries || entries.length === 0) {
      return Response.json({ skipped: true, reason: 'no payroll entry found', employeeId, referenceMonth });
    }

    const results = [];

    for (const entry of entries) {
      // Não zera se attendance_bonus já é 0
      if (!entry.attendance_bonus || entry.attendance_bonus === 0) {
        results.push({ entry_id: entry.id, skipped: true, reason: 'attendance_bonus already 0' });
        continue;
      }

      // Verifica se há pagamento atrelado que bloqueie o recálculo
      const paymentStatuses = await base44.asServiceRole.entities.PaymentStatus.filter({
        payroll_entry_id: entry.id,
      });

      const ps = paymentStatuses?.[0];
      const q1Locked = ps && BLOCKED_STATUSES.includes(ps.status_q1);
      const q2Locked = ps && BLOCKED_STATUSES.includes(ps.status_q2);

      if (q1Locked || q2Locked) {
        results.push({ entry_id: entry.id, skipped: true, reason: `payment locked (q1=${ps?.status_q1}, q2=${ps?.status_q2})` });
        continue;
      }

      // Zera a bonificação por presença
      await base44.asServiceRole.entities.PayrollEntry.update(entry.id, {
        attendance_bonus: 0,
      });

      // Registra no audit log
      await base44.asServiceRole.entities.PayrollAuditLog.create({
        action: 'update',
        entity_type: 'PayrollEntry',
        entity_id: entry.id,
        employee_id: entry.employee_id,
        company_id: entry.company_id,
        reference_month: referenceMonth,
        user_name: 'Sistema',
        description: `Bonificação por Presença zerada automaticamente — Falta Não Justificada registrada em ${startDate}`,
        details: {
          attendance_bonus_anterior: entry.attendance_bonus,
          attendance_bonus_novo: 0,
          motivo: 'Falta Não Justificada',
          ajuste_data: startDate,
          ajuste_tangerino_id: adjustment.tangerino_id,
        },
      });

      results.push({ entry_id: entry.id, zeroed: true, previous_value: entry.attendance_bonus });
    }

    return Response.json({ success: true, employeeId, referenceMonth, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});