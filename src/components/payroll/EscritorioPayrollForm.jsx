import { useState, useEffect, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator } from 'lucide-react';
import { calculateEscritorioPayroll, formatCurrency, getMonthName, getWorkingDaysInMonth, getWorkingDaysFromDate } from '@/lib/payrollCalculations';
import PeriodDiscountsTable from './PeriodDiscountsTable';
import InstallmentDialog from './InstallmentDialog';
import AbsenceDiscountsTable, { totalAbsenceDiscount, absenceDiscountByPeriod } from './AbsenceDiscountsTable';
import ProvisionCalculator from './ProvisionCalculator';
import { base44 } from '@/api/base44Client';

// Componentes extraídos para FORA do componente pai para evitar perda de foco ao redigitar
function NumInput({ value, onChange, disabled, className = '', step = '0.01', min, placeholder }) {
  const [local, setLocal] = useState(null);
  const externalVal = value ?? 0;
  const displayVal = local !== null ? local : (externalVal === 0 ? '' : String(externalVal));
  return (
    <Input
      className={`font-mono ${className}`}
      type="number"
      step={step}
      min={min}
      placeholder={placeholder}
      value={displayVal}
      disabled={disabled}
      onFocus={e => {
        setLocal(externalVal === 0 ? '' : String(externalVal));
        setTimeout(() => e.target.select(), 0);
      }}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => {
        const parsed = parseFloat(e.target.value);
        onChange(isNaN(parsed) ? 0 : parsed);
        setLocal(null);
      }}
    />
  );
}

function FormRow({ label, hint, children }) {
  return (
    <div>
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

function CalcRow({ label, value }) {
  return (
    <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold text-primary">{formatCurrency(value)}</span>
    </div>
  );
}

export default function EscritorioPayrollForm({ employee, entry, referenceMonth, onSave, onClose, readOnly = false, jobRole = null }) {
  const workingDays = getWorkingDaysInMonth(referenceMonth);
  // Dias úteis para VR: proporcional se admissão ocorreu neste mês
  const vrWorkingDays = (() => {
    if (employee?.admission_date && employee.admission_date.slice(0, 7) === referenceMonth) {
      return getWorkingDaysFromDate(employee.admission_date, referenceMonth);
    }
    return workingDays;
  })();

  const [form, setForm] = useState({
    company_id: employee.company_id,
    // Convenção Coletiva
    base_salary: entry?.base_salary ?? 0,
    meal_voucher_day_value: entry?.meal_voucher_day_value ?? 0,
    meal_voucher_days: entry?.meal_voucher_days ?? vrWorkingDays,
    transport_voucher_day_value: entry?.transport_voucher_day_value ?? 0,
    transport_voucher_days: entry?.transport_voucher_days ?? workingDays,
    transport_voucher_discount_pct: entry?.transport_voucher_discount_pct ?? 0,
    meal_voucher_discount_pct: entry?.meal_voucher_discount_pct ?? 0,
    inss_pct: entry?.inss_pct ?? 0,
    inss_deduction: entry?.inss_deduction ?? 0,
    // Bonificação Extra (soma ao salário base — rateado nas quinzenas)
    extra_bonus: entry?.extra_bonus ?? 0,
    // Bonificação
    bonus: entry?.bonus ?? 0,
    attendance_bonus: entry?.attendance_bonus ?? 0,
    // Outros Benefícios
    dental_plan: entry?.dental_plan ?? 0,
    food_voucher: entry?.food_voucher ?? 0,
    birthday_bonus: entry?.birthday_bonus ?? 0,
    // Geral
    first_period_advance: entry?.first_period_advance ?? 0,
    notes: entry?.notes ?? '',
  });

  // Auto-preenche Bonificação de Aniversário (R$ 200) se o mês da folha = mês de nascimento
  // Só aplica quando a folha ainda não tem valor salvo (entry sem birthday_bonus)
  useEffect(() => {
    if (readOnly) return;
    if (entry?.birthday_bonus !== undefined && entry?.birthday_bonus !== null) return; // já tem valor salvo
    if (!employee.birth_date) return;
    const birthMonth = employee.birth_date.split('-')[1]; // "MM"
    const refMonth = referenceMonth.split('-')[1];         // "MM"
    if (birthMonth === refMonth) {
      setForm(f => ({ ...f, birthday_bonus: 200 }));
    }
  }, [employee.birth_date, referenceMonth, readOnly]);

  const [firstDiscounts, setFirstDiscounts] = useState(entry?.first_discounts ?? []);
  const [secondDiscounts, setSecondDiscounts] = useState(entry?.second_discounts ?? []);
  const [installmentDialog, setInstallmentDialog] = useState(null);

  // Rateio quinzenal: proporção da 1ª quinzena (padrão 0.5 = 50%)
  const [firstPeriodSplit, setFirstPeriodSplit] = useState(entry?.first_period_split ?? 0.5);
  const [firstBaseRaw, setFirstBaseRaw] = useState(null);
  const [secondBaseRaw, setSecondBaseRaw] = useState(null);
  const [pointAdjustments, setPointAdjustments] = useState([]);
  const [absenceDiscounts, setAbsenceDiscounts] = useState(entry?.absence_discounts ?? {});

  // Carregar ajustes de ponto expandidos por dia
  useEffect(() => {
    if (!employee.tangerino_id) return;
    const [year, month] = referenceMonth.split('-').map(Number);
    const start = `${referenceMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${referenceMonth}-${String(lastDay).padStart(2, '0')}`;
    
    base44.entities.PointAdjustment.filter({ employee_tangerino_id: Number(employee.tangerino_id) }).then(all => {
      // Filtra ajustes que se sobrepõem ao mês OU ao mês anterior/próximo
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      
      // Expande intervalo para incluir mês anterior e próximo (para capturar faltas que impactam múltiplos períodos)
      const prevMonthStart = new Date(year, month - 2, 1);
      const nextMonthEnd = new Date(year, month + 1, 0);
      
      const overlapping = all.filter(a => {
        const adjStart = new Date(a.start_date);
        const adjEnd = new Date(a.end_date);
        return adjEnd >= prevMonthStart && adjStart <= nextMonthEnd;
      });
      
      // Expande cada ajuste para cada dia do seu período
      const expanded = [];
      for (const adj of overlapping) {
        const adjStart = new Date(adj.start_date);
        const adjEnd = new Date(adj.end_date);
        let current = new Date(adjStart);
        
        while (current <= adjEnd) {
          expanded.push({
            ...adj,
            date: current.toISOString().split('T')[0],
          });
          current.setDate(current.getDate() + 1);
        }
      }
      
      // Filtra apenas dias do mês de referência
      const forMonth = expanded.filter(a => a.date >= start && a.date <= end);
      forMonth.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      
      setPointAdjustments(forMonth);
    });
  }, [employee.tangerino_id, referenceMonth]);

  // Carregar CashOuts
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

  const set = (k, v) => { if (!readOnly) setForm(f => ({ ...f, [k]: v })); };

  // Helper: conecta NumInput ao form state por field name
  const numInputProps = (field, extra = {}) => ({
    value: form[field] ?? 0,
    disabled: readOnly,
    onChange: v => set(field, v),
    ...extra,
  });

  // crédito reduz o total de desconto, débito aumenta
  const firstDiscountTotal = firstDiscounts.reduce((s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0), 0);
  const secondDiscountTotal = secondDiscounts.reduce((s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0), 0);
  const totalDiscount = totalAbsenceDiscount(absenceDiscounts);
  const { first: absenceFirst, second: absenceSecond } = absenceDiscountByPeriod(absenceDiscounts);

  const calcForm = { ...form, absence_discount: totalDiscount, absence_discount_first: absenceFirst, absence_discount_second: absenceSecond, first_period_discount: firstDiscountTotal, second_period_discount: secondDiscountTotal, first_period_split: firstPeriodSplit };
  const calc = calculateEscritorioPayroll(calcForm);

  // Total a Pagar = Líquido Convenção + Outros Benefícios + líquido quinzenal (créditos - débitos - adiantamento)
  const quinzenalLiquido = -firstDiscountTotal - secondDiscountTotal - (form.first_period_advance || 0);
  const totalAPagar = calc.liquido_convencao + calc.total_outros_beneficios + quinzenalLiquido;

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
      // campos calculados
      extra_bonus: form.extra_bonus,
      bonus: form.bonus,
      attendance_bonus: form.attendance_bonus,
      meal_voucher: calc.meal_voucher,
      transport_voucher: calc.transport_voucher,
      meal_voucher_discount: calc.meal_voucher_discount,
      inss: calc.inss,
      inss_pct: form.inss_pct,
      inss_deduction: form.inss_deduction,
      fgts: calc.fgts,
      irrf: calc.irrf,
      gross_total: calc.gross_total,
      net_total: calc.net_total,
      absence_discount: totalDiscount,
      absence_discounts: absenceDiscounts,
      absence_discount_first: absenceFirst,
      absence_discount_second: absenceSecond,
      first_period_discount: firstDiscountTotal,
      second_period_discount: secondDiscountTotal,
      first_discounts: firstDiscounts,
      second_discounts: secondDiscounts,
      first_period_base: calc.first_period_base,
      second_period_base: calc.second_period_base,
      first_period_net: calc.first_period_net,
      second_period_net: calc.second_period_net,
      first_period_split: firstPeriodSplit,
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
              <Badge variant="default">{employee.contract_type}</Badge>
              <Badge variant="outline" className="text-xs">Escritório</Badge>
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

          <Tabs defaultValue="convencao">
            <TabsList className="grid grid-cols-5 w-full mt-4">
              <TabsTrigger value="convencao">Proventos</TabsTrigger>
              <TabsTrigger value="quinzenal">Quinzenal</TabsTrigger>
              <TabsTrigger value="ajuste_ponto">
                Ajuste de Ponto {pointAdjustments.length > 0 && (
                  <span className="ml-1 bg-destructive text-destructive-foreground text-xs rounded-full px-1.5">{pointAdjustments.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="provisao" className="gap-1.5">
                <Calculator className="w-3.5 h-3.5" /> Provisão
              </TabsTrigger>
            </TabsList>

            {/* ── ABA: Convenção Coletiva ── */}
            <TabsContent value="convencao" className="space-y-4 mt-4">
              {readOnly && (
                <div className="bg-muted/50 border border-border rounded-lg px-4 py-2 text-sm text-muted-foreground">
                  Modo visualização — nenhuma alteração pode ser realizada.
                </div>
              )}

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Proventos</p>
              <div className="grid grid-cols-2 gap-4">
                <FormRow label="Piso Salarial" hint="Valor bruto do salário base">
                  <NumInput {...numInputProps('base_salary')} />
                </FormRow>
                <FormRow label="Bonificação Extra" hint="Somado ao salário — rateado nas quinzenas">
                  <NumInput {...numInputProps('extra_bonus')} />
                </FormRow>
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

              <div>
                <Label>Vale Refeição</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <div className="flex-1">
                    <NumInput {...numInputProps('meal_voucher_day_value', { placeholder: 'Valor/dia' })} />
                    <p className="text-xs text-muted-foreground mt-0.5">Valor por dia trabalhado</p>
                  </div>
                  <span className="text-muted-foreground font-bold text-lg">×</span>
                  <div className="w-24">
                    <NumInput {...numInputProps('meal_voucher_days', { step: '1', min: '0', className: 'text-center' })} />
                    <p className="text-xs text-muted-foreground mt-0.5 text-center">
                      {!entry && employee?.admission_date?.slice(0, 7) === referenceMonth ? 'Dias (admissão)' : 'Dias úteis'}
                    </p>
                  </div>
                  <span className="text-muted-foreground">=</span>
                  <div className="w-32 bg-muted/40 rounded-lg p-2 text-right">
                    <p className="font-mono font-semibold text-primary">{formatCurrency(calc.meal_voucher)}</p>
                    <p className="text-xs text-muted-foreground">Total VR</p>
                  </div>
                </div>
              </div>

              <CalcRow label="Total Custos Convenção Coletiva" value={calc.total_convencao} />

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Outros Benefícios</p>
              <div className="grid grid-cols-2 gap-4">
                <FormRow label="Seguro Odontológico">
                  <NumInput {...numInputProps('dental_plan')} />
                </FormRow>
                <FormRow label="Vale Alimentação">
                  <NumInput {...numInputProps('food_voucher')} />
                </FormRow>
              </div>

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bonificações (adicionadas diretamente na 2ª quinzena — não somam ao bruto)</p>
              <div className="grid grid-cols-2 gap-4">
                <FormRow label="Bonificação de Produtividade" hint="Adicionado diretamente na 2ª quinzena">
                  <NumInput {...numInputProps('bonus')} />
                </FormRow>
                <FormRow label="Bonificação por Presença" hint="Adicionado diretamente na 2ª quinzena">
                  <NumInput {...numInputProps('attendance_bonus')} />
                </FormRow>
                <FormRow label="Bonificação de Aniversário" hint="Adicionado diretamente na 2ª quinzena">
                  <NumInput {...numInputProps('birthday_bonus')} />
                </FormRow>
              </div>

              <div>
                <Label>Vale Transporte</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <div className="flex-1">
                    <NumInput {...numInputProps('transport_voucher_day_value', { placeholder: 'Valor/dia' })} />
                    <p className="text-xs text-muted-foreground mt-0.5">Valor por dia trabalhado</p>
                  </div>
                  <span className="text-muted-foreground font-bold text-lg">×</span>
                  <div className="w-24">
                    <NumInput {...numInputProps('transport_voucher_days', { step: '1', min: '0', className: 'text-center' })} />
                    <p className="text-xs text-muted-foreground mt-0.5 text-center">Dias úteis</p>
                  </div>
                  <span className="text-muted-foreground">=</span>
                  <div className="w-32 bg-muted/40 rounded-lg p-2 text-right">
                    <p className="font-mono font-semibold text-primary">{formatCurrency(calc.transport_voucher)}</p>
                    <p className="text-xs text-muted-foreground">Total VT</p>
                  </div>
                </div>
              </div>
              <CalcRow label="Total Outros Benefícios" value={calc.total_outros_beneficios} />

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descontos Convenção</p>

              <div className="grid grid-cols-2 gap-4">
                <FormRow label="Desconto Vale Transporte (%)" hint="% sobre o valor do vale transporte">
                  <div className="flex gap-2 items-center">
                    <NumInput {...numInputProps('transport_voucher_discount_pct', { min: '0', placeholder: '%' })} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.transport_voucher_discount)}</span>
                  </div>
                </FormRow>
                <FormRow label="Desconto Vale Refeição (%)" hint="% sobre o valor do vale refeição">
                  <div className="flex gap-2 items-center">
                    <NumInput {...numInputProps('meal_voucher_discount_pct', { min: '0', placeholder: '%' })} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.meal_voucher_discount)}</span>
                  </div>
                </FormRow>
                <FormRow label="Desconto INSS (%)" hint="% calculado sobre o piso salarial">
                  <div className="flex gap-2 items-center">
                    <NumInput {...numInputProps('inss_pct', { min: '0', placeholder: '%' })} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.inss)}</span>
                  </div>
                </FormRow>
                <FormRow label="Dedução INSS (R$)" hint="Valor a subtrair do desconto INSS bruto">
                  <div className="flex gap-2 items-center">
                    <NumInput {...numInputProps('inss_deduction', { min: '0', placeholder: 'R$' })} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">líq. {formatCurrency(calc.inss_net)}</span>
                  </div>
                </FormRow>
              </div>

              <div className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-3">
                <div>
                  <p className="font-bold text-base">Total Bruto Convenção</p>
                  <p className="text-xs text-muted-foreground">Piso salarial + VR{form.extra_bonus > 0 ? ' + Bonificação Extra' : ''}</p>
                </div>
                <p className="font-mono font-bold text-foreground text-xl">{formatCurrency(calc.gross_total)}</p>
              </div>

              <div className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-3">
                <div>
                  <p className="font-bold text-base">Líquido Convenção</p>
                  <p className="text-xs text-muted-foreground">Bruto convenção − descontos convenção</p>
                </div>
                <p className="font-mono font-bold text-foreground text-xl">{formatCurrency(calc.net_total)}</p>
              </div>

              <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-4 py-3">
                <div>
                  <p className="font-bold text-base">Total Outros Benefícios</p>
                  <p className="text-xs text-muted-foreground">VT + Odontológico + VA + Aniversário</p>
                </div>
                <p className="font-mono font-bold text-secondary text-xl">{formatCurrency(calc.total_outros_beneficios)}</p>
              </div>
            </TabsContent>

            {/* ── ABA: Quinzenal ── */}
            <TabsContent value="quinzenal" className="space-y-5 mt-4">
              {/* Rateio editável */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">Base 1ª Quinzena</p>
                  {readOnly ? (
                    <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.first_period_base ?? calc.net_total / 2)}</p>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      className="font-mono font-bold text-lg h-9"
                      value={firstBaseRaw !== null ? firstBaseRaw : (calc.first_period_base ?? calc.net_total / 2)}
                      onChange={e => setFirstBaseRaw(e.target.value)}
                      onBlur={e => {
                        const v = parseFloat(e.target.value);
                        const val = isNaN(v) ? 0 : v;
                        if (calc.net_total !== 0) setFirstPeriodSplit(val / calc.net_total);
                        setFirstBaseRaw(null);
                      }}
                      onFocus={e => {
                        setFirstBaseRaw(String(calc.first_period_base ?? calc.net_total / 2));
                        setTimeout(() => e.target.select(), 0);
                      }}
                    />
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{Math.round(firstPeriodSplit * 100)}% do líquido</p>
                </div>
                <div className="bg-muted/30 rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">Base 2ª Quinzena</p>
                  {readOnly ? (
                    <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.second_period_base ?? calc.net_total / 2)}</p>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      className="font-mono font-bold text-lg h-9"
                      value={secondBaseRaw !== null ? secondBaseRaw : (calc.second_period_base ?? calc.net_total / 2)}
                      onChange={e => setSecondBaseRaw(e.target.value)}
                      onBlur={e => {
                        const v = parseFloat(e.target.value);
                        const val = isNaN(v) ? 0 : v;
                        if (calc.net_total !== 0) setFirstPeriodSplit(1 - val / calc.net_total);
                        setSecondBaseRaw(null);
                      }}
                      onFocus={e => {
                        setSecondBaseRaw(String(calc.second_period_base ?? calc.net_total / 2));
                        setTimeout(() => e.target.select(), 0);
                      }}
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
                    <NumInput {...numInputProps('first_period_advance', { className: 'mt-1 h-8 text-sm' })} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Descontos da 1ª Quinzena</p>
                    <PeriodDiscountsTable items={firstDiscounts} onChange={readOnly ? () => {} : setFirstDiscounts} readOnly={readOnly} onOpenInstallment={readOnly ? undefined : () => setInstallmentDialog('first')} />
                  </div>
                  <div className={`${calc.first_period_net < 0 ? 'bg-destructive/10' : 'bg-primary/10'} rounded-lg px-4 py-3 flex justify-between items-center`}>
                    <div>
                      <p className="text-xs text-muted-foreground">{calc.first_period_net < 0 ? 'Saldo Negativo 1ª Quinzena' : 'Á Receber 1ª Quinzena'}</p>
                      <p className="text-xs text-muted-foreground">Descontos: {formatCurrency(firstDiscountTotal + form.first_period_advance + absenceFirst)}</p>
                    </div>
                    <p className={`font-mono font-bold text-lg ${calc.first_period_net < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(calc.first_period_net)}</p>
                  </div>
                </div>

                <div className="space-y-3 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">2ª Quinzena (16–30)</p>
                    <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.second_period_base ?? calc.net_total / 2)}</span>
                  </div>
                  {form.food_voucher > 0 && (
                    <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                      <span className="text-xs text-secondary font-medium">+ Vale Alimentação</span>
                      <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(form.food_voucher)}</span>
                    </div>
                  )}
                  {form.bonus > 0 && (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span className="text-xs text-green-700 font-medium">+ Bonificação de Produtividade</span>
                      <span className="font-mono text-xs font-semibold text-green-700">+ {formatCurrency(form.bonus)}</span>
                    </div>
                  )}
                  {form.attendance_bonus > 0 && (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span className="text-xs text-green-700 font-medium">+ Bonificação por Presença</span>
                      <span className="font-mono text-xs font-semibold text-green-700">+ {formatCurrency(form.attendance_bonus)}</span>
                    </div>
                  )}
                  {form.birthday_bonus > 0 && (
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="text-xs text-amber-700 font-medium">+ Bonificação de Aniversário</span>
                      <span className="font-mono text-xs font-semibold text-amber-700">+ {formatCurrency(form.birthday_bonus)}</span>
                    </div>
                  )}
                  {absenceSecond > 0 && (
                    <div className="flex items-center justify-between bg-destructive/10 rounded-lg px-3 py-2">
                      <span className="text-xs text-destructive font-medium">− Desc. Faltas (dias 16–31)</span>
                      <span className="font-mono text-xs font-semibold text-destructive">- {formatCurrency(absenceSecond)}</span>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Descontos da 2ª Quinzena</p>
                    <PeriodDiscountsTable items={secondDiscounts} onChange={readOnly ? () => {} : setSecondDiscounts} readOnly={readOnly} onOpenInstallment={readOnly ? undefined : () => setInstallmentDialog('second')} />
                  </div>
                  <div className={`${calc.second_period_net < 0 ? 'bg-destructive/10' : 'bg-primary/10'} rounded-lg px-4 py-3 flex justify-between items-center`}>
                    <div>
                      <p className="text-xs text-muted-foreground">{calc.second_period_net < 0 ? 'Saldo Negativo 2ª Quinzena' : 'Á Receber 2ª Quinzena'}</p>
                      <p className="text-xs text-muted-foreground">Descontos: {formatCurrency(secondDiscountTotal + absenceSecond)}</p>
                    </div>
                    <p className={`font-mono font-bold text-lg ${calc.second_period_net < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(calc.second_period_net)}</p>
                  </div>
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
                  payrollForm={form}
                />
              )}
            </TabsContent>

            {/* ── ABA: Resumo ── */}
            <TabsContent value="resumo" className="mt-4">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Convenção Coletiva</p>
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Piso Salarial</span>
                  <span className="font-mono">{formatCurrency(form.base_salary)}</span>
                </div>
                {form.extra_bonus > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Bonificação Extra</span>
                    <span className="font-mono">{formatCurrency(form.extra_bonus)}</span>
                  </div>
                )}
                {calc.meal_voucher > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Vale Refeição ({form.meal_voucher_days}d × {formatCurrency(form.meal_voucher_day_value)})</span>
                    <span className="font-mono">{formatCurrency(calc.meal_voucher)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-border font-semibold">
                  <span>Total Custos Convenção</span>
                  <span className="font-mono">{formatCurrency(calc.total_convencao)}</span>
                </div>
                {calc.transport_voucher_discount > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-destructive">Desconto VT ({form.transport_voucher_discount_pct}%)</span>
                    <span className="font-mono text-destructive">- {formatCurrency(calc.transport_voucher_discount)}</span>
                  </div>
                )}
                {calc.meal_voucher_discount > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-destructive">Desconto VR ({form.meal_voucher_discount_pct}%)</span>
                    <span className="font-mono text-destructive">- {formatCurrency(calc.meal_voucher_discount)}</span>
                  </div>
                )}
                {calc.inss_net > 0 && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-destructive">INSS ({form.inss_pct}%{form.inss_deduction > 0 ? ` − ded. ${formatCurrency(form.inss_deduction)}` : ''})</span>
                    <span className="font-mono text-destructive">- {formatCurrency(calc.inss_net)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-border font-semibold text-primary">
                  <span>A Receber (líquido conv.)</span>
                  <span className="font-mono">{formatCurrency(calc.liquido_convencao)}</span>
                </div>

                <Separator className="my-2" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Outros Benefícios</p>
                {form.dental_plan > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Seguro Odontológico</span><span className="font-mono">{formatCurrency(form.dental_plan)}</span></div>}
                {calc.transport_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Transporte ({form.transport_voucher_days}d × {formatCurrency(form.transport_voucher_day_value)})</span><span className="font-mono">{formatCurrency(calc.transport_voucher)}</span></div>}
                {form.food_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Alimentação</span><span className="font-mono">{formatCurrency(form.food_voucher)}</span></div>}
                {form.bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Bonificação de Produtividade</span><span className="font-mono">{formatCurrency(form.bonus)}</span></div>}
                {form.attendance_bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Bonificação por Presença</span><span className="font-mono text-green-600">{formatCurrency(form.attendance_bonus)}</span></div>}
                {form.birthday_bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Bonificação Aniversário</span><span className="font-mono text-amber-600">{formatCurrency(form.birthday_bonus)}</span></div>}
                {calc.total_outros_beneficios > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-border font-semibold">
                    <span>Total Outros Benefícios</span>
                    <span className="font-mono">{formatCurrency(calc.total_outros_beneficios)}</span>
                  </div>
                )}

                <Separator className="my-2" />
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

                <div className="flex justify-between items-center py-2 border-b border-border font-semibold">
                  <span>Total Outros Benefícios</span>
                  <span className="font-mono text-secondary">{formatCurrency(calc.total_outros_beneficios)}</span>
                </div>

                <div className="flex justify-between items-center py-3 bg-primary/10 rounded-lg px-3">
                  <span className="font-bold text-lg">Total a Pagar</span>
                  <span className="font-mono font-bold text-primary text-xl">{formatCurrency(totalAPagar)}</span>
                </div>

                <div className="border border-border rounded-lg px-4 py-2 flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">FGTS (8%) — informativo</span>
                  <span className="font-mono font-semibold text-secondary">{formatCurrency(calc.fgts)}</span>
                </div>
              </div>
            </TabsContent>
            {/* ── ABA: Calculadora de Provisão ── */}
            <TabsContent value="provisao" className="mt-4">
              <ProvisionCalculator
                items={[
                  { label: 'Piso Salarial', value: form.base_salary },
                  { label: 'Vale Refeição', value: calc.meal_voucher },
                  { label: 'Vale Transporte', value: calc.transport_voucher },
                  { label: 'Seguro Odontológico', value: form.dental_plan },
                  { label: 'Vale Alimentação', value: form.food_voucher },
                ]}
              />
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