import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { X, Save } from 'lucide-react';
import { formatCurrency } from '@/lib/payrollCalculations';

function NumInput({ label, value, onChange, readOnly }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min="0"
        step="0.01"
        value={value || ''}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        readOnly={readOnly}
        className="mt-1 font-mono"
      />
    </div>
  );
}

export default function EsporadicoPayrollForm({ employee, entry, referenceMonth, readOnly, onSave, onClose, jobRole }) {
  const [form, setForm] = useState({
    base_salary: 0,
    bonus: 0,
    other_benefits: 0,
    pj_retention: 0,
    first_period_discount: 0,
    second_period_discount: 0,
    notes: '',
    ...entry,
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const grossTotal = (form.base_salary || 0) + (form.bonus || 0) + (form.other_benefits || 0);
  const totalDescontos = (form.pj_retention || 0);
  const netTotal = grossTotal - totalDescontos;
  const firstNet = netTotal / 2 - (form.first_period_discount || 0);
  const secondNet = netTotal / 2 - (form.second_period_discount || 0);

  const handleSave = () => {
    onSave({
      ...form,
      company_id: employee.company_id,
      gross_total: grossTotal,
      net_total: netTotal,
      first_period_net: firstNet,
      second_period_net: secondNet,
      first_period_split: 0.5,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">{employee.name}</h2>
            <p className="text-sm text-muted-foreground">Prestador Esporádico — {referenceMonth}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="p-5 space-y-6">
          {/* Proventos */}
          <div>
            <h3 className="text-sm font-semibold text-primary mb-3 uppercase tracking-wide">Proventos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <NumInput label="Valor do Serviço (R$)" value={form.base_salary} onChange={v => set('base_salary', v)} readOnly={readOnly} />
              <NumInput label="Bonificação / Prêmio" value={form.bonus} onChange={v => set('bonus', v)} readOnly={readOnly} />
              <NumInput label="Outros Benefícios" value={form.other_benefits} onChange={v => set('other_benefits', v)} readOnly={readOnly} />
            </div>
          </div>

          {/* Descontos */}
          <div>
            <h3 className="text-sm font-semibold text-destructive mb-3 uppercase tracking-wide">Descontos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <NumInput label="Retenção PJ / ISS (%)" value={form.pj_retention} onChange={v => set('pj_retention', v)} readOnly={readOnly} />
              <NumInput label="Desc. Adiantamento (1ª Q.)" value={form.first_period_discount} onChange={v => set('first_period_discount', v)} readOnly={readOnly} />
              <NumInput label="Desc. Adiantamento (2ª Q.)" value={form.second_period_discount} onChange={v => set('second_period_discount', v)} readOnly={readOnly} />
            </div>
          </div>

          {/* Resumo */}
          <div className="bg-muted/30 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">Bruto</p>
              <p className="font-mono font-semibold text-foreground">{formatCurrency(grossTotal)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">Descontos</p>
              <p className="font-mono font-semibold text-destructive">{formatCurrency(totalDescontos)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">1ª Quinzena</p>
              <p className={`font-mono font-semibold ${firstNet < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(firstNet)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">2ª Quinzena</p>
              <p className={`font-mono font-semibold ${secondNet < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(secondNet)}</p>
            </div>
          </div>

          {/* Observações */}
          <div>
            <Label className="text-xs text-muted-foreground">Observações</Label>
            <Textarea
              className="mt-1 text-sm"
              rows={2}
              value={form.notes || ''}
              onChange={e => set('notes', e.target.value)}
              readOnly={readOnly}
              placeholder="Descrição do serviço prestado, período, etc."
            />
          </div>
        </div>

        {!readOnly && (
          <div className="flex justify-end gap-2 p-5 border-t border-border">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} className="gap-2">
              <Save className="w-4 h-4" /> Salvar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}