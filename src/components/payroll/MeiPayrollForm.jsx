import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { calculatePayroll, formatCurrency, getMonthName, getWorkingDaysInMonth } from '@/lib/payrollCalculations';
import PeriodDiscountsTable from './PeriodDiscountsTable';
import InstallmentDialog from './InstallmentDialog';
import { base44 } from '@/api/base44Client';

// Cálculo simplificado MEI:
// - Gross = Remuneração (base_salary) + KM + Ajuda de Custo + Moto + Bônus + Outros
// - Sem INSS, sem IRRF, sem Contribuição Assistencial, sem descontos CLT
// - Net = Gross - Retenção PJ (se houver)
// - Quinzenal = net rateado pelo split (padrão 50/50), 2ª + KM + AjudaCusto
function calculateMeiPayroll(entry) {
  const salary = entry.base_salary || 0;
  const kmBonus = Math.round((entry.km_bonus_qty || 0) * (entry.km_bonus_value || 0) * 100) / 100;
  const costAllowance = entry.cost_allowance || 0;
  const motoRental = entry.motorcycle_rental || 0;
  const bonus = entry.bonus || 0;
  const otherBenefits = entry.other_benefits || 0;
  const foodVoucher = entry.food_voucher || 0;
  const pjRetention = entry.pj_retention || 0;

  const grossTotal = salary + kmBonus + costAllowance + motoRental + bonus + otherBenefits;
  const netTotal = grossTotal - pjRetention;

  const splitFirst = entry.first_period_split != null ? entry.first_period_split : 0.5;
  const splitSecond = 1 - splitFirst;
  const firstBase = Math.round(netTotal * splitFirst * 100) / 100;
  const secondBase = Math.round(netTotal * splitSecond * 100) / 100;

  const firstPeriodNet = firstBase + foodVoucher
    - (entry.first_period_advance || 0)
    - (entry.first_period_discount || 0);
  const secondPeriodNet = secondBase + kmBonus + costAllowance
    - (entry.second_period_discount || 0);

  return {
    km_bonus: kmBonus,
    gross_total: Math.round(grossTotal * 100) / 100,
    net_total: Math.round(netTotal * 100) / 100,
    first_period_base: firstBase,
    second_period_base: secondBase,
    first_period_net: Math.round(firstPeriodNet * 100) / 100,
    second_period_net: Math.round(secondPeriodNet * 100) / 100,
  };
}

export default function MeiPayrollForm({ employee, entry, referenceMonth, onSave, onClose, readOnly = false, jobRole = null }) {
  const workingDays = getWorkingDaysInMonth(referenceMonth);

  const [form, setForm] = useState({
    company_id: employee.company_id,
    base_salary: entry?.base_salary ?? 0,
    working_days: entry?.working_days ?? workingDays,
    food_voucher: entry?.food_voucher ?? 0,
    km_bonus_qty: entry?.km_bonus_qty ?? 0,
    km_bonus_value: entry?.km_bonus_value ?? 0,
    cost_allowance: entry?.cost_allowance ?? 0,
    motorcycle_rental: entry?.motorcycle_rental ?? 0,
    bonus: entry?.bonus ?? 0,
    other_benefits: entry?.other_benefits ?? 0,
    pj_retention: entry?.pj_retention ?? 0,
    first_period_advance: entry?.first_period_advance ?? 0,
    notes: entry?.notes ?? '',
  });

  const [firstDiscounts, setFirstDiscounts] = useState(entry?.first_discounts ?? []);
  const [secondDiscounts, setSecondDiscounts] = useState(entry?.second_discounts ?? []);
  const [firstPeriodSplit, setFirstPeriodSplit] = useState(entry?.first_period_split ?? 0.5);
  const [installmentDialog, setInstallmentDialog] = useState(null);

  // Carregar CashOuts do colaborador no mês
  useEffect(() => {
    base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: referenceMonth }).then(cashOuts => {
      const fromCashFirst = cashOuts.filter(c => c.period === 'first').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));
      const fromCashSecond = cashOuts.filter(c => c.period === 'second').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));
      setFirstDiscounts(prev => [...prev.filter(x => !x.fromCashOut), ...fromCashFirst]);
      setSecondDiscounts(prev => [...prev.filter(x => !x.fromCashOut), ...fromCashSecond]);
    });
  }, [employee.id, referenceMonth]);

  const set = (k, v) => { if (!readOnly) setForm(f => ({ ...f, [k]: v })); };
  const setNum = (k, v) => set(k, parseFloat(v) || 0);

  const numericField = useCallback((key) => {
    const externalVal = form[key] ?? 0;
    return {
      type: 'number',
      step: 'any',
      disabled: readOnly,
      className: 'mt-1 font-mono',
      value: externalVal === 0 ? '' : String(externalVal),
      onChange: (e) => set(key, e.target.value),
      onBlur: (e) => setNum(key, e.target.value),
      onFocus: (e) => setTimeout(() => e.target.select(), 0),
    };
  }, [form, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstDiscountTotal = firstDiscounts.reduce((s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0), 0);
  const secondDiscountTotal = secondDiscounts.reduce((s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0), 0);

  const calcForm = {
    ...form,
    first_period_discount: firstDiscountTotal,
    second_period_discount: secondDiscountTotal,
    first_period_split: firstPeriodSplit,
  };
  const calc = calculateMeiPayroll(calcForm);

  const handleInstallmentConfirm = async ({ description, installmentValue, startDate, preview, installments }) => {
    const isFirst = installmentDialog === 'first';
    const firstEntry = { date: startDate, description: `${description} (1/${installments})`, amount: installmentValue, id: Date.now() };
    if (isFirst) setFirstDiscounts(prev => [...prev, firstEntry]);
    else setSecondDiscounts(prev => [...prev, firstEntry]);

    for (let i = 1; i < preview.length; i++) {
      const p = preview[i];
      const day = isFirst ? 15 : 28;
      const date = `${p.month}-${String(day).padStart(2, '0')}`;
      await base44.entities.CashOut.create({
        employee_id: employee.id,
        company_id: employee.company_id,
        date,
        description: `${description} (${i + 1}/${installments})`,
        amount: installmentValue,
        reference_month: p.month,
        period: isFirst ? 'first' : 'second',
        notes: `Parcela gerada automaticamente`,
      });
    }
    setInstallmentDialog(null);
  };

  const handleSave = () => {
    onSave({
      ...form,
      km_bonus_qty: form.km_bonus_qty,
      km_bonus_value: form.km_bonus_value,
      km_bonus: calc.km_bonus,
      cost_allowance: form.cost_allowance,
      pj_retention: form.pj_retention,
      food_voucher: form.food_voucher,
      gross_total: calc.gross_total,
      net_total: calc.net_total,
      first_period_discount: firstDiscountTotal,
      second_period_discount: secondDiscountTotal,
      first_discounts: firstDiscounts,
      second_discounts: secondDiscounts,
      first_period_net: calc.first_period_net,
      second_period_net: calc.second_period_net,
      first_period_split: firstPeriodSplit,
      reference_month: referenceMonth,
      // MEI não tem faltas/INSS/IRRF
      absence_discount: 0,
      absence_discounts: {},
      absence_discount_first: 0,
      absence_discount_second: 0,
      inss: 0,
      irrf: 0,
      fgts: 0,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {readOnly ? 'Visualização — ' : 'Lançamento — '}{employee.name}
              <Badge variant="secondary">MEI</Badge>
              <Badge variant="outline" className="text-xs">Motociclista MEI</Badge>
              <span className="text-sm font-normal text-muted-foreground">{getMonthName(referenceMonth)}</span>
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="proventos">
            <TabsList className="grid grid-cols-3 w-full mt-4">
              <TabsTrigger value="proventos">Proventos</TabsTrigger>
              <TabsTrigger value="quinzenal">Quinzenal</TabsTrigger>
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
            </TabsList>

            {/* ── ABA: Proventos ── */}
            <TabsContent value="proventos" className="space-y-4 mt-4">
              {readOnly && (
                <div className="bg-muted/50 border border-border rounded-lg px-4 py-2 text-sm text-muted-foreground">
                  Modo visualização — nenhuma alteração pode ser realizada.
                </div>
              )}

              <div className="text-xs px-3 py-1.5 rounded-md bg-orange-50 border border-orange-200 text-orange-700 font-medium w-fit">
                Modelo: Motociclista MEI — Prestador de Serviço: {employee.name}
              </div>

              {/* Remuneração e Dias Úteis */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Remuneração do MEI (R$)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Total dos Vencimentos</p>
                  <Input {...numericField('base_salary')} />
                </div>
                <div>
                  <Label>Dias Úteis no Mês</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Editável conforme calendário</p>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    disabled={readOnly}
                    className="mt-1 font-mono"
                    value={form.working_days === 0 ? '' : String(form.working_days)}
                    onChange={e => set('working_days', e.target.value)}
                    onBlur={e => setNum('working_days', e.target.value)}
                    onFocus={e => setTimeout(() => e.target.select(), 0)}
                  />
                </div>
              </div>

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Benefícios</p>

              {/* KM Excedente */}
              <div>
                <Label>KM Excedente</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <div className="flex-1">
                    <Input {...numericField('km_bonus_qty')} className="font-mono" placeholder="Qtd. KM" />
                    <p className="text-xs text-muted-foreground mt-0.5">Quantidade de KM</p>
                  </div>
                  <span className="text-muted-foreground font-bold text-lg">×</span>
                  <div className="flex-1">
                    <Input {...numericField('km_bonus_value')} className="font-mono" placeholder="R$/KM" />
                    <p className="text-xs text-muted-foreground mt-0.5">Valor por KM (R$)</p>
                  </div>
                  <span className="text-muted-foreground">=</span>
                  <div className="w-32 bg-muted/40 rounded-lg p-2 text-right">
                    <p className="font-mono font-semibold text-primary">{formatCurrency(calc.km_bonus)}</p>
                    <p className="text-xs text-muted-foreground">Total KM</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Ajuda de Custo</Label>
                  <Input {...numericField('cost_allowance')} />
                </div>
                <div>
                  <Label>Aluguel da Motocicleta</Label>
                  <Input {...numericField('motorcycle_rental')} />
                </div>
                <div>
                  <Label>Vale Alimentação</Label>
                  <Input {...numericField('food_voucher')} />
                </div>
                <div>
                  <Label>Bonificação / Prêmio</Label>
                  <Input {...numericField('bonus')} />
                </div>
                <div>
                  <Label>Outros Benefícios</Label>
                  <Input {...numericField('other_benefits')} />
                </div>
              </div>

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Retenções</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Retenção PJ (R$)</Label>
                  <Input {...numericField('pj_retention')} />
                </div>
              </div>

              <Separator />
              <div className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-3">
                <div>
                  <p className="font-bold text-base">Total Bruto</p>
                  <p className="text-xs text-muted-foreground">Soma de todos os vencimentos</p>
                </div>
                <p className="font-mono font-bold text-foreground text-xl">{formatCurrency(calc.gross_total)}</p>
              </div>

              {form.pj_retention > 0 && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Retenção PJ</span>
                    <span className="font-mono text-destructive">- {formatCurrency(form.pj_retention)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-3">
                <div>
                  <p className="font-bold text-base">Total a Receber</p>
                  <p className="text-xs text-muted-foreground">Líquido após retenções</p>
                </div>
                <p className="font-mono font-bold text-primary text-2xl">{formatCurrency(calc.net_total)}</p>
              </div>
            </TabsContent>

            {/* ── ABA: Quinzenal ── */}
            <TabsContent value="quinzenal" className="space-y-5 mt-4">
              {/* Rateio editável */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">Base 1ª Quinzena</p>
                  {readOnly ? (
                    <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.first_period_base)}</p>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      className="font-mono font-bold text-lg h-9"
                      value={calc.first_period_base}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0;
                        const split = calc.net_total > 0 ? Math.min(1, Math.max(0, v / calc.net_total)) : 0.5;
                        setFirstPeriodSplit(split);
                      }}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{Math.round(firstPeriodSplit * 100)}% do líquido</p>
                </div>
                <div className="bg-muted/30 rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">Base 2ª Quinzena</p>
                  {readOnly ? (
                    <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.second_period_base)}</p>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      className="font-mono font-bold text-lg h-9"
                      value={calc.second_period_base}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0;
                        const split = calc.net_total > 0 ? Math.min(1, Math.max(0, 1 - v / calc.net_total)) : 0.5;
                        setFirstPeriodSplit(split);
                      }}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{Math.round((1 - firstPeriodSplit) * 100)}% do líquido</p>
                </div>
              </div>
              {firstPeriodSplit !== 0.5 && (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <span className="text-xs text-amber-700">Rateio personalizado: {Math.round(firstPeriodSplit * 100)}% / {Math.round((1 - firstPeriodSplit) * 100)}%</span>
                  {!readOnly && <button className="text-xs text-amber-700 underline" onClick={() => setFirstPeriodSplit(0.5)}>Resetar para 50/50</button>}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1ª Quinzena */}
                <div className="space-y-3 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">1ª Quinzena (1–15)</p>
                    <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.first_period_base)}</span>
                  </div>
                  {form.food_voucher > 0 && (
                    <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                      <span className="text-xs text-secondary font-medium">+ Vale Alimentação (pago na 1ª quinzena)</span>
                      <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(form.food_voucher)}</span>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Adiantamento</Label>
                    <Input {...numericField('first_period_advance')} className="mt-1 font-mono h-8 text-sm" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Descontos da 1ª Quinzena</p>
                    <PeriodDiscountsTable items={firstDiscounts} onChange={readOnly ? () => {} : setFirstDiscounts} readOnly={readOnly} onOpenInstallment={readOnly ? undefined : () => setInstallmentDialog('first')} />
                  </div>
                  <div className="bg-primary/10 rounded-lg px-4 py-3 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Á Receber 1ª Quinzena</p>
                      <p className="text-xs text-muted-foreground">Descontos: {formatCurrency(firstDiscountTotal + form.first_period_advance)}</p>
                    </div>
                    <p className="font-mono font-bold text-primary text-lg">{formatCurrency(calc.first_period_net)}</p>
                  </div>
                </div>

                {/* 2ª Quinzena */}
                <div className="space-y-3 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">2ª Quinzena (16–30)</p>
                    <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.second_period_base)}</span>
                  </div>
                  {(calc.km_bonus > 0 || form.cost_allowance > 0) && (
                    <div className="space-y-1">
                      {calc.km_bonus > 0 && (
                        <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                          <span className="text-xs text-secondary font-medium">+ KM Excedente ({form.km_bonus_qty} km × {formatCurrency(form.km_bonus_value)})</span>
                          <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(calc.km_bonus)}</span>
                        </div>
                      )}
                      {form.cost_allowance > 0 && (
                        <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                          <span className="text-xs text-secondary font-medium">+ Ajuda de Custo</span>
                          <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(form.cost_allowance)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Descontos da 2ª Quinzena</p>
                    <PeriodDiscountsTable items={secondDiscounts} onChange={readOnly ? () => {} : setSecondDiscounts} readOnly={readOnly} onOpenInstallment={readOnly ? undefined : () => setInstallmentDialog('second')} />
                  </div>
                  <div className="bg-primary/10 rounded-lg px-4 py-3 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Á Receber 2ª Quinzena</p>
                      <p className="text-xs text-muted-foreground">Descontos: {formatCurrency(secondDiscountTotal)}</p>
                    </div>
                    <p className="font-mono font-bold text-primary text-lg">{formatCurrency(calc.second_period_net)}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── ABA: Resumo ── */}
            <TabsContent value="resumo" className="mt-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Remuneração MEI (Base)</span>
                  <span className="font-mono">{formatCurrency(form.base_salary)}</span>
                </div>
                {calc.km_bonus > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">KM Excedente ({form.km_bonus_qty} km × {formatCurrency(form.km_bonus_value)})</span>
                    <span className="font-mono">{formatCurrency(calc.km_bonus)}</span>
                  </div>
                )}
                {form.cost_allowance > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Ajuda de Custo</span><span className="font-mono">{formatCurrency(form.cost_allowance)}</span></div>}
                {form.motorcycle_rental > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Aluguel da Motocicleta</span><span className="font-mono">{formatCurrency(form.motorcycle_rental)}</span></div>}
                {form.food_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Alimentação</span><span className="font-mono">{formatCurrency(form.food_voucher)}</span></div>}
                {form.bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Bonificação / Prêmio</span><span className="font-mono">{formatCurrency(form.bonus)}</span></div>}
                {form.other_benefits > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Outros Benefícios</span><span className="font-mono">{formatCurrency(form.other_benefits)}</span></div>}
                <div className="flex justify-between items-center py-2 border-b border-border font-semibold">
                  <span>Total Bruto</span>
                  <span className="font-mono">{formatCurrency(calc.gross_total)}</span>
                </div>
                {form.pj_retention > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-destructive">Retenção PJ</span>
                    <span className="font-mono text-destructive">- {formatCurrency(form.pj_retention)}</span>
                  </div>
                )}
                {(firstDiscounts.length > 0 || form.first_period_advance > 0) && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Descontos 1ª Quinzena</p>
                    {form.first_period_advance > 0 && (
                      <div className="flex justify-between py-1 border-b border-border">
                        <span className="text-destructive text-sm">Adiantamento</span>
                        <span className="font-mono text-destructive text-sm">- {formatCurrency(form.first_period_advance)}</span>
                      </div>
                    )}
                    {firstDiscounts.map((d, i) => (
                      <div key={i} className="flex justify-between py-1 border-b border-border">
                        <span className={`text-sm ${d.type === 'credit' ? 'text-green-600' : 'text-destructive'}`}>{d.description}</span>
                        <span className={`font-mono text-sm ${d.type === 'credit' ? 'text-green-600' : 'text-destructive'}`}>{d.type === 'credit' ? '+ ' : '- '}{formatCurrency(d.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {secondDiscounts.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Lançamentos 2ª Quinzena</p>
                    {secondDiscounts.map((d, i) => (
                      <div key={i} className="flex justify-between py-1 border-b border-border">
                        <span className={`text-sm ${d.type === 'credit' ? 'text-green-600' : 'text-destructive'}`}>{d.description}</span>
                        <span className={`font-mono text-sm ${d.type === 'credit' ? 'text-green-600' : 'text-destructive'}`}>{d.type === 'credit' ? '+ ' : '- '}{formatCurrency(d.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between items-center py-3 bg-primary/10 rounded-lg px-3">
                  <span className="font-bold text-lg">Total Líquido</span>
                  <span className="font-mono font-bold text-primary text-xl">{formatCurrency(calc.net_total)}</span>
                </div>
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
            period={installmentDialog}
          />
        )}

        <div className="flex gap-3 px-6 py-4 border-t border-border bg-background shrink-0">
          {readOnly ? (
            <Button variant="outline" className="flex-1" onClick={onClose}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave}>Salvar Lançamento</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}