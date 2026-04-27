import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, CreditCard, Minus, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/payrollCalculations';

// amount sempre positivo; type = 'debit' (subtrai) ou 'credit' (soma)
export default function PeriodDiscountsTable({ items = [], onChange, readonly = false, readOnly = false, onOpenInstallment }) {
  const [newRow, setNewRow] = useState({ date: '', description: '', amount: '', type: 'debit' });

  const isRO = readonly || readOnly;

  const addRow = () => {
    if (!newRow.date || !newRow.description || !newRow.amount) return;
    onChange([...items, {
      ...newRow,
      amount: parseFloat(newRow.amount) || 0,
      type: newRow.type || 'debit',
      id: Date.now(),
    }]);
    setNewRow({ date: '', description: '', amount: '', type: 'debit' });
  };

  const removeRow = (idx) => onChange(items.filter((_, i) => i !== idx));

  // total líquido: créditos somam, débitos subtraem
  const netEffect = items.reduce((s, r) => {
    const v = r.amount || 0;
    return r.type === 'credit' ? s - v : s + v; // desconto = positivo subtrai do líquido
  }, 0);

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-left px-3 py-2 font-medium">Descrição</th>
              <th className="text-center px-2 py-2 font-medium w-20">Tipo</th>
              <th className="text-right px-3 py-2 font-medium">Valor</th>
              {!isRO && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={isRO ? 4 : 5} className="text-center text-muted-foreground py-4 text-xs">
                  Nenhum lançamento
                </td>
              </tr>
            )}
            {items.map((row, idx) => {
              const isCredit = row.type === 'credit';
              return (
                <tr key={row.id ?? idx} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{row.date}</td>
                  <td className="px-3 py-2">{row.description}</td>
                  <td className="px-2 py-2 text-center">
                    {isCredit ? (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-600 bg-green-100 rounded px-1.5 py-0.5">
                        <TrendingUp className="w-3 h-3" /> Crédito
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-destructive bg-destructive/10 rounded px-1.5 py-0.5">
                        <Minus className="w-3 h-3" /> Débito
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${isCredit ? 'text-green-600' : 'text-destructive'}`}>
                    {isCredit ? '+ ' : '- '}{formatCurrency(row.amount)}
                  </td>
                  {!isRO && (
                    <td className="px-2 py-2">
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeRow(idx)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-muted/20">
                <td colSpan={3} className="px-3 py-2 font-semibold text-xs text-muted-foreground">Efeito líquido</td>
                <td className={`px-3 py-2 text-right font-mono font-semibold ${netEffect >= 0 ? 'text-destructive' : 'text-green-600'}`}>
                  {netEffect >= 0 ? '- ' : '+ '}{formatCurrency(Math.abs(netEffect))}
                </td>
                {!isRO && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!isRO && (
        <div className="space-y-2">
          {/* Seletor de tipo visualmente claro */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewRow(r => ({ ...r, type: 'debit' }))}
              className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-semibold transition-colors
                ${newRow.type === 'debit'
                  ? 'bg-destructive/10 border-destructive text-destructive'
                  : 'border-border text-muted-foreground hover:bg-muted/50'}`}
            >
              <Minus className="w-3 h-3" /> Débito (desconto)
            </button>
            <button
              type="button"
              onClick={() => setNewRow(r => ({ ...r, type: 'credit' }))}
              className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-semibold transition-colors
                ${newRow.type === 'credit'
                  ? 'bg-green-100 border-green-600 text-green-700'
                  : 'border-border text-muted-foreground hover:bg-muted/50'}`}
            >
              <TrendingUp className="w-3 h-3" /> Crédito (acréscimo)
            </button>
          </div>

          <div className="flex gap-2 items-center">
            <Input
              type="date"
              className="w-36 font-mono text-xs h-8"
              value={newRow.date}
              onChange={e => setNewRow(r => ({ ...r, date: e.target.value }))}
            />
            <Input
              placeholder="Descrição"
              className="flex-1 h-8 text-xs"
              value={newRow.description}
              onChange={e => setNewRow(r => ({ ...r, description: e.target.value }))}
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Valor"
              className={`w-28 font-mono h-8 text-xs ${newRow.type === 'credit' ? 'border-green-400' : 'border-destructive/40'}`}
              value={newRow.amount}
              onChange={e => setNewRow(r => ({ ...r, amount: e.target.value }))}
            />
            <Button
              size="sm"
              variant="outline"
              className={`h-8 px-3 ${newRow.type === 'credit' ? 'border-green-500 text-green-700 hover:bg-green-50' : 'border-destructive/40 text-destructive hover:bg-destructive/5'}`}
              onClick={addRow}
            >
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>

          {onOpenInstallment && (
            <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/5" onClick={onOpenInstallment}>
              <CreditCard className="w-3 h-3" /> Lançar em Parcelas
            </Button>
          )}
        </div>
      )}
    </div>
  );
}