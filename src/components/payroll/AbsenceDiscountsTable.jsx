import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wand2 } from 'lucide-react';
import { formatCurrency } from '@/lib/payrollCalculations';

// IDs de motivos de ajuste considerados FALTA (geram desconto)
export const ABSENCE_REASON_IDS = new Set([5, 8, 16, 18, 19, 23, 24, 27, 2154902, 2157106, 2160971, 2169310, 2170370, 2173794]);

// Campos a calcular por motivo (null = nenhum desconto)
// 'half' = metade de cada valor
const REASON_COLS = {
  5:       { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
  8:       { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true  },
  16:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true  },
  18:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true  },
  19:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true  },
  23:      { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
  24:      { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
  27:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true  },
  2154902: { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true, half: true },
  2157106: { daily: false, vt: false, vr: false, dsr: false, moto: false, hazard: false },
  2160971: { daily: false, vt: false, vr: false, dsr: false, moto: false, hazard: false },
  2169310: { daily: false, vt: false, vr: false, dsr: false, moto: false, hazard: false },
  2170370: { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
  2173794: { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false },
};

// Retorna o total de uma linha de descontos
export function rowTotal(disc) {
  if (!disc || typeof disc !== 'object') return 0;
  return ['daily', 'vt', 'vr', 'dsr', 'moto', 'hazard'].reduce((s, k) => s + (parseFloat(disc[k]) || 0), 0);
}

// Retorna o total geral de absenceDiscounts
export function totalAbsenceDiscount(absenceDiscounts) {
  return Object.values(absenceDiscounts || {}).reduce((s, v) => s + rowTotal(v), 0);
}

// Calcula valores base por dia com base no formulário
function calcBaseValues(payrollForm) {
  const baseSalary = parseFloat(payrollForm?.base_salary) || 0;
  const vrPerDay = parseFloat(payrollForm?.meal_voucher_day_value) || 0;
  const vrDays = parseFloat(payrollForm?.meal_voucher_days) || 1;
  const vtPerDay = parseFloat(payrollForm?.transport_voucher_day_value) || 0;
  const vtTotal = parseFloat(payrollForm?.transport_voucher) || 0;
  const motoRental = parseFloat(payrollForm?.motorcycle_rental) || 0;
  const hazardPay = parseFloat(payrollForm?.hazard_pay) || 0;

  const daily = baseSalary > 0 ? Math.round((baseSalary / 30) * 100) / 100 : 0;
  const dsr = daily;
  const vr = vrPerDay;
  const vt = vtPerDay > 0
    ? vtPerDay
    : (vtTotal > 0 && vrDays > 0 ? Math.round((vtTotal / vrDays) * 100) / 100 : 0);
  const moto = motoRental > 0 && vrDays > 0 ? Math.round((motoRental / vrDays) * 100) / 100 : 0;
  const hazard = hazardPay > 0 && vrDays > 0 ? Math.round((hazardPay / vrDays) * 100) / 100 : 0;

  return { daily, vt, vr, dsr, moto, hazard };
}

// Aplica as regras do motivo ao valor base
function calcAutoForReason(reasonId, payrollForm, isMotocyclist) {
  const base = calcBaseValues(payrollForm);
  const rules = REASON_COLS[Number(reasonId)];
  if (!rules) return { daily: 0, vt: 0, vr: 0, dsr: 0, moto: 0, hazard: 0 };

  const factor = rules.half ? 0.5 : 1;
  return {
    daily:  rules.daily  ? Math.round(base.daily  * factor * 100) / 100 : 0,
    vt:     rules.vt     ? Math.round(base.vt     * factor * 100) / 100 : 0,
    vr:     rules.vr     ? Math.round(base.vr     * factor * 100) / 100 : 0,
    dsr:    rules.dsr    ? Math.round(base.dsr    * factor * 100) / 100 : 0,
    moto:   (rules.moto   && isMotocyclist) ? Math.round(base.moto   * factor * 100) / 100 : 0,
    hazard: (rules.hazard && isMotocyclist) ? Math.round(base.hazard * factor * 100) / 100 : 0,
  };
}

export default function AbsenceDiscountsTable({ pointAdjustments, absenceDiscounts, setAbsenceDiscounts, readOnly, isMotocyclist, payrollForm }) {
  // Ao montar ou quando os ajustes mudam, pré-preenche automaticamente linhas ainda zeradas
  useEffect(() => {
    if (readOnly || !payrollForm) return;
    const absenceRows = pointAdjustments.filter(a => ABSENCE_REASON_IDS.has(Number(a.adjustment_reason_id)));
    if (absenceRows.length === 0) return;

    setAbsenceDiscounts(prev => {
      const next = { ...prev };
      absenceRows.forEach(a => {
        const key = String(a.tangerino_id || a.id);
        const existing = prev[key];
        const isBlank = !existing || rowTotal(existing) === 0;
        if (isBlank) {
          next[key] = calcAutoForReason(a.adjustment_reason_id, payrollForm, isMotocyclist);
        }
      });
      return next;
    });
  // Só roda quando os ajustes de ponto mudam, não em cada keystroke do form
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointAdjustments]);

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

  // Recalcula automaticamente uma linha específica com os valores atuais do form
  const recalcRow = (key, reasonId) => {
    if (readOnly || !payrollForm) return;
    setAbsenceDiscounts(prev => ({
      ...prev,
      [key]: calcAutoForReason(reasonId, payrollForm, isMotocyclist),
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
              <th className="text-right px-2 py-2 font-medium text-destructive">Diário</th>
              <th className="text-right px-2 py-2 font-medium text-destructive">VT</th>
              <th className="text-right px-2 py-2 font-medium text-destructive">VR</th>
              <th className="text-right px-2 py-2 font-medium text-destructive">DSR</th>
              {isMotocyclist && <>
                <th className="text-right px-2 py-2 font-medium text-destructive">Loc. Moto</th>
                <th className="text-right px-2 py-2 font-medium text-destructive">Periculosidade</th>
              </>}
              {!readOnly && <th className="text-center px-2 py-2 font-medium text-muted-foreground">Auto</th>}
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
                      {!readOnly && (
                        <td className="px-2 py-1.5 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            title="Recalcular automaticamente"
                            onClick={() => recalcRow(key, a.adjustment_reason_id)}
                          >
                            <Wand2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      )}
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
                      {!readOnly && <td className="px-2 py-2 text-center text-muted-foreground">—</td>}
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
                <td colSpan={isMotocyclist ? (readOnly ? 8 : 9) : (readOnly ? 6 : 7)} className="px-3 py-2 text-right text-muted-foreground text-xs uppercase tracking-wide">
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