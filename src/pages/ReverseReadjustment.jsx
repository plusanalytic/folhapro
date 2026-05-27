import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { getMonthName } from '@/lib/payrollCalculations';
import { Plus, Play, CheckCircle2, RotateCcw, Trash2, Edit, AlertTriangle, TrendingDown, Users, Wrench } from 'lucide-react';
import ReadjustmentRuleForm from '@/components/readjustment/ReadjustmentRuleForm';
import ReadjustmentSimulationDialog from '@/components/readjustment/ReadjustmentSimulationDialog';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  draft:    { label: 'Rascunho',    className: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  applying: { label: 'Processando', className: 'bg-blue-100 text-blue-700 border-blue-300' },
  applied:  { label: 'Aplicado',    className: 'bg-green-100 text-green-700 border-green-300' },
  reverted: { label: 'Revertido',   className: 'bg-red-100 text-red-700 border-red-300' },
};

const SCOPE_LABEL = { payroll_type: 'Por Folha', employee: 'Colaborador' };
const PAYROLL_TYPE_LABEL = {
  MOTOCICLISTA_CLT: 'Motociclista CLT',
  MOTOCICLISTA_MEI: 'Motociclista MEI',
  ESCRITORIO: 'Escritório',
  SOCIO: 'Sócio (Pró-Labore)',
  ESPORADICO: 'Esporádico',
};

export default function ReverseReadjustment() {
  const [allRules, setAllRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState(null);
  const [simulatingRule, setSimulatingRule] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [applyToSecondOnly, setApplyToSecondOnly] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [progress, setProgress] = useState(null);
  const pollRef = useRef(null);

  const rules = allRules.filter(r => r.rule_type === 'decrease');

  const loadRules = async () => {
    setLoading(true);
    const [r, c, e, w] = await Promise.all([
      base44.entities.ReadjustmentRule.list('-created_date'),
      base44.entities.Company.filter({ is_active: true }),
      base44.entities.Employee.list(),
      base44.entities.Workplace.list(),
    ]);
    setAllRules(r);
    setCompanies(c);
    setEmployees(e);
    setWorkplaces(w);
    setLoading(false);
  };

  useEffect(() => { loadRules(); }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const companyName = (id) => companies.find(c => c.id === id)?.name ?? id;
  const employeeName = (id) => employees.find(e => e.id === id)?.name ?? id;
  const workplaceName = (tid) => workplaces.find(w => String(w.tangerino_id) === String(tid))?.name ?? tid;

  const startPolling = (ruleId, label) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const updated = await base44.entities.ReadjustmentRule.get(ruleId);
        const current = updated?.affected_entries_count ?? 0;
        const total   = updated?.progress_total ?? 0;
        setProgress({ current, total, label });
        if (updated?.status !== 'applying') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setProgress(null);
          setActionLoading(false);
          loadRules();
        }
      } catch { /* ignora */ }
    }, 1500);
  };

  const handleUnionContrib = async (rule, revert = false) => {
    setConfirmAction(null);
    setActionLoading(true);
    const label = revert ? 'Revertendo contribuição assistencial...' : 'Aplicando contribuição assistencial...';
    setProgress({ current: 0, total: 0, label });
    try {
      const fnName = revert ? 'revertUnionContribAdjustment' : 'applyUnionContribAdjustment';
      const res = await base44.functions.invoke(fnName, { ruleId: rule.id });
      if (res.data?.success) {
        toast.success(`Contribuição assistencial ${revert ? 'revertida' : 'ajustada'} em ${res.data.updatedCount ?? res.data.revertedCount ?? 0} folha(s)`);
      } else {
        toast.error(res.data?.error ?? 'Erro');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error ?? err?.message ?? 'Erro');
    } finally {
      setProgress(null);
      setActionLoading(false);
      loadRules();
    }
  };

  const handleApply = async (rule) => {
    setConfirmAction(null);
    setActionLoading(true);
    setProgress({ current: 0, total: 0, label: 'Aplicando redução...' });
    startPolling(rule.id, 'Aplicando redução...');
    try {
      const res = await base44.functions.invoke('applyReverseReadjustment', { ruleId: rule.id, applyToSecondOnly });
      if (res.data?.success) {
        toast.success(`Redução aplicada em ${res.data.updatedCount} folha(s)`);
      } else {
        toast.error(res.data?.error ?? 'Erro ao aplicar redução');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error ?? err?.message ?? 'Erro ao aplicar redução');
    } finally {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setProgress(null);
      setActionLoading(false);
      loadRules();
    }
  };

  const handleRevert = async (rule) => {
    setConfirmAction(null);
    setActionLoading(true);
    setProgress({ current: 0, total: 0, label: 'Revertendo redução...' });
    startPolling(rule.id, 'Revertendo redução...');
    try {
      const res = await base44.functions.invoke('revertReverseReadjustment', { ruleId: rule.id });
      if (res.data?.success) {
        toast.success(`Redução revertida em ${res.data.revertedCount} folha(s)`);
      } else {
        toast.error(res.data?.error ?? 'Erro ao reverter');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error ?? err?.message ?? 'Erro ao reverter');
    } finally {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setProgress(null);
      setActionLoading(false);
      loadRules();
    }
  };

  const handleDelete = async (rule) => {
    await base44.entities.ReadjustmentRule.delete(rule.id);
    toast.success('Redução excluída');
    loadRules();
    setConfirmAction(null);
  };

  const formatDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingDown className="w-6 h-6 text-red-500" />
            Módulo de Redução Salarial
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie reduções com simulação e reversão</p>
        </div>
        <Button className="gap-2 bg-red-600 hover:bg-red-700" onClick={() => setEditingRule({})}>
          <Plus className="w-4 h-4" /> Nova Redução
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <TrendingDown className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma redução cadastrada</p>
          <p className="text-sm mt-1">Clique em "Nova Redução" para começar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map(rule => {
            const sc = STATUS_CONFIG[rule.status] ?? STATUS_CONFIG.draft;
            return (
              <div key={rule.id} className="border rounded-xl p-5 bg-white shadow-sm space-y-4 border-red-100">
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
                      {rule.company_id && <Badge variant="outline" className="text-muted-foreground">{companyName(rule.company_id)}</Badge>}
                      {rule.workplace_tangerino_id && <Badge variant="outline" className="text-blue-600 border-blue-300">Local: {workplaceName(rule.workplace_tangerino_id)}</Badge>}
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

                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    {rule.status === 'draft' && (
                      <>
                        <Button size="sm" variant="outline" className="gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50"
                          onClick={() => setSimulatingRule(rule)}>
                          <Play className="w-3.5 h-3.5" /> Simular
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
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
                    {(rule.status === 'applied' || rule.status === 'applying') && (
                      <>
                        <Button size="sm" variant="outline" className="gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50"
                          onClick={() => setSimulatingRule(rule)}>
                          <Play className="w-3.5 h-3.5" /> Ver Simulação
                        </Button>
                        {!rule.union_contrib_applied ? (
                          <Button size="sm" variant="outline" className="gap-1.5 text-purple-600 border-purple-300 hover:bg-purple-50"
                            onClick={() => setConfirmAction({ type: 'unionContrib', rule })}>
                            <Users className="w-3.5 h-3.5" /> Contrib. Assist.
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="gap-1.5 text-gray-500 border-gray-300 hover:bg-gray-50"
                            onClick={() => setConfirmAction({ type: 'revertUnionContrib', rule })}>
                            <Users className="w-3.5 h-3.5" /> Reverter Contrib.
                          </Button>
                        )}
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

                <div className="grid grid-cols-5 gap-2 text-xs text-center">
                  {[
                    { label: 'Salário Efetivo', value: rule.effective_salary_pct },
                    { label: 'Aluguel Moto', value: rule.motorcycle_rental_pct },
                    { label: 'Vale Refeição', value: rule.meal_voucher_day_value_pct },
                    { label: 'Vale Alimentação', value: rule.food_voucher_day_value_pct },
                    { label: 'Periculosidade', value: `${rule.hazard_pay_pct_on_salary}% s/ sal.` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-red-50 rounded-lg p-2">
                      <div className="text-muted-foreground mb-0.5">{label}</div>
                      <div className="font-semibold text-red-600">{typeof value === 'number' ? `-${value}%` : value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {actionLoading && progress !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-8 max-w-sm w-full shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 border-4 border-red-200 border-t-red-500 rounded-full animate-spin mx-auto" />
            <div>
              <p className="font-semibold text-base">{progress.label}</p>
              {progress.total > 0 ? (
                <p className="text-sm text-muted-foreground mt-1">{progress.current} de {progress.total} folhas processadas</p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">Preparando...</p>
              )}
            </div>
            {progress.total > 0 && (
              <Progress value={Math.round((progress.current / progress.total) * 100)} className="h-3" />
            )}
            <p className="text-xs text-muted-foreground">Não feche esta janela</p>
          </div>
        </div>
      )}

      {confirmAction && !actionLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-base">
                  {confirmAction.type === 'apply' && 'Aplicar Redução Salarial'}
                  {confirmAction.type === 'revert' && 'Reverter Redução'}
                  {confirmAction.type === 'unionContrib' && 'Ajustar Contribuição Assistencial'}
                  {confirmAction.type === 'revertUnionContrib' && 'Reverter Contribuição Assistencial'}
                  {confirmAction.type === 'delete' && 'Excluir Redução'}
                </h3>
                <div className="text-sm text-muted-foreground mt-2">
                  {confirmAction.type === 'apply' && (
                    <>
                      <p>Os valores das folhas do escopo serão <strong>reduzidos</strong> conforme os percentuais configurados.</p>
                      <div className="mt-3 flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <input type="checkbox" id="applyToSecondOnlyRev" className="mt-0.5 cursor-pointer"
                          checked={applyToSecondOnly} onChange={e => setApplyToSecondOnly(e.target.checked)} />
                        <label htmlFor="applyToSecondOnlyRev" className="cursor-pointer text-sm text-orange-800">
                          <strong>1ª quinzena já foi paga</strong> — lançar a diferença apenas na 2ª quinzena.
                        </label>
                      </div>
                    </>
                  )}
                  {confirmAction.type === 'revert' && <p>Todas as folhas serão restauradas aos valores originais via snapshot.</p>}
                  {confirmAction.type === 'unionContrib' && <p>Contribuição assistencial será ajustada nas folhas deste escopo.</p>}
                  {confirmAction.type === 'revertUnionContrib' && <p>A contribuição assistencial será restaurada ao valor anterior ao ajuste.</p>}
                  {confirmAction.type === 'delete' && <p>A redução será excluída permanentemente.</p>}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancelar</Button>
              <Button
                variant={['delete', 'revert', 'revertUnionContrib'].includes(confirmAction.type) ? 'destructive' : 'default'}
                className={confirmAction.type === 'apply' ? 'bg-red-600 hover:bg-red-700' : ''}
                onClick={() => {
                  if (confirmAction.type === 'apply') handleApply(confirmAction.rule);
                  else if (confirmAction.type === 'revert') handleRevert(confirmAction.rule);
                  else if (confirmAction.type === 'unionContrib') handleUnionContrib(confirmAction.rule, false);
                  else if (confirmAction.type === 'revertUnionContrib') handleUnionContrib(confirmAction.rule, true);
                  else if (confirmAction.type === 'delete') handleDelete(confirmAction.rule);
                }}
              >
                {confirmAction.type === 'apply' ? 'Confirmar Redução' :
                 confirmAction.type === 'revert' ? 'Confirmar Reversão' :
                 confirmAction.type === 'unionContrib' ? 'Confirmar Ajuste' :
                 confirmAction.type === 'revertUnionContrib' ? 'Reverter Ajuste' : 'Excluir'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingRule && (
        <ReadjustmentRuleForm
          rule={editingRule?.id ? editingRule : null}
          isReverse={true}
          onSave={() => { setEditingRule(null); loadRules(); toast.success('Redução salva'); }}
          onClose={() => setEditingRule(null)}
        />
      )}

      {simulatingRule && (
        <ReadjustmentSimulationDialog rule={simulatingRule} onClose={() => setSimulatingRule(null)} />
      )}
    </div>
  );
}