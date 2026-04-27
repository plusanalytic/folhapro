import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/payrollCalculations';

// IDs de motivos de ajuste considerados FALTA (geram desconto)
export const ABSENCE_REASON_IDS = new Set([5, 8, 16, 18, 19, 23, 24, 27, 2154902, 2157106, 2160971, 2169310, 2170370, 2173794]);

// Retorna o total de uma linha de descontos
export function rowTotal(disc) {
  if (!disc || typeof disc !== 'object') return 0;
  return ['daily', 'vt', 'vr', 'dsr', 'moto', 'hazard'].reduce((s, k) => s + (parseFloat(disc[k]) || 0), 0);
}

// Retorna o total geral de absenceDiscounts
export function totalAbsenceDiscount(absenceDiscounts) {
  return Object.values(absenceDiscounts || {}).reduce((s, v) => s + rowTotal(v), 0);
}

const COL_W = 'w-24';

export default function AbsenceDiscountsTable({ pointAdjustments, absenceDiscounts, setAbsenceDiscounts, readOnly, isMotocyclist }) {
  const setCell = (key, col, val) => {
    if (readOnly) return;
    setAbsenceDiscounts(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [col]: val },
    }));
  };

  const blurCell = (key, col, val) => {
    if (readOnly) return;
    setAbsenceDiscounts(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [col]: parseFloat(val) || 0 },
    }));
  };

  const CellInput = ({ rowKey, col }) => {
    const val = absenceDiscounts[rowKey]?.[col] ?? '';
    return (
      <Input
        type="number"
        step="0.01"
        min="0"
        disabled={readOnly}
        className="h-7 font-mono text-xs text-right border-destructive/30 focus:border-destructive px-1"
        placeholder="0"
        value={val}
        onChange={e => setCell(rowKey, col, e.target.value)}
        onBlur={e => blurCell(rowKey, col, e.target.value)}
        onFocus={e => e.target.select()}
      />
    );
  };

  const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

  const absenceRows = pointAdjustments.filter(a => ABSENCE_REASON_IDS.has(Number(a.adjustment_reason_id)));
  const otherRows = pointAdjustments.filter(a => !ABSENCE_REASON_IDS.has(Number(a.adjustment_reason_id)));
  const allRows = [...absenceRows, ...otherRows];

  const grandTotal = totalAbsenceDiscount(absenceDiscounts);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{pointAdjustments.length} ajuste(s) encontrado(s)</span>
          <Badge variant="destructive" className="text-xs">{absenceRows.length} falta(s) com desconto</Badge>
        </div>
        {grandTotal > 0 && (
          <div className="bg-destructive/10 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-xs text-destructive font-medium">Total desconto faltas:</span>
            <span className="font-mono font-bold text-destructive">{formatCurrency(grandTotal)}</span>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Data</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Motivo</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Obs.</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">D. Int.</th>
              {/* Colunas de desconto */}
              <th className="text-right px-2 py-2 font-medium text-destructive">Diário</th>
              <th className="text-right px-2 py-2 font-medium text-destructive">VT</th>
              <th className="text-right px-2 py-2 font-medium text-destructive">VR</th>
              <th className="text-right px-2 py-2 font-medium text-destructive">DSR</th>
              {isMotocyclist && <>
                <th className="text-right px-2 py-2 font-medium text-destructive">Loc. Moto</th>
                <th className="text-right px-2 py-2 font-medium text-destructive">Periculosidade</th>
              </>}
              <th className="text-right px-3 py-2 font-medium text-foreground bg-muted/60">Total</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((a, i) => {
              const isAbsence = ABSENCE_REASON_IDS.has(Number(a.adjustment_reason_id));
              const key = String(a.tangerino_id || a.id);
              const total = rowTotal(absenceDiscounts[key]);
              return (
                <tr key={a.id} className={`border-b border-border last:border-0 ${isAbsence ? 'bg-destructive/5' : (i % 2 === 0 ? '' : 'bg-muted/10')}`}>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{fmtDate(a.start_date)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={isAbsence ? 'destructive' : 'outline'} className="text-xs font-normal whitespace-nowrap">
                      {a.adjustment_reason_description || '—'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate" title={a.observation}>
                    {a.observation || '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {a.full_day ? <span className="text-destructive font-semibold">Sim</span> : <span className="text-muted-foreground">Não</span>}
                  </td>

                  {isAbsence ? (
                    <>
                      <td className="px-2 py-1.5"><CellInput rowKey={key} col="daily" /></td>
                      <td className="px-2 py-1.5"><CellInput rowKey={key} col="vt" /></td>
                      <td className="px-2 py-1.5"><CellInput rowKey={key} col="vr" /></td>
                      <td className="px-2 py-1.5"><CellInput rowKey={key} col="dsr" /></td>
                      {isMotocyclist && <>
                        <td className="px-2 py-1.5"><CellInput rowKey={key} col="moto" /></td>
                        <td className="px-2 py-1.5"><CellInput rowKey={key} col="hazard" /></td>
                      </>}
                      <td className="px-3 py-2 text-right font-mono font-semibold text-destructive bg-muted/30 whitespace-nowrap">
                        {total > 0 ? formatCurrency(total) : '—'}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                      <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                      <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                      <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                      {isMotocyclist && <>
                        <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                        <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                      </>}
                      <td className="px-3 py-2 text-center text-muted-foreground bg-muted/30">—</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
          {absenceRows.length > 0 && (
            <tfoot>
              <tr className="bg-muted/50 border-t-2 border-border font-semibold">
                <td colSpan={isMotocyclist ? 8 : 6} className="px-3 py-2 text-right text-muted-foreground text-xs uppercase tracking-wide">
                  Total Desconto Faltas
                </td>
                <td className="px-3 py-2 text-right font-mono text-destructive">
                  {grandTotal > 0 ? formatCurrency(grandTotal) : '—'}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {grandTotal > 0 && (
        <p className="text-xs text-muted-foreground">
          * O total de desconto de faltas (<strong>{formatCurrency(grandTotal)}</strong>) é refletido automaticamente no campo <strong>Faltas</strong> na aba Proventos.
        </p>
      )}
    </div>
  );
}