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
import { base44 } from '@/api/base44Client';

export default function PayrollEntryForm({ employee, entry, referenceMonth, onSave, onClose }) {
  const workingDays = getWorkingDaysInMonth(referenceMonth);

  const [form, setForm] = useState({
    company_id: employee.company_id,
    base_salary: entry?.base_salary ?? employee.base_salary ?? 0,
    absences_days: entry?.absences_days ?? 0,
    meal_voucher_day_value: entry?.meal_voucher_day_value ?? 0,
    meal_voucher_days: entry?.meal_voucher_days ?? workingDays,
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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setNum = (k, v) => set(k, parseFloat(v) || 0);

  const firstDiscountTotal = firstDiscounts.reduce((s, r) => s + (r.amount || 0), 0);
  const secondDiscountTotal = secondDiscounts.reduce((s, r) => s + (r.amount || 0), 0);

  const calcForm = { ...form, first_period_discount: firstDiscountTotal, second_period_discount: secondDiscountTotal };
  const calc = calculatePayroll(calcForm, employee.contract_type);

  const handleSave = () => {
    onSave({
      ...form,
      ...calc,
      meal_voucher_day_value: form.meal_voucher_day_value,
      meal_voucher_days: form.meal_voucher_days,
      meal_voucher: calc.meal_voucher,
      union_contribution: calc.union_contribution,
      meal_voucher_discount: calc.meal_voucher_discount,
      inss_pct: form.inss_pct,
      inss_discount: form.inss_discount,
      inss: calc.inss_net,
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
            Lançamento — {employee.name}
            <Badge variant={employee.contract_type === 'CLT' ? 'default' : 'secondary'}>{employee.contract_type}</Badge>
            <span className="text-sm font-normal text-muted-foreground">{getMonthName(referenceMonth)}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="proventos">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="proventos">Proventos</TabsTrigger>
            <TabsTrigger value="quinzenal">Quinzenal</TabsTrigger>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
          </TabsList>

          <TabsContent value="proventos" className="space-y-4 mt-4">
            {/* Salário e Faltas */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Salário Base / Valor Fixo</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.base_salary} onChange={e => setNum('base_salary', e.target.value)} />
              </div>
              <div>
                <Label>Faltas (dias)</Label>
                <Input className="mt-1" type="number" step="1" min="0" value={form.absences_days} onChange={e => setNum('absences_days', e.target.value)} />
              </div>
            </div>

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Benefícios</p>

            {/* Vale Refeição com valor dia + dias */}
            <div>
              <Label>Vale Refeição</Label>
              <div className="flex gap-2 mt-1 items-center">
                <div className="flex-1">
                  <Input className="font-mono" type="number" step="0.01" placeholder="Valor/dia" value={form.meal_voucher_day_value} onChange={e => setNum('meal_voucher_day_value', e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-0.5">Valor por dia</p>
                </div>
                <span className="text-muted-foreground font-bold text-lg">×</span>
                <div className="w-24">
                  <Input className="font-mono text-center" type="number" step="1" min="0" value={form.meal_voucher_days} onChange={e => setNum('meal_voucher_days', e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-0.5 text-center">Dias úteis</p>
                </div>
                <span className="text-muted-foreground">=</span>
                <div className="w-32 bg-muted/40 rounded-lg p-2 text-right">
                  <p className="font-mono font-semibold text-primary">{formatCurrency(calc.meal_voucher)}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vale Transporte</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.transport_voucher} onChange={e => setNum('transport_voucher', e.target.value)} />
              </div>
              <div>
                <Label>Adicional KM</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.km_bonus} onChange={e => setNum('km_bonus', e.target.value)} />
              </div>
              <div>
                <Label>Aluguel da Motocicleta</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.motorcycle_rental} onChange={e => setNum('motorcycle_rental', e.target.value)} />
              </div>
              <div>
                <Label>Periculosidade</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.hazard_pay} onChange={e => setNum('hazard_pay', e.target.value)} />
              </div>
              <div>
                <Label>Bonificação / Prêmio</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.bonus} onChange={e => setNum('bonus', e.target.value)} />
              </div>
              <div>
                <Label>Outros Benefícios</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.other_benefits} onChange={e => setNum('other_benefits', e.target.value)} />
              </div>
            </div>

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descontos</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Contribuição Assistencial (% sobre piso salarial)</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <Input className="font-mono" type="number" step="0.01" min="0" placeholder="%" value={form.union_contribution_pct} onChange={e => setNum('union_contribution_pct', e.target.value)} />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.union_contribution)}</span>
                </div>
              </div>
              <div>
                <Label>Desconto VR (% sobre total do VR)</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <Input className="font-mono" type="number" step="0.01" min="0" placeholder="%" value={form.meal_voucher_discount_pct} onChange={e => setNum('meal_voucher_discount_pct', e.target.value)} />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.meal_voucher_discount)}</span>
                </div>
              </div>
              <div>
                <Label>Seguro de Vida (R$)</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.life_insurance} onChange={e => setNum('life_insurance', e.target.value)} />
              </div>
            </div>

            {employee.contract_type === 'PJ' && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Retenções PJ</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Retenção PJ</Label>
                    <Input className="mt-1 font-mono" type="number" step="0.01" value={form.pj_retention} onChange={e => setNum('pj_retention', e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {employee.contract_type === 'CLT' && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">INSS</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>INSS % (base: salário + periculosidade)</Label>
                    <div className="flex gap-2 mt-1 items-center">
                      <Input className="font-mono" type="number" step="0.01" min="0" placeholder="% ou deixe 0 para tabela" value={form.inss_pct} onChange={e => setNum('inss_pct', e.target.value)} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.inss)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Deixe 0 para usar tabela progressiva INSS 2026</p>
                  </div>
                  <div>
                    <Label>Desconto INSS (R$)</Label>
                    <div className="flex gap-2 mt-1 items-center">
                      <Input className="font-mono" type="number" step="0.01" min="0" placeholder="Valor a descontar do INSS" value={form.inss_discount} onChange={e => setNum('inss_discount', e.target.value)} />
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
                <div>
                  <Label className="text-xs">Adiantamento</Label>
                  <Input className="mt-1 font-mono h-8 text-sm" type="number" step="0.01" value={form.first_period_advance} onChange={e => setNum('first_period_advance', e.target.value)} />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Descontos da 1ª Quinzena</p>
                  <PeriodDiscountsTable items={firstDiscounts} onChange={setFirstDiscounts} />
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
                  <PeriodDiscountsTable items={secondDiscounts} onChange={setSecondDiscounts} />
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
              <div className="flex justify-between items-center py-3 bg-primary/10 rounded-lg px-3">
                <span className="font-bold text-lg">Total Líquido</span>
                <span className="font-mono font-bold text-primary text-xl">{formatCurrency(calc.net_total)}</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-border bg-background shrink-0">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleSave}>Salvar Lançamento</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}