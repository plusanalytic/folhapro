import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, getMonthName, getWorkingDaysInMonth } from '@/lib/payrollCalculations';
import PeriodDiscountsTable from './PeriodDiscountsTable';
import InstallmentDialog from './InstallmentDialog';
import { base44 } from '@/api/base44Client';

// Calcula dias úteis da 1ª quinzena (dias 1–15) e 2ª quinzena (dias 16–fim)
function getWorkingDaysByPeriod(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const nationalHolidays = ['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'];
  let first = 0, second = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const mmdd = `${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (nationalHolidays.includes(mmdd)) continue;
    if (d <= 15) first++; else second++;
  }
  return { first, second };
}

// Cálculo MEI:
// - remuneracao = (valor_base / dias_uteis_mes) * dias_uteis_trabalhados
// - Gross = remuneracao + KM + Ajuda de Custo + Moto + Bônus + Outros
// - Net = Gross - Seguro de Vida
// - Quinzenal = net rateado pelos dias úteis de cada quinzena
function calculateMeiPayroll(entry) {
  const valorBase = entry.base_salary || 0;
  const diasMes = entry.working_days_month || 1;
  const diasTrabalhados = entry.working_days_worked || diasMes;
  const remuneracao = Math.round((valorBase / diasMes) * diasTrabalhados * 100) / 100;

  const kmBonus = Math.round((entry.km_bonus_qty || 0) * (entry.km_bonus_value || 0) * 100) / 100;
  const costAllowance = entry.cost_allowance || 0;
  const motoRental = entry.motorcycle_rental || 0;
  const bonus = entry.bonus || 0;
  const otherBenefits = entry.other_benefits || 0;
  const foodVoucher = entry.food_voucher || 0;
  const lifeInsurance = entry.life_insurance || 0;

  const grossTotal = remuneracao + kmBonus + costAllowance + motoRental + bonus + otherBenefits;
  // Seguro de vida NÃO subtrai do total — só é descontado na 1ª quinzena
  const netTotal = grossTotal;

  // Rateio por dias úteis de cada quinzena
  const diasQ1 = entry.working_days_first || 0;
  const diasQ2 = entry.working_days_second || 0;
  const totalQDias = diasQ1 + diasQ2 || 1;
  const splitFirst = diasQ1 / totalQDias;
  const splitSecond = diasQ2 / totalQDias;

  const firstBase = Math.round(netTotal * splitFirst * 100) / 100;
  const secondBase = Math.round(netTotal * splitSecond * 100) / 100;

  const firstPeriodNet = firstBase + foodVoucher
    - lifeInsurance
    - (entry.first_period_advance || 0)
    - (entry.first_period_discount || 0);
  const secondPeriodNet = secondBase + kmBonus + costAllowance
    - (entry.second_period_discount || 0);

  return {
    remuneracao,
    km_bonus: kmBonus,
    life_insurance: lifeInsurance,
    gross_total: Math.round(grossTotal * 100) / 100,
    net_total: Math.round(netTotal * 100) / 100,
    first_period_base: firstBase,
    second_period_base: secondBase,
    split_first: splitFirst,
    split_second: splitSecond,
    first_period_net: Math.round(firstPeriodNet * 100) / 100,
    second_period_net: Math.round(secondPeriodNet * 100) / 100,
  };
}

export default function MeiPayrollForm({ employee, entry, referenceMonth, onSave, onClose, readOnly = false, jobRole = null }) {
  const workingDays = getWorkingDaysInMonth(referenceMonth);
  const defaultPeriods = getWorkingDaysByPeriod(referenceMonth);

  const [form, setForm] = useState({
    company_id: employee.company_id,
    base_salary: entry?.base_salary ?? 0,
    working_days_month: entry?.working_days_month ?? workingDays,
    working_days_worked: entry?.working_days_worked ?? workingDays,
    working_days_first: entry?.working_days_first ?? defaultPeriods.first,
    working_days_second: entry?.working_days_second ?? defaultPeriods.second,
    food_voucher: entry?.food_voucher ?? 0,
    km_bonus_qty: entry?.km_bonus_qty ?? 0,
    km_bonus_value: entry?.km_bonus_value ?? 0,
    cost_allowance: entry?.cost_allowance ?? 0,
    motorcycle_rental: entry?.motorcycle_rental ?? 0,
    bonus: entry?.bonus ?? 0,
    other_benefits: entry?.other_benefits ?? 0,
    life_insurance: entry?.life_insurance ?? 0,
    first_period_advance: entry?.first_period_advance ?? 0,
    notes: entry?.notes ?? '',
  });

  const [firstDiscounts, setFirstDiscounts] = useState(entry?.first_discounts ?? []);
  const [secondDiscounts, setSecondDiscounts] = useState(entry?.second_discounts ?? []);
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
  };
  const calc = calculateMeiPayroll(calcForm);
  const remuneracao = calc.remuneracao;

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
      km_bonus: calc.km_bonus,
      gross_total: calc.gross_total,
      net_total: calc.net_total,
      first_period_discount: firstDiscountTotal,
      second_period_discount: secondDiscountTotal,
      first_discounts: firstDiscounts,
      second_discounts: secondDiscounts,
      first_period_net: calc.first_period_net,
      second_period_net: calc.second_period_net,
      first_period_split: calc.split_first,
      reference_month: referenceMonth,
      pj_retention: 0,
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

              {/* Remuneração com cálculo proporcional */}
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Remuneração do MEI</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Valor Base (R$)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Remuneração contratual</p>
                    <Input {...numericField('base_salary')} />
                  </div>
                  <div>
                    <Label>Dias Úteis no Mês</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Total de dias úteis</p>
                    <Input
                      type="number" step="1" min="1" disabled={readOnly}
                      className="mt-1 font-mono"
                      value={form.working_days_month === 0 ? '' : String(form.working_days_month)}
                      onChange={e => {
                        const total = parseInt(e.target.value) || 0;
                        const periods = getWorkingDaysByPeriod(referenceMonth);
                        const ratio = periods.first + periods.second > 0 ? periods.first / (periods.first + periods.second) : 0.5;
                        set('working_days_month', total);
                        set('working_days_first', Math.round(total * ratio));
                        set('working_days_second', total - Math.round(total * ratio));
                      }}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                  </div>
                  <div>
                    <Label>Dias Úteis Trabalhados</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Dias efetivamente trabalhados</p>
                    <Input
                      type="number" step="1" min="0" disabled={readOnly}
                      className="mt-1 font-mono"
                      value={form.working_days_worked === 0 ? '' : String(form.working_days_worked)}
                      onChange={e => set('working_days_worked', e.target.value)}
                      onBlur={e => setNum('working_days_worked', e.target.value)}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-2">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Remuneração = ({formatCurrency(form.base_salary)} ÷ {form.working_days_month || 1} dias) × {form.working_days_worked || 0} dias
                    </p>
                  </div>
                  <p className="font-mono font-bold text-primary text-lg">{formatCurrency(remuneracao)}</p>
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
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descontos</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Seguro de Vida (R$)</Label>
                  <Input {...numericField('life_insurance')} />
                </div>
              </div>

              <Separator />
              <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-3">
                <div>
                  <p className="font-bold text-base">Total Bruto / Total a Receber</p>
                  <p className="text-xs text-muted-foreground">Remuneração + benefícios</p>
                </div>
                <p className="font-mono font-bold text-primary text-2xl">{formatCurrency(calc.gross_total)}</p>
              </div>

              {form.life_insurance > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700 font-medium">Seguro de Vida — descontado na 1ª quinzena</span>
                    <span className="font-mono text-amber-700">- {formatCurrency(form.life_insurance)}</span>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── ABA: Quinzenal ── */}
            <TabsContent value="quinzenal" className="space-y-5 mt-4">
              {/* Rateio por dias úteis */}
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Dias Úteis por Quinzena — Rateio da Remuneração
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Dias Úteis — 1ª Quinzena (1–15)</Label>
                    <Input
                      type="number" step="1" min="0" disabled={readOnly}
                      className="mt-1 font-mono"
                      value={form.working_days_first === 0 ? '' : String(form.working_days_first)}
                      onChange={e => {
                        const v = parseInt(e.target.value) || 0;
                        const total = form.working_days_month || (v + form.working_days_second);
                        set('working_days_first', v);
                        set('working_days_second', Math.max(0, total - v));
                      }}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                  </div>
                  <div>
                    <Label>Dias Úteis — 2ª Quinzena (16–fim)</Label>
                    <Input
                      type="number" step="1" min="0" disabled={readOnly}
                      className="mt-1 font-mono"
                      value={form.working_days_second === 0 ? '' : String(form.working_days_second)}
                      onChange={e => {
                        const v = parseInt(e.target.value) || 0;
                        const total = form.working_days_month || (form.working_days_first + v);
                        set('working_days_second', v);
                        set('working_days_first', Math.max(0, total - v));
                      }}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-primary/10 rounded-lg px-4 py-2 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Base 1ª Quinzena</p>
                      <p className="text-xs text-muted-foreground">{form.working_days_first} / {form.working_days_first + form.working_days_second} dias ({Math.round(calc.split_first * 100)}%)</p>
                    </div>
                    <p className="font-mono font-bold text-primary text-lg">{formatCurrency(calc.first_period_base)}</p>
                  </div>
                  <div className="bg-primary/10 rounded-lg px-4 py-2 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Base 2ª Quinzena</p>
                      <p className="text-xs text-muted-foreground">{form.working_days_second} / {form.working_days_first + form.working_days_second} dias ({Math.round(calc.split_second * 100)}%)</p>
                    </div>
                    <p className="font-mono font-bold text-primary text-lg">{formatCurrency(calc.second_period_base)}</p>
                  </div>
                </div>
              </div>

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
                  {form.life_insurance > 0 && (
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="text-xs text-amber-700 font-medium">− Seguro de Vida</span>
                      <span className="font-mono text-xs font-semibold text-amber-700">- {formatCurrency(form.life_insurance)}</span>
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
                      <p className="text-xs text-muted-foreground">Descontos: {formatCurrency(firstDiscountTotal + form.first_period_advance + form.life_insurance)}</p>
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
                  <span className="text-muted-foreground">Valor Base</span>
                  <span className="font-mono">{formatCurrency(form.base_salary)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Remuneração Proporcional ({form.working_days_worked}/{form.working_days_month} dias)</span>
                  <span className="font-mono font-semibold">{formatCurrency(remuneracao)}</span>
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
                  <span>Total Bruto / Total a Receber</span>
                  <span className="font-mono">{formatCurrency(calc.gross_total)}</span>
                </div>
                {(firstDiscounts.length > 0 || form.first_period_advance > 0 || form.life_insurance > 0) && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Descontos 1ª Quinzena</p>
                    {form.life_insurance > 0 && (
                      <div className="flex justify-between py-1 border-b border-border">
                        <span className="text-amber-700 text-sm">Seguro de Vida</span>
                        <span className="font-mono text-amber-700 text-sm">- {formatCurrency(form.life_insurance)}</span>
                      </div>
                    )}
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