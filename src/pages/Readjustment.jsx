import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { getMonthName } from '@/lib/payrollCalculations';
import { Plus, Play, CheckCircle2, RotateCcw, Trash2, Edit, AlertTriangle } from 'lucide-react';
import ReadjustmentRuleForm from '@/components/readjustment/ReadjustmentRuleForm';
import ReadjustmentSimulationDialog from '@/components/readjustment/ReadjustmentSimulationDialog';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  draft:    { label: 'Rascunho',  className: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  applied:  { label: 'Aplicado', className: 'bg-green-100 text-green-700 border-green-300' },
  reverted: { label: 'Revertido', className: 'bg-red-100 text-red-700 border-red-300' },
};

const SCOPE_LABEL = { payroll_type: 'Por Folha', employee: 'Colaborador' };

const PAYROLL_TYPE_LABEL = {
  MOTOCICLISTA_CLT: 'Motociclista CLT',
  MOTOCICLISTA_MEI: 'Motociclista MEI',
  ESCRITORIO: 'Escritório',
  SOCIO: 'Sócio (Pró-Labore)',
  ESPORADICO: 'Esporádico',
};

export default function Readjustment() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState(null);
  const [simulatingRule, setSimulatingRule] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // {type, rule}
  const [applyToSecondOnly, setApplyToSecondOnly] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [employees, setEmployees] = useState([]);

  const loadRules = async () => {
    setLoading(true);
    const [r, c, e] = await Promise.all([
      base44.entities.ReadjustmentRule.list('-created_date'),
      base44.entities.Company.filter({ is_active: true }),
      base44.entities.Employee.filter({ is_active: true }),
    ]);
    setRules(r);
    setCompanies(c);
    setEmployees(e);
    setLoading(false);
  };

  useEffect(() => { loadRules(); }, []);

  const companyName = (id) => companies.find(c => c.id === id)?.name ?? id;
  const employeeName = (id) => employees.find(e => e.id === id)?.name ?? id;

  const handleDelete = async (rule) => {
    await base44.entities.ReadjustmentRule.delete(rule.id);
    toast.success('Reajuste excluído');
    loadRules();
    setConfirmAction(null);
  };

  const handleApply = async (rule) => {
    setActionLoading(true);
    const res = await base44.functions.invoke('applyReadjustment', { ruleId: rule.id, applyToSecondOnly });
    setActionLoading(false);
    if (res.data?.success) {
      toast.success(`Reajuste aplicado em ${res.data.updatedCount} folha(s)`);
      loadRules();
    } else {
      toast.error(res.data?.error ?? 'Erro ao aplicar reajuste');
    }
    setConfirmAction(null);
  };

  const handleRevert = async (rule) => {
    setActionLoading(true);
    const res = await base44.functions.invoke('revertReadjustment', { ruleId: rule.id });
    setActionLoading(false);
    if (res.data?.success) {
      toast.success(`Reajuste revertido em ${res.data.revertedCount} folha(s)`);
      loadRules();
    } else {
      toast.error(res.data?.error ?? 'Erro ao reverter reajuste');
    }
    setConfirmAction(null);
  };

  const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Módulo de Reajuste Salarial</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie reajustes anuais para motociclistas CLT com simulação e reversão</p>
        </div>
        <Button className="gap-2" onClick={() => setEditingRule({})}>
          <Plus className="w-4 h-4" /> Novo Reajuste
        </Button>
      </div>

      {/* Rules list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Play className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum reajuste cadastrado</p>
          <p className="text-sm mt-1">Clique em "Novo Reajuste" para começar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map(rule => {
            const sc = STATUS_CONFIG[rule.status] ?? STATUS_CONFIG.draft;
            return (
              <div key={rule.id} className="border rounded-xl p-5 bg-white shadow-sm space-y-4">
                {/* Title row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base truncate">{rule.description || '—'}</h3>
                      <Badge variant="outline" className={sc.className}>{sc.label}</Badge>
                      <Badge variant="outline">{getMonthName(rule.reference_month)}</Badge>
                      <Badge variant="outline" className="text-muted-foreground">
                        {SCOPE_LABEL[rule.readjustment_scope]}
                        {rule.readjustment_scope === 'payroll_type' && rule.payroll_type && `: ${PAYROLL_TYPE_LABEL[rule.payroll_type] ?? rule.payroll_type}`}
                        {rule.readjustment_scope === 'employee' && rule.employee_id && `: ${employeeName(rule.employee_id)}`}
                      </Badge>
                    </div>
                    {rule.status === 'applied' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Aplicado em {formatDate(rule.applied_date)} — {rule.affected_entries_count ?? 0} folha(s)
                      </p>
                    )}
                    {rule.status === 'reverted' && (
                      <p className="text-xs text-muted-foreground mt-1">Revertido em {formatDate(rule.reverted_date)}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {rule.status === 'draft' && (
                      <>
                        <Button size="sm" variant="outline" className="gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50"
                          onClick={() => setSimulatingRule(rule)}>
                          <Play className="w-3.5 h-3.5" /> Simular
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-green-600 border-green-300 hover:bg-green-50"
                          onClick={() => setConfirmAction({ type: 'apply', rule })}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Aplicar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingRule(rule)}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          onClick={() => setConfirmAction({ type: 'delete', rule })}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {rule.status === 'applied' && (
                      <>
                        <Button size="sm" variant="outline" className="gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50"
                          onClick={() => setSimulatingRule(rule)}>
                          <Play className="w-3.5 h-3.5" /> Ver Simulação
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
                          onClick={() => setConfirmAction({ type: 'revert', rule })}>
                          <RotateCcw className="w-3.5 h-3.5" /> Reverter
                        </Button>
                      </>
                    )}
                    {rule.status === 'reverted' && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmAction({ type: 'delete', rule })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Percentages grid */}
                <div className="grid grid-cols-5 gap-2 text-xs text-center">
                  {[
                    { label: 'Salário Efetivo', value: rule.effective_salary_pct },
                    { label: 'Aluguel Moto', value: rule.motorcycle_rental_pct },
                    { label: 'Vale Refeição', value: rule.meal_voucher_day_value_pct },
                    { label: 'Vale Alimentação', value: rule.food_voucher_day_value_pct },
                    { label: 'Periculosidade', value: `${rule.hazard_pay_pct_on_salary}% s/ sal.` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/40 rounded-lg p-2">
                      <div className="text-muted-foreground mb-0.5">{label}</div>
                      <div className="font-semibold text-primary">{typeof value === 'number' ? `+${value}%` : value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-base">
                  {confirmAction.type === 'apply' && 'Aplicar Reajuste'}
                  {confirmAction.type === 'revert' && 'Reverter Reajuste'}
                  {confirmAction.type === 'delete' && 'Excluir Reajuste'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {confirmAction.type === 'apply' && (
                    <>
                      As folhas do escopo selecionado serão atualizadas e o salário base dos colaboradores será atualizado para os próximos meses.
                      <div className="mt-3 flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <input
                          type="checkbox"
                          id="applyToSecondOnly"
                          className="mt-0.5 cursor-pointer"
                          checked={applyToSecondOnly}
                          onChange={e => setApplyToSecondOnly(e.target.checked)}
                        />
                        <label htmlFor="applyToSecondOnly" className="cursor-pointer text-sm text-orange-800">
                          <strong>1ª quinzena já foi paga</strong> — lançar a diferença do reajuste apenas na 2ª quinzena, sem alterar o valor já pago na 1ª.
                        </label>
                      </div>
                    </>
                  )}
                  {confirmAction.type === 'revert' && 'Todas as folhas serão restauradas aos valores originais. Esta ação não pode ser desfeita sem reaplicar o reajuste.'}
                  {confirmAction.type === 'delete' && 'O reajuste será excluído permanentemente.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={actionLoading}>Cancelar</Button>
              <Button
                variant={confirmAction.type === 'delete' || confirmAction.type === 'revert' ? 'destructive' : 'default'}
                disabled={actionLoading}
                onClick={() => {
                  if (confirmAction.type === 'apply') handleApply(confirmAction.rule);
                  else if (confirmAction.type === 'revert') handleRevert(confirmAction.rule);
                  else if (confirmAction.type === 'delete') handleDelete(confirmAction.rule);
                }}
              >
                {actionLoading ? 'Processando...' : (
                  confirmAction.type === 'apply' ? 'Confirmar Aplicação' :
                  confirmAction.type === 'revert' ? 'Confirmar Reversão' : 'Excluir'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Form dialog */}
      {editingRule && (
        <ReadjustmentRuleForm
          rule={editingRule?.id ? editingRule : null}
          onSave={() => { setEditingRule(null); loadRules(); toast.success('Reajuste salvo'); }}
          onClose={() => setEditingRule(null)}
        />
      )}

      {/* Simulation dialog */}
      {simulatingRule && (
        <ReadjustmentSimulationDialog rule={simulatingRule} onClose={() => setSimulatingRule(null)} />
      )}
    </div>
  );
}