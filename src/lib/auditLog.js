import { base44 } from '@/api/base44Client';

/**
 * Registra uma ação no log de auditoria da folha de pagamento.
 * @param {object} params
 * @param {string} params.action - Tipo da ação (create, update, delete, close, reopen, close_month, reopen_month, clone)
 * @param {string} params.entity_type - Tipo da entidade afetada
 * @param {string} [params.entity_id] - ID da entidade
 * @param {string} [params.employee_id] - ID do colaborador
 * @param {string} [params.employee_name] - Nome do colaborador
 * @param {string} [params.company_id] - ID da empresa
 * @param {string} [params.company_name] - Nome da empresa
 * @param {string} [params.reference_month] - Mês de referência (YYYY-MM)
 * @param {string} [params.user_name] - Nome do usuário que fez a ação
 * @param {string} params.description - Descrição legível da ação
 * @param {object} [params.details] - Detalhes extras
 */
export async function logAudit(params) {
  try {
    await base44.entities.PayrollAuditLog.create({
      action: params.action,
      entity_type: params.entity_type || 'PayrollEntry',
      entity_id: params.entity_id || '',
      employee_id: params.employee_id || '',
      employee_name: params.employee_name || '',
      company_id: params.company_id || '',
      company_name: params.company_name || '',
      reference_month: params.reference_month || '',
      user_name: params.user_name || 'Usuário',
      description: params.description,
      details: params.details || {},
    });
  } catch (e) {
    // Log nunca deve quebrar o fluxo principal
    console.warn('[auditLog] Erro ao registrar log:', e);
  }
}