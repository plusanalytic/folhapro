import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/payrollCalculations';

// Input numérico estável (fora do componente pai para não causar remount)
function DayInput({ value, onChange }) {
  const [raw, setRaw] = useState(null);
  const display = raw !== null ? raw : (value === 0 ? '' : String(value));
  return (
    <Input
      type="number"
      step="1"
      min="1"
      className="h-8 w-20 font-mono text-center text-sm"
      value={display}
      onChange={e => setRaw(e.target.value)}
      onBlur={e => { onChange(parseInt(e.target.value) || 30); setRaw(null); }}
      onFocus={e => { setRaw(value === 0 ? '' : String(value)); setTimeout(() => e.target.select(), 0); }}
    />
  );
}

/**
 * items: [{ label, value, show? }]
 * Campos obrigatórios: label (string), value (number)
 * show (opcional): se false, linha é ocultada
 */
export default function ProvisionCalculator({ items = [] }) {
  const [globalDays, setGlobalDays] = useState(30);
  // Dias individuais por linha: null = usa globalDays
  const [rowDays, setRowDays] = useState({});

  const visibleItems = items.filter(it => it.show !== false && it.value > 0);

  if (visibleItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <p className="text-sm">Nenhum item com valor preenchido para calcular provisão.</p>
        <p className="text-xs">Preencha os valores na aba de Proventos primeiro.</p>
      </div>
    );
  }

  const getDays = (key) => rowDays[key] !== undefined ? rowDays[key] : globalDays;
  const setRowDay = (key, val) => setRowDays(prev => ({ ...prev, [key]: val }));

  return (
    <div className="space-y-4">
      {/* Cabeçalho com total de dias global */}
      <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Total de Dias (Global)</p>
          <p className="text-xs text-muted-foreground">Aplica-se a todas as linhas que não tenham dias individuais definidos</p>
        </div>
        <DayInput value={globalDays} onChange={setGlobalDays} />
        <span className="text-xs text-muted-foreground">dias</span>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left p-3 font-medium text-muted-foreground">Item</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Valor Total</th>
              <th className="text-center p-3 font-medium text-muted-foreground w-32">Dias</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Valor / Dia</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item, idx) => {
              const days = getDays(item.label);
              const perDay = days > 0 ? item.value / days : 0;
              return (
                <tr key={item.label} className={`border-b border-border last:border-0 ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                  <td className="p-3 font-medium">{item.label}</td>
                  <td className="p-3 text-right font-mono text-primary font-semibold">
                    {formatCurrency(item.value)}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <DayInput
                        value={getDays(item.label)}
                        onChange={v => setRowDay(item.label, v)}
                      />
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-secondary">
                    {formatCurrency(perDay)}
                    <span className="text-xs text-muted-foreground font-normal ml-1">/dia</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-primary/10 border-t-2 border-primary/30">
              <td className="p-3 font-bold">TOTAL</td>
              <td className="p-3 text-right font-mono font-bold text-primary">
                {formatCurrency(visibleItems.reduce((s, it) => s + it.value, 0))}
              </td>
              <td className="p-3 text-center text-xs text-muted-foreground">—</td>
              <td className="p-3 text-right font-mono font-bold text-secondary">
                {formatCurrency(visibleItems.reduce((s, it) => {
                  const d = getDays(it.label);
                  return s + (d > 0 ? it.value / d : 0);
                }, 0))}
                <span className="text-xs text-muted-foreground font-normal ml-1">/dia</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
        💡 Altere os dias em cada linha individualmente ou use o campo global acima para ajustar todas as linhas de uma vez.
        Os valores/dia são calculados dividindo o total do item pelo número de dias.
      </p>
    </div>
  );
}