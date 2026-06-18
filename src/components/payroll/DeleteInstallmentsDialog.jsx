import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/payrollCalculations';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const BLOCKED_STATUSES = ['AGENDADO', 'PAGO', 'RESCISÃO', 'DESLIGADO', 'FÉRIAS', 'AFASTADO', 'SALDO NEGATIVO', 'COBRIDOR'];
const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function monthLabel(ref) {
  if (!ref) return '—';
  const [y, mo] = ref.split('-');
  return `${MONTHS_PT[parseInt(mo)-1]}/${y.slice(2)}`;
}

/**
 * Dialog de exclusão de parcelas vinculadas a uma folha.
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   onDeleted: (deletedIds: string[]) => void
 *   installments: CashOut[] com source='payroll_installment' do mesmo grupo
 *   selectedInstallmentId: string | null — ID CashOut da parcela clicada (pré-seleciona)
 */
export default function DeleteInstallmentsDialog({ open, onClose, onDeleted, installments = [], selectedInstallmentId }) {
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [blockedMap, setBlockedMap] = useState({});
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  // Pré-seleciona a parcela clicada quando o dialog abre
  useEffect(() => {
    if (open) {
      setSelected(selectedInstallmentId ? [selectedInstallmentId] : []);
    }
  }, [open, selectedInstallmentId]);

  // Verifica status de bloqueio quando o dialog abre
  useEffect(() => {
    if (!open || installments.length === 0) return;
    setLoadingBlocked(true);
    setBlockedMap({});

    (async () => {
      const result = {};
      for (const inst of installments) {
        if (!inst.employee_id || !inst.reference_month) continue;
        const payEntries = await base44.entities.PayrollEntry.filter({
          employee_id: inst.employee_id,
          reference_month: inst.reference_month,
        });
        if (!payEntries.length) continue;
        const psArr = await base44.entities.PaymentStatus.filter({ payroll_entry_id: payEntries[0].id });
        if (!psArr.length) continue;
        const ps = psArr[0];
        const status = inst.period === 'first' ? ps.status_q1 : ps.status_q2;
        if (BLOCKED_STATUSES.includes(status)) {
          result[inst.id] = status;
        }
      }
      setBlockedMap(result);
      setLoadingBlocked(false);
    })();
  }, [open, installments]); // eslint-disable-line

  const toggle = (id) => {
    if (blockedMap[id]) return;
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    setSelected(installments.filter(i => !blockedMap[i.id]).map(i => i.id));
  };

  const toDelete = installments.filter(i => selected.includes(i.id));
  const baseDescription = (installments[0]?.description || '').replace(/\s*\(\d+\/\d+\)$/, '');

  const handleDelete = async () => {
    if (toDelete.length === 0) return;
    setLoading(true);

    const deletedIds = [];

    for (const inst of toDelete) {
      // Parcelas futuras (deduct_from_payroll=true): remover do CashOut + recalcular folha
      if (inst.deduct_from_payroll && inst.employee_id && inst.reference_month) {
        await removeCashOutFromPayroll(inst);
      }
      // 1ª parcela (deduct_from_payroll=false): remover desconto direto da folha + CashOut
      if (!inst.deduct_from_payroll && inst.employee_id && inst.reference_month) {
        await removeDirectDiscountFromPayroll(inst);
      }
      await base44.entities.CashOut.delete(inst.id);
      deletedIds.push(inst.id);
    }

    toast.success(`${deletedIds.length} parcela(s) excluída(s) com sucesso`);
    setLoading(false);
    onDeleted(deletedIds);
  };

  // Ordena por número de parcela
  const sorted = [...installments].sort((a, b) => {
    const na = parseInt(a.description?.match(/\((\d+)\/\d+\)$/)?.[1] || '0');
    const nb = parseInt(b.description?.match(/\((\d+)\/\d+\)$/)?.[1] || '0');
    return na - nb;
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !loading) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            Excluir Parcelas do Parcelamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Exclusão sincronizada com Saída de Caixa</p>
              <p className="text-xs mt-0.5">As parcelas marcadas serão removidas de <strong>Saída de Caixa</strong> e os descontos correspondentes serão <strong>revertidos na folha de pagamento</strong> de cada mês.</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">
              Parcelamento: <span className="text-primary font-semibold">{baseDescription}</span>
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Selecione quais parcelas deseja excluir ({installments.length} no total):
            </p>

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{selected.length} de {installments.length} selecionada(s)</span>
              <button className="text-xs text-primary underline" onClick={selectAll}>
                Selecionar todas disponíveis
              </button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-72 overflow-y-auto">
              {loadingBlocked && (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Verificando status...
                </div>
              )}
              {!loadingBlocked && sorted.map((inst, idx) => {
                const isBlocked = !!blockedMap[inst.id];
                const isSelected = selected.includes(inst.id);
                const isFirst = !inst.deduct_from_payroll;
                const matchN = inst.description?.match(/\((\d+)\/(\d+)\)$/);
                const parcelLabel = matchN ? `${matchN[1]}ª de ${matchN[2]}` : `Parcela ${idx + 1}`;

                return (
                  <div
                    key={inst.id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors select-none
                      ${isBlocked ? 'bg-muted/40 opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/30'}
                      ${isSelected && !isBlocked ? 'bg-destructive/5 border-l-2 border-l-destructive' : ''}`}
                    onClick={() => toggle(inst.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isBlocked}
                      onCheckedChange={() => toggle(inst.id)}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{parcelLabel}</span>
                        <Badge variant="outline" className="text-xs">{monthLabel(inst.reference_month)}</Badge>
                        {isFirst && (
                          <Badge className="text-xs bg-green-100 text-green-700 border-green-300">
                            Aplicada na folha
                          </Badge>
                        )}
                        {isBlocked && (
                          <Badge className="text-xs bg-red-100 text-red-700 border-red-300">
                            🔒 {blockedMap[inst.id]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{inst.description}</p>
                    </div>
                    <span className="font-mono font-semibold text-destructive text-sm shrink-0">
                      {formatCurrency(inst.amount)}
                    </span>
                  </div>
                );
              })}
            </div>

            {Object.keys(blockedMap).length > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                ⚠ {Object.keys(blockedMap).length} parcela(s) bloqueadas — quinzena já com status {Object.values(blockedMap)[0]}.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2 border-t border-border">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={selected.length === 0 || loading}
              onClick={handleDelete}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Excluindo...</>
                : `Excluir ${selected.length > 0 ? `${selected.length} parcela(s)` : ''}`
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Remove desconto via CashOut deduct_from_payroll de uma folha futura
async function removeCashOutFromPayroll(inst) {
  const payEntries = await base44.entities.PayrollEntry.filter({
    employee_id: inst.employee_id,
    reference_month: inst.reference_month,
  });
  if (!payEntries.length) return;
  const e = payEntries[0];

  // Busca todos os CashOuts que ainda existirão após a exclusão deste
  const allCOs = await base44.entities.CashOut.filter({
    employee_id: inst.employee_id,
    reference_month: inst.reference_month,
  });
  const remaining = allCOs.filter(c => c.deduct_from_payroll && c.id !== inst.id);

  const firstNonCO = (e.first_discounts || []).filter(r => r.source !== 'cashout');
  const secondNonCO = (e.second_discounts || []).filter(r => r.source !== 'cashout');
  const firstCOs = remaining.filter(c => c.period === 'first').map(c => ({
    type: 'debit', description: c.description, amount: c.amount, source: 'cashout', source_id: c.id,
  }));
  const secondCOs = remaining.filter(c => c.period === 'second').map(c => ({
    type: 'debit', description: c.description, amount: c.amount, source: 'cashout', source_id: c.id,
  }));
  const newFirst = [...firstNonCO, ...firstCOs];
  const newSecond = [...secondNonCO, ...secondCOs];

  const calcDiscount = (arr) =>
    arr.filter(r => r.type !== 'credit').reduce((s, r) => s + (r.amount || 0), 0) -
    arr.filter(r => r.type === 'credit').reduce((s, r) => s + (r.amount || 0), 0);

  const newFD = calcDiscount(newFirst);
  const newSD = calcDiscount(newSecond);
  const newFNet = Math.round(((e.first_period_net || 0) - (newFD - (e.first_period_discount || 0))) * 100) / 100;
  const newSNet = Math.round(((e.second_period_net || 0) - (newSD - (e.second_period_discount || 0))) * 100) / 100;

  await base44.entities.PayrollEntry.update(e.id, {
    first_discounts: newFirst,
    second_discounts: newSecond,
    first_period_discount: newFD,
    second_period_discount: newSD,
    first_period_net: newFNet,
    second_period_net: newSNet,
  });
}

// Remove desconto direto (1ª parcela aplicada diretamente na folha, sem deduct_from_payroll)
async function removeDirectDiscountFromPayroll(inst) {
  const payEntries = await base44.entities.PayrollEntry.filter({
    employee_id: inst.employee_id,
    reference_month: inst.reference_month,
  });
  if (!payEntries.length) return;
  const e = payEntries[0];

  // Remove qualquer item de first_discounts ou second_discounts com a mesma descrição E valor
  // que não seja source='cashout' (pois a 1ª parcela é inserida sem source)
  const removeMatch = (arr) => arr.filter(d =>
    !(d.description === inst.description && Math.abs(d.amount - inst.amount) < 0.01 && d.source !== 'cashout')
  );

  const newFirst = removeMatch(e.first_discounts || []);
  const newSecond = removeMatch(e.second_discounts || []);

  const calcDiscount = (arr) =>
    arr.filter(r => r.type !== 'credit').reduce((s, r) => s + (r.amount || 0), 0) -
    arr.filter(r => r.type === 'credit').reduce((s, r) => s + (r.amount || 0), 0);

  const newFD = calcDiscount(newFirst);
  const newSD = calcDiscount(newSecond);
  const newFNet = Math.round(((e.first_period_net || 0) - (newFD - (e.first_period_discount || 0))) * 100) / 100;
  const newSNet = Math.round(((e.second_period_net || 0) - (newSD - (e.second_period_discount || 0))) * 100) / 100;

  await base44.entities.PayrollEntry.update(e.id, {
    first_discounts: newFirst,
    second_discounts: newSecond,
    first_period_discount: newFD,
    second_period_discount: newSD,
    first_period_net: newFNet,
    second_period_net: newSNet,
  });
}