import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NEW_VALUE = 36.05;
const OLD_VALUE = 35.00;
const DIFF      = Math.round((NEW_VALUE - OLD_VALUE) * 100) / 100; // 1.05

const r = (v) => Math.round((v ?? 0) * 100) / 100;
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// Retry com backoff exponencial para tratar rate limit
async function updateWithRetry(entities, id, data, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await entities.PayrollEntry.update(id, data);
    } catch (err) {
      const isRateLimit = err?.status === 429 || (err?.message ?? '').toLowerCase().includes('rate');
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = 500 * Math.pow(2, attempt); // 500ms, 1s, 2s, 4s, 8s
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

async function updateRuleWithRetry(entities, ruleId, data, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await entities.ReadjustmentRule.update(ruleId, data);
    } catch (err) {
      const isRateLimit = err?.status === 429 || (err?.message ?? '').toLowerCase().includes('rate');
      if (isRateLimit && attempt < maxRetries - 1) {
        await sleep(500 * Math.pow(2, attempt));
      } else {
        throw err;
      }
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { ruleId } = await req.json();
    if (!ruleId) return Response.json({ error: 'ruleId obrigatório' }, { status: 400 });

    const rule = await base44.asServiceRole.entities.ReadjustmentRule.get(ruleId);
    if (!rule) return Response.json({ error: 'Regra não encontrada' }, { status: 404 });
    if (rule.union_contrib_applied) return Response.json({ error: 'Ajuste de contribuição assistencial já aplicado' }, { status: 400 });

    // Busca folhas pelos parâmetros da regra (não depende de snapshot)
    const allEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ reference_month: rule.reference_month });
    let entries = [];

    if (rule.readjustment_scope === 'employee' && rule.employee_id) {
      entries = allEntries.filter(e => e.employee_id === rule.employee_id && (e.clt_moto_base_salary ?? 0) > 0);
    } else if (rule.readjustment_scope === 'payroll_type' && rule.payroll_type) {
      const [jobRoles, allEmployees] = await Promise.all([
        base44.asServiceRole.entities.JobRole.list(),
        base44.asServiceRole.entities.Employee.list(),
      ]);
      const matchingRoles = jobRoles.filter(jr => jr.payroll_type === rule.payroll_type);
      const roleIds = new Set(matchingRoles.map(jr => String(jr.tangerino_id)).filter(Boolean));
      let relevantEmps = allEmployees.filter(e =>
        e.job_role_tangerino_id && roleIds.has(String(e.job_role_tangerino_id)) &&
        (!rule.company_id || e.company_id === rule.company_id)
      );
      if (rule.workplace_tangerino_id) {
        const wpId = String(rule.workplace_tangerino_id);
        relevantEmps = relevantEmps.filter(e => (e.workplace_list ?? []).map(String).includes(wpId));
      }
      const empIds = new Set(relevantEmps.map(e => e.id));
      entries = allEntries.filter(e => empIds.has(e.employee_id) && (e.clt_moto_base_salary ?? 0) > 0);
    } else {
      // Fallback: usa snapshot se existir, senão todas as folhas com CLT moto
      const snapshot = rule.affected_payroll_entries_snapshot ?? [];
      if (snapshot.length > 0) {
        const snapshotIds = new Set(snapshot.map(e => e.id).filter(Boolean));
        entries = allEntries.filter(e => snapshotIds.has(e.id));
      } else {
        entries = allEntries.filter(e => (e.clt_moto_base_salary ?? 0) > 0);
      }
    }

    if (rule.excluded_employee_ids && rule.excluded_employee_ids.length > 0) {
      const excludedSet = new Set(rule.excluded_employee_ids);
      entries = entries.filter(e => !excludedSet.has(e.employee_id));
    }

    if (entries.length === 0) return Response.json({ error: 'Nenhuma folha encontrada para os parâmetros da regra' }, { status: 400 });

    // Inicializa progresso — snapshot começa vazio e cresce incrementalmente (suporte a estorno parcial)
    await updateRuleWithRetry(base44.asServiceRole.entities, ruleId, {
      union_contrib_in_progress: true,
      union_contrib_progress_total: entries.length,
      union_contrib_updated_count: 0,
      union_contrib_snapshot: [], // será preenchido incrementalmente
    });

    let updatedCount = 0;
    let incrementalSnapshot = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Salva valores ORIGINAIS desta entrada no snapshot incremental ANTES de alterar
      // Inclui net_total para que fixUnionContribNetTotal e revert possam restaurá-lo se necessário
      incrementalSnapshot.push({
        id: entry.id,
        union_contribution_value: entry.union_contribution_value ?? OLD_VALUE,
        union_contribution:       entry.union_contribution ?? 0,
        second_period_net:        entry.second_period_net ?? 0,
        net_total:                entry.net_total ?? 0,  // salvo para referência e reversão
        // first_period_net NÃO é alterado — não precisa no snapshot
      });

      // Aplica ajuste: APENAS second_period_net é deduzido, first_period_net é preservado
      await updateWithRetry(base44.asServiceRole.entities, entry.id, {
        union_contribution_value: NEW_VALUE,
        union_contribution:       NEW_VALUE,
        second_period_net:        r((entry.second_period_net ?? 0) - DIFF),
        // first_period_net: NÃO ALTERADO
        // net_total: NÃO ALTERADO (o rateio já está fixo no campo first_period_net/second_period_net)
      });

      updatedCount++;

      // A cada batch: persiste snapshot incremental + progresso (para permitir estorno parcial)
      if (updatedCount % BATCH_SIZE === 0 || i === entries.length - 1) {
        await updateRuleWithRetry(base44.asServiceRole.entities, ruleId, {
          union_contrib_updated_count: updatedCount,
          union_contrib_snapshot: [...incrementalSnapshot],
        });
        await sleep(300);
      }
    }

    // Finaliza
    await updateRuleWithRetry(base44.asServiceRole.entities, ruleId, {
      union_contrib_applied:        true,
      union_contrib_in_progress:    false,
      union_contrib_applied_date:   new Date().toISOString(),
      union_contrib_updated_count:  updatedCount,
      union_contrib_snapshot:       incrementalSnapshot,
    });

    return Response.json({ success: true, updatedCount, diff: DIFF, newValue: NEW_VALUE });
  } catch (error) {
    // Garante que flag de progresso seja limpa mesmo em erro
    try {
      const base44 = createClientFromRequest(req);
      const { ruleId } = await req.json().catch(() => ({}));
      if (ruleId) {
        await base44.asServiceRole.entities.ReadjustmentRule.update(ruleId, {
          union_contrib_in_progress: false,
        });
      }
    } catch { /* ignora erro no cleanup */ }
    return Response.json({ error: error.message }, { status: 500 });
  }
});