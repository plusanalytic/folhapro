import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { calculatePayroll, formatCurrency, getMonthName } from '@/lib/payrollCalculations';

export default function PayrollEntryForm({ employee, entry, referenceMonth, onSave, onClose }) {
  const [form, setForm] = useState({
    company_id: employee.company_id,
    base_salary: entry?.base_salary ?? employee.base_salary ?? 0,
    absences_days: entry?.absences_days ?? 0,
    meal_voucher: entry?.meal_voucher ?? 0,
    transport_voucher: entry?.transport_voucher ?? 0,
    km_bonus: entry?.km_bonus ?? 0,
    bonus: entry?.bonus ?? 0,
    other_benefits: entry?.other_benefits ?? 0,
    pj_retention: entry?.pj_retention ?? 0,
    first_period_advance: entry?.first_period_advance ?? 0,
    first_period_discount: entry?.first_period_discount ?? 0,
    first_period_note: entry?.first_period_note ?? '',
    second_period_discount: entry?.second_period_discount ?? 0,
    second_period_note: entry?.second_period_note ?? '',
    notes: entry?.notes ?? '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setNum = (k, v) => set(k, parseFloat(v) || 0);

  const calc = calculatePayroll(form, employee.contract_type);

  const handleSave = () => {
    onSave({
      ...form,
      ...calc,
      reference_month: referenceMonth,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vale Refeição</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.meal_voucher} onChange={e => setNum('meal_voucher', e.target.value)} />
              </div>
              <div>
                <Label>Vale Transporte</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.transport_voucher} onChange={e => setNum('transport_voucher', e.target.value)} />
              </div>
              <div>
                <Label>Adicional KM</Label>
                <Input className="mt-1 font-mono" type="number" step="0.01" value={form.km_bonus} onChange={e => setNum('km_bonus', e.target.value)} />
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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Encargos Calculados (CLT 2026)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">INSS</p>
                    <p className="font-mono font-semibold text-destructive">{formatCurrency(calc.inss)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">FGTS</p>
                    <p className="font-mono font-semibold text-orange-500">{formatCurrency(calc.fgts)}</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">IRRF</p>
                    <p className="font-mono font-semibold text-destructive">{formatCurrency(calc.irrf)}</p>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="quinzenal" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <p className="font-semibold text-sm">1º Quinzena (1–15)</p>
                <div>
                  <Label>Adiantamento</Label>
                  <Input className="mt-1 font-mono" type="number" step="0.01" value={form.first_period_advance} onChange={e => setNum('first_period_advance', e.target.value)} />
                </div>
                <div>
                  <Label>Desconto</Label>
                  <Input className="mt-1 font-mono" type="number" step="0.01" value={form.first_period_discount} onChange={e => setNum('first_period_discount', e.target.value)} />
                </div>
                <div>
                  <Label>Nota</Label>
                  <Input className="mt-1" value={form.first_period_note} onChange={e => set('first_period_note', e.target.value)} placeholder="Observação..." />
                </div>
                <div className="bg-primary/10 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Á Receber 1º 15</p>
                  <p className="font-mono font-bold text-primary text-lg">{formatCurrency(calc.first_period_net)}</p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="font-semibold text-sm">2º Quinzena (16–30)</p>
                <div>
                  <Label>Desconto</Label>
                  <Input className="mt-1 font-mono" type="number" step="0.01" value={form.second_period_discount} onChange={e => setNum('second_period_discount', e.target.value)} />
                </div>
                <div>
                  <Label>Nota</Label>
                  <Input className="mt-1" value={form.second_period_note} onChange={e => set('second_period_note', e.target.value)} placeholder="Observação..." />
                </div>
                <div className="bg-primary/10 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Á Receber 2º 15</p>
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
              {form.meal_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Refeição</span><span className="font-mono">{formatCurrency(form.meal_voucher)}</span></div>}
              {form.transport_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Transporte</span><span className="font-mono">{formatCurrency(form.transport_voucher)}</span></div>}
              {form.km_bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Adicional KM</span><span className="font-mono">{formatCurrency(form.km_bonus)}</span></div>}
              {form.bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Bonificação</span><span className="font-mono">{formatCurrency(form.bonus)}</span></div>}
              {form.other_benefits > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Outros</span><span className="font-mono">{formatCurrency(form.other_benefits)}</span></div>}
              <div className="flex justify-between items-center py-2 border-b border-border font-semibold">
                <span>Total Bruto</span>
                <span className="font-mono">{formatCurrency(calc.gross_total)}</span>
              </div>
              {employee.contract_type === 'CLT' && <>
                {calc.inss > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">INSS</span><span className="font-mono text-destructive">- {formatCurrency(calc.inss)}</span></div>}
                {calc.irrf > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">IRRF</span><span className="font-mono text-destructive">- {formatCurrency(calc.irrf)}</span></div>}
              </>}
              {form.pj_retention > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Retenção PJ</span><span className="font-mono text-destructive">- {formatCurrency(form.pj_retention)}</span></div>}
              <div className="flex justify-between items-center py-3 bg-primary/10 rounded-lg px-3">
                <span className="font-bold text-lg">Total Líquido</span>
                <span className="font-mono font-bold text-primary text-xl">{formatCurrency(calc.net_total)}</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex gap-3 pt-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleSave}>Salvar Lançamento</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}