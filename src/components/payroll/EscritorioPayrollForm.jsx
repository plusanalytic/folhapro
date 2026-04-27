import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { calculateEscritorioPayroll, formatCurrency, getMonthName, getWorkingDaysInMonth } from '@/lib/payrollCalculations';
import PeriodDiscountsTable from './PeriodDiscountsTable';
import InstallmentDialog from './InstallmentDialog';
import { base44 } from '@/api/base44Client';

export default function EscritorioPayrollForm({ employee, entry, referenceMonth, onSave, onClose, readOnly = false, jobRole = null }) {
  const workingDays = getWorkingDaysInMonth(referenceMonth);

  const [form, setForm] = useState({
    company_id: employee.company_id,
    // Convenção Coletiva
    base_salary: entry?.base_salary ?? 0,
    meal_voucher_day_value: entry?.meal_voucher_day_value ?? 0,
    meal_voucher_days: entry?.meal_voucher_days ?? workingDays,
    transport_voucher_day_value: entry?.transport_voucher_day_value ?? 0,
    transport_voucher_days: entry?.transport_voucher_days ?? workingDays,
    transport_voucher_discount_pct: entry?.transport_voucher_discount_pct ?? 0,
    meal_voucher_discount_pct: entry?.meal_voucher_discount_pct ?? 0,
    inss_pct: entry?.inss_pct ?? 0,
    inss_deduction: entry?.inss_deduction ?? 0,
    // Outros Benefícios
    dental_plan: entry?.dental_plan ?? 0,
    food_voucher: entry?.food_voucher ?? 0,
    birthday_bonus: entry?.birthday_bonus ?? 0,
    // Geral
    first_period_advance: entry?.first_period_advance ?? 0,
    notes: entry?.notes ?? '',
  });

  const [firstDiscounts, setFirstDiscounts] = useState(entry?.first_discounts ?? []);
  const [secondDiscounts, setSecondDiscounts] = useState(entry?.second_discounts ?? []);
  const [installmentDialog, setInstallmentDialog] = useState(null);
  const [pointAdjustments, setPointAdjustments] = useState([]);

  // Carregar ajustes de ponto
  useEffect(() => {
    if (!employee.tangerino_id) return;
    const [year, month] = referenceMonth.split('-').map(Number);
    const start = `${referenceMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${referenceMonth}-${String(lastDay).padStart(2, '0')}`;
    base44.entities.PointAdjustment.filter({ employee_tangerino_id: Number(employee.tangerino_id) }).then(all => {
      setPointAdjustments(all.filter(a => a.start_date >= start && a.start_date <= end));
    });
  }, [employee.tangerino_id, referenceMonth]);

  // Carregar CashOuts
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

  // Input numérico que não perde foco e permite apagar o zero
  const NumInput = ({ field, className = '', step = '0.01', min, placeholder }) => {
    const [local, setLocal] = useState(String(form[field] ?? ''));
    // Sincroniza quando form muda externamente
    const formVal = String(form[field] ?? '');
    useEffect(() => {
      setLocal(formVal);
    }, [formVal]);
    return (
      <Input
        className={`font-mono ${className}`}
        type="number"
        step={step}
        min={min}
        placeholder={placeholder}
        value={local}
        disabled={readOnly}
        onFocus={e => e.target.select()}
        onChange={e => setLocal(e.target.value)}
        onBlur={e => {
          const parsed = parseFloat(e.target.value);
          const val = isNaN(parsed) ? 0 : parsed;
          setLocal(String(val));
          set(field, val);
        }}
      />
    );
  };

  const firstDiscountTotal = firstDiscounts.reduce((s, r) => s + (r.amount || 0), 0);
  const secondDiscountTotal = secondDiscounts.reduce((s, r) => s + (r.amount || 0), 0);

  const calcForm = { ...form, first_period_discount: firstDiscountTotal, second_period_discount: secondDiscountTotal };
  const calc = calculateEscritorioPayroll(calcForm);

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
      // campos calculados
      meal_voucher: calc.meal_voucher,
      transport_voucher: calc.transport_voucher,
      meal_voucher_discount: calc.meal_voucher_discount,
      inss: calc.inss,
      inss_pct: form.inss_pct,
      inss_deduction: form.inss_deduction,
      fgts: calc.fgts,
      irrf: calc.irrf,
      gross_total: calc.gross_total,
      net_total: calc.total_pagar,
      first_period_discount: firstDiscountTotal,
      second_period_discount: secondDiscountTotal,
      first_discounts: firstDiscounts,
      second_discounts: secondDiscounts,
      first_period_net: calc.first_period_net,
      second_period_net: calc.second_period_net,
      reference_month: referenceMonth,
    });
  };

  const Row = ({ label, hint, children }) => (
    <div>
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );

  const CalcRow = ({ label, value }) => (
    <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold text-primary">{formatCurrency(value)}</span>
    </div>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {readOnly ? 'Visualização — ' : 'Lançamento — '}{employee.name}
              <Badge variant="default">{employee.contract_type}</Badge>
              <Badge variant="outline" className="text-xs">Escritório</Badge>
              <span className="text-sm font-normal text-muted-foreground">{getMonthName(referenceMonth)}</span>
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="convencao">
            <TabsList className="grid grid-cols-4 w-full mt-4">
              <TabsTrigger value="convencao">Proventos</TabsTrigger>
              <TabsTrigger value="quinzenal">Quinzenal</TabsTrigger>
              <TabsTrigger value="ajuste_ponto">
                Ajuste de Ponto {pointAdjustments.length > 0 && (
                  <span className="ml-1 bg-destructive text-destructive-foreground text-xs rounded-full px-1.5">{pointAdjustments.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
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
                <Row label="Piso Salarial" hint="Valor bruto do salário base">
                  <NumInput field="base_salary" />
                </Row>
              </div>

              <div>
                <Label>Vale Refeição</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <div className="flex-1">
                    <NumInput field="meal_voucher_day_value" placeholder="Valor/dia" />
                    <p className="text-xs text-muted-foreground mt-0.5">Valor por dia trabalhado</p>
                  </div>
                  <span className="text-muted-foreground font-bold text-lg">×</span>
                  <div className="w-24">
                    <NumInput field="meal_voucher_days" step="1" min="0" className="text-center" />
                    <p className="text-xs text-muted-foreground mt-0.5 text-center">Dias úteis</p>
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
                <Row label="Seguro Odontológico">
                  <NumInput field="dental_plan" />
                </Row>
                <Row label="Vale Alimentação">
                  <NumInput field="food_voucher" />
                </Row>
                <Row label="Bonificação de Aniversário">
                  <NumInput field="birthday_bonus" />
                </Row>
              </div>

              <div>
                <Label>Vale Transporte</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <div className="flex-1">
                    <NumInput field="transport_voucher_day_value" placeholder="Valor/dia" />
                    <p className="text-xs text-muted-foreground mt-0.5">Valor por dia trabalhado</p>
                  </div>
                  <span className="text-muted-foreground font-bold text-lg">×</span>
                  <div className="w-24">
                    <NumInput field="transport_voucher_days" step="1" min="0" className="text-center" />
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
                <Row label="Desconto Vale Transporte (%)" hint="% sobre o valor do vale transporte">
                  <div className="flex gap-2 items-center">
                    <NumInput field="transport_voucher_discount_pct" min="0" placeholder="%" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.transport_voucher_discount)}</span>
                  </div>
                </Row>
                <Row label="Desconto Vale Refeição (%)" hint="% sobre o valor do vale refeição">
                  <div className="flex gap-2 items-center">
                    <NumInput field="meal_voucher_discount_pct" min="0" placeholder="%" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.meal_voucher_discount)}</span>
                  </div>
                </Row>
                <Row label="Desconto INSS (%)" hint="% calculado sobre o piso salarial">
                  <div className="flex gap-2 items-center">
                    <NumInput field="inss_pct" min="0" placeholder="%" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.inss)}</span>
                  </div>
                </Row>
                <Row label="Dedução INSS (R$)" hint="Valor a subtrair do desconto INSS bruto">
                  <div className="flex gap-2 items-center">
                    <NumInput field="inss_deduction" min="0" placeholder="R$" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">líq. {formatCurrency(calc.inss_net)}</span>
                  </div>
                </Row>
              </div>

              <div className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-3">
                <div>
                  <p className="font-bold text-base">Total Bruto Convenção</p>
                  <p className="text-xs text-muted-foreground">Piso salarial + Vale Refeição</p>
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

              <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-3">
                <div>
                  <p className="font-bold text-base">Total a Pagar</p>
                  <p className="text-xs text-muted-foreground">Líquido convenção + Outros benefícios</p>
                </div>
                <p className="font-mono font-bold text-primary text-2xl">{formatCurrency(calc.total_pagar)}</p>
              </div>
            </TabsContent>

            {/* ── ABA: Quinzenal ── */}
            <TabsContent value="quinzenal" className="space-y-5 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground">Base 1ª Quinzena (50%)</p>
                  <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.total_pagar / 2)}</p>
                </div>
                <div className="bg-muted/30 rounded-lg px-4 py-3 text-center">
                  <p className="text-xs text-muted-foreground">Base 2ª Quinzena (50%)</p>
                  <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.total_pagar / 2)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">1ª Quinzena (1–15)</p>
                    <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.total_pagar / 2)}</span>
                  </div>
                  <div>
                    <Label className="text-xs">Adiantamento</Label>
                    <NumInput field="first_period_advance" className="mt-1 h-8 text-sm" />
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

                <div className="space-y-3 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">2ª Quinzena (16–30)</p>
                    <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.total_pagar / 2)}</span>
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
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{pointAdjustments.length} ajuste(s) encontrado(s)</span>
                    <Badge variant="destructive" className="text-xs">{pointAdjustments.filter(a => a.adjustment_reason_count_as_missing).length} falta(s)</Badge>
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border">
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Data Início</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Data Fim</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Motivo</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Observação</th>
                          <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                          <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Dia Inteiro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pointAdjustments.map((a, i) => {
                          const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
                          return (
                            <tr key={a.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                              <td className="px-4 py-2.5 font-mono text-xs">{fmtDate(a.start_date)}</td>
                              <td className="px-4 py-2.5 font-mono text-xs">{fmtDate(a.end_date)}</td>
                              <td className="px-4 py-2.5">
                                <Badge variant={a.adjustment_reason_count_as_missing ? 'destructive' : 'outline'} className="text-xs font-normal">
                                  {a.adjustment_reason_description || '—'}
                                </Badge>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[200px] truncate" title={a.observation}>
                                {a.observation || '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`text-xs font-medium ${a.status === 'APROVADO' ? 'text-green-600' : 'text-yellow-600'}`}>
                                  {a.status || '—'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-center text-xs">
                                {a.full_day ? <span className="text-destructive font-semibold">Sim</span> : <span className="text-muted-foreground">Não</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
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
                {form.birthday_bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Bonificação Aniversário</span><span className="font-mono">{formatCurrency(form.birthday_bonus)}</span></div>}
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
                        <span className="text-destructive text-sm">{d.description}</span>
                        <span className="font-mono text-destructive text-sm">- {formatCurrency(d.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {secondDiscounts.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Descontos 2ª Quinzena</p>
                    {secondDiscounts.map((d, i) => (
                      <div key={i} className="flex justify-between py-1 border-b border-border">
                        <span className="text-destructive text-sm">{d.description}</span>
                        <span className="font-mono text-destructive text-sm">- {formatCurrency(d.amount)}</span>
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
                  <span className="font-mono font-bold text-primary text-xl">{formatCurrency(calc.total_pagar)}</span>
                </div>

                <div className="border border-border rounded-lg px-4 py-2 flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">FGTS (8%) — informativo</span>
                  <span className="font-mono font-semibold text-secondary">{formatCurrency(calc.fgts)}</span>
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