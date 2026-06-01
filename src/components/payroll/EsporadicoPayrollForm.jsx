import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';
import PeriodDiscountsTable from './PeriodDiscountsTable';
import InstallmentDialog from './InstallmentDialog';
import AbsenceDiscountsTable, { totalAbsenceDiscount } from './AbsenceDiscountsTable';
import { base44 } from '@/api/base44Client';

function NumInput({ label, value, onChange, readOnly, hint }) {
  const [raw, setRaw] = useState(null);
  const display = raw !== null ? raw : (value === 0 ? '' : String(value ?? ''));
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Input
        type="number" min="0" step="0.01"
        value={display}
        onChange={e => setRaw(e.target.value)}
        onBlur={e => { onChange(parseFloat(e.target.value) || 0); setRaw(null); }}
        onFocus={e => { setRaw(String(value ?? 0)); setTimeout(() => e.target.select(), 0); }}
        readOnly={readOnly}
        className="mt-1 font-mono"
      />
    </div>
  );
}

function fmtDate(d) {
  if (!d) return null;
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

const QUINZENA_BLOCKED_STATUSES = ['AGENDADO', 'PAGO', 'RESCISÃO', 'DESLIGADO', 'FÉRIAS', 'AFASTADO', 'SALDO NEGATIVO'];

export default function EsporadicoPayrollForm({ employee, entry, referenceMonth, readOnly, onSave, onClose, paymentStatus = null }) {
  // Esporádico tem apenas 1 período (first) — bloqueado se a quinzena 1 estiver paga
  // Bloqueia somente quando AMBAS as quinzenas estão pagas (consistente com hasPaymentBaixa do Payroll)
  const q1Locked = !readOnly && QUINZENA_BLOCKED_STATUSES.includes(paymentStatus?.status_q1) && QUINZENA_BLOCKED_STATUSES.includes(paymentStatus?.status_q2);
  const allLocked = readOnly || q1Locked;
  const [form, setForm] = useState({
    km_bonus_qty: entry?.km_bonus_qty ?? 0,
    km_bonus_value: entry?.km_bonus_value ?? 10.00,
    life_insurance: entry?.life_insurance ?? 0,
    other_discounts: entry?.other_discounts ?? 0,
    bonus: entry?.bonus ?? 0,
    notes: entry?.notes ?? '',
    second_period_discount: entry?.second_period_discount ?? 0,
  });

  const set = (key, val) => { if (!allLocked) setForm(f => ({ ...f, [key]: val })); };

  const pontos = form.km_bonus_qty || 0;
  const valorPonto = form.km_bonus_value || 10;
  const kmBonusTotal = Math.round(pontos * valorPonto * 100) / 100;
  const totalVencimentos = Math.round((kmBonusTotal + (form.bonus || 0)) * 100) / 100;

  // Ajustes de ponto
  const [pointAdjustments, setPointAdjustments] = useState([]);
  const [absenceDiscounts, setAbsenceDiscounts] = useState(entry?.absence_discounts ?? {});

  // Descontos/acréscimos mensais (sem separação por quinzena)
  const [monthDiscounts, setMonthDiscounts] = useState(() => {
    // Migra dados antigos (first + second) para lista unificada
    const first = entry?.first_discounts ?? [];
    const second = entry?.second_discounts ?? [];
    const all = [...first, ...second];
    // Remove duplicatas por id
    const seen = new Set();
    return all.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
  });
  const [installmentDialog, setInstallmentDialog] = useState(null);

  useEffect(() => {
    if (!employee.tangerino_id) return;
    const [year, month] = referenceMonth.split('-').map(Number);
    const start = `${referenceMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${referenceMonth}-${String(lastDay).padStart(2, '0')}`;
    base44.entities.PointAdjustment.filter({ employee_tangerino_id: Number(employee.tangerino_id) }).then(all => {
      const monthStart = new Date(year, month - 1, 1);
      const nextMonthEnd = new Date(year, month + 1, 0);
      const prevMonthStart = new Date(year, month - 2, 1);
      const overlapping = all.filter(a => {
        const adjStart = new Date(a.start_date);
        const adjEnd = new Date(a.end_date);
        return adjEnd >= prevMonthStart && adjStart <= nextMonthEnd;
      });
      const expanded = [];
      for (const adj of overlapping) {
        const adjStart = new Date(adj.start_date);
        const adjEnd = new Date(adj.end_date);
        let current = new Date(adjStart);
        while (current <= adjEnd) {
          expanded.push({ ...adj, date: current.toISOString().split('T')[0] });
          current.setDate(current.getDate() + 1);
        }
      }
      const forMonth = expanded.filter(a => a.date >= start && a.date <= end);
      forMonth.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      setPointAdjustments(forMonth);
    });
  }, [employee.tangerino_id, referenceMonth]);

  useEffect(() => {
    base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: referenceMonth }).then(cashOuts => {
      const toDeduct = cashOuts.filter(c => c.deduct_from_payroll).map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));
      setMonthDiscounts(prev => [...prev.filter(x => !x.fromCashOut), ...toDeduct]);
    });
  }, [employee.id, referenceMonth]);

  const monthDiscountTotal = monthDiscounts.reduce((s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0), 0);

  const totalAbsDiscount = totalAbsenceDiscount(absenceDiscounts);

  const totalDescontos = (form.life_insurance || 0) + (form.other_discounts || 0) + totalAbsDiscount + monthDiscountTotal;
  const netTotal = totalVencimentos - totalDescontos;

  const handleInstallmentConfirm = async ({ description, installmentValue, startDate, preview, installments }) => {
    const firstEntry = { date: startDate, description: `${description} (1/${installments})`, amount: installmentValue, id: Date.now() };
    setMonthDiscounts(prev => [...prev, firstEntry]);
    setInstallmentDialog(null);
    for (let i = 1; i < preview.length; i++) {
      const p = preview[i];
      const date = `${p.month}-28`;
      await base44.entities.CashOut.create({
        employee_id: employee.id,
        company_id: employee.company_id,
        date,
        description: `${description} (${i + 1}/${installments})`,
        amount: installmentValue,
        reference_month: p.month,
        period: 'second',
        notes: `Parcela gerada automaticamente`,
        deduct_from_payroll: true,
      });
    }
  };

  const handleSave = () => {
    onSave({
      ...form,
      company_id: entry?.company_id || employee.company_id,
      base_salary: totalVencimentos,
      km_bonus_qty: pontos,
      km_bonus_value: valorPonto,
      km_bonus: kmBonusTotal,
      gross_total: totalVencimentos,
      net_total: netTotal,
      first_period_net: netTotal,
      second_period_net: 0,
      first_period_base: netTotal,
      second_period_base: 0,
      first_period_split: 1,
      absence_discount: totalAbsDiscount,
      absence_discounts: absenceDiscounts,
      first_period_discount: monthDiscountTotal,
      second_period_discount: 0,
      first_discounts: monthDiscounts,
      second_discounts: [],
      reference_month: referenceMonth,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 flex-wrap">
              {readOnly ? 'Visualização — ' : 'Lançamento — '}{employee.name}
              <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">Esporádico</Badge>
              <span className="text-sm font-normal text-muted-foreground">{getMonthName(referenceMonth)}</span>
              {employee.birth_date && (
                <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">
                  Nasc.: {fmtDate(employee.birth_date)}
                </span>
              )}
              {employee.admission_date && (
                <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">
                  Admissão: {fmtDate(employee.admission_date)}
                </span>
              )}
              {employee.termination_date && (
                <span className="text-xs text-destructive border border-destructive/30 rounded px-2 py-0.5">
                  Demissão: {fmtDate(employee.termination_date)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="proventos">
            <TabsList className="grid grid-cols-4 w-full mt-4">
              <TabsTrigger value="proventos">Proventos</TabsTrigger>
              <TabsTrigger value="quinzenal">Lançamentos</TabsTrigger>
              <TabsTrigger value="ajuste_ponto">
                Ajuste de Ponto {pointAdjustments.length > 0 && <span className="ml-1 bg-destructive text-destructive-foreground text-xs rounded-full px-1.5">{pointAdjustments.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
            </TabsList>

            {/* ── ABA: Proventos ── */}
            <TabsContent value="proventos" className="space-y-5 mt-4">
              {readOnly && (
                <div className="bg-muted/50 border border-border rounded-lg px-4 py-2 text-sm text-muted-foreground">
                  Modo visualização — nenhuma alteração pode ser realizada.
                </div>
              )}
              {!readOnly && q1Locked && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 text-sm text-amber-700">
                  🔒 Pagamento bloqueado — ambas as quinzenas foram pagas. Todos os campos estão desabilitados.
                </div>
              )}

              <div className="text-xs px-3 py-1.5 rounded-md bg-orange-50 border border-orange-200 text-orange-700 font-medium w-fit">
                Modelo: Prestador Esporádico — {employee.name}
              </div>

              {/* Proventos */}
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Proventos</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumInput
                    label="Pontos"
                    value={form.km_bonus_qty}
                    onChange={v => set('km_bonus_qty', v)}
                    readOnly={allLocked}
                    hint="Quantidade de pontos produzidos"
                  />
                  <NumInput
                    label="Valor do Ponto (R$)"
                    value={form.km_bonus_value}
                    onChange={v => set('km_bonus_value', v)}
                    readOnly={allLocked}
                    hint="Padrão: R$ 10,00"
                  />
                </div>
                <NumInput
                  label="Bonificação / Prêmio (R$)"
                  value={form.bonus}
                  onChange={v => set('bonus', v)}
                  readOnly={allLocked}
                />
                <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total dos Vencimentos</p>
                    <p className="text-xs text-muted-foreground">{pontos} pontos × {formatCurrency(valorPonto)}{form.bonus > 0 ? ` + ${formatCurrency(form.bonus)} bônus` : ''}</p>
                  </div>
                  <p className="font-mono font-bold text-primary text-xl">{formatCurrency(totalVencimentos)}</p>
                </div>
              </div>

              <Separator />

              {/* Descontos */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descontos</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumInput label="Seguro de Vida (R$)" value={form.life_insurance} onChange={v => set('life_insurance', v)} readOnly={allLocked} />
                <NumInput label="Diversos (R$)" value={form.other_discounts} onChange={v => set('other_discounts', v)} readOnly={allLocked} />
              </div>

              {totalAbsDiscount > 0 && (
                <div className="flex items-center justify-between bg-destructive/10 rounded-lg px-4 py-2">
                  <span className="text-sm text-destructive font-medium">Desconto de Faltas (via Ajuste de Ponto)</span>
                  <span className="font-mono font-semibold text-destructive">- {formatCurrency(totalAbsDiscount)}</span>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-3">
                <div>
                  <p className="font-bold text-base">Total a Receber</p>
                  <p className="text-xs text-muted-foreground">Líquido após todos os descontos</p>
                </div>
                <p className="font-mono font-bold text-primary text-2xl">{formatCurrency(netTotal)}</p>
              </div>
            </TabsContent>

            {/* ── ABA: Lançamentos ── */}
            <TabsContent value="quinzenal" className="space-y-5 mt-4">
              <div className="space-y-3 border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Lançamentos do Mês</p>
                  <span className="text-xs text-muted-foreground">Base: {formatCurrency(totalVencimentos)}</span>
                </div>
                {totalAbsDiscount > 0 && (
                  <div className="flex items-center justify-between bg-destructive/10 rounded-lg px-3 py-2">
                    <span className="text-xs text-destructive font-medium">− Desconto de Faltas</span>
                    <span className="font-mono text-xs font-semibold text-destructive">- {formatCurrency(totalAbsDiscount)}</span>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Descontos / Acréscimos</p>
                  <PeriodDiscountsTable
                    items={monthDiscounts}
                    onChange={allLocked ? () => {} : setMonthDiscounts}
                    readOnly={allLocked}
                    onOpenInstallment={allLocked ? undefined : () => setInstallmentDialog('month')}
                  />
                </div>
                <div className={`${netTotal < 0 ? 'bg-destructive/10' : 'bg-primary/10'} rounded-lg px-4 py-3 flex justify-between items-center`}>
                  <div>
                    <p className="text-xs text-muted-foreground">{netTotal < 0 ? 'Saldo Negativo' : 'Total Líquido a Receber'}</p>
                    <p className="text-xs text-muted-foreground">Lançamentos: {formatCurrency(monthDiscountTotal)}</p>
                  </div>
                  <p className={`font-mono font-bold text-lg ${netTotal < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(netTotal)}</p>
                </div>
              </div>
            </TabsContent>

            {/* ── ABA: Ajuste de Ponto ── */}
            <TabsContent value="ajuste_ponto" className="mt-4">
              {pointAdjustments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <p className="text-sm">Nenhum ajuste de ponto registrado para este colaborador neste mês.</p>
                  {!employee.tangerino_id && (
                    <p className="text-xs text-destructive">Colaborador sem vínculo com Tangerino.</p>
                  )}
                </div>
              ) : (
                <AbsenceDiscountsTable
                  pointAdjustments={pointAdjustments}
                  absenceDiscounts={absenceDiscounts}
                  setAbsenceDiscounts={setAbsenceDiscounts}
                  readOnly={readOnly}
                  isMotocyclist={false}
                  payrollForm={{ base_salary: totalVencimentos }}
                />
              )}
            </TabsContent>

            {/* ── ABA: Resumo ── */}
            <TabsContent value="resumo" className="mt-4">
              <div className="space-y-3">
                {form.notes && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Observação</p>
                    <p className="text-sm text-amber-800">{form.notes}</p>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Pontos ({pontos} × {formatCurrency(valorPonto)})</span>
                  <span className="font-mono">{formatCurrency(kmBonusTotal)}</span>
                </div>
                {form.bonus > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Bonificação / Prêmio</span>
                    <span className="font-mono">{formatCurrency(form.bonus)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-border font-semibold">
                  <span>Total dos Vencimentos</span>
                  <span className="font-mono">{formatCurrency(totalVencimentos)}</span>
                </div>
                {form.life_insurance > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-destructive">Seguro de Vida</span>
                    <span className="font-mono text-destructive">- {formatCurrency(form.life_insurance)}</span>
                  </div>
                )}
                {form.other_discounts > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-destructive">Diversos</span>
                    <span className="font-mono text-destructive">- {formatCurrency(form.other_discounts)}</span>
                  </div>
                )}
                {totalAbsDiscount > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-destructive">Desconto de Faltas</span>
                    <span className="font-mono text-destructive">- {formatCurrency(totalAbsDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-3 bg-primary/10 rounded-lg px-3">
                  <span className="font-bold text-lg">Total Líquido</span>
                  <span className="font-mono font-bold text-primary text-xl">{formatCurrency(netTotal)}</span>
                </div>

                {monthDiscounts.length > 0 && (
                  <>
                    <Separator />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Lançamentos do Mês</p>
                    {monthDiscounts.map((d, i) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-border">
                        <span className={d.type === 'credit' ? 'text-green-600' : 'text-destructive'}>{d.description}</span>
                        <span className={`font-mono ${d.type === 'credit' ? 'text-green-600' : 'text-destructive'}`}>{d.type === 'credit' ? '+' : '-'} {formatCurrency(d.amount)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {installmentDialog && (
          <InstallmentDialog
            open={!!installmentDialog}
            onClose={() => setInstallmentDialog(null)}
            onConfirm={handleInstallmentConfirm}
            referenceMonth={referenceMonth}
            period="second"
          />
        )}

        <div className="px-6 pt-4 border-t border-border bg-background shrink-0">
          {!readOnly && (
            <div className="mb-3">
              <Label className="text-xs">Observação (aparece no PDF)</Label>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={2}
                placeholder="Descrição do serviço prestado, período, etc."
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>
          )}
          {entry?.id && <p className="text-xs text-muted-foreground font-mono pb-2">ID da Folha: {entry.id}</p>}
          <div className="flex gap-3 pb-4">
            {(readOnly || q1Locked) ? (
              <Button variant="outline" className="flex-1" onClick={onClose}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
                <Button className="flex-1" onClick={handleSave}>Salvar Lançamento</Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}