import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/payrollCalculations';

export default function PeriodDiscountsTable({ items = [], onChange, readonly = false, readOnly = false }) {
  const [newRow, setNewRow] = useState({ date: '', description: '', amount: '' });

  const addRow = () => {
    if (!newRow.date || !newRow.description || !newRow.amount) return;
    onChange([...items, { ...newRow, amount: parseFloat(newRow.amount) || 0, id: Date.now() }]);
    setNewRow({ date: '', description: '', amount: '' });
  };

  const removeRow = (idx) => onChange(items.filter((_, i) => i !== idx));

  const total = items.reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-left px-3 py-2 font-medium">Descrição</th>
              <th className="text-right px-3 py-2 font-medium">Valor</th>
              {!(readonly || readOnly) && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={(readonly || readOnly) ? 3 : 4} className="text-center text-muted-foreground py-4 text-xs">
                  Nenhum desconto lançado
                </td>
              </tr>
            )}
            {items.map((row, idx) => (
              <tr key={row.id ?? idx} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{row.date}</td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2 text-right font-mono text-destructive">- {formatCurrency(row.amount)}</td>
                {!(readonly || readOnly) && (
                  <td className="px-2 py-2">
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeRow(idx)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-muted/20">
                <td colSpan={2} className="px-3 py-2 font-semibold text-xs text-muted-foreground">Total descontos</td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-destructive">- {formatCurrency(total)}</td>
                {!(readonly || readOnly) && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!(readonly || readOnly) && (
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
            className="w-28 font-mono h-8 text-xs"
            value={newRow.amount}
            onChange={e => setNewRow(r => ({ ...r, amount: e.target.value }))}
          />
          <Button size="sm" variant="outline" className="h-8 px-3" onClick={addRow}>
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}