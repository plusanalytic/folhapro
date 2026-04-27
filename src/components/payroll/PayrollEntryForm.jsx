import { useState, useEffect } from 'react';
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
import AbsenceDiscountsTable, { totalAbsenceDiscount } from './AbsenceDiscountsTable';
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

export default function PayrollEntryForm({ employee, entry, referenceMonth, onSave, onClose, readOnly = false, jobRole = null }) {
  const workingDays = getWorkingDaysInMonth(referenceMonth);
  const payrollType = jobRole?.payroll_type || null;
  const show = (field) => isFieldVisible(payrollType, field);

  const [form, setForm] = useState({
    company_id: employee.company_id,
    base_salary: entry?.base_salary ?? 0,
    absences_days: entry?.absences_days ?? 0,
    meal_voucher_day_value: entry?.meal_voucher_day_value ?? 0,
    meal_voucher_days: entry?.meal_voucher_days ?? workingDays,
    food_voucher: entry?.food_voucher ?? 0,
    transport_voucher: entry?.transport_voucher ?? 0,
    km_bonus: entry?.km_bonus ?? 0,
    motorcycle_rental: entry?.motorcycle_rental ?? 0,
    hazard_pay: entry?.hazard_pay ?? 0,
    bonus: entry?.bonus ?? 0,
    other_benefits: entry?.other_benefits ?? 0,
    union_contribution_pct: entry?.union_contribution_pct ?? 0,
    meal_voucher_discount_pct: entry?.meal_voucher_discount_pct ?? 0,
    life_insurance: entry?.life_insurance ?? 0,
    inss_pct: entry?.inss_pct ?? 0,
    inss_discount: entry?.inss_discount ?? 0,
    pj_retention: entry?.pj_retention ?? 0,
    first_period_advance: entry?.first_period_advance ?? 0,
    notes: entry?.notes ?? '',
  });

  // Descontos quinzenais (lista de {date, description, amount, id})
  const [firstDiscounts, setFirstDiscounts] = useState(entry?.first_discounts ?? []);
  const [secondDiscounts, setSecondDiscounts] = useState(entry?.second_discounts ?? []);

  // Parcelas
  const [installmentDialog, setInstallmentDialog] = useState(null); // 'first' | 'second' | null

  // Ajustes de ponto (faltas) do colaborador no mês
  const [pointAdjustments, setPointAdjustments] = useState([]);
  // Mapa de desconto por ajuste: { [tangerino_id_do_ajuste]: valor }
  const [absenceDiscounts, setAbsenceDiscounts] = useState(entry?.absence_discounts ?? {});

  useEffect(() => {
    if (!employee.tangerino_id) return;
    // Busca ajustes que se sobrepõem ao mês de referência (inclui mês anterior e próximo)
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
      forMonth.sort((a, b) => (a.adjustment_reason_description || '').localeCompare(b.adjustment_reason_description || '', 'pt-BR'));
      
      setPointAdjustments(forMonth);
    });
  }, [employee.tangerino_id, referenceMonth]);

  // Carregar CashOuts do colaborador no mês
  useEffect(() => {
    base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: referenceMonth }).then(cashOuts => {
      const fromCashFirst = cashOuts.filter(c => c.period === 'first').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));
      const fromCashSecond = cashOuts.filter(c => c.period === 'second').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));
      // Mescla: mantém manuais já existentes + CashOuts (evita duplicatas por id)
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

  const set = (k, v) => { if (!readOnly) setForm(f => ({ ...f, [k]: v })); };
  const setNum = (k, v) => set(k, parseFloat(v) || 0);

  // crédito reduz o total de desconto, débito aumenta
  const firstDiscountTotal = firstDiscounts.reduce((s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0), 0);
  const secondDiscountTotal = secondDiscounts.reduce((s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0), 0);

  // Total desconto faltas vindo dos ajustes de ponto (nova estrutura multi-coluna)
  const totalDiscount = totalAbsenceDiscount(absenceDiscounts);

  const calcForm = { ...form, absence_discount: totalDiscount, first_period_discount: firstDiscountTotal, second_period_discount: secondDiscountTotal };
  const calc = calculatePayroll(calcForm, employee.contract_type);

  const handleInstallmentConfirm = async ({ description, installmentValue, startDate, preview, installments }) => {
    const isFirst = installmentDialog === 'first';

    // 1ª parcela: adiciona ao desconto da quinzena atual
    const firstEntry = { date: startDate, description: `${description} (1/${installments})`, amount: installmentValue, id: Date.now() };
    if (isFirst) setFirstDiscounts(prev => [...prev, firstEntry]);
    else setSecondDiscounts(prev => [...prev, firstEntry]);

    // Parcelas seguintes: cria CashOuts nos meses posteriores
    for (let i = 1; i < preview.length; i++) {
      const p = preview[i];
      const [y, m] = p.month.split('-').map(Number);
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
      ...calc,
      meal_voucher_day_value: form.meal_voucher_day_value,
      meal_voucher_days: form.meal_voucher_days,
      meal_voucher: calc.meal_voucher,
      food_voucher: form.food_voucher,
      union_contribution: calc.union_contribution,
      meal_voucher_discount: calc.meal_voucher_discount,
      inss_pct: form.inss_pct,
      inss_discount: form.inss_discount,
      inss: calc.inss_net,
      absence_discount: totalDiscount,
      absence_discounts: absenceDiscounts,
      first_period_discount: firstDiscountTotal,
      second_period_discount: secondDiscountTotal,
      first_discounts: firstDiscounts,
      second_discounts: secondDiscounts,
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
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="proventos">Proventos</TabsTrigger>
            <TabsTrigger value="quinzenal">Quinzenal</TabsTrigger>
            <TabsTrigger value="faltas">
              Ajuste de Ponto {pointAdjustments.length > 0 && <span className="ml-1 bg-destructive text-destructive-foreground text-xs rounded-full px-1.5">{pointAdjustments.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
          </TabsList>

          <TabsContent value="proventos" className="space-y-4 mt-4">
            {readOnly && (
              <div className="bg-muted/50 border border-border rounded-lg px-4 py-2 text-sm text-muted-foreground">
                Modo visualização — nenhuma alteração pode ser realizada.
              </div>
            )}
            {/* Salário e Faltas */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Salário Base / Valor Fixo</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.base_salary} onChange={e => setNum('base_salary', e.target.value)} disabled={readOnly} />
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

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Benefícios</p>
            {payrollType && (
              <div className="text-xs px-3 py-1.5 rounded-md bg-accent text-accent-foreground font-medium w-fit">
                Modelo: {{'MOTOCICLISTA_CLT':'Motociclista CLT','MOTOCICLISTA_MEI':'Motociclista MEI','ESCRITORIO':'Escritório','SOCIO':'Sócio'}[payrollType]}
              </div>
            )}

            {/* Vale Refeição com valor dia + dias */}
            {show('meal_voucher') && <div>
              <Label>Vale Refeição</Label>
              <div className="flex gap-2 mt-1 items-center">
                <div className="flex-1">
                  <Input className="font-mono" type="number" step="0.01" placeholder="Valor/dia" value={form.meal_voucher_day_value} onChange={e => setNum('meal_voucher_day_value', e.target.value)} disabled={readOnly} />
                  <p className="text-xs text-muted-foreground mt-0.5">Valor por dia</p>
                </div>
                <span className="text-muted-foreground font-bold text-lg">×</span>
                <div className="w-24">
                  <Input className="font-mono text-center" type="number" step="1" min="0" value={form.meal_voucher_days} onChange={e => setNum('meal_voucher_days', e.target.value)} disabled={readOnly} />
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
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.food_voucher} onChange={e => setNum('food_voucher', e.target.value)} disabled={readOnly} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {show('transport_voucher') && <div>
                <Label>Vale Transporte</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.transport_voucher} onChange={e => setNum('transport_voucher', e.target.value)} disabled={readOnly} />
              </div>}
              {show('km_bonus') && <div>
                <Label>Adicional KM</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.km_bonus} onChange={e => setNum('km_bonus', e.target.value)} disabled={readOnly} />
              </div>}
              {show('motorcycle_rental') && <div>
                <Label>Aluguel da Motocicleta</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.motorcycle_rental} onChange={e => setNum('motorcycle_rental', e.target.value)} disabled={readOnly} />
              </div>}
              {show('hazard_pay') && <div>
                <Label>Periculosidade</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.hazard_pay} onChange={e => setNum('hazard_pay', e.target.value)} disabled={readOnly} />
              </div>}
              <div>
                <Label>Bonificação / Prêmio</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.bonus} onChange={e => setNum('bonus', e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <Label>Outros Benefícios</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.other_benefits} onChange={e => setNum('other_benefits', e.target.value)} disabled={readOnly} />
              </div>
            </div>

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descontos</p>
            <div className="grid grid-cols-2 gap-4">
              {show('union_contribution_pct') && <div>
                <Label>Contribuição Assistencial (% sobre piso salarial)</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <Input className="font-mono" type="number" step="0.01" min="0" placeholder="%" value={form.union_contribution_pct} onChange={e => setNum('union_contribution_pct', e.target.value)} disabled={readOnly} />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.union_contribution)}</span>
                </div>
              </div>}
              {show('meal_voucher_discount_pct') && <div>
                <Label>Desconto VR (% sobre total do VR)</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <Input className="font-mono" type="number" step="0.01" min="0" placeholder="%" value={form.meal_voucher_discount_pct} onChange={e => setNum('meal_voucher_discount_pct', e.target.value)} disabled={readOnly} />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.meal_voucher_discount)}</span>
                </div>
              </div>}
              {show('life_insurance') && <div>
                <Label>Seguro de Vida (R$)</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.life_insurance} onChange={e => setNum('life_insurance', e.target.value)} disabled={readOnly} />
              </div>}
            </div>

            {(employee.contract_type === 'PJ' || show('pj_retention')) && !['MOTOCICLISTA_CLT','ESCRITORIO'].includes(payrollType) && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Retenções PJ</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Retenção PJ</Label>
                    <Input className="mt-1 font-mono" type="number" step="0.01" value={form.pj_retention} onChange={e => setNum('pj_retention', e.target.value)} disabled={readOnly} />
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
                    <Label>INSS % (base: salário + periculosidade)</Label>
                    <div className="flex gap-2 mt-1 items-center">
                      <Input className="font-mono" type="number" step="0.01" min="0" placeholder="% ou deixe 0 para tabela" value={form.inss_pct} onChange={e => setNum('inss_pct', e.target.value)} disabled={readOnly} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.inss)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Deixe 0 para usar tabela progressiva INSS 2026</p>
                  </div>
                  <div>
                    <Label>Desconto INSS (R$)</Label>
                    <div className="flex gap-2 mt-1 items-center">
                      <Input className="font-mono" type="number" step="0.01" min="0" placeholder="Valor a descontar do INSS" value={form.inss_discount} onChange={e => setNum('inss_discount', e.target.value)} disabled={readOnly} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">INSS líquido: {formatCurrency(calc.inss_net)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Reduz o INSS calculado no total a receber</p>
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

            <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-3">
              <div>
                <p className="font-bold text-base">Total a Receber</p>
                <p className="text-xs text-muted-foreground">Líquido após todos os descontos</p>
              </div>
              <p className="font-mono font-bold text-primary text-2xl">{formatCurrency(calc.net_total)}</p>
            </div>
          </TabsContent>

          <TabsContent value="quinzenal" className="space-y-5 mt-4">
            {/* Resumo 50/50 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/30 rounded-lg px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground">Base 1ª Quinzena (50%)</p>
                <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.net_total / 2)}</p>
              </div>
              <div className="bg-muted/30 rounded-lg px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground">Base 2ª Quinzena (50%)</p>
                <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.net_total / 2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1ª Quinzena */}
              <div className="space-y-3 border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">1ª Quinzena (1–15)</p>
                  <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.net_total / 2)}</span>
                </div>
                {show('food_voucher') && form.food_voucher > 0 && (
                   <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                     <span className="text-xs text-secondary font-medium">+ Vale Alimentação (pago na 1ª quinzena)</span>
                     <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(form.food_voucher)}</span>
                   </div>
                 )}
                <div>
                  <Label className="text-xs">Adiantamento</Label>
                  <Input className="mt-1 font-mono h-8 text-sm" type="number" step="0.01" value={form.first_period_advance} onChange={e => setNum('first_period_advance', e.target.value)} disabled={readOnly} />
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
                  <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.net_total / 2)}</span>
                </div>
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
                payrollForm={form}
              />
            )}
          </TabsContent>

          <TabsContent value="resumo" className="mt-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Salário Base</span>
                <span className="font-mono">{formatCurrency(form.base_salary)}</span>
              </div>
              {calc.absence_discount > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Desc. Faltas ({form.absences_days}d)</span>
                  <span className="font-mono text-destructive">- {formatCurrency(calc.absence_discount)}</span>
                </div>
              )}
              {calc.meal_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Refeição ({form.meal_voucher_days}d × {formatCurrency(form.meal_voucher_day_value)})</span><span className="font-mono">{formatCurrency(calc.meal_voucher)}</span></div>}
              {show('food_voucher') && form.food_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Alimentação</span><span className="font-mono">{formatCurrency(form.food_voucher)}</span></div>}
              {form.transport_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Transporte</span><span className="font-mono">{formatCurrency(form.transport_voucher)}</span></div>}
              {form.km_bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Adicional KM</span><span className="font-mono">{formatCurrency(form.km_bonus)}</span></div>}
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
                  <span className="text-destructive">INSS{form.inss_discount > 0 ? ` (desc. ${formatCurrency(form.inss_discount)})` : ''}</span>
                  <span className="font-mono text-destructive">- {formatCurrency(calc.inss_net)}</span>
                </div>}
                {calc.irrf > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">IRRF</span><span className="font-mono text-destructive">- {formatCurrency(calc.irrf)}</span></div>}
              </>}
              {form.pj_retention > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Retenção PJ</span><span className="font-mono text-destructive">- {formatCurrency(form.pj_retention)}</span></div>}
              {calc.union_contribution > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Contribuição Assistencial ({form.union_contribution_pct}%)</span><span className="font-mono text-destructive">- {formatCurrency(calc.union_contribution)}</span></div>}
              {calc.meal_voucher_discount > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Desconto VR ({form.meal_voucher_discount_pct}%)</span><span className="font-mono text-destructive">- {formatCurrency(calc.meal_voucher_discount)}</span></div>}
              {form.life_insurance > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Seguro de Vida</span><span className="font-mono text-destructive">- {formatCurrency(form.life_insurance)}</span></div>}

              {/* Descontos Quinzenais */}
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