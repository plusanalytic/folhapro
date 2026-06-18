import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/payrollCalculations';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const BLOCKED_STATUSES = ['AGENDADO', 'PAGO', 'RESCISÃO', 'DESLIGADO', 'FÉRIAS', 'AFASTADO', 'SALDO NEGATIVO', 'COBRIDOR'];

/**
 * Dialog de exclusão de parcelas vinculadas a uma folha.
 * 
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   onDeleted: (deletedIds: string[]) => void  — callback após exclusão bem-sucedida
 *   installments: array de CashOut com source='payroll_installment' do mesmo grupo (mesma descrição-base)
 *   selectedInstallment: CashOut — a parcela que disparou o dialog
 */
export default function DeleteInstallmentsDialog({ open, onClose, onDeleted, installments = [], selectedInstallment }) {
  // Pré-seleciona apenas a parcela clicada
  const [selected, setSelected] = useState(() => selectedInstallment ? [selectedInstallment.id] : []);
  const [loading, setLoading] = useState(false);

  // Meses com status bloqueado — buscados ao abrir
  const [blockedMonths, setBlockedMonths] = useState({});
  const [checkedBlocked, setCheckedBlocked] = useState(false);

  const checkBlockedStatuses = async () => {
    if (checkedBlocked) return;
    const result = {};
    for (const inst of installments) {
      if (!inst.employee_id || !inst.reference_month) continue;
      const payEntries = await base44.entities.PayrollEntry.filter({ employee_id: inst.employee_id, reference_month: inst.reference_month });
      if (!payEntries.length) continue;
      const psArr = await base44.entities.PaymentStatus.filter({ payroll_entry_id: payEntries[0].id });
      if (!psArr.length) continue;
      const ps = psArr[0];
      const statusToCheck = inst.period === 'first' ? ps.status_q1 : ps.status_q2;
      if (BLOCKED_STATUSES.includes(statusToCheck)) {
        result[inst.id] = statusToCheck;
      }
    }
    setBlockedMonths(result);
    setCheckedBlocked(true);
  };

  // Verifica status ao abrir
  if (open && !checkedBlocked) {
    checkBlockedStatuses();
  }

  const toggle = (id) => {
    if (blockedMonths[id]) return; // bloqueada, não pode selecionar
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    const selectable = installments.filter(i => !blockedMonths[i.id]).map(i => i.id);
    setSelected(selectable);
  };

  const selectedInstallments = installments.filter(i => selected.includes(i.id));
  const blockedCount = Object.keys(blockedMonths).length;

  // Extrai descrição base (sem o "(N/M)" do final)
  const baseDescription = selectedInstallment?.description?.replace(/\s*\(\d+\/\d+\)$/, '') || '';

  const handleDelete = async () => {
    if (selected.length === 0) return;
    setLoading(true);

    const deletedIds = [];
    const affectedPayrolls = new Map(); // reference_month => { employee_id, payrollEntryId }

    for (const inst of selectedInstallments) {
      // Se é a 1ª parcela (deduct_from_payroll=false), só remove do CashOut
      // Se é parcela futura (deduct_from_payroll=true), remove do CashOut e atualiza folha
      if (inst.deduct_from_payroll && inst.employee_id && inst.reference_month) {
        const key = `${inst.employee_id}__${inst.reference_month}`;
        if (!affectedPayrolls.has(key)) {
          const payEntries = await base44.entities.PayrollEntry.filter({ employee_id: inst.employee_id, reference_month: inst.reference_month });
          if (payEntries.length) {
            affectedPayrolls.set(key, { employee_id: inst.employee_id, reference_month: inst.reference_month, entryId: payEntries[0].id });
          }
        }
      }
      await base44.entities.CashOut.delete(inst.id);
      deletedIds.push(inst.id);
    }

    // Recalcula folhas afetadas
    for (const [, info] of affectedPayrolls) {
      await recalcPayrollEntry(info.employee_id, info.reference_month, info.entryId);
    }

    // 1ª parcela: precisa também remover o desconto direto da folha do mês de referência
    const firstInstallment = selectedInstallments.find(i => !i.deduct_from_payroll);
    if (firstInstallment && firstInstallment.employee_id && firstInstallment.reference_month) {
      await removeDirectDiscountFromPayroll(firstInstallment);
    }

    toast.success(`${deletedIds.length} parcela(s) excluída(s) com sucesso`);
    setLoading(false);
    onDeleted(deletedIds);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setSelected(selectedInstallment ? [selectedInstallment.id] : []); setCheckedBlocked(false); setBlockedMonths({}); } }}>
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
              <p className="font-semibold">Atenção: exclusão reflete na folha de pagamento</p>
              <p className="text-xs mt-0.5">As parcelas selecionadas serão removidas da <strong>Saída de Caixa</strong> e seus descontos correspondentes serão <strong>revertidos na folha de pagamento</strong> de cada mês, desde que o pagamento não esteja bloqueado.</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Parcelamento: <span className="text-primary">{baseDescription}</span></p>
            <p className="text-xs text-muted-foreground mb-3">Selecione as parcelas que deseja excluir:</p>

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{selected.length} de {installments.length} selecionada(s)</span>
              <button className="text-xs text-primary underline" onClick={selectAll}>Selecionar todas disponíveis</button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border max-h-64 overflow-y-auto">
              {installments.map((inst, idx) => {
                const isBlocked = !!blockedMonths[inst.id];
                const isSelected = selected.includes(inst.id);
                const isFirst = !inst.deduct_from_payroll;
                const match = inst.description?.match(/\((\d+)\/(\d+)\)$/);
                const parcelLabel = match ? `${match[1]}ª/${match[2]}` : `${idx + 1}ª`;
                const [y, mo] = inst.reference_month?.split('-') || [];
                const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                const monthLabel = y && mo ? `${MONTHS[parseInt(mo)-1]}/${y.slice(2)}` : inst.reference_month;

                return (
                  <div
                    key={inst.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                      ${isBlocked ? 'bg-muted/50 cursor-not-allowed opacity-60' : 'hover:bg-muted/30'}
                      ${isSelected && !isBlocked ? 'bg-destructive/5' : ''}`}
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
                        <span className="text-sm font-medium">{parcelLabel}</span>
                        <Badge variant="outline" className="text-xs">{monthLabel}</Badge>
                        {isFirst && (
                          <Badge className="text-xs bg-green-100 text-green-700 border-green-300">Aplicada na folha</Badge>
                        )}
                        {isBlocked && (
                          <Badge className="text-xs bg-red-100 text-red-700 border-red-300">Bloqueada: {blockedMonths[inst.id]}</Badge>
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

            {blockedCount > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                ⚠ {blockedCount} parcela(s) não podem ser excluídas pois a quinzena já está com status bloqueante (AGENDADO, PAGO, etc).
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={selected.length === 0 || loading}
              onClick={handleDelete}
            >
              {loading ? 'Excluindo...' : `Excluir ${selected.length > 0 ? `${selected.length} parcela(s)` : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

async function recalcPayrollEntry(employeeId, referenceMonth, entryId) {
  const entry = await base44.entities.PayrollEntry.filter({ employee_id: employeeId, reference_month: referenceMonth });
  if (!entry.length) return;
  const e = entry[0];
  const allCashOuts = await base44.entities.CashOut.filter({ employee_id: employeeId, reference_month: referenceMonth });
  const deductCashOuts = allCashOuts.filter(c => c.deduct_from_payroll);
  const firstNonCashout = (e.first_discounts || []).filter(r => r.source !== 'cashout');
  const secondNonCashout = (e.second_discounts || []).filter(r => r.source !== 'cashout');
  const firstCashouts = deductCashOuts.filter(c => c.period === 'first').map(c => ({ type: 'debit', label: c.description, amount: c.amount, source: 'cashout', source_id: c.id }));
  const secondCashouts = deductCashOuts.filter(c => c.period === 'second').map(c => ({ type: 'debit', label: c.description, amount: c.amount, source: 'cashout', source_id: c.id }));
  const newFirst = [...firstNonCashout, ...firstCashouts];
  const newSecond = [...secondNonCashout, ...secondCashouts];
  const calcDiscount = (arr) => arr.filter(r => r.type !== 'credit').reduce((s,r) => s + (r.amount||0), 0) - arr.filter(r => r.type === 'credit').reduce((s,r) => s + (r.amount||0), 0);
  const newFirstDiscount = calcDiscount(newFirst);
  const newSecondDiscount = calcDiscount(newSecond);
  const oldFirstDiscount = e.first_period_discount || 0;
  const oldSecondDiscount = e.second_period_discount || 0;
  const newFirstNet = Math.round(((e.first_period_net || 0) - (newFirstDiscount - oldFirstDiscount)) * 100) / 100;
  const newSecondNet = Math.round(((e.second_period_net || 0) - (newSecondDiscount - oldSecondDiscount)) * 100) / 100;
  await base44.entities.PayrollEntry.update(e.id, {
    first_discounts: newFirst,
    second_discounts: newSecond,
    first_period_discount: newFirstDiscount,
    second_period_discount: newSecondDiscount,
    first_period_net: newFirstNet,
    second_period_net: newSecondNet,
  });
}

// Remove o desconto direto da folha do mês da 1ª parcela (que foi inserido sem passar pelo CashOut deduct_from_payroll)
async function removeDirectDiscountFromPayroll(firstInstallment) {
  const { employee_id, reference_month, description, amount } = firstInstallment;
  const payEntries = await base44.entities.PayrollEntry.filter({ employee_id, reference_month });
  if (!payEntries.length) return;
  const e = payEntries[0];
  // Remove da first_discounts e second_discounts qualquer item com a descrição exata E valor exato (sem source cashout)
  const removeMatch = (arr) => arr.filter(d => !(d.description === description && d.amount === amount && d.source !== 'cashout'));
  const newFirst = removeMatch(e.first_discounts || []);
  const newSecond = removeMatch(e.second_discounts || []);
  const calcDiscount = (arr) => arr.filter(r => r.type !== 'credit').reduce((s,r) => s + (r.amount||0), 0) - arr.filter(r => r.type === 'credit').reduce((s,r) => s + (r.amount||0), 0);
  const newFirstDiscount = calcDiscount(newFirst);
  const newSecondDiscount = calcDiscount(newSecond);
  const oldFirstDiscount = e.first_period_discount || 0;
  const oldSecondDiscount = e.second_period_discount || 0;
  const newFirstNet = Math.round(((e.first_period_net || 0) - (newFirstDiscount - oldFirstDiscount)) * 100) / 100;
  const newSecondNet = Math.round(((e.second_period_net || 0) - (newSecondDiscount - oldSecondDiscount)) * 100) / 100;
  await base44.entities.PayrollEntry.update(e.id, {
    first_discounts: newFirst,
    second_discounts: newSecond,
    first_period_discount: newFirstDiscount,
    second_period_discount: newSecondDiscount,
    first_period_net: newFirstNet,
    second_period_net: newSecondNet,
  });
}