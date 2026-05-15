import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { X, Save } from 'lucide-react';
import { formatCurrency } from '@/lib/payrollCalculations';

function NumInput({ label, value, onChange, readOnly, hint }) {
  const [raw, setRaw] = useState(null);
  const display = raw !== null ? raw : (value === 0 ? '' : String(value ?? ''));
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Input
        type="number"
        min="0"
        step="0.01"
        value={display}
        onChange={e => setRaw(e.target.value)}
        onBlur={e => { onChange(parseFloat(e.target.value) || 0); setRaw(null); }}
        onFocus={e => { setRaw(String(value ?? 0)); setTimeout(() => e.target.select(), 0); }}
        readOnly={readOnly}
        className="mt-1 font-mono"
      />
    </div>
  );
}

export default function EsporadicoPayrollForm({ employee, entry, referenceMonth, readOnly, onSave, onClose }) {
  const [form, setForm] = useState({
    km_bonus_qty: 0,         // pontos
    km_bonus_value: 10.00,   // valor do ponto (default 10,00)
    life_insurance: 0,
    other_discounts: 0,
    first_period_advance: 0,
    second_period_discount: 0,
    notes: '',
    // se tem entry salva, sobrescreve
    ...(entry ? {
      km_bonus_qty: entry.km_bonus_qty ?? 0,
      km_bonus_value: entry.km_bonus_value ?? 10.00,
      life_insurance: entry.life_insurance ?? 0,
      other_discounts: entry.other_discounts ?? 0,
      first_period_advance: entry.first_period_advance ?? 0,
      second_period_discount: entry.second_period_discount ?? 0,
      notes: entry.notes ?? '',
    } : {}),
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const pontos = form.km_bonus_qty || 0;
  const valorPonto = form.km_bonus_value || 10;
  const totalVencimentos = Math.round(pontos * valorPonto * 100) / 100;

  const totalDescontos = (form.life_insurance || 0) + (form.other_discounts || 0);
  const netTotal = totalVencimentos - totalDescontos;
  const firstNet = netTotal / 2 - (form.first_period_advance || 0);
  const secondNet = netTotal / 2 - (form.second_period_discount || 0);

  const handleSave = () => {
    onSave({
      ...form,
      company_id: entry?.company_id || employee.company_id,
      base_salary: totalVencimentos,
      km_bonus_qty: pontos,
      km_bonus_value: valorPonto,
      km_bonus: totalVencimentos,
      gross_total: totalVencimentos,
      net_total: netTotal,
      first_period_net: firstNet,
      second_period_net: secondNet,
      first_period_split: 0.5,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">{employee.name}</h2>
            <p className="text-sm text-muted-foreground">Prestador Esporádico — {referenceMonth}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="p-5 space-y-6">
          {/* PROVENTOS */}
          <div>
            <h3 className="text-sm font-semibold text-primary mb-3 uppercase tracking-wide">Proventos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumInput
                label="Pontos"
                value={form.km_bonus_qty}
                onChange={v => set('km_bonus_qty', v)}
                readOnly={readOnly}
                hint="Quantidade de pontos produzidos"
              />
              <NumInput
                label="Valor do Ponto (R$)"
                value={form.km_bonus_value}
                onChange={v => set('km_bonus_value', v)}
                readOnly={readOnly}
                hint="Padrão: R$ 10,00"
              />
            </div>

            {/* Total dos Vencimentos */}
            <div className="mt-3 flex items-center justify-between bg-primary/10 rounded-lg px-4 py-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total dos Vencimentos</p>
                <p className="text-xs text-muted-foreground">{pontos} pontos × {formatCurrency(valorPonto)}</p>
              </div>
              <p className="font-mono font-bold text-primary text-xl">{formatCurrency(totalVencimentos)}</p>
            </div>
          </div>

          {/* DESCONTOS */}
          <div>
            <h3 className="text-sm font-semibold text-destructive mb-3 uppercase tracking-wide">Descontos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumInput
                label="Seguro de Vida (R$)"
                value={form.life_insurance}
                onChange={v => set('life_insurance', v)}
                readOnly={readOnly}
              />
              <NumInput
                label="Diversos (R$)"
                value={form.other_discounts}
                onChange={v => set('other_discounts', v)}
                readOnly={readOnly}
              />
            </div>
          </div>

          {/* Resumo Quinzenal */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Quinzenal</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border border-border rounded-lg p-3">
                <p className="text-xs font-semibold text-primary mb-2">1ª Quinzena (1–15)</p>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Base (50%)</span>
                  <span className="font-mono">{formatCurrency(netTotal / 2)}</span>
                </div>
                <NumInput
                  label="Adiantamento (R$)"
                  value={form.first_period_advance}
                  onChange={v => set('first_period_advance', v)}
                  readOnly={readOnly}
                />
                <div className={`mt-2 flex justify-between font-semibold text-sm ${firstNet < 0 ? 'text-destructive' : 'text-primary'}`}>
                  <span>{firstNet < 0 ? 'Saldo Negativo' : 'A Receber'}</span>
                  <span className="font-mono">{formatCurrency(firstNet)}</span>
                </div>
              </div>
              <div className="border border-border rounded-lg p-3">
                <p className="text-xs font-semibold text-primary mb-2">2ª Quinzena (16–30)</p>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Base (50%)</span>
                  <span className="font-mono">{formatCurrency(netTotal / 2)}</span>
                </div>
                <NumInput
                  label="Outros Descontos (R$)"
                  value={form.second_period_discount}
                  onChange={v => set('second_period_discount', v)}
                  readOnly={readOnly}
                />
                <div className={`mt-2 flex justify-between font-semibold text-sm ${secondNet < 0 ? 'text-destructive' : 'text-primary'}`}>
                  <span>{secondNet < 0 ? 'Saldo Negativo' : 'A Receber'}</span>
                  <span className="font-mono">{formatCurrency(secondNet)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Resumo Total */}
          <div className="bg-muted/30 rounded-lg p-4 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">Total Vencimentos</p>
              <p className="font-mono font-semibold text-foreground">{formatCurrency(totalVencimentos)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">Total Descontos</p>
              <p className="font-mono font-semibold text-destructive">{formatCurrency(totalDescontos)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">Líquido</p>
              <p className={`font-mono font-semibold ${netTotal < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(netTotal)}</p>
            </div>
          </div>

          {/* Observação */}
          <div>
            <Label className="text-xs text-muted-foreground">Observação</Label>
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

        {!readOnly ? (
          <div className="flex justify-end gap-2 p-5 border-t border-border">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} className="gap-2">
              <Save className="w-4 h-4" /> Salvar
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2 p-5 border-t border-border">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </div>
        )}
      </div>
    </div>
  );
}