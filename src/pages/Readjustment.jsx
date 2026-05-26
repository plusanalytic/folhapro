import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { getMonthName } from '@/lib/payrollCalculations';
import { Plus, Play, CheckCircle2, RotateCcw, Trash2, Edit, AlertTriangle, Zap, Users } from 'lucide-react';
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

export default function Readjustment() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState(null);
  const [simulatingRule, setSimulatingRule] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [applyToSecondOnly, setApplyToSecondOnly] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [progress, setProgress] = useState(null); // { current, total, label }
  const pollRef = useRef(null);

  const loadRules = async () => {
    setLoading(true);
    const [r, c, e] = await Promise.all([
      base44.entities.ReadjustmentRule.list('-created_date'),
      base44.entities.Company.filter({ is_active: true }),
      base44.entities.Employee.list(),
    ]);
    setRules(r);
    setCompanies(c);
    setEmployees(e);
    setLoading(false);
  };

  useEffect(() => { loadRules(); }, []);

  // Limpa polling ao desmontar
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const companyName = (id) => companies.find(c => c.id === id)?.name ?? id;
  const employeeName = (id) => employees.find(e => e.id === id)?.name ?? id;

  const startPolling = (ruleId, label, stopCondition = null) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const updated = await base44.entities.ReadjustmentRule.get(ruleId);
        // Condição de parada customizável (para union contrib)
        const shouldStop = stopCondition ? stopCondition(updated) : (updated?.status !== 'applying');
        const current = updated?.affected_entries_count ?? 0;
        const total   = updated?.progress_total ?? 0;
        setProgress({ current, total, label });
        if (shouldStop) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setProgress(null);
          setActionLoading(false);
          loadRules();
        }
      } catch { /* ignora erros de poll */ }
    }, 1500);
  };

  const startUnionPolling = (ruleId, label) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const updated = await base44.entities.ReadjustmentRule.get(ruleId);
        const current = updated?.union_contrib_updated_count ?? 0;
        const total   = updated?.union_contrib_progress_total ?? 0;
        setProgress({ current, total, label });
        const done = !updated?.union_contrib_in_progress;
        if (done) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setProgress(null);
          setActionLoading(false);
          loadRules();
        }
      } catch { /* ignora erros de poll */ }
    }, 1500);
  };

  const handleUnionContrib = async (rule, revert = false) => {
    setConfirmAction(null);
    setActionLoading(true);
    const label = revert ? 'Revertendo contribuição assistencial...' : 'Aplicando contribuição assistencial...';
    setProgress({ current: 0, total: 0, label });
    if (!revert) {
      startUnionPolling(rule.id, label);
    }
    try {
      const fnName = revert ? 'revertUnionContribAdjustment' : 'applyUnionContribAdjustment';
      const res = await base44.functions.invoke(fnName, { ruleId: rule.id });
      if (res.data?.success) {
        const count = res.data.updatedCount ?? res.data.revertedCount ?? 0;
        const partialMsg = res.data.isPartial ? ` ${res.data.partialLabel}` : '';
        toast.success(`Contribuição assistencial ${revert ? 'revertida' : 'ajustada'} em ${count} folha(s)${partialMsg}`);
      } else {
        toast.error(res.data?.error ?? 'Erro ao processar contribuição assistencial');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error ?? err?.message ?? 'Erro');
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
    toast.success('Reajuste excluído');
    loadRules();
    setConfirmAction(null);
  };

  const handleApply = async (rule) => {
    setConfirmAction(null);
    setActionLoading(true);
    setProgress({ current: 0, total: 0, label: 'Aplicando reajuste...' });
    // Inicia polling imediatamente para capturar progresso mesmo se a função demorar
    startPolling(rule.id, 'Aplicando reajuste...');
    try {
      const res = await base44.functions.invoke('applyReadjustment', { ruleId: rule.id, applyToSecondOnly });
      if (res.data?.success) {
        toast.success(`Reajuste aplicado em ${res.data.updatedCount} folha(s)`);
      } else {
        toast.error(res.data?.error ?? 'Erro ao aplicar reajuste');
      }
    } catch (err) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erro ao aplicar reajuste';
      toast.error(msg);
    } finally {
      // O polling cuidará de limpar o estado quando o status mudar
      // Mas se a função retornou (sucesso ou erro), encerramos o polling agora
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setProgress(null);
      setActionLoading(false);
      loadRules();
    }
  };

  const handleRevert = async (rule, forceRevertWithMath = false) => {
    setConfirmAction(null);
    setActionLoading(true);
    const label = forceRevertWithMath ? 'Revertendo (matemática inversa)...' : 'Revertendo reajuste...';
    setProgress({ current: 0, total: 0, label });
    startPolling(rule.id, label);
    try {
      const res = await base44.functions.invoke('revertReadjustment', { ruleId: rule.id, forceRevertWithMath });
      if (res.data?.success) {
        toast.success(`Reajuste revertido em ${res.data.revertedCount} folha(s)`);
      } else {
        toast.error(res.data?.error ?? 'Erro ao reverter reajuste');
      }
    } catch (err) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Erro ao reverter reajuste';
      toast.error(msg);
    } finally {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setProgress(null);
      setActionLoading(false);
      loadRules();
    }
  };

  const formatDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Módulo de Reajuste Salarial</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie reajustes anuais com simulação e reversão</p>
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
                      {rule.company_id && <Badge variant="outline" className="text-muted-foreground">{companyName(rule.company_id)}</Badge>}
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
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
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
                        <Button size="sm" variant="outline" className="gap-1.5 text-orange-600 border-orange-300 hover:bg-orange-50"
                          title="Reverter por matemática inversa (para reajustes parcialmente aplicados)"
                          onClick={() => setConfirmAction({ type: 'forceRevert', rule })}>
                          <Zap className="w-3.5 h-3.5" /> Reverter
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
                          rule.union_contrib_in_progress ? (
                            <Button size="sm" variant="outline" disabled className="gap-1.5 text-purple-400 border-purple-200">
                              <Users className="w-3.5 h-3.5 animate-pulse" /> Processando...
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="gap-1.5 text-purple-600 border-purple-300 hover:bg-purple-50"
                              title="Atualizar Contribuição Assistencial de R$35 para R$36,05 (-R$1,05 na 2ª quinzena)"
                              onClick={() => setConfirmAction({ type: 'unionContrib', rule })}>
                              <Users className="w-3.5 h-3.5" /> Contrib. Assist.
                            </Button>
                          )
                        ) : (
                          <Button size="sm" variant="outline" className="gap-1.5 text-gray-500 border-gray-300 hover:bg-gray-50"
                            title={`Reverter ajuste de contribuição assistencial${(rule.union_contrib_updated_count ?? 0) < (rule.union_contrib_progress_total ?? 0) ? ' (parcial)' : ''}`}
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

      {/* Progress overlay */}
      {actionLoading && progress !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-8 max-w-sm w-full shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
            <div>
              <p className="font-semibold text-base">{progress.label}</p>
              {progress.total > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {progress.current} de {progress.total} folhas processadas
                </p>
              )}
              {progress.total === 0 && (
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

      {/* Confirm dialog */}
      {confirmAction && !actionLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-base">
                  {confirmAction.type === 'apply' && 'Aplicar Reajuste'}
                  {confirmAction.type === 'revert' && 'Reverter Reajuste'}
                  {confirmAction.type === 'forceRevert' && '⚠️ Reverter por Matemática Inversa'}
                  {confirmAction.type === 'unionContrib' && 'Ajustar Contribuição Assistencial'}
                  {confirmAction.type === 'revertUnionContrib' && 'Reverter Contribuição Assistencial'}
                  {confirmAction.type === 'delete' && 'Excluir Reajuste'}
                </h3>
                <div className="text-sm text-muted-foreground mt-2">
                  {confirmAction.type === 'apply' && (
                    <>
                      <p>As folhas do escopo serão atualizadas e o salário dos colaboradores ajustado.</p>
                      <div className="mt-3 flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <input
                          type="checkbox"
                          id="applyToSecondOnly"
                          className="mt-0.5 cursor-pointer"
                          checked={applyToSecondOnly}
                          onChange={e => setApplyToSecondOnly(e.target.checked)}
                        />
                        <label htmlFor="applyToSecondOnly" className="cursor-pointer text-sm text-orange-800">
                          <strong>1ª quinzena já foi paga</strong> — lançar a diferença apenas na 2ª quinzena.
                        </label>
                      </div>
                    </>
                  )}
                  {confirmAction.type === 'revert' && (
                    <p>Todas as folhas serão restauradas aos valores originais via snapshot salvo.</p>
                  )}
                  {confirmAction.type === 'forceRevert' && (
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-800">
                      <p className="font-medium mb-1">Use quando o reajuste foi interrompido (ex: rate limit).</p>
                      <p>Os valores serão calculados pela <strong>matemática inversa</strong> dos percentuais configurados.
                      Verifique os valores após a reversão.</p>
                    </div>
                  )}
                  {confirmAction.type === 'unionContrib' && (
                    <div className="space-y-2">
                      <p>Para todas as folhas do reajuste selecionado:</p>
                      <ul className="text-sm space-y-1 list-disc pl-4">
                        <li>Contribuição Assistencial: <strong>R$35,00 → R$36,50</strong></li>
                        <li>Desconto na 2ª quinzena: <strong>-R$1,50</strong></li>
                        <li>1ª quinzena: sem alteração</li>
                      </ul>
                      <p className="text-xs text-green-700 mt-1">✅ Reversível a qualquer momento pelo botão "Reverter Contrib."</p>
                    </div>
                  )}
                  {confirmAction.type === 'revertUnionContrib' && (
                    <p>Os valores de Contribuição Assistencial e 2ª quinzena serão restaurados aos valores anteriores ao ajuste.</p>
                  )}
                  {confirmAction.type === 'delete' && <p>O reajuste será excluído permanentemente.</p>}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancelar</Button>
              <Button
                variant={['delete', 'revert', 'forceRevert', 'revertUnionContrib'].includes(confirmAction.type) ? 'destructive' : 'default'}
                onClick={() => {
                  if (confirmAction.type === 'apply') handleApply(confirmAction.rule);
                  else if (confirmAction.type === 'revert') handleRevert(confirmAction.rule, false);
                  else if (confirmAction.type === 'forceRevert') handleRevert(confirmAction.rule, true);
                  else if (confirmAction.type === 'unionContrib') handleUnionContrib(confirmAction.rule, false);
                  else if (confirmAction.type === 'revertUnionContrib') handleUnionContrib(confirmAction.rule, true);
                  else if (confirmAction.type === 'delete') handleDelete(confirmAction.rule);
                }}
              >
                {confirmAction.type === 'apply' ? 'Confirmar Aplicação' :
                 confirmAction.type === 'revert' ? 'Confirmar Reversão' :
                 confirmAction.type === 'forceRevert' ? 'Reverter (Matemática Inversa)' :
                 confirmAction.type === 'unionContrib' ? 'Confirmar Ajuste' :
                 confirmAction.type === 'revertUnionContrib' ? 'Reverter Ajuste' : 'Excluir'}
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