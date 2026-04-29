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
  const [form, setForm] = useState({ ...DEFAULTS, company_id: employee.company_id, ...entry });
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
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {readOnly ? 'Visualização — ' : 'Lançamento — '}{employee.name}
              <Badge variant="secondary">Sócio</Badge>
              <Badge variant="outline" className="text-xs">Pró-Labore</Badge>
              <span className="text-sm font-normal text-muted-foreground">{monthName}</span>
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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Proventos</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Adiantamento 1ª Quinzena (R$)</Label>
                  <NumInput value={form.first_period_advance} disabled={readOnly} onChange={v => set('first_period_advance', v)} />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3 border border-border rounded-xl p-4">
                  <p className="font-semibold text-sm">1ª Quinzena (1–15)</p>
                  <p className="text-xs font-medium text-muted-foreground">Descontos / Créditos</p>
                  <PeriodDiscountsTable items={firstDiscounts} onChange={readOnly ? () => {} : setFirstDiscounts} readOnly={readOnly} onOpenInstallment={readOnly ? undefined : () => setInstallmentDialog('first')} />
                  <div className="bg-primary/10 rounded-lg px-4 py-3 flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">Á Receber 1ª Quinzena</p>
                    <p className="font-mono font-bold text-primary text-lg">{formatCurrency(Math.round((calc.net_labore / 2 - form.first_period_advance - firstTotal) * 100) / 100)}</p>
                  </div>
                </div>
                <div className="space-y-3 border border-border rounded-xl p-4">
                  <p className="font-semibold text-sm">2ª Quinzena (16–30)</p>
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
                    <p className="font-mono font-bold text-primary text-lg">{formatCurrency(Math.round((calc.net_labore / 2 + form.profit_distribution - form.other_discounts - secondTotal) * 100) / 100)}</p>
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
                {form.first_period_advance > 0 && <div className="flex justify-between py-2 border-b border-border text-destructive"><span>Adiantamento 1ª Quinzena</span><span className="font-mono">- {formatCurrency(form.first_period_advance)}</span></div>}
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
            period={installmentDialog}
            onAdd={(item) => {
              if (installmentDialog === 'first') setFirstDiscounts(p => [...p, item]);
              else setSecondDiscounts(p => [...p, item]);
              setInstallmentDialog(null);
            }}
            onClose={() => setInstallmentDialog(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}