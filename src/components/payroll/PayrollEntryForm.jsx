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
import AbsenceDiscountsTable, { totalAbsenceDiscount, absenceDiscountByPeriod } from './AbsenceDiscountsTable';
import ProvisionCalculator from './ProvisionCalculator';
import { base44 } from '@/api/base44Client';

// Regras de visibilidade de campos por modelo de folha
const PAYROLL_TYPE_FIELDS = {
  MOTOCICLISTA_CLT: {
    show: ['meal_voucher', 'food_voucher', 'transport_voucher', 'km_bonus', 'motorcycle_rental', 'hazard_pay', 'bonus', 'other_benefits', 'union_contribution_pct', 'meal_voucher_discount_pct', 'life_insurance', 'inss', 'fgts', 'irrf'],
    hide: ['pj_retention'],
  },
  MOTOCICLISTA_MEI: {
    show: ['km_bonus', 'motorcycle_rental', 'bonus', 'other_benefits', 'pj_retention'],
    hide: ['meal_voucher', 'transport_voucher', 'hazard_pay', 'union_contribution_pct', 'meal_voucher_discount_pct', 'life_insurance', 'inss', 'fgts', 'irrf'],
  },
  ESCRITORIO: {
    show: ['meal_voucher', 'transport_voucher', 'bonus', 'other_benefits', 'union_contribution_pct', 'meal_voucher_discount_pct', 'life_insurance', 'inss', 'fgts', 'irrf'],
    hide: ['km_bonus', 'motorcycle_rental', 'hazard_pay', 'pj_retention'],
  },
  SOCIO: {
    show: ['bonus', 'other_benefits', 'pj_retention'],
    hide: ['meal_voucher', 'transport_voucher', 'km_bonus', 'motorcycle_rental', 'hazard_pay', 'union_contribution_pct', 'meal_voucher_discount_pct', 'life_insurance', 'inss', 'fgts', 'irrf'],
  },
};

function isFieldVisible(payrollType, field) {
  if (!payrollType || !PAYROLL_TYPE_FIELDS[payrollType]) return true;
  const rules = PAYROLL_TYPE_FIELDS[payrollType];
  if (rules.hide?.includes(field)) return false;
  return true;
}

// Tabela INSS CLT simplificada conforme solicitado
function autoInssFromSalary(salary) {
  if (salary <= 1621) return { pct: 7.5, discount: 0 };
  if (salary <= 2902.84) return { pct: 9, discount: 24.32 };
  if (salary <= 4354.27) return { pct: 12, discount: 111.40 };
  return { pct: 13, discount: 198.49 };
}

// Calcula dias trabalhados considerando data de admissão
function calcDefaultWorkingDays(referenceMonth, admissionDate) {
  if (!admissionDate) return 30;
  const admMonth = admissionDate.slice(0, 7);
  if (admMonth !== referenceMonth) return 30;
  const admDay = parseInt(admissionDate.slice(8, 10));
  return Math.max(1, 30 - admDay);
}

function PeriodBaseInput({ value, onChange }) {
  const [raw, setRaw] = useState(null);
  const display = raw !== null ? raw : (value === 0 ? '0' : String(value ?? 0));
  return (
    <Input
      type="number"
      step="0.01"
      className="font-mono font-bold text-lg h-9"
      value={display}
      onChange={e => setRaw(e.target.value)}
      onBlur={e => {
        const v = parseFloat(e.target.value);
        onChange(isNaN(v) ? 0 : v);
        setRaw(null);
      }}
      onFocus={e => {
        setRaw(String(value ?? 0));
        setTimeout(() => e.target.select(), 0);
      }}
    />
  );
}

export default function PayrollEntryForm({ employee, entry, referenceMonth, onSave, onClose, readOnly = false, jobRole = null }) {
  const workingDays = getWorkingDaysInMonth(referenceMonth);
  const payrollType = jobRole?.payroll_type || null;
  const show = (field) => isFieldVisible(payrollType, field);
  const isCLTMoto = payrollType === 'MOTOCICLISTA_CLT';

  // Dias trabalhados padrão: 30 ou proporcional para admitidos no mês
  const defaultWorkingDays = calcDefaultWorkingDays(referenceMonth, employee?.admission_date);

  // Para MOTOCICLISTA_CLT: salário efetivo = (base_salary / 30) * working_days_worked
  // working_days_worked é editável pelo usuário; base_salary é o piso contratual
  const [workingDaysWorked, setWorkingDaysWorked] = useState(() => {
    if (!isCLTMoto) return 30;
    return entry?.working_days_worked ?? defaultWorkingDays;
  });
  const [workingDaysWorkedStr, setWorkingDaysWorkedStr] = useState(() => String(entry?.working_days_worked ?? defaultWorkingDays));

  const [form, setForm] = useState(() => {
    const baseSalary = entry?.base_salary ?? employee?.base_salary ?? 0;
    // INSS: se já existe entrada, usa os valores salvos; se não, calcula automaticamente
    let inss_pct = entry?.inss_pct ?? 0;
    let inss_discount = entry?.inss_discount ?? 0;
    if (!entry && isCLTMoto && baseSalary > 0) {
      const autoInss = autoInssFromSalary(baseSalary);
      inss_pct = autoInss.pct;
      inss_discount = autoInss.discount;
    }
    return {
      company_id: employee.company_id,
      base_salary: baseSalary,
      absences_days: entry?.absences_days ?? 0,
      meal_voucher_day_value: entry?.meal_voucher_day_value ?? 0,
      meal_voucher_days: entry?.meal_voucher_days ?? workingDays,
      food_voucher: entry?.food_voucher ?? 0,
      transport_voucher: entry?.transport_voucher ?? 0,
      km_bonus_qty: entry?.km_bonus_qty ?? 0,
      km_bonus_value: entry?.km_bonus_value ?? 0,
      cost_allowance: entry?.cost_allowance ?? 0,
      motorcycle_rental: entry?.motorcycle_rental ?? 0,
      hazard_pay: entry?.hazard_pay ?? 0,
      bonus: entry?.bonus ?? 0,
      other_benefits: entry?.other_benefits ?? 0,
      union_contribution_value: entry?.union_contribution_value ?? 35,
      meal_voucher_discount_pct: entry?.meal_voucher_discount_pct ?? 0,
      life_insurance: entry?.life_insurance ?? 0,
      inss_pct,
      inss_discount,
      pj_retention: entry?.pj_retention ?? 0,
      first_period_advance: entry?.first_period_advance ?? 0,
      notes: entry?.notes ?? '',
      working_days_worked: entry?.working_days_worked ?? defaultWorkingDays,
    };
  });

  // Salário efetivo CLT = (base / 30) * dias trabalhados
  const dailyRate = isCLTMoto ? Math.round((form.base_salary / 30) * 100) / 100 : 0;
  const effectiveSalary = isCLTMoto ? Math.round(dailyRate * workingDaysWorked * 100) / 100 : form.base_salary;

  // Quando base_salary ou workingDaysWorked muda, auto-sugere INSS se não foi customizado
  const [inssCustomized, setInssCustomized] = useState(!!entry);

  useEffect(() => {
    if (!isCLTMoto || inssCustomized) return;
    const autoInss = autoInssFromSalary(effectiveSalary);
    setForm(f => ({ ...f, inss_pct: autoInss.pct, inss_discount: autoInss.discount }));
  }, [effectiveSalary, isCLTMoto, inssCustomized]);

  // Descontos quinzenais
  const [firstDiscounts, setFirstDiscounts] = useState(entry?.first_discounts ?? []);
  const [secondDiscounts, setSecondDiscounts] = useState(entry?.second_discounts ?? []);

  // Rateio quinzenal
  const [firstPeriodSplit, setFirstPeriodSplit] = useState(entry?.first_period_split ?? 0.5);
  const [firstBaseOverride, setFirstBaseOverride] = useState(entry?.first_period_base ?? null);

  const [installmentDialog, setInstallmentDialog] = useState(null);

  const [pointAdjustments, setPointAdjustments] = useState([]);
  const [absenceDiscounts, setAbsenceDiscounts] = useState(entry?.absence_discounts ?? {});

  useEffect(() => {
    if (!employee.tangerino_id) return;
    const [year, month] = referenceMonth.split('-').map(Number);
    const start = `${referenceMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${referenceMonth}-${String(lastDay).padStart(2, '0')}`;

    base44.entities.PointAdjustment.filter({ employee_tangerino_id: Number(employee.tangerino_id) }).then(all => {
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      const prevMonthStart = new Date(year, month - 2, 1);
      const nextMonthEnd = new Date(year, month + 1, 0);

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
      forMonth.sort((a, b) => (a.adjustment_reason_description || '').localeCompare(b.adjustment_reason_description || '', 'pt-BR'));
      setPointAdjustments(forMonth);
    });
  }, [employee.tangerino_id, referenceMonth]);

  useEffect(() => {
    base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: referenceMonth }).then(cashOuts => {
      const toDeduct = cashOuts.filter(c => c.deduct_from_payroll);
      const fromCashFirst = toDeduct.filter(c => c.period === 'first').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));
      const fromCashSecond = toDeduct.filter(c => c.period === 'second').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));
      setFirstDiscounts(prev => {
        const manual = prev.filter(x => !x.fromCashOut);
        return [...manual, ...fromCashFirst];
      });
      setSecondDiscounts(prev => {
        const manual = prev.filter(x => !x.fromCashOut);
        return [...manual, ...fromCashSecond];
      });
    });
  }, [employee.id, referenceMonth]);

  // Taxa sindical automática na quinzena de admissão (apenas CLT moto, valor = dailyRate)
  useEffect(() => {
    if (!isCLTMoto || readOnly || !employee.admission_date) return;
    const admMonth = employee.admission_date.slice(0, 7);
    if (admMonth !== referenceMonth) return;
    const admDay = parseInt(employee.admission_date.slice(8, 10));
    const isFirstQ = admDay <= 15;
    const taxaDesc = 'Taxa Sindical Admissão';

    if (isFirstQ) {
      setFirstDiscounts(prev => {
        if (prev.find(x => x.description === taxaDesc)) return prev;
        return [...prev, { date: employee.admission_date, description: taxaDesc, amount: dailyRate, id: 'taxa-sind-adm', type: 'debit' }];
      });
    } else {
      setSecondDiscounts(prev => {
        if (prev.find(x => x.description === taxaDesc)) return prev;
        return [...prev, { date: employee.admission_date, description: taxaDesc, amount: dailyRate, id: 'taxa-sind-adm', type: 'debit' }];
      });
    }
  }, [isCLTMoto, employee.admission_date, referenceMonth, dailyRate]);

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

  const totalDiscount = totalAbsenceDiscount(absenceDiscounts);
  const { first: absenceFirst, second: absenceSecond } = absenceDiscountByPeriod(absenceDiscounts);

  // Para cálculo, usa o salário efetivo (dias trabalhados × valor dia) no CLT moto
  const formForCalc = isCLTMoto ? { ...form, base_salary: effectiveSalary } : form;

  const calcForm = { ...formForCalc, absence_discount: totalDiscount, absence_discount_first: absenceFirst, absence_discount_second: absenceSecond, first_period_discount: firstDiscountTotal, second_period_discount: secondDiscountTotal, union_contribution_value: form.union_contribution_value, first_period_split: firstPeriodSplit };
  const calcRaw = calculatePayroll(calcForm, employee.contract_type, payrollType);
  const calc = (calcRaw.net_total === 0 && firstBaseOverride !== null)
    ? { ...calcRaw, first_period_base: firstBaseOverride, second_period_base: -firstBaseOverride,
        first_period_net: firstBaseOverride - (form.first_period_advance || 0) - firstDiscountTotal - absenceFirst,
        second_period_net: -firstBaseOverride - secondDiscountTotal - absenceSecond }
    : calcRaw;

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
        deduct_from_payroll: true,
      });
    }
    setInstallmentDialog(null);
  };

  const handleSave = () => {
    onSave({
      ...form,
      base_salary: effectiveSalary, // salvo o valor efetivo calculado
      working_days_worked: workingDaysWorked,
      ...calc,
      meal_voucher_day_value: form.meal_voucher_day_value,
      meal_voucher_days: form.meal_voucher_days,
      meal_voucher: calc.meal_voucher,
      food_voucher: form.food_voucher,
      km_bonus_qty: form.km_bonus_qty,
      km_bonus_value: form.km_bonus_value,
      km_bonus: calc.km_bonus || 0,
      cost_allowance: form.cost_allowance,
      union_contribution_value: form.union_contribution_value,
      union_contribution: calc.union_contribution,
      meal_voucher_discount: calc.meal_voucher_discount,
      inss_pct: form.inss_pct,
      inss_discount: form.inss_discount,
      inss: calc.inss_net,
      absence_discount: totalDiscount,
      absence_discounts: absenceDiscounts,
      absence_discount_first: absenceFirst,
      absence_discount_second: absenceSecond,
      first_period_discount: firstDiscountTotal,
      second_period_discount: secondDiscountTotal,
      first_discounts: firstDiscounts,
      second_discounts: secondDiscounts,
      first_period_split: firstPeriodSplit,
      first_period_base: calc.first_period_base,
      second_period_base: calc.second_period_base,
      reference_month: referenceMonth,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {readOnly ? 'Visualização — ' : 'Lançamento — '}{employee.name}
            <Badge variant={employee.contract_type === 'CLT' ? 'default' : 'secondary'}>{employee.contract_type}</Badge>
            <span className="text-sm font-normal text-muted-foreground">{getMonthName(referenceMonth)}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="proventos">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="proventos">Proventos</TabsTrigger>
            <TabsTrigger value="quinzenal">Quinzenal</TabsTrigger>
            <TabsTrigger value="faltas">
              Ajuste de Ponto {pointAdjustments.length > 0 && <span className="ml-1 bg-destructive text-destructive-foreground text-xs rounded-full px-1.5">{pointAdjustments.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="provisao">Provisão</TabsTrigger>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
          </TabsList>

          <TabsContent value="proventos" className="space-y-4 mt-4">
            {readOnly && (
              <div className="bg-muted/50 border border-border rounded-lg px-4 py-2 text-sm text-muted-foreground">
                Modo visualização — nenhuma alteração pode ser realizada.
              </div>
            )}

            {/* ── MOTOCICLISTA CLT: Valor Dia + Dias Trabalhados ── */}
            {isCLTMoto && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Remuneração CLT</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Salário Base Contratual (R$)</Label>
                    <Input {...numericField('base_salary')} onBlur={e => { setNum('base_salary', e.target.value); setInssCustomized(false); }} />
                    <p className="text-xs text-muted-foreground mt-0.5">Piso salarial mensal</p>
                  </div>
                  <div>
                    <Label>Valor Dia (R$)</Label>
                    <div className="mt-1 px-3 py-2 rounded-md border border-border bg-muted/30 font-mono text-sm font-semibold text-primary">
                      {formatCurrency(dailyRate)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Salário ÷ 30</p>
                  </div>
                  <div>
                    <Label>Dias Trabalhados</Label>
                    <Input
                      type="number" step="1" min="1" max="31"
                      disabled={readOnly}
                      className="mt-1 font-mono"
                      value={workingDaysWorkedStr}
                      onChange={e => {
                        setWorkingDaysWorkedStr(e.target.value);
                        const n = parseInt(e.target.value);
                        if (!isNaN(n)) setWorkingDaysWorked(n);
                      }}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {defaultWorkingDays < 30 && !entry ? <span className="text-amber-600 font-medium">Auto: {defaultWorkingDays} dias (admissão no mês)</span> : 'Padrão: 30 dias'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-2">
                  <span className="text-xs text-muted-foreground">Salário Efetivo = {formatCurrency(dailyRate)} × {workingDaysWorked} dias</span>
                  <span className="font-mono font-bold text-primary text-lg">{formatCurrency(effectiveSalary)}</span>
                </div>
              </div>
            )}

            {/* Salário padrão (não CLT moto) */}
            {!isCLTMoto && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Salário Base / Valor Fixo</Label>
                  <Input {...numericField('base_salary')} />
                </div>
                <div>
                  <Label>Desconto de Faltas (R$)</Label>
                  {totalDiscount > 0 ? (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 font-mono text-sm font-semibold text-destructive">
                        {formatCurrency(totalDiscount)}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">via Ajuste de Ponto</span>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Preencha os descontos na aba Ajuste de Ponto</p>
                  )}
                </div>
              </div>
            )}

            {isCLTMoto && totalDiscount > 0 && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <span className="text-xs text-destructive font-medium">Desconto de Faltas:</span>
                <span className="font-mono text-xs font-semibold text-destructive">{formatCurrency(totalDiscount)}</span>
                <span className="text-xs text-muted-foreground ml-1">— veja aba Ajuste de Ponto</span>
              </div>
            )}

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Benefícios</p>
            {payrollType && (
              <div className="text-xs px-3 py-1.5 rounded-md bg-accent text-accent-foreground font-medium w-fit">
                Modelo: {{'MOTOCICLISTA_CLT':'Motociclista CLT','MOTOCICLISTA_MEI':'Motociclista MEI','ESCRITORIO':'Escritório','SOCIO':'Sócio'}[payrollType]}
              </div>
            )}

            {show('meal_voucher') && <div>
              <Label>Vale Refeição</Label>
              <div className="flex gap-2 mt-1 items-center">
                <div className="flex-1">
                  <Input {...numericField('meal_voucher_day_value')} className="font-mono" placeholder="Valor/dia" />
                  <p className="text-xs text-muted-foreground mt-0.5">Valor por dia</p>
                </div>
                <span className="text-muted-foreground font-bold text-lg">×</span>
                <div className="w-24">
                  <Input {...numericField('meal_voucher_days')} className="font-mono text-center" />
                  <p className="text-xs text-muted-foreground mt-0.5 text-center">Dias úteis</p>
                </div>
                <span className="text-muted-foreground">=</span>
                <div className="w-32 bg-muted/40 rounded-lg p-2 text-right">
                  <p className="font-mono font-semibold text-primary">{formatCurrency(calc.meal_voucher)}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </div>}

            {show('food_voucher') && (
              <div>
                <Label>Vale Alimentação</Label>
                <Input {...numericField('food_voucher')} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {show('transport_voucher') && <div>
                <Label>Vale Transporte</Label>
                <Input {...numericField('transport_voucher')} />
              </div>}
              {show('km_bonus') && <div className="col-span-2">
                <Label>KM Adicional</Label>
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
                    <p className="font-mono font-semibold text-primary">{formatCurrency(calc.km_bonus || 0)}</p>
                    <p className="text-xs text-muted-foreground">Total KM</p>
                  </div>
                </div>
              </div>}
              {show('km_bonus') && <div>
                <Label>Ajuda de Custo</Label>
                <Input {...numericField('cost_allowance')} />
              </div>}
              {show('motorcycle_rental') && <div>
                <Label>Aluguel da Motocicleta</Label>
                <Input {...numericField('motorcycle_rental')} />
              </div>}
              {show('hazard_pay') && <div>
                <Label>Periculosidade (30% do salário base)</Label>
                <Input
                  {...numericField('hazard_pay')}
                  onFocus={(e) => {
                    if (!readOnly && (form.hazard_pay === 0 || form.hazard_pay === Math.round(effectiveSalary * 0.3 * 100) / 100)) {
                      const auto = Math.round(effectiveSalary * 0.3 * 100) / 100;
                      set('hazard_pay', auto);
                    }
                    setTimeout(() => e.target.select(), 0);
                  }}
                />
                {effectiveSalary > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Auto: {formatCurrency(Math.round(effectiveSalary * 0.3 * 100) / 100)} (30%)
                    {!readOnly && form.hazard_pay !== Math.round(effectiveSalary * 0.3 * 100) / 100 && form.hazard_pay > 0 && <span className="text-amber-600 ml-1">— valor personalizado</span>}
                  </p>
                )}
              </div>}
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
              {show('union_contribution_pct') && <div>
                <Label>Contribuição Assistencial (R$)</Label>
                <Input {...numericField('union_contribution_value')} />
              </div>}
              {show('meal_voucher_discount_pct') && <div>
                <Label>Desconto VR (% sobre total do VR)</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <Input {...numericField('meal_voucher_discount_pct')} className="font-mono" placeholder="%" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.meal_voucher_discount)}</span>
                </div>
              </div>}
              {show('life_insurance') && <div>
                <Label>Seguro de Vida (R$)</Label>
                <Input {...numericField('life_insurance')} />
              </div>}
            </div>

            {(employee.contract_type === 'PJ' || show('pj_retention')) && !['MOTOCICLISTA_CLT','ESCRITORIO'].includes(payrollType) && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Retenções PJ</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Retenção PJ</Label>
                    <Input {...numericField('pj_retention')} />
                  </div>
                </div>
              </>
            )}

            {employee.contract_type === 'CLT' && show('inss') && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">INSS</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>INSS % {isCLTMoto && <span className="text-xs text-primary font-normal">(auto pela tabela)</span>}</Label>
                    <div className="flex gap-2 mt-1 items-center">
                      <Input
                        type="number" step="any" disabled={readOnly}
                        className="font-mono"
                        value={form.inss_pct === 0 ? '' : String(form.inss_pct)}
                        onChange={e => { set('inss_pct', e.target.value); setInssCustomized(true); }}
                        onBlur={e => { setNum('inss_pct', e.target.value); }}
                        onFocus={e => setTimeout(() => e.target.select(), 0)}
                        placeholder="% INSS"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.inss)}</span>
                    </div>
                    {isCLTMoto && effectiveSalary > 0 && (
                      <p className="text-xs text-primary mt-1 font-medium">
                        {(() => { const a = autoInssFromSalary(effectiveSalary); return `Tabela: ${a.pct}% (desc. ${formatCurrency(a.discount)}) — base ${formatCurrency(effectiveSalary)}`; })()}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Desconto INSS (R$)</Label>
                    <div className="flex gap-2 mt-1 items-center">
                      <Input
                        type="number" step="any" disabled={readOnly}
                        className="font-mono"
                        value={form.inss_discount === 0 ? '' : String(form.inss_discount)}
                        onChange={e => { set('inss_discount', e.target.value); setInssCustomized(true); }}
                        onBlur={e => setNum('inss_discount', e.target.value)}
                        onFocus={e => setTimeout(() => e.target.select(), 0)}
                        placeholder="Dedução da tabela"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">líquido: {formatCurrency(calc.inss_net)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            <Separator />
            <div className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-3">
              <div>
                <p className="font-bold text-base">Total Bruto</p>
                <p className="text-xs text-muted-foreground">Antes dos descontos</p>
              </div>
              <p className="font-mono font-bold text-foreground text-xl">{formatCurrency(calc.gross_total)}</p>
            </div>

            {(() => {
              const items = [];
              if (calc.inss_net > 0) items.push({ label: `INSS${form.inss_discount > 0 ? ` (desc. ${formatCurrency(form.inss_discount)})` : ''}`, value: calc.inss_net });
              if (calc.irrf > 0) items.push({ label: 'IRRF', value: calc.irrf });
              if (calc.union_contribution > 0) items.push({ label: 'Contribuição Assistencial', value: calc.union_contribution });
              if (calc.meal_voucher_discount > 0) items.push({ label: `Desconto VR (${form.meal_voucher_discount_pct}%)`, value: calc.meal_voucher_discount });
              if (form.life_insurance > 0) items.push({ label: 'Seguro de Vida', value: form.life_insurance });
              if (items.length === 0) return null;
              const totalDesc = items.reduce((s, i) => s + i.value, 0);
              return (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 space-y-1.5">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-2">Descontos</p>
                  {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-mono text-destructive">- {formatCurrency(item.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t border-destructive/20 pt-1.5 mt-1">
                    <span className="text-destructive">Total Descontos</span>
                    <span className="font-mono text-destructive">- {formatCurrency(totalDesc)}</span>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-3">
              <div>
                <p className="font-bold text-base">Total a Receber</p>
                <p className="text-xs text-muted-foreground">Líquido após todos os descontos</p>
              </div>
              <p className="font-mono font-bold text-primary text-2xl">{formatCurrency(calc.net_total)}</p>
            </div>
          </TabsContent>

          <TabsContent value="quinzenal" className="space-y-5 mt-4">
            <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Base 1ª Quinzena</p>
            {readOnly ? (
              <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.first_period_base ?? calc.net_total / 2)}</p>
            ) : (
              <PeriodBaseInput
                value={calc.net_total !== 0 ? (calc.first_period_base ?? calc.net_total / 2) : (firstBaseOverride ?? 0)}
                onChange={v => {
                  if (calc.net_total !== 0) {
                    setFirstPeriodSplit(v / calc.net_total);
                    setFirstBaseOverride(null);
                  } else {
                    setFirstBaseOverride(v);
                  }
                }}
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">{calc.net_total !== 0 ? `${Math.round(firstPeriodSplit * 100)}% do líquido` : 'valor fixo'}</p>
            </div>
            <div className="bg-muted/30 rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Base 2ª Quinzena</p>
            {readOnly ? (
              <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.second_period_base ?? calc.net_total / 2)}</p>
            ) : (
              <PeriodBaseInput
                value={calc.net_total !== 0 ? (calc.second_period_base ?? calc.net_total / 2) : (firstBaseOverride !== null ? -firstBaseOverride : 0)}
                onChange={v => {
                  if (calc.net_total !== 0) {
                    setFirstPeriodSplit(1 - v / calc.net_total);
                    setFirstBaseOverride(null);
                  } else {
                    setFirstBaseOverride(-v);
                  }
                }}
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">{calc.net_total !== 0 ? `${Math.round((1 - firstPeriodSplit) * 100)}% do líquido` : 'valor fixo'}</p>
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
                  <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.first_period_base ?? calc.net_total / 2)}</span>
                </div>
                {absenceFirst > 0 && (
                  <div className="flex items-center justify-between bg-destructive/10 rounded-lg px-3 py-2">
                    <span className="text-xs text-destructive font-medium">− Desc. Faltas (dias 1–15)</span>
                    <span className="font-mono text-xs font-semibold text-destructive">- {formatCurrency(absenceFirst)}</span>
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
                    <p className="text-xs text-muted-foreground">Descontos: {formatCurrency(firstDiscountTotal + form.first_period_advance + absenceFirst)}</p>
                  </div>
                  <p className="font-mono font-bold text-primary text-lg">{formatCurrency(calc.first_period_net)}</p>
                </div>
              </div>

              {/* 2ª Quinzena */}
              <div className="space-y-3 border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">2ª Quinzena (16–30)</p>
                  <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.second_period_base ?? calc.net_total / 2)}</span>
                </div>
                {show('food_voucher') && form.food_voucher > 0 && (
                   <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                     <span className="text-xs text-secondary font-medium">+ Vale Alimentação (pago na 2ª quinzena)</span>
                     <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(form.food_voucher)}</span>
                   </div>
                 )}
                {absenceSecond > 0 && (
                  <div className="flex items-center justify-between bg-destructive/10 rounded-lg px-3 py-2">
                    <span className="text-xs text-destructive font-medium">− Desc. Faltas (dias 16–31)</span>
                    <span className="font-mono text-xs font-semibold text-destructive">- {formatCurrency(absenceSecond)}</span>
                  </div>
                )}
                {show('km_bonus') && (calc.km_bonus > 0 || form.cost_allowance > 0) && (
                  <div className="space-y-1">
                    {calc.km_bonus > 0 && (
                      <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                        <span className="text-xs text-secondary font-medium">+ KM Adicional ({form.km_bonus_qty} km × {formatCurrency(form.km_bonus_value)})</span>
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
                    <p className="text-xs text-muted-foreground">Descontos: {formatCurrency(secondDiscountTotal + absenceSecond)}</p>
                  </div>
                  <p className="font-mono font-bold text-primary text-lg">{formatCurrency(calc.second_period_net)}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="faltas" className="mt-4">
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
                isMotocyclist={payrollType === 'MOTOCICLISTA_CLT'}
                payrollForm={formForCalc}
              />
            )}
          </TabsContent>

          <TabsContent value="provisao" className="mt-4">
            <ProvisionCalculator
              items={[
                { label: 'Salário Base', value: effectiveSalary },
                { label: 'Vale Refeição', value: calc.meal_voucher },
                { label: 'Vale Alimentação', value: form.food_voucher },
                { label: 'Vale Transporte', value: form.transport_voucher },
                { label: 'KM Adicional', value: calc.km_bonus || 0 },
                { label: 'Ajuda de Custo', value: form.cost_allowance },
                { label: 'Aluguel da Motocicleta', value: form.motorcycle_rental },
                { label: 'Periculosidade', value: form.hazard_pay },
                { label: 'Bonificação / Prêmio', value: form.bonus },
                { label: 'Outros Benefícios', value: form.other_benefits },
              ]}
            />
          </TabsContent>

          <TabsContent value="resumo" className="mt-4">
            <div className="space-y-3">
              {isCLTMoto && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Salário ({dailyRate > 0 ? `${formatCurrency(dailyRate)}/dia × ${workingDaysWorked} dias` : '—'})</span>
                  <span className="font-mono">{formatCurrency(effectiveSalary)}</span>
                </div>
              )}
              {!isCLTMoto && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Salário Base</span>
                  <span className="font-mono">{formatCurrency(form.base_salary)}</span>
                </div>
              )}
              {calc.absence_discount > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Desc. Faltas</span>
                  <span className="font-mono text-destructive">- {formatCurrency(calc.absence_discount)}</span>
                </div>
              )}
              {calc.meal_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Refeição</span><span className="font-mono">{formatCurrency(calc.meal_voucher)}</span></div>}
              {show('food_voucher') && form.food_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Alimentação</span><span className="font-mono">{formatCurrency(form.food_voucher)}</span></div>}
              {form.transport_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Transporte</span><span className="font-mono">{formatCurrency(form.transport_voucher)}</span></div>}
              {show('km_bonus') && calc.km_bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">KM Adicional</span><span className="font-mono">{formatCurrency(calc.km_bonus)}</span></div>}
              {show('km_bonus') && form.cost_allowance > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Ajuda de Custo</span><span className="font-mono">{formatCurrency(form.cost_allowance)}</span></div>}
              {form.motorcycle_rental > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Aluguel da Motocicleta</span><span className="font-mono">{formatCurrency(form.motorcycle_rental)}</span></div>}
              {form.hazard_pay > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Periculosidade</span><span className="font-mono">{formatCurrency(form.hazard_pay)}</span></div>}
              {form.bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Bonificação</span><span className="font-mono">{formatCurrency(form.bonus)}</span></div>}
              {form.other_benefits > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Outros</span><span className="font-mono">{formatCurrency(form.other_benefits)}</span></div>}
              <div className="flex justify-between items-center py-2 border-b border-border font-semibold">
                <span>Total Bruto</span>
                <span className="font-mono">{formatCurrency(calc.gross_total)}</span>
              </div>
              {employee.contract_type === 'CLT' && <>
                {calc.inss > 0 && <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-destructive">INSS ({form.inss_pct}%{form.inss_discount > 0 ? `, desc. ${formatCurrency(form.inss_discount)}` : ''})</span>
                  <span className="font-mono text-destructive">- {formatCurrency(calc.inss_net)}</span>
                </div>}
                {calc.irrf > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">IRRF</span><span className="font-mono text-destructive">- {formatCurrency(calc.irrf)}</span></div>}
              </>}
              {form.pj_retention > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Retenção PJ</span><span className="font-mono text-destructive">- {formatCurrency(form.pj_retention)}</span></div>}
              {calc.union_contribution > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Contribuição Assistencial</span><span className="font-mono text-destructive">- {formatCurrency(calc.union_contribution)}</span></div>}
              {calc.meal_voucher_discount > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Desconto VR ({form.meal_voucher_discount_pct}%)</span><span className="font-mono text-destructive">- {formatCurrency(calc.meal_voucher_discount)}</span></div>}
              {form.life_insurance > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Seguro de Vida</span><span className="font-mono text-destructive">- {formatCurrency(form.life_insurance)}</span></div>}
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

        <div className="px-6 pt-4 border-t border-border bg-background shrink-0">
          {!readOnly && (
            <div className="mb-3">
              <Label className="text-xs">Observação (aparece no PDF)</Label>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={2}
                placeholder="Observação informativa para o recibo..."
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>
          )}
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