import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { X, Save } from 'lucide-react';
import { formatCurrency, calculateProLabore, getMonthName } from '@/lib/payrollCalculations';
import PeriodDiscountsTable from './PeriodDiscountsTable';
import InstallmentDialog from './InstallmentDialog';

function NumInput({ value, onChange, disabled, placeholder = '0,00', step = '0.01' }) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value));
  useEffect(() => { setRaw(value === 0 ? '' : String(value)); }, [value]);
  return (
    <Input
      type="number" step={step} min="0" disabled={disabled}
      className="font-mono"
      value={raw}
      onChange={e => { setRaw(e.target.value); onChange(parseFloat(e.target.value) || 0); }}
      onFocus={e => setTimeout(() => e.target.select(), 0)}
      placeholder={placeholder}
    />
  );
}

const DEFAULTS = {
  base_salary: 0,
  quota_adjustment: 0,
  birthday_bonus: 0,
  profit_distribution: 0,
  inss_pct: 11,
  irrf: 0,
  first_period_advance: 0,
  other_discounts: 0,
  first_discounts: [],
  second_discounts: [],
  notes: '',
};

export default function ProLaboreForm({ employee, entry, referenceMonth, readOnly, onSave, onClose }) {
  const [form, setForm] = useState({ ...DEFAULTS, ...entry });
  const [firstDiscounts, setFirstDiscounts] = useState(entry?.first_discounts ?? []);
  const [secondDiscounts, setSecondDiscounts] = useState(entry?.second_discounts ?? []);
  const [installmentDialog, setInstallmentDialog] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load cashouts
  useEffect(() => {
    base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: referenceMonth }).then(cashOuts => {
      const fromFirst  = cashOuts.filter(c => c.period === 'first').map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));
      const fromSecond = cashOuts.filter(c => c.period === 'second').map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));
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
      // Store quinzenal nets for PDF
      first_period_net:  Math.round((calc.net_labore / 2) * 100) / 100,
      second_period_net: Math.round(((calc.net_labore / 2) + calc.profit_distribution - form.first_period_advance - form.other_discounts - firstTotal - secondTotal) * 100) / 100,
    };
    await onSave(payload);
    setSaving(false);
  };

  const monthName = getMonthName(referenceMonth);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
      <Card className="w-full max-w-3xl my-4">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">
            Pró-Labore — {employee.name} — {monthName}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="proventos">
            <TabsList className="mb-4">
              <TabsTrigger value="proventos">Pró-Labore</TabsTrigger>
              <TabsTrigger value="quinzenal">Quinzenal</TabsTrigger>
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
            </TabsList>

            {/* ── Pró-Labore ── */}
            <TabsContent value="proventos" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Pró-Labore Base (R$)</Label>
                  <NumInput value={form.base_salary} disabled={readOnly} onChange={v => set('base_salary', v)} />
                </div>
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

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase">Descontos</p>
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

              <Separator />
              <div className="rounded-lg bg-muted/40 p-4 space-y-1 text-sm font-mono">
                <div className="flex justify-between"><span>Total Bruto</span><span className="font-semibold">{formatCurrency(calc.gross_total)}</span></div>
                <div className="flex justify-between text-destructive"><span>INSS ({form.inss_pct}%)</span><span>- {formatCurrency(calc.inss)}</span></div>
                <div className="flex justify-between text-destructive"><span>IRRF</span><span>- {formatCurrency(calc.irrf)}</span></div>
                <Separator />
                <div className="flex justify-between font-bold text-primary text-base"><span>Líquido Pró-Labore</span><span>{formatCurrency(calc.net_labore)}</span></div>
              </div>
            </TabsContent>

            {/* ── Quinzenal ── */}
            <TabsContent value="quinzenal" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
                <div>
                  <Label className="text-xs">Adiantamento 1ª Quinzena (R$)</Label>
                  <NumInput value={form.first_period_advance} disabled={readOnly} onChange={v => set('first_period_advance', v)} />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Descontos / Créditos — 1ª Quinzena</p>
                  <PeriodDiscountsTable items={firstDiscounts} onChange={readOnly ? () => {} : setFirstDiscounts} readOnly={readOnly} onOpenInstallment={readOnly ? undefined : () => setInstallmentDialog('first')} />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Descontos / Créditos — 2ª Quinzena</p>
                  <PeriodDiscountsTable items={secondDiscounts} onChange={readOnly ? () => {} : setSecondDiscounts} readOnly={readOnly} onOpenInstallment={readOnly ? undefined : () => setInstallmentDialog('second')} />
                </div>
              </div>
            </TabsContent>

            {/* ── Resumo ── */}
            <TabsContent value="resumo" className="space-y-3">
              <div className="rounded-lg border p-4 space-y-2 text-sm font-mono">
                <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Resumo do Pró-Labore</p>
                <div className="flex justify-between"><span>Pró-Labore Base</span><span>{formatCurrency(form.base_salary)}</span></div>
                <div className="flex justify-between"><span>Reajuste de Cota</span><span>{formatCurrency(form.quota_adjustment)}</span></div>
                <div className="flex justify-between"><span>Bon. Aniversário</span><span>{formatCurrency(form.birthday_bonus)}</span></div>
                <div className="flex justify-between font-semibold border-t pt-2"><span>Total Bruto</span><span>{formatCurrency(calc.gross_total)}</span></div>
                <div className="flex justify-between text-destructive"><span>INSS ({form.inss_pct}%)</span><span>- {formatCurrency(calc.inss)}</span></div>
                <div className="flex justify-between text-destructive"><span>IRRF</span><span>- {formatCurrency(calc.irrf)}</span></div>
                <div className="flex justify-between font-bold text-primary border-t pt-2"><span>Líquido Pró-Labore</span><span>{formatCurrency(calc.net_labore)}</span></div>
                <Separator className="my-2" />
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Distribuição e Adiantamentos</p>
                <div className="flex justify-between"><span>Líquido Pró-Labore</span><span>{formatCurrency(calc.net_labore)}</span></div>
                <div className="flex justify-between"><span>Distribuição de Lucros</span><span>{formatCurrency(form.profit_distribution)}</span></div>
                {form.first_period_advance > 0 && <div className="flex justify-between text-destructive"><span>Adiantamento 1ª Quinzena</span><span>- {formatCurrency(form.first_period_advance)}</span></div>}
                {form.other_discounts > 0 && <div className="flex justify-between text-destructive"><span>Outros Descontos</span><span>- {formatCurrency(form.other_discounts)}</span></div>}
                {(firstTotal + secondTotal) !== 0 && <div className="flex justify-between text-destructive"><span>Descontos Quinzenais</span><span>- {formatCurrency(firstTotal + secondTotal)}</span></div>}
                <div className="flex justify-between font-bold text-primary text-base border-t pt-2"><span>Total Líquido a Receber</span><span>{formatCurrency(calc.net_total)}</span></div>
              </div>
            </TabsContent>
          </Tabs>

          {!readOnly && (
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {installmentDialog && (
        <InstallmentDialog
          period={installmentDialog}
          onAdd={(item) => {
            if (installmentDialog === 'first') setFirstDiscounts(p => [...p, item]);
            else setSecondDiscounts(p => [...p, item]);
            setInstallmentDialog(null);
          }}
          onClose={() => setInstallmentDialog(null)}
        />
      )}
    </div>
  );
}