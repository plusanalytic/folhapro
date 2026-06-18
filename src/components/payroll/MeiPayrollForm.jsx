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
import MeiPeriodDiscountsTable from './MeiPeriodDiscountsTable';
import InstallmentDialog from './InstallmentDialog';
import { base44 } from '@/api/base44Client';
import { RefreshCw } from 'lucide-react';


const COST_ALLOWANCE_DEFAULT = 500;

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

function calculateMeiPayroll(entry) {
  const valorBase = entry.base_salary || 0;
  const diasMes = entry.working_days_month || 1;
  const diasTrabalhados = entry.working_days_worked || diasMes;
  const remuneracao = Math.round((valorBase / diasMes) * diasTrabalhados * 100) / 100;

  const kmBonus = Math.round((entry.km_bonus_qty || 0) * (entry.km_bonus_value || 0) * 100) / 100;
  const costAllowance = entry.cost_allowance || 0;
  const motoRental = entry.motorcycle_rental || 0;
  const bonus = entry.bonus || 0;
  const overtime = entry.overtime || 0;
  const otherBenefits = entry.other_benefits || 0;
  const foodVoucher = entry.food_voucher || 0;
  const lifeInsurance = entry.life_insurance || 0;

  // bonus, overtime, ajuda de custo NÃO entram no gross/net total — são pagos na 2ª quinzena
  const grossTotal = remuneracao + kmBonus + motoRental + otherBenefits;
  const netTotal = grossTotal;

  const diasQ1 = entry.working_days_first || 0;
  const diasQ2 = entry.working_days_second || 0;
  const totalQDias = diasQ1 + diasQ2 || 1;
  const splitFirst = diasQ1 / totalQDias;
  const splitSecond = diasQ2 / totalQDias;

  const firstBase = Math.round(netTotal * splitFirst * 100) / 100;
  const secondBase = Math.round(netTotal * splitSecond * 100) / 100;

  const firstPeriodNet = firstBase
    - lifeInsurance
    - (entry.first_period_advance || 0)
    - (entry.first_period_discount || 0);
  const secondPeriodNet = secondBase + foodVoucher + kmBonus + costAllowance + bonus + overtime
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

const QUINZENA_BLOCKED_STATUSES = ['AGENDADO', 'PAGO', 'RESCISÃO', 'DESLIGADO', 'FÉRIAS', 'AFASTADO', 'SALDO NEGATIVO'];

export default function MeiPayrollForm({ employee, entry, referenceMonth, onSave, onClose, readOnly = false, paymentStatus = null }) {
  const q1Locked = !readOnly && QUINZENA_BLOCKED_STATUSES.includes(paymentStatus?.status_q1);
  const q2Locked = !readOnly && QUINZENA_BLOCKED_STATUSES.includes(paymentStatus?.status_q2);
  const baseLocked = readOnly || q2Locked;

  // Dias úteis do mês por quinzena — usado apenas para pré-preencher folha NOVA (entry === null)
  const { first: wdFirst, second: wdSecond } = getWorkingDaysByPeriod(referenceMonth);
  const wdMonth = wdFirst + wdSecond;

  const [form, setForm] = useState({
    company_id: employee.company_id,
    base_salary: entry?.base_salary ?? 0,
    working_days_month:  entry ? (entry.working_days_month  ?? 0) : wdMonth,
    working_days_worked: entry ? (entry.working_days_worked ?? 0) : wdMonth,
    working_days_first:  entry ? (entry.working_days_first  ?? 0) : wdFirst,
    working_days_second: entry ? (entry.working_days_second ?? 0) : wdSecond,
    food_voucher: entry?.food_voucher ?? 0,
    km_bonus_qty: entry?.km_bonus_qty ?? 0,
    km_bonus_value: entry?.km_bonus_value ?? 0,
    cost_allowance: entry?.cost_allowance ?? COST_ALLOWANCE_DEFAULT,
    motorcycle_rental: entry?.motorcycle_rental ?? 0,
    bonus: entry?.bonus ?? 0,
    overtime: entry?.overtime ?? 0,
    other_benefits: entry?.other_benefits ?? 0,
    life_insurance: entry?.life_insurance ?? 0,
    first_period_advance: entry?.first_period_advance ?? 0,
    notes: entry?.notes ?? '',
  });

  // Estado de string separado para os 4 campos de dias — evita que parseInt('') = NaN reforce 0 durante digitação
  const [daysStr, setDaysStr] = useState({
    working_days_month:  String(entry ? (entry.working_days_month  ?? '') : wdMonth),
    working_days_worked: String(entry ? (entry.working_days_worked ?? '') : wdMonth),
    working_days_first:  String(entry ? (entry.working_days_first  ?? '') : wdFirst),
    working_days_second: String(entry ? (entry.working_days_second ?? '') : wdSecond),
  });

  const [firstDiscounts, setFirstDiscounts] = useState(entry?.first_discounts ?? []);
  const [secondDiscounts, setSecondDiscounts] = useState(entry?.second_discounts ?? []);
  const [installmentDialog, setInstallmentDialog] = useState(null);

  // Conta faltas automaticamente a partir das tabelas de descontos
  const faltasFirst = firstDiscounts.filter(r => r.category === 'falta').length;
  const faltasSecond = secondDiscounts.filter(r => r.category === 'falta').length;
  const totalFaltas = faltasFirst + faltasSecond;

  // Recalcula ajuda de custo com base nas faltas das tabelas
  const recalcCostAllowance = () => {
    const workingDays = form.working_days_month || 1;
    let newValue;
    if (totalFaltas === 0) {
      newValue = COST_ALLOWANCE_DEFAULT;
    } else if (totalFaltas === 1) {
      const daily = COST_ALLOWANCE_DEFAULT / workingDays;
      newValue = Math.max(0, Math.round((COST_ALLOWANCE_DEFAULT - daily) * 100) / 100);
    } else {
      newValue = 0;
    }
    setForm(f => ({ ...f, cost_allowance: newValue }));
  };

  // Carregar CashOuts do colaborador no mês
  useEffect(() => {
    base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: referenceMonth }).then(cashOuts => {
      const toDeduct = cashOuts.filter(c => c.deduct_from_payroll);
      const fromCashFirst = toDeduct.filter(c => c.period === 'first').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));
      const fromCashSecond = toDeduct.filter(c => c.period === 'second').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));
      setFirstDiscounts(prev => [...prev.filter(x => !x.fromCashOut), ...fromCashFirst]);
      setSecondDiscounts(prev => [...prev.filter(x => !x.fromCashOut), ...fromCashSecond]);
    });
  }, [employee.id, referenceMonth]);

  // Atualiza campo de dias: mantém string para exibição e número no form
  const setDayField = (key, strVal) => {
    if (readOnly) return;
    setDaysStr(prev => ({ ...prev, [key]: strVal }));
    const num = parseInt(strVal);
    setForm(f => ({ ...f, [key]: isNaN(num) ? 0 : num }));
  };

  // Quando "Dias Trabalhados" muda, pré-distribui entre as quinzenas SE ainda não foram editadas manualmente
  const handleWorkedDaysChange = (strVal) => {
    if (readOnly) return;
    setDaysStr(prev => ({ ...prev, working_days_worked: strVal }));
    const num = parseInt(strVal);
    const worked = isNaN(num) ? 0 : num;
    setForm(f => {
      const newForm = { ...f, working_days_worked: worked };
      // Só distribui automaticamente se ambos os campos de quinzena ainda estão zerados
      if (f.working_days_first === 0 && f.working_days_second === 0 && worked > 0) {
        const half = Math.floor(worked / 2);
        const q1 = half;
        const q2 = worked - half;
        setDaysStr(prev => ({ ...prev, working_days_first: String(q1), working_days_second: String(q2) }));
        return { ...newForm, working_days_first: q1, working_days_second: q2 };
      }
      return newForm;
    });
  };

  // Input numérico genérico (float)
  const numericInput = (key, forceDisabled) => ({
    type: 'number',
    step: 'any',
    disabled: forceDisabled !== undefined ? forceDisabled : baseLocked,
    className: 'mt-1 font-mono',
    value: form[key] === 0 ? '' : String(form[key]),
    onChange: (e) => {
      if (readOnly) return;
      const v = e.target.value;
      setForm(f => ({ ...f, [key]: v === '' ? 0 : parseFloat(v) || 0 }));
    },
    onFocus: (e) => setTimeout(() => e.target.select(), 0),
  });

  // Input de dias — usa daysStr para não forçar zero durante digitação
  const dayInput = (key, forceDisabled) => ({
    type: 'number',
    step: '1',
    min: '0',
    disabled: forceDisabled !== undefined ? forceDisabled : baseLocked,
    className: 'mt-1 font-mono',
    value: daysStr[key] ?? '',
    onChange: (e) => setDayField(key, e.target.value),
    onFocus: (e) => setTimeout(() => e.target.select(), 0),
  });

  const firstDiscountTotal = firstDiscounts.reduce((s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0), 0);
  const secondDiscountTotal = secondDiscounts.reduce((s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0), 0);

  const calcRaw = calculateMeiPayroll({
    ...form,
    first_period_discount: firstDiscountTotal,
    second_period_discount: secondDiscountTotal,
  });

  // q1IsPaid: verifica status independente de readOnly (para funcionar no modo visualização também)
  const q1IsPaid = QUINZENA_BLOCKED_STATUSES.includes(paymentStatus?.status_q1);
  // Se 1ª quinzena está paga (readOnly ou não) OU base foi congelada pelo sistema, congela a base da 1ª quinzena
  const isFirstBaseFrozen = (q1IsPaid || !!entry?.first_period_base_locked) && entry?.first_period_base > 0;
  const calc = (() => {
    if (isFirstBaseFrozen) {
      // Modo edição com 1ª quinzena paga: congela base da 1ª, deduz seguro de vida corretamente
      const frozenFirstBase = entry.first_period_base;
      const frozenFirstNet = frozenFirstBase
        - (form.life_insurance || 0)
        - (form.first_period_advance || 0)
        - firstDiscountTotal;
      const newSecondBase = calcRaw.net_total - frozenFirstBase;
      const newSecondNet = calcRaw.second_period_net + (newSecondBase - calcRaw.second_period_base);
      return { ...calcRaw, first_period_base: frozenFirstBase, second_period_base: newSecondBase, first_period_net: frozenFirstNet, second_period_net: newSecondNet };
    }
    return calcRaw;
  })();

  const handleInstallmentConfirm = async ({ description, installmentValue, startDate, preview, installments }) => {
    const isFirst = installmentDialog === 'first';
    // 1ª parcela: entra direto como desconto na quinzena atual + registrada no CashOut para rastreamento
    const firstEntry = { date: startDate, description: `${description} (1/${installments})`, amount: installmentValue, id: Date.now() };
    if (isFirst) setFirstDiscounts(prev => [...prev, firstEntry]);
    else setSecondDiscounts(prev => [...prev, firstEntry]);
    setInstallmentDialog(null);
    // Todas as parcelas (incluindo a 1ª) são registradas no CashOut com source=payroll_installment
    for (let i = 0; i < preview.length; i++) {
      const p = preview[i];
      const day = isFirst ? 15 : 28;
      const date = i === 0 ? startDate : `${p.month}-${String(day).padStart(2, '0')}`;
      await base44.entities.CashOut.create({
        employee_id: employee.id,
        company_id: employee.company_id,
        date,
        description: `${description} (${i + 1}/${installments})`,
        amount: installmentValue,
        reference_month: p.month,
        period: isFirst ? 'first' : 'second',
        notes: `Parcela ${i + 1}/${installments} — parcelamento gerado em ${referenceMonth}`,
        deduct_from_payroll: i > 0, // 1ª já foi aplicada direto na folha
        source: 'payroll_installment',
      });
    }
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
      first_period_base: calc.first_period_base,
      second_period_base: calc.second_period_base,
      first_period_split: isFirstBaseFrozen && calcRaw.net_total !== 0
        ? Math.round((calc.first_period_base / calcRaw.net_total) * 10000) / 10000
        : calc.split_first,
      first_period_base_locked: q1IsPaid || entry?.first_period_base_locked || false,
      bonus: form.bonus || 0,
      overtime: form.overtime || 0,
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
            <DialogTitle className="flex items-center gap-3 flex-wrap">
              {readOnly ? 'Visualização — ' : 'Lançamento — '}{employee.name}
              <Badge variant="secondary">MEI</Badge>
              <Badge variant="outline" className="text-xs">Motociclista MEI</Badge>
              <span className="text-sm font-normal text-muted-foreground">{getMonthName(referenceMonth)}</span>
              {employee.birth_date && (
                <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">
                  Nasc.: {employee.birth_date.split('-').reverse().join('/')}
                </span>
              )}
              {employee.admission_date && (
                <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">
                  Admissão: {employee.admission_date.split('-').reverse().join('/')}
                </span>
              )}
              {employee.termination_date && (
                <span className="text-xs text-destructive border border-destructive/30 rounded px-2 py-0.5">
                  Demissão: {employee.termination_date.split('-').reverse().join('/')}
                </span>
              )}
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
              {!readOnly && (q1Locked || q2Locked) && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 text-sm text-amber-700">
                  🔒 {q1Locked && q2Locked ? 'Ambas as quinzenas estão bloqueadas — todos os campos estão desabilitados.' : q1Locked ? '1ª quinzena já paga — você pode alterar proventos livremente. A diferença será aplicada automaticamente na base da 2ª quinzena.' : '2ª quinzena bloqueada — campos que afetam a 2ª quinzena estão desabilitados.'}
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
                    <Input {...numericInput('base_salary')} />
                  </div>
                  <div>
                    <Label>Dias Úteis no Mês</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Total de dias úteis</p>
                    <Input {...dayInput('working_days_month')} min="1" />
                  </div>
                  <div>
                    <Label>Dias Úteis Trabalhados</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Dias efetivamente trabalhados</p>
                    <Input
                      type="number" step="1" min="0" disabled={baseLocked}
                      className="mt-1 font-mono"
                      value={daysStr.working_days_worked ?? ''}
                      onChange={e => handleWorkedDaysChange(e.target.value)}
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
                  <p className="font-mono font-bold text-primary text-lg">{formatCurrency(calc.remuneracao)}</p>
                </div>
              </div>

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Benefícios</p>

              {/* KM Excedente */}
              <div>
                <Label>KM Excedente</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <div className="flex-1">
                    <Input {...numericInput('km_bonus_qty')} placeholder="Qtd. KM" />
                    <p className="text-xs text-muted-foreground mt-0.5">Quantidade de KM</p>
                  </div>
                  <span className="text-muted-foreground font-bold text-lg">×</span>
                  <div className="flex-1">
                    <Input {...numericInput('km_bonus_value')} placeholder="R$/KM" />
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
                  <Label>Ajuda de custo pacote de dados (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={baseLocked}
                    className="mt-1 font-mono"
                    value={form.cost_allowance === 0 ? '' : String(form.cost_allowance)}
                    onChange={e => {
                      if (readOnly) return;
                      const v = e.target.value;
                      setForm(f => ({ ...f, cost_allowance: v === '' ? 0 : parseFloat(v) || 0 }));
                    }}
                    onFocus={e => setTimeout(() => e.target.select(), 0)}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label>Aluguel da Motocicleta</Label>
                  <Input {...numericInput('motorcycle_rental')} />
                </div>
                <div>
                  <Label>Vale Alimentação</Label>
                  <Input {...numericInput('food_voucher')} />
                </div>
                <div>
                  <Label>Outros Benefícios</Label>
                  <Input {...numericInput('other_benefits')} />
                </div>
              </div>

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bonificações (pagas na 2ª quinzena — não somam ao bruto)</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Bonificação / Prêmio</Label>
                  <Input {...numericInput('bonus')} />
                </div>
                <div>
                  <Label>Hora Extra</Label>
                  <Input {...numericInput('overtime')} />
                </div>
              </div>

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descontos</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <Label>Seguro de Vida (R$)</Label>
                  <Input {...numericInput('life_insurance', readOnly || q1Locked)} />
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
              {q1Locked && !readOnly && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-300 rounded-lg px-3 py-2 text-xs text-blue-700 font-medium">
                  1ª quinzena já paga — Base congelada. Alterações refletem apenas na 2ª quinzena.
                </div>
              )}
              {/* Rateio por dias úteis */}
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Dias Úteis por Quinzena — Rateio da Remuneração
                </p>
                <p className="text-xs text-muted-foreground">Referência: {form.working_days_worked} dias trabalhados. Edite livremente.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Dias Úteis — 1ª Quinzena (1–15)</Label>
                    <Input {...dayInput('working_days_first', readOnly || q1Locked)} />
                  </div>
                  <div>
                    <Label>Dias Úteis — 2ª Quinzena (16–fim)</Label>
                    <Input {...dayInput('working_days_second', readOnly || q2Locked)} />
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
                  {q1Locked && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-700 font-medium">
                      🔒 1ª Quinzena bloqueada — status: <strong>{paymentStatus?.status_q1}</strong>
                    </div>
                  )}
                  {paymentStatus?.payment_date_q1 && (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span className="text-xs text-green-700 font-medium">📅 Data de Pagamento</span>
                      <span className="text-xs font-mono text-green-700 font-semibold">{paymentStatus.payment_date_q1.split('-').reverse().join('/')}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">1ª Quinzena (1–15)</p>
                    <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.first_period_base)}</span>
                  </div>
                  {form.life_insurance > 0 && (
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="text-xs text-amber-700 font-medium">− Seguro de Vida</span>
                      <span className="font-mono text-xs font-semibold text-amber-700">- {formatCurrency(form.life_insurance)}</span>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">Adiantamento</Label>
                    <Input {...numericInput('first_period_advance', readOnly || q1Locked)} className="mt-1 font-mono h-8 text-sm" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Descontos da 1ª Quinzena</p>
                    <MeiPeriodDiscountsTable items={firstDiscounts} onChange={(readOnly || q1Locked) ? () => {} : setFirstDiscounts} readOnly={readOnly || q1Locked} onOpenInstallment={(readOnly || q1Locked) ? undefined : () => setInstallmentDialog('first')} />
                  </div>
                  <div className={`${calc.first_period_net < 0 ? 'bg-destructive/10' : 'bg-primary/10'} rounded-lg px-4 py-3 flex justify-between items-center`}>
                    <div>
                      <p className="text-xs text-muted-foreground">{calc.first_period_net < 0 ? 'Saldo Negativo 1ª Quinzena' : 'Á Receber 1ª Quinzena'}</p>
                      <p className="text-xs text-muted-foreground">Descontos: {formatCurrency(firstDiscountTotal + form.first_period_advance + form.life_insurance)}</p>
                    </div>
                    <p className={`font-mono font-bold text-lg ${calc.first_period_net < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(calc.first_period_net)}</p>
                  </div>
                </div>

                {/* 2ª Quinzena */}
                <div className="space-y-3 border border-border rounded-xl p-4">
                  {q2Locked && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-700 font-medium">
                      🔒 2ª Quinzena bloqueada — status: <strong>{paymentStatus?.status_q2}</strong>
                    </div>
                  )}
                  {paymentStatus?.payment_date_q2 && (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span className="text-xs text-green-700 font-medium">📅 Data de Pagamento</span>
                      <span className="text-xs font-mono text-green-700 font-semibold">{paymentStatus.payment_date_q2.split('-').reverse().join('/')}</span>
                    </div>
                  )}
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">2ª Quinzena (16–30)</p>
                  <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.second_period_base)}</span>
                </div>
                {form.food_voucher > 0 && (
                  <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                    <span className="text-xs text-secondary font-medium">+ Vale Alimentação (pago na 2ª quinzena)</span>
                    <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(form.food_voucher)}</span>
                  </div>
                )}
                {form.bonus > 0 && (
                  <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span className="text-xs text-amber-700 font-medium">+ Bonificação / Prêmio</span>
                    <span className="font-mono text-xs font-semibold text-amber-700">+ {formatCurrency(form.bonus)}</span>
                  </div>
                )}
                {form.overtime > 0 && (
                  <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <span className="text-xs text-amber-700 font-medium">+ Hora Extra</span>
                    <span className="font-mono text-xs font-semibold text-amber-700">+ {formatCurrency(form.overtime)}</span>
                  </div>
                )}
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
                          <span className="text-xs text-secondary font-medium">+ Ajuda de custo pacote de dados</span>
                          <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(form.cost_allowance)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-muted-foreground">Descontos da 2ª Quinzena</p>
                      {!readOnly && (
                        <Button size="sm" variant="outline" className="gap-1 h-6 text-xs border-orange-300 text-orange-700 hover:bg-orange-50" onClick={recalcCostAllowance}>
                          <RefreshCw className="w-3 h-3" /> Recalc. Ajuda de Custo
                          {totalFaltas > 0 && <span className="ml-1 bg-red-500 text-white rounded-full text-[10px] px-1">{totalFaltas}</span>}
                        </Button>
                      )}
                    </div>
                    <MeiPeriodDiscountsTable items={secondDiscounts} onChange={(readOnly || q2Locked) ? () => {} : setSecondDiscounts} readOnly={readOnly || q2Locked} onOpenInstallment={(readOnly || q2Locked) ? undefined : () => setInstallmentDialog('second')} />
                  </div>
                  <div className={`${calc.second_period_net < 0 ? 'bg-destructive/10' : 'bg-primary/10'} rounded-lg px-4 py-3 flex justify-between items-center`}>
                    <div>
                      <p className="text-xs text-muted-foreground">{calc.second_period_net < 0 ? 'Saldo Negativo 2ª Quinzena' : 'Á Receber 2ª Quinzena'}</p>
                      <p className="text-xs text-muted-foreground">Descontos: {formatCurrency(secondDiscountTotal)}</p>
                    </div>
                    <p className={`font-mono font-bold text-lg ${calc.second_period_net < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(calc.second_period_net)}</p>
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
                  <span className="font-mono font-semibold">{formatCurrency(calc.remuneracao)}</span>
                </div>
                {calc.km_bonus > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">KM Excedente ({form.km_bonus_qty} km × {formatCurrency(form.km_bonus_value)})</span>
                    <span className="font-mono">{formatCurrency(calc.km_bonus)}</span>
                  </div>
                )}
                {form.cost_allowance > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Ajuda de custo pacote de dados <span className="text-xs">(paga na 2ª quinzena)</span></span><span className="font-mono">{formatCurrency(form.cost_allowance)}</span></div>}
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

        <div className="px-6 pt-4 border-t border-border bg-background shrink-0">
          {!readOnly && (
            <div className="mb-3">
              <Label className="text-xs">Observação (aparece no PDF)</Label>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={2}
                placeholder="Observação informativa para o recibo..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          )}
          {entry?.id && <p className="text-xs text-muted-foreground font-mono pb-2">ID da Folha: {entry.id}</p>}
          <div className="flex gap-3 pb-4">
            {readOnly ? (
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