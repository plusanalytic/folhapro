import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, TrendingUp, Minus, CreditCard, UserX } from 'lucide-react';
import { formatCurrency } from '@/lib/payrollCalculations';

// Tabela de descontos quinzenais para MEI — suporta categoria "falta" e "outros"
export default function MeiPeriodDiscountsTable({ items = [], onChange, readOnly = false, onOpenInstallment }) {
  const [newRow, setNewRow] = useState({ date: '', description: '', amount: '', type: 'debit', category: 'outros' });

  const isFalta = newRow.category === 'falta';

  const addRow = () => {
    const desc = isFalta ? 'Falta' : newRow.description;
    if (!desc || !newRow.amount) return;
    onChange([...items, {
      date: newRow.date,
      description: desc,
      amount: parseFloat(newRow.amount) || 0,
      type: newRow.category === 'falta' ? 'debit' : newRow.type,
      category: newRow.category,
      id: Date.now(),
    }]);
    setNewRow({ date: '', description: '', amount: '', type: 'debit', category: 'outros' });
  };

  const removeRow = (idx) => onChange(items.filter((_, i) => i !== idx));

  const netEffect = items.reduce((s, r) => {
    const v = r.amount || 0;
    return r.type === 'credit' ? s - v : s + v;
  }, 0);

  const faltasCount = items.filter(r => r.category === 'falta').length;

  return (
    <div className="space-y-2">
      {faltasCount > 0 && (
        <div className={`text-xs rounded-md px-3 py-1.5 font-medium flex items-center gap-1.5 ${faltasCount >= 2 ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
          <UserX className="w-3 h-3" />
          {faltasCount >= 2
            ? `${faltasCount} faltas registradas — Ajuda de Custo será zerada`
            : `${faltasCount} falta registrada — desconta 1 diária da Ajuda de Custo`}
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-left px-3 py-2 font-medium">Descrição</th>
              <th className="text-center px-2 py-2 font-medium w-16">Cat.</th>
              <th className="text-right px-3 py-2 font-medium">Valor</th>
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 4 : 5} className="text-center text-muted-foreground py-4 text-xs">
                  Nenhum lançamento
                </td>
              </tr>
            )}
            {items.map((row, idx) => {
              const isCredit = row.type === 'credit';
              const isFaltaRow = row.category === 'falta';
              return (
                <tr key={row.id ?? idx} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{row.date}</td>
                  <td className="px-3 py-2 text-xs">{row.description}</td>
                  <td className="px-2 py-2 text-center">
                    {isFaltaRow ? (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-600 bg-red-100 rounded px-1.5 py-0.5">
                        <UserX className="w-3 h-3" /> Falta
                      </span>
                    ) : isCredit ? (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-600 bg-green-100 rounded px-1.5 py-0.5">
                        <TrendingUp className="w-3 h-3" /> Créd.
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-destructive bg-destructive/10 rounded px-1.5 py-0.5">
                        <Minus className="w-3 h-3" /> Desc.
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono text-xs ${isCredit ? 'text-green-600' : 'text-destructive'}`}>
                    {isCredit ? '+ ' : '- '}{formatCurrency(row.amount)}
                  </td>
                  {!readOnly && (
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
                {!readOnly && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!readOnly && (
        <div className="space-y-2">
          {/* Seletor de categoria */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewRow(r => ({ ...r, category: 'falta', type: 'debit' }))}
              className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-semibold transition-colors
                ${newRow.category === 'falta'
                  ? 'bg-red-100 border-red-500 text-red-700'
                  : 'border-border text-muted-foreground hover:bg-muted/50'}`}
            >
              <UserX className="w-3 h-3" /> Falta
            </button>
            <button
              type="button"
              onClick={() => setNewRow(r => ({ ...r, category: 'outros', type: 'debit' }))}
              className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-semibold transition-colors
                ${newRow.category === 'outros' && newRow.type === 'debit'
                  ? 'bg-destructive/10 border-destructive text-destructive'
                  : 'border-border text-muted-foreground hover:bg-muted/50'}`}
            >
              <Minus className="w-3 h-3" /> Desconto
            </button>
            <button
              type="button"
              onClick={() => setNewRow(r => ({ ...r, category: 'outros', type: 'credit' }))}
              className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-semibold transition-colors
                ${newRow.category === 'outros' && newRow.type === 'credit'
                  ? 'bg-green-100 border-green-600 text-green-700'
                  : 'border-border text-muted-foreground hover:bg-muted/50'}`}
            >
              <TrendingUp className="w-3 h-3" /> Crédito
            </button>
          </div>

          <div className="flex gap-2 items-center">
            <Input
              type="date"
              className="w-36 font-mono text-xs h-8"
              value={newRow.date}
              onChange={e => setNewRow(r => ({ ...r, date: e.target.value }))}
            />
            {!isFalta && (
              <Input
                placeholder="Descrição"
                className="flex-1 h-8 text-xs"
                value={newRow.description}
                onChange={e => setNewRow(r => ({ ...r, description: e.target.value }))}
              />
            )}
            {isFalta && (
              <div className="flex-1 h-8 flex items-center px-3 rounded-md border border-red-200 bg-red-50 text-xs text-red-600 font-medium">
                Falta
              </div>
            )}
            <Input
              type="number"
              step="0.01"
              placeholder="Valor"
              className={`w-28 font-mono h-8 text-xs ${newRow.type === 'credit' ? 'border-green-400' : newRow.category === 'falta' ? 'border-red-400' : 'border-destructive/40'}`}
              value={newRow.amount}
              onChange={e => setNewRow(r => ({ ...r, amount: e.target.value }))}
            />
            <Button
              size="sm"
              variant="outline"
              className={`h-8 px-3 ${newRow.type === 'credit' ? 'border-green-500 text-green-700 hover:bg-green-50' : newRow.category === 'falta' ? 'border-red-400 text-red-700 hover:bg-red-50' : 'border-destructive/40 text-destructive hover:bg-destructive/5'}`}
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