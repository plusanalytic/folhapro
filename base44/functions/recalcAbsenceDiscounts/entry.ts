import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * recalcAbsenceDiscounts
 *
 * Recalcula absence_discounts e atualiza first_period_net / second_period_net
 * para PayrollEntries com base nos PointAdjustments.
 *
 * Respeita quinzenas bloqueadas (AGENDADO, PAGO, etc.): dias em período bloqueado
 * preservam o valor existente e NÃO alteram o net daquela quinzena.
 *
 * Pode ser chamado com:
 *   - { reference_month }  — para um mês específico (após sync diário)
 *   - { payroll_entry_id } — para uma folha específica
 *   - {}                   — todas as folhas abertas
 */

const ABSENCE_REASON_IDS = new Set([5, 11, 8, 16, 18, 19, 23, 24, 27, 2154902, 2157106, 2160971, 2169310, 2170370, 2173794]);

const REASON_COLS = {
  5:       { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
  11:       { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
  8:       { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true  },
  16:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true  },
  18:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true  },
  19:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true  },
  23:      { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
  24:      { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
  27:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true  },
  2154902: { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true, half: true },
  2157106: { daily: false, vt: false, vr: false, dsr: false, moto: false, hazard: false },
  2160971: { daily: false, vt: false, vr: false, dsr: false, moto: false, hazard: false },
  2169310: { daily: false, vt: false, vr: false, dsr: false, moto: false, hazard: false },
  2170370: { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
  2173794: { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
};

const BLOCKED_STATUSES = new Set(['AGENDADO', 'PAGO', 'RESCISÃO', 'DESLIGADO', 'FÉRIAS', 'AFASTADO', 'SALDO NEGATIVO', 'COBRIDOR']);

function rowTotal(disc) {
  if (!disc || typeof disc !== 'object') return 0;
  return ['daily', 'vt', 'vr', 'dsr', 'moto', 'hazard'].reduce((s, k) => s + (parseFloat(disc[k]) || 0), 0);
}

function absenceByPeriod(absenceDiscounts) {
  let first = 0, second = 0;
  for (const [key, disc] of Object.entries(absenceDiscounts || {})) {
    const dateMatch = key.match(/(\d{4}-\d{2}-(\d{2}))$/);
    const day = dateMatch ? parseInt(dateMatch[2], 10) : 0;
    const total = rowTotal(disc);
    if (day >= 1 && day <= 15) first += total;
    else second += total;
  }
  return { first: Math.round(first * 100) / 100, second: Math.round(second * 100) / 100 };
}

function calcBaseValues(entry) {
  const baseSalary = parseFloat(entry.base_salary) || 0;
  const vrPerDay   = parseFloat(entry.meal_voucher_day_value) || 0;
  const vrDays     = parseFloat(entry.meal_voucher_days) || 1;
  const vtPerDay   = parseFloat(entry.transport_voucher_day_value) || 0;
  const vtTotal    = parseFloat(entry.transport_voucher) || 0;
  const motoRental = parseFloat(entry.motorcycle_rental) || 0;
  const hazardPay  = parseFloat(entry.hazard_pay) || 0;

  const daily = baseSalary > 0 ? Math.round((baseSalary / 30) * 10000) / 10000 : 0;
  const dsr   = daily;
  const vr    = vrPerDay;
  const vt    = vtPerDay > 0 ? vtPerDay : (vtTotal > 0 && vrDays > 0 ? Math.round((vtTotal / vrDays) * 100) / 100 : 0);
  const moto   = motoRental > 0 && vrDays > 0 ? Math.round((motoRental / vrDays) * 100) / 100 : 0;
  const hazard = hazardPay  > 0 && vrDays > 0 ? Math.round((hazardPay  / vrDays) * 100) / 100 : 0;

  return { daily, vt, vr, dsr, moto, hazard };
}

function calcAutoForReason(reasonId, entry) {
  const base  = calcBaseValues(entry);
  const rules = REASON_COLS[Number(reasonId)];
  if (!rules) return { daily: 0, vt: 0, vr: 0, dsr: 0, moto: 0, hazard: 0 };

  const factor = rules.half ? 0.5 : 1;
  const isMoto = (entry.motorcycle_rental > 0) || (entry.hazard_pay > 0);

  return {
    daily:  rules.daily  ? Math.round(base.daily  * factor * 100) / 100 : 0,
    vt:     rules.vt     ? Math.round(base.vt     * factor * 100) / 100 : 0,
    vr:     rules.vr     ? Math.round(base.vr     * factor * 100) / 100 : 0,
    dsr:    rules.dsr    ? Math.round(base.dsr    * factor * 100) / 100 : 0,
    moto:   (rules.moto   && isMoto) ? Math.round(base.moto   * factor * 100) / 100 : 0,
    hazard: (rules.hazard && isMoto) ? Math.round(base.hazard * factor * 100) / 100 : 0,
  };
}

function expandAdjustmentsForMonth(adjustments, referenceMonth) {
  const [year, month] = referenceMonth.split('-').map(Number);
  const result = [];

  for (const adj of adjustments) {
    if (!adj.start_date) continue;
    const start = new Date(adj.start_date + 'T00:00:00');
    const end   = adj.end_date ? new Date(adj.end_date + 'T00:00:00') : start;

    let cur = new Date(start);
    while (cur <= end) {
      if (cur.getFullYear() === year && (cur.getMonth() + 1) === month) {
        const dateStr = cur.toISOString().split('T')[0];
        result.push({ ...adj, date: dateStr });
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  return result;
}

/**
 * Reconstrói absence_discounts respeitando quinzenas bloqueadas e edições manuais.
 * Dias em período bloqueado: preserva valor existente.
 * Dias não bloqueados: recalcula (exceto editados manualmente).
 */
function recalcAbsenceDiscountsForEntry(entry, adjustments, lockedFirst, lockedSecond) {
  const prevDiscounts = entry.absence_discounts || {};
  const dailyAdjs = expandAdjustmentsForMonth(adjustments, entry.reference_month);
  const absenceAdjs = dailyAdjs.filter(a => ABSENCE_REASON_IDS.has(Number(a.adjustment_reason_id)));

  const next = {};

  for (const a of absenceAdjs) {
    const key = String(a.date ? `${a.tangerino_id}-${a.date}` : (a.tangerino_id || a.id));
    const day = a.date ? parseInt(a.date.split('-')[2], 10) : 0;
    const isFirstPeriod = day >= 1 && day <= 15;

    // Se a quinzena está bloqueada: preserva o valor existente (não altera)
    if ((isFirstPeriod && lockedFirst) || (!isFirstPeriod && lockedSecond)) {
      if (prevDiscounts[key]) next[key] = prevDiscounts[key];
      continue;
    }

    // Preserva edições manuais
    if (prevDiscounts[key]?._manual === true) {
      next[key] = prevDiscounts[key];
      continue;
    }

    // Domingo: sem desconto
    const dow = new Date(a.date + 'T00:00:00').getDay();
    if (dow === 0) {
      next[key] = { daily: 0, vt: 0, vr: 0, dsr: 0, moto: 0, hazard: 0, _sunday: true };
      continue;
    }

    next[key] = calcAutoForReason(a.adjustment_reason_id, entry);
  }

  return next;
}

async function fetchAllPayrollEntries(base44, filter = {}) {
  const entries = [];
  const CHUNK = 500;
  let offset = 0;
  while (true) {
    const chunk = await base44.asServiceRole.entities.PayrollEntry.filter(filter, 'reference_month', CHUNK, offset);
    entries.push(...chunk);
    if (chunk.length < CHUNK) break;
    offset += CHUNK;
  }
  return entries;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));

    console.log('[recalc] Iniciando recálculo de descontos de faltas...');

    // Decide quais folhas processar
    let entries = [];
    if (body.payroll_entry_id) {
      entries = await base44.asServiceRole.entities.PayrollEntry.filter({ id: body.payroll_entry_id });
      console.log(`[recalc] Modo: folha específica (${body.payroll_entry_id})`);
    } else if (body.reference_month) {
      entries = await fetchAllPayrollEntries(base44, { reference_month: body.reference_month });
      console.log(`[recalc] Modo: mês ${body.reference_month} — ${entries.length} folhas`);
    } else {
      entries = await fetchAllPayrollEntries(base44, { status: 'open' });
      console.log(`[recalc] Modo: folhas abertas — ${entries.length} encontradas`);
    }

    // Carrega TODOS os ajustes de ponto de uma vez
    console.log('[recalc] Carregando todos os ajustes de ponto...');
    const allAdjs = [];
    const CHUNK = 2000;
    let offset = 0;
    while (true) {
      const chunk = await base44.asServiceRole.entities.PointAdjustment.list('start_date', CHUNK, offset);
      allAdjs.push(...chunk);
      if (chunk.length < CHUNK) break;
      offset += CHUNK;
    }
    console.log(`[recalc] Total ajustes carregados: ${allAdjs.length}`);

    // Indexa ajustes por employee_id
    const adjsByEmployee = {};
    for (const adj of allAdjs) {
      if (!adj.employee_id) continue;
      if (!adjsByEmployee[adj.employee_id]) adjsByEmployee[adj.employee_id] = [];
      adjsByEmployee[adj.employee_id].push(adj);
    }

    // Carrega PaymentStatuses das folhas em processamento (indexado por payroll_entry_id)
    console.log('[recalc] Carregando status de pagamentos...');
    const entryIdSet = new Set(entries.map(e => e.id));
    const paymentStatusMap = {};

    // Carrega todos os PaymentStatuses dos meses das entries
    const monthSet = new Set(entries.map(e => e.reference_month).filter(Boolean));
    for (const month of monthSet) {
      const psChunk = await base44.asServiceRole.entities.PaymentStatus.filter({ reference_month: month }, null, 2000);
      for (const ps of psChunk) {
        if (entryIdSet.has(ps.payroll_entry_id)) {
          paymentStatusMap[ps.payroll_entry_id] = ps;
        }
      }
    }

    let updated = 0;
    let skipped = 0;
    let errors  = 0;
    let blockedPeriods = 0;

    for (const entry of entries) {
      if (!entry.employee_id || !entry.reference_month) { skipped++; continue; }

      // Verifica quais quinzenas estão bloqueadas
      const ps = paymentStatusMap[entry.id];
      const lockedFirst  = ps ? BLOCKED_STATUSES.has(ps.status_q1 || '') : false;
      const lockedSecond = ps ? BLOCKED_STATUSES.has(ps.status_q2 || '') : false;
      if (lockedFirst) blockedPeriods++;
      if (lockedSecond) blockedPeriods++;

      const adjustments = adjsByEmployee[entry.employee_id] || [];
      const newAbsenceDiscounts = recalcAbsenceDiscountsForEntry(entry, adjustments, lockedFirst, lockedSecond);

      // Compara com estado anterior
      const oldDiscountsJson = JSON.stringify(entry.absence_discounts || {});
      const newDiscountsJson = JSON.stringify(newAbsenceDiscounts);

      // Calcula totais por período
      const oldPeriods = absenceByPeriod(entry.absence_discounts || {});
      const newPeriods = absenceByPeriod(newAbsenceDiscounts);

      const absence_discount_first  = newPeriods.first;
      const absence_discount_second = newPeriods.second;
      const absence_discount = Math.round((absence_discount_first + absence_discount_second) * 100) / 100;

      // Delta-ajusta os valores líquidos por quinzena (só para períodos não bloqueados)
      const deltaFirst  = newPeriods.first  - oldPeriods.first;
      const deltaSecond = newPeriods.second - oldPeriods.second;

      const newFirstNet  = lockedFirst
        ? (entry.first_period_net || 0)
        : Math.round(((entry.first_period_net || 0) - deltaFirst) * 100) / 100;
      const newSecondNet = lockedSecond
        ? (entry.second_period_net || 0)
        : Math.round(((entry.second_period_net || 0) - deltaSecond) * 100) / 100;

      const noChange = oldDiscountsJson === newDiscountsJson
        && (entry.absence_discount_first || 0) === absence_discount_first
        && (entry.absence_discount_second || 0) === absence_discount_second;

      if (noChange) { skipped++; continue; }

      try {
        await base44.asServiceRole.entities.PayrollEntry.update(entry.id, {
          absence_discounts: newAbsenceDiscounts,
          absence_discount,
          absence_discount_first,
          absence_discount_second,
          first_period_net: newFirstNet,
          second_period_net: newSecondNet,
        });
        updated++;
        console.log(`[recalc] ✓ ${entry.employee_id} / ${entry.reference_month}: 1ªQ ${oldPeriods.first}→${newPeriods.first}, 2ªQ ${oldPeriods.second}→${newPeriods.second}${lockedFirst ? ' (1ªQ bloq)' : ''}${lockedSecond ? ' (2ªQ bloq)' : ''}`);
      } catch (e) {
        errors++;
        console.error(`[recalc] Erro ${entry.id}: ${e.message}`);
      }
    }

    console.log(`[recalc] Concluído. Atualizado: ${updated}, Sem mudança: ${skipped}, Erros: ${errors}, Períodos bloqueados preservados: ${blockedPeriods}`);

    return Response.json({ success: true, entries_processed: entries.length, updated, skipped, errors, blocked_periods: blockedPeriods });

  } catch (error) {
    console.error('[recalc] Erro geral:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});