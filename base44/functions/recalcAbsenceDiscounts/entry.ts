import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * recalcAbsenceDiscounts
 *
 * Recalcula o campo absence_discounts e absence_discount para todas as
 * PayrollEntry abertas (status='open') com base nos PointAdjustments
 * atualmente no banco.
 *
 * Pode ser chamado com:
 *   - { scheduled: true }  — via automação agendada
 *   - { payroll_entry_id } — para recalcular uma folha específica
 *   - {}                   — por um admin via frontend
 */

// IDs de motivos de ajuste que geram desconto (mesma lista do frontend)
const ABSENCE_REASON_IDS = new Set([5, 8, 16, 18, 19, 23, 24, 27, 2154902, 2157106, 2160971, 2169310, 2170370, 2173794]);

// Regras por motivo (mesmo mapeamento do AbsenceDiscountsTable)
const REASON_COLS = {
  5:       { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
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

function rowTotal(disc) {
  if (!disc || typeof disc !== 'object') return 0;
  return ['daily', 'vt', 'vr', 'dsr', 'moto', 'hazard'].reduce((s, k) => s + (parseFloat(disc[k]) || 0), 0);
}

function totalAbsenceDiscount(absenceDiscounts) {
  return Object.values(absenceDiscounts || {}).reduce((s, v) => s + rowTotal(v), 0);
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
  const vt    = vtPerDay > 0 ? vtPerDay
    : (vtTotal > 0 && vrDays > 0 ? Math.round((vtTotal / vrDays) * 100) / 100 : 0);
  const moto   = motoRental > 0 && vrDays > 0 ? Math.round((motoRental / vrDays) * 100) / 100 : 0;
  const hazard = hazardPay  > 0 && vrDays > 0 ? Math.round((hazardPay  / vrDays) * 100) / 100 : 0;

  return { daily, vt, vr, dsr, moto, hazard };
}

function isMotocyclistEntry(entry) {
  return (entry.motorcycle_rental > 0) || (entry.hazard_pay > 0);
}

function calcAutoForReason(reasonId, entry) {
  const base  = calcBaseValues(entry);
  const rules = REASON_COLS[Number(reasonId)];
  if (!rules) return { daily: 0, vt: 0, vr: 0, dsr: 0, moto: 0, hazard: 0 };

  const factor      = rules.half ? 0.5 : 1;
  const isMoto      = isMotocyclistEntry(entry);

  return {
    daily:  rules.daily  ? Math.round(base.daily  * factor * 100) / 100 : 0,
    vt:     rules.vt     ? Math.round(base.vt     * factor * 100) / 100 : 0,
    vr:     rules.vr     ? Math.round(base.vr     * factor * 100) / 100 : 0,
    dsr:    rules.dsr    ? Math.round(base.dsr    * factor * 100) / 100 : 0,
    moto:   (rules.moto   && isMoto) ? Math.round(base.moto   * factor * 100) / 100 : 0,
    hazard: (rules.hazard && isMoto) ? Math.round(base.hazard * factor * 100) / 100 : 0,
  };
}

/**
 * Expande ajustes multi-dia para dias individuais dentro do mês de referência
 */
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
 * Reconstrói absence_discounts APENAS para as linhas que NÃO foram editadas manualmente.
 * Linhas com _manual=true são preservadas.
 */
function recalcAbsenceDiscountsForEntry(entry, adjustments) {
  const prevDiscounts = entry.absence_discounts || {};

  // Filtra ajustes do mês e expande dia a dia
  const dailyAdjs = expandAdjustmentsForMonth(adjustments, entry.reference_month);
  const absenceAdjs = dailyAdjs.filter(a => ABSENCE_REASON_IDS.has(Number(a.adjustment_reason_id)));

  const next = {};

  for (const a of absenceAdjs) {
    const key = String(a.date ? `${a.tangerino_id}-${a.date}` : (a.tangerino_id || a.id));

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

  const newTotal = Math.round(totalAbsenceDiscount(next) * 100) / 100;

  return { absence_discounts: next, absence_discount: newTotal };
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

async function fetchAdjustmentsForEmployee(base44, employeeId) {
  const adjs = [];
  const CHUNK = 2000;
  let offset = 0;
  while (true) {
    const chunk = await base44.asServiceRole.entities.PointAdjustment.filter(
      { employee_id: employeeId }, 'start_date', CHUNK, offset
    );
    adjs.push(...chunk);
    if (chunk.length < CHUNK) break;
    offset += CHUNK;
  }
  return adjs;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));

    console.log('[recalc] Iniciando recálculo de descontos de faltas...');

    // Decide quais folhas processar
    let entries = [];
    if (body.payroll_entry_id) {
      const single = await base44.asServiceRole.entities.PayrollEntry.filter({ id: body.payroll_entry_id });
      entries = single;
      console.log(`[recalc] Modo: folha específica (${body.payroll_entry_id})`);
    } else if (body.reference_month) {
      // Por mês específico (para processamento em lote por mês)
      const filter = { reference_month: body.reference_month };
      entries = await fetchAllPayrollEntries(base44, filter);
      console.log(`[recalc] Modo: mês ${body.reference_month} — ${entries.length} folhas`);
    } else {
      // Apenas folhas abertas
      entries = await fetchAllPayrollEntries(base44, { status: 'open' });
      console.log(`[recalc] Modo: folhas abertas — ${entries.length} encontradas`);
    }

    // Carrega TODOS os ajustes de ponto de uma vez (mais eficiente que buscar por employee)
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

    // Indexa ajustes por employee_id para lookup rápido
    const adjsByEmployee = {};
    for (const adj of allAdjs) {
      if (!adj.employee_id) continue;
      if (!adjsByEmployee[adj.employee_id]) adjsByEmployee[adj.employee_id] = [];
      adjsByEmployee[adj.employee_id].push(adj);
    }

    let updated = 0;
    let skipped = 0;
    let errors  = 0;

    for (const entry of entries) {
      if (!entry.employee_id || !entry.reference_month) { skipped++; continue; }

      const adjustments = adjsByEmployee[entry.employee_id] || [];
      const { absence_discounts, absence_discount } = recalcAbsenceDiscountsForEntry(entry, adjustments);

      const oldTotal = Math.round((parseFloat(entry.absence_discount) || 0) * 100) / 100;
      const oldDiscountsJson = JSON.stringify(entry.absence_discounts || {});
      const newDiscountsJson = JSON.stringify(absence_discounts);

      if (oldTotal === absence_discount && oldDiscountsJson === newDiscountsJson) {
        skipped++;
        continue;
      }

      try {
        await base44.asServiceRole.entities.PayrollEntry.update(entry.id, {
          absence_discounts,
          absence_discount,
        });
        updated++;
        console.log(`[recalc] ✓ ${entry.employee_id} / ${entry.reference_month}: ${oldTotal} → ${absence_discount}`);
      } catch (e) {
        errors++;
        console.error(`[recalc] Erro ${entry.id}: ${e.message}`);
      }
    }

    console.log(`[recalc] Concluído. Atualizado: ${updated}, Sem mudança: ${skipped}, Erros: ${errors}`);

    return Response.json({ success: true, entries_processed: entries.length, updated, skipped, errors });

  } catch (error) {
    console.error('[recalc] Erro geral:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});