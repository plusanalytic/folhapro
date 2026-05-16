import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Save } from 'lucide-react';
import { formatCurrency, calculateProLabore, getMonthName, getWorkingDaysInMonth } from '@/lib/payrollCalculations';
import PeriodDiscountsTable from './PeriodDiscountsTable';
import InstallmentDialog from './InstallmentDialog';

function NumInput({ value, onChange, disabled, placeholder = '0,00', step = '0.01' }) {
  const [raw, setRaw] = useState(null);
  const display = raw !== null ? raw : (value === 0 ? '' : String(value));
  return (
    <Input
      type="number" step={step} min="0" disabled={disabled}
      className="font-mono"
      value={display}
      onChange={e => setRaw(e.target.value)}
      onBlur={e => { onChange(parseFloat(e.target.value) || 0); setRaw(null); }}
      onFocus={e => { setRaw(value === 0 ? '' : String(value)); setTimeout(() => e.target.select(), 0); }}
      placeholder={placeholder}
    />
  );
}

function DayInput({ value, onChange, disabled }) {
  const [raw, setRaw] = useState(null);
  const display = raw !== null ? raw : (value === 0 ? '' : String(value));
  return (
    <Input
      type="number" step="1" min="0" disabled={disabled}
      className="font-mono"
      value={display}
      onChange={e => setRaw(e.target.value)}
      onBlur={e => { onChange(parseInt(e.target.value) || 0); setRaw(null); }}
      onFocus={e => { setRaw(value === 0 ? '' : String(value)); setTimeout(() => e.target.select(), 0); }}
      placeholder="0"
    />
  );
}

const DEFAULTS = {
  base_salary: 0,
  working_days_month: 0,
  working_days_worked: 0,
  working_days_first: 0,
  working_days_second: 0,
  quota_adjustment: 0,
  birthday_bonus: 0,
  profit_distribution: 0,
  inss_pct: 11,
  irrf: 0,
  other_discounts: 0,
  first_discounts: [],
  second_discounts: [],
  notes: '',
};

export default function ProLaboreForm({ employee, entry, referenceMonth, readOnly, onSave, onClose }) {
  const totalWorkingDays = getWorkingDaysInMonth(referenceMonth);
  const [form, setForm] = useState({
    ...DEFAULTS,
    company_id: employee.company_id,
    working_days_month: entry?.working_days_month ?? totalWorkingDays,
    working_days_worked: entry?.working_days_worked ?? totalWorkingDays,
    working_days_first: entry?.working_days_first ?? 0,
    working_days_second: entry?.working_days_second ?? 0,
    ...entry,
  });
  const [firstDiscounts, setFirstDiscounts] = useState(entry?.first_discounts ?? []);
  const [secondDiscounts, setSecondDiscounts] = useState(entry?.second_discounts ?? []);
  const [installmentDialog, setInstallmentDialog] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load cashouts — só desconta se "Descontar do colaborador" estiver marcado
  useEffect(() => {
    base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: referenceMonth }).then(cashOuts => {
      const toDeduct = cashOuts.filter(c => c.deduct_from_payroll);
      const fromFirst  = toDeduct.filter(c => c.period === 'first').map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));
      const fromSecond = toDeduct.filter(c => c.period === 'second').map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));
      setFirstDiscounts(prev => [...(entry?.first_discounts ?? []).filter(x => !x.fromCashOut), ...fromFirst]);
      setSecondDiscounts(prev => [...(entry?.second_discounts ?? []).filter(x => !x.fromCashOut), ...fromSecond]);
    });
  }, [employee.id, referenceMonth]);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const firstTotal  = firstDiscounts.reduce((s, x) => x.type === 'credit' ? s - (x.amount || 0) : s + (x.amount || 0), 0);
  const secondTotal = secondDiscounts.reduce((s, x) => x.type === 'credit' ? s - (x.amount || 0) : s + (x.amount || 0), 0);

  const calc = calculateProLabore({
    ...form,
    first_period_discount: firstTotal,
    second_period_discount: secondTotal,
  });

  // Remuneração proporcional
  const diasMes = form.working_days_month || 1;
  const diasTrabalhados = form.working_days_worked || diasMes;
  const remuneracao = Math.round((form.base_salary / diasMes) * diasTrabalhados * 100) / 100;

  // Quinzenal split por valor total (igual ao CLT moto) — padrão 50/50
  const [firstPeriodSplit, setFirstPeriodSplit] = useState(entry?.first_period_split ?? 0.5);
  const firstBase = Math.round(calc.net_labore * firstPeriodSplit * 100) / 100;
  const secondBase = Math.round(calc.net_labore * (1 - firstPeriodSplit) * 100) / 100;
  const firstPeriodNet = Math.round((firstBase - firstTotal) * 100) / 100;
  const secondPeriodNet = Math.round((secondBase + form.profit_distribution - form.other_discounts - secondTotal) * 100) / 100;

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

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...form,
      first_discounts:        firstDiscounts,
      second_discounts:       secondDiscounts,
      first_period_discount:  firstTotal,
      second_period_discount: secondTotal,
      gross_total:            calc.gross_total,
      net_total:              calc.net_total,
      inss:                   calc.inss,
      irrf:                   calc.irrf,
      working_days_month:     form.working_days_month,
      working_days_worked:    form.working_days_worked,
      first_period_split:     firstPeriodSplit,
      first_period_net:       firstPeriodNet,
      second_period_net:      secondPeriodNet,
      first_period_base:      firstBase,
      second_period_base:     secondBase,
    };
    await onSave(payload);
    setSaving(false);
  };

  const monthName = getMonthName(referenceMonth);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 flex-wrap">
              {readOnly ? 'Visualização — ' : 'Lançamento — '}{employee.name}
              <Badge variant="secondary">Sócio</Badge>
              <Badge variant="outline" className="text-xs">Pró-Labore</Badge>
              <span className="text-sm font-normal text-muted-foreground">{monthName}</span>
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
              <TabsTrigger value="proventos">Pró-Labore</TabsTrigger>
              <TabsTrigger value="quinzenal">Quinzenal</TabsTrigger>
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
            </TabsList>

            {/* ── Pró-Labore ── */}
            <TabsContent value="proventos" className="space-y-4 mt-4">
              {readOnly && (
                <div className="bg-muted/50 border border-border rounded-lg px-4 py-2 text-sm text-muted-foreground">
                  Modo visualização — nenhuma alteração pode ser realizada.
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Remuneração</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Valor Base (R$)</Label>
                    <NumInput value={form.base_salary} disabled={readOnly} onChange={v => set('base_salary', v)} />
                  </div>
                  <div>
                    <Label className="text-xs">Dias Úteis no Mês</Label>
                    <DayInput value={form.working_days_month} disabled={readOnly} onChange={v => set('working_days_month', v)} />
                  </div>
                  <div>
                    <Label className="text-xs">Dias Úteis Trabalhados</Label>
                    <DayInput value={form.working_days_worked} disabled={readOnly} onChange={v => set('working_days_worked', v)} />
                  </div>
                </div>
                <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-2">
                  <p className="text-xs text-muted-foreground">
                    Remuneração = ({formatCurrency(form.base_salary)} ÷ {diasMes}) × {diasTrabalhados} dias
                  </p>
                  <p className="font-mono font-bold text-primary text-lg">{formatCurrency(remuneracao)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Proventos</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Reajuste de Cota (R$)</Label>
                    <NumInput value={form.quota_adjustment} disabled={readOnly} onChange={v => set('quota_adjustment', v)} />
                  </div>
                  <div>
                    <Label className="text-xs">Bonificação de Aniversário (R$)</Label>
                    <NumInput value={form.birthday_bonus} disabled={readOnly} onChange={v => set('birthday_bonus', v)} />
                  </div>
                  <div>
                    <Label className="text-xs">Distribuição de Lucros (R$)</Label>
                    <NumInput value={form.profit_distribution} disabled={readOnly} onChange={v => set('profit_distribution', v)} />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descontos</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">INSS Pró-Labore (%)</Label>
                    <NumInput value={form.inss_pct} disabled={readOnly} onChange={v => set('inss_pct', v)} step="0.01" />
                  </div>
                  <div>
                    <Label className="text-xs">IRRF (R$) — manual</Label>
                    <NumInput value={form.irrf} disabled={readOnly} onChange={v => set('irrf', v)} />
                  </div>
                  <div>
                    <Label className="text-xs">Outros Descontos (R$)</Label>
                    <NumInput value={form.other_discounts} disabled={readOnly} onChange={v => set('other_discounts', v)} />
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-primary/10 p-4 space-y-2 text-sm font-mono">
                <div className="flex justify-between"><span>Total Bruto</span><span className="font-semibold">{formatCurrency(calc.gross_total)}</span></div>
                <div className="flex justify-between text-destructive"><span>INSS ({form.inss_pct}%)</span><span>- {formatCurrency(calc.inss)}</span></div>
                <div className="flex justify-between text-destructive"><span>IRRF</span><span>- {formatCurrency(calc.irrf)}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-primary text-base"><span>Líquido Pró-Labore</span><span>{formatCurrency(calc.net_labore)}</span></div>
              </div>
            </TabsContent>

            {/* ── Quinzenal ── */}
            <TabsContent value="quinzenal" className="space-y-5 mt-4">
              {/* Rateio por valor total (igual CLT moto) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">Base 1ª Quinzena</p>
                  {readOnly ? (
                    <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(firstBase)}</p>
                  ) : (
                    <Input
                      type="number" step="0.01" className="font-mono font-bold text-lg h-9"
                      value={firstBase === 0 ? '' : String(firstBase)}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0;
                        if (calc.net_labore !== 0) setFirstPeriodSplit(v / calc.net_labore);
                      }}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{Math.round(firstPeriodSplit * 100)}% do líquido</p>
                </div>
                <div className="bg-muted/30 rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">Base 2ª Quinzena</p>
                  {readOnly ? (
                    <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(secondBase)}</p>
                  ) : (
                    <Input
                      type="number" step="0.01" className="font-mono font-bold text-lg h-9"
                      value={secondBase === 0 ? '' : String(secondBase)}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0;
                        if (calc.net_labore !== 0) setFirstPeriodSplit(1 - v / calc.net_labore);
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
                <div className="space-y-3 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">1ª Quinzena (1–15)</p>
                    <span className="text-xs text-muted-foreground">Base: {formatCurrency(firstBase)}</span>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">Descontos / Créditos</p>
                  <PeriodDiscountsTable items={firstDiscounts} onChange={readOnly ? () => {} : setFirstDiscounts} readOnly={readOnly} onOpenInstallment={readOnly ? undefined : () => setInstallmentDialog('first')} />
                  <div className="bg-primary/10 rounded-lg px-4 py-3 flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">Á Receber 1ª Quinzena</p>
                    <p className="font-mono font-bold text-primary text-lg">{formatCurrency(firstPeriodNet)}</p>
                  </div>
                </div>
                <div className="space-y-3 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">2ª Quinzena (16–30)</p>
                    <span className="text-xs text-muted-foreground">Base: {formatCurrency(secondBase)}</span>
                  </div>
                  {form.profit_distribution > 0 && (
                    <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                      <span className="text-xs text-secondary font-medium">+ Distribuição de Lucros</span>
                      <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(form.profit_distribution)}</span>
                    </div>
                  )}
                  <p className="text-xs font-medium text-muted-foreground">Descontos / Créditos</p>
                  <PeriodDiscountsTable items={secondDiscounts} onChange={readOnly ? () => {} : setSecondDiscounts} readOnly={readOnly} onOpenInstallment={readOnly ? undefined : () => setInstallmentDialog('second')} />
                  <div className="bg-primary/10 rounded-lg px-4 py-3 flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">Á Receber 2ª Quinzena</p>
                    <p className="font-mono font-bold text-primary text-lg">{formatCurrency(secondPeriodNet)}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Resumo ── */}
            <TabsContent value="resumo" className="mt-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-muted-foreground">Pró-Labore Base</span>
                  <span className="font-mono">{formatCurrency(form.base_salary)}</span>
                </div>
                {form.quota_adjustment > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Reajuste de Cota</span><span className="font-mono">{formatCurrency(form.quota_adjustment)}</span></div>}
                {form.birthday_bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Bon. Aniversário</span><span className="font-mono">{formatCurrency(form.birthday_bonus)}</span></div>}
                <div className="flex justify-between items-center py-2 border-b border-border font-semibold">
                  <span>Total Bruto</span>
                  <span className="font-mono">{formatCurrency(calc.gross_total)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border text-destructive"><span>INSS ({form.inss_pct}%)</span><span className="font-mono">- {formatCurrency(calc.inss)}</span></div>
                <div className="flex justify-between py-2 border-b border-border text-destructive"><span>IRRF</span><span className="font-mono">- {formatCurrency(calc.irrf)}</span></div>
                <div className="flex justify-between items-center py-2 border-b border-border font-bold text-primary">
                  <span>Líquido Pró-Labore</span>
                  <span className="font-mono">{formatCurrency(calc.net_labore)}</span>
                </div>
                {form.profit_distribution > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">+ Distribuição de Lucros</span><span className="font-mono">{formatCurrency(form.profit_distribution)}</span></div>}
                {/* Adiantamento removido da folha Sócio */}
                {form.other_discounts > 0 && <div className="flex justify-between py-2 border-b border-border text-destructive"><span>Outros Descontos</span><span className="font-mono">- {formatCurrency(form.other_discounts)}</span></div>}
                {(firstTotal + secondTotal) !== 0 && <div className="flex justify-between py-2 border-b border-border text-destructive"><span>Descontos Quinzenais</span><span className="font-mono">- {formatCurrency(firstTotal + secondTotal)}</span></div>}
                <div className="flex justify-between items-center py-3 bg-primary/10 rounded-lg px-3">
                  <span className="font-bold text-lg">Total Líquido a Receber</span>
                  <span className="font-mono font-bold text-primary text-xl">{formatCurrency(calc.net_total)}</span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-border bg-background shrink-0">
          {readOnly ? (
            <Button variant="outline" className="flex-1" onClick={onClose}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving} >
                <Save className="w-4 h-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar Lançamento'}
              </Button>
            </>
          )}
        </div>

        {installmentDialog && (
          <InstallmentDialog
            open={!!installmentDialog}
            period={installmentDialog}
            referenceMonth={referenceMonth}
            onConfirm={handleInstallmentConfirm}
            onClose={() => setInstallmentDialog(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}