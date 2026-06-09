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
// va e ajcusto: só aplicados quando isMotocyclist (campos de CLT Moto)
const REASON_COLS = {
  5:       { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false, va: false, ajcusto: false },
  8:       { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true,  va: true,  ajcusto: true  },
  16:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true,  va: true,  ajcusto: true  },
  18:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true,  va: true,  ajcusto: true  },
  19:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true,  va: true,  ajcusto: true  },
  23:      { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false, va: false, ajcusto: false },
  24:      { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false, va: false, ajcusto: false },
  27:      { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true,  va: true,  ajcusto: true  },
  2154902: { daily: true,  vt: true,  vr: true,  dsr: true,  moto: true,  hazard: true,  va: true,  ajcusto: true, half: true },
  2157106: { daily: false, vt: false, vr: false, dsr: false, moto: false, hazard: false, va: false, ajcusto: false },
  2160971: { daily: false, vt: false, vr: false, dsr: false, moto: false, hazard: false, va: false, ajcusto: false },
  2169310: { daily: false, vt: false, vr: false, dsr: false, moto: false, hazard: false, va: false, ajcusto: false },
  2170370: { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false, va: false, ajcusto: false },
  2173794: { daily: false, vt: true,  vr: true,  dsr: false, moto: false, hazard: false, va: false, ajcusto: false },
};

// Retorna o total de uma linha de descontos
export function rowTotal(disc) {
  if (!disc || typeof disc !== 'object') return 0;
  return ['daily', 'vt', 'vr', 'dsr', 'moto', 'hazard', 'va', 'ajcusto'].reduce((s, k) => s + (parseFloat(disc[k]) || 0), 0);
}

// Retorna o total geral de absenceDiscounts
export function totalAbsenceDiscount(absenceDiscounts) {
  return Object.values(absenceDiscounts || {}).reduce((s, v) => s + rowTotal(v), 0);
}

// Retorna { first: number, second: number } — desconto de faltas por quinzena
// A chave do mapa é `tangerino_id-YYYY-MM-DD`, então extraímos o dia da chave
export function absenceDiscountByPeriod(absenceDiscounts) {
  let first = 0;
  let second = 0;
  for (const [key, disc] of Object.entries(absenceDiscounts || {})) {
    // Extrai a data do padrão "id-YYYY-MM-DD" ou usa "id" sem data
    const dateMatch = key.match(/(\d{4}-\d{2}-(\d{2}))$/);
    const day = dateMatch ? parseInt(dateMatch[2], 10) : 0;
    const amount = rowTotal(disc);
    if (day >= 1 && day <= 15) {
      first += amount;
    } else {
      second += amount;
    }
  }
  return {
    first: Math.round(first * 100) / 100,
    second: Math.round(second * 100) / 100,
  };
}

// Calcula valores base por dia com base no formulário
// Regras:
//   Diário      = salário base / dias úteis do mês
//   VT          = valor dia vale transporte (campo direto)
//   VR          = valor dia VR (campo direto)
//   DSR         = (salário base / dias úteis) + (periculosidade / 30)
//   Loc. Moto   = aluguel moto / dias úteis do mês (valor dia efetivo)
//   Periculosidade = periculosidade / 30
//   VA          = valor dia VA (food_voucher / full_month_contract_working_days)
//   Aj. Custo   = valor dia ajuda de custo (cost_allowance / full_month_contract_working_days)
function calcBaseValues(payrollForm) {
  // Salário base: usa clt_moto_base_salary se disponível, senão base_salary
  const baseSalary = parseFloat(payrollForm?.clt_moto_base_salary) || parseFloat(payrollForm?.base_salary) || 0;
  // Dias úteis do mês (mês cheio): para salário base, VA e Aj. Custo
  const workingDays = parseFloat(payrollForm?.full_month_contract_working_days) || parseFloat(payrollForm?.working_days_month) || 30;
  // Dias úteis do contrato: usado exclusivamente para Loc. Moto (aluguel ÷ dias úteis contrato)
  const contractWorkingDays = parseFloat(payrollForm?.contract_working_days) || workingDays;

  const vrPerDay = parseFloat(payrollForm?.meal_voucher_day_value) || 0;
  const vtPerDay = parseFloat(payrollForm?.transport_voucher_day_value) || 0;
  const motoRental = parseFloat(payrollForm?.motorcycle_rental) || 0;
  const hazardPay = parseFloat(payrollForm?.hazard_pay) || 0;
  const foodVoucher = parseFloat(payrollForm?.food_voucher) || 0;
  const costAllowance = parseFloat(payrollForm?.cost_allowance) || 0;

  // Valor dia salário base
  const daily = baseSalary > 0 ? Math.round((baseSalary / workingDays) * 10000) / 10000 : 0;
  // Periculosidade / 30 (fixo em 30 conforme regra)
  const hazard = hazardPay > 0 ? Math.round((hazardPay / 30) * 10000) / 10000 : 0;
  // DSR = valor dia salário base + periculosidade/30
  const dsr = Math.round((daily + hazard) * 10000) / 10000;
  // VR = valor dia direto do campo
  const vr = vrPerDay;
  // VT = valor dia direto do campo
  const vt = vtPerDay;
  // Loc. Moto = aluguel / dias úteis do CONTRATO (contract_working_days)
  const moto = motoRental > 0 ? Math.round((motoRental / contractWorkingDays) * 10000) / 10000 : 0;
  // VA = valor dia VA (usa workingDays do mês cheio)
  const va = foodVoucher > 0 ? Math.round((foodVoucher / workingDays) * 10000) / 10000 : 0;
  // Aj. Custo = valor dia ajuda de custo (usa workingDays do mês cheio)
  const ajcusto = costAllowance > 0 ? Math.round((costAllowance / workingDays) * 10000) / 10000 : 0;

  return { daily, vt, vr, dsr, moto, hazard, va, ajcusto };
}

// Aplica as regras do motivo ao valor base
function calcAutoForReason(reasonId, payrollForm, isMotocyclist) {
  const base = calcBaseValues(payrollForm);
  const rules = REASON_COLS[Number(reasonId)];
  if (!rules) return { daily: 0, vt: 0, vr: 0, dsr: 0, moto: 0, hazard: 0 };

  const factor = rules.half ? 0.5 : 1;
  return {
    daily:   rules.daily   ? Math.round(base.daily   * factor * 100) / 100 : 0,
    vt:      rules.vt      ? Math.round(base.vt      * factor * 100) / 100 : 0,
    vr:      rules.vr      ? Math.round(base.vr      * factor * 100) / 100 : 0,
    dsr:     rules.dsr     ? Math.round(base.dsr     * factor * 100) / 100 : 0,
    moto:    (rules.moto    && isMotocyclist) ? Math.round(base.moto    * factor * 100) / 100 : 0,
    hazard:  (rules.hazard  && isMotocyclist) ? Math.round(base.hazard  * factor * 100) / 100 : 0,
    va:      (rules.va      && isMotocyclist) ? Math.round(base.va      * factor * 100) / 100 : 0,
    ajcusto: (rules.ajcusto && isMotocyclist) ? Math.round(base.ajcusto * factor * 100) / 100 : 0,
  };
}

// ObsInput — campo de texto livre por linha (informativo)
function ObsInput({ value, disabled, onChange }) {
  return (
    <input
      type="text"
      disabled={disabled}
      title={disabled && value ? value : undefined}
      className="h-7 text-xs border border-input rounded px-2 bg-transparent w-full min-w-[110px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
      placeholder={disabled ? '—' : 'Observação...'}
      value={value || ''}
      onChange={onChange}
    />
  );
}

// CellInput extraído para FORA do componente pai para evitar perda de foco
function CellInput({ value, disabled, onChange, onBlur }) {
  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      disabled={disabled}
      className="h-7 font-mono text-xs text-right border-destructive/30 focus:border-destructive px-1"
      placeholder="0"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={e => { e.target.select(); }}
    />
  );
}

export default function AbsenceDiscountsTable({ pointAdjustments, absenceDiscounts, setAbsenceDiscounts, readOnly, isMotocyclist, payrollForm, lockedPeriods = {} }) {
  // Ao montar ou quando os ajustes mudam, pré-preenche automaticamente linhas ainda zeradas E não editadas manualmente
  useEffect(() => {
    if (readOnly || !payrollForm) return;
    const absenceRows = pointAdjustments.filter(a => ABSENCE_REASON_IDS.has(Number(a.adjustment_reason_id)));
    if (absenceRows.length === 0) return;

    setAbsenceDiscounts(prev => {
      const next = { ...prev };
      absenceRows.forEach(a => {
        const key = String(a.date ? `${a.tangerino_id}-${a.date}` : (a.tangerino_id || a.id));
        const existing = prev[key];

        // Verifica se o dia cai em quinzena bloqueada — nunca recalcula se bloqueada
        const rowDay = a.date ? parseInt(a.date.split('-')[2], 10) : 0;
        const rowPeriodLocked = rowDay > 0 && (rowDay <= 15 ? !!lockedPeriods.first : !!lockedPeriods.second);
        if (rowPeriodLocked) return; // preserva o valor já lançado/pago

        // Domingo nunca gera desconto
        const dow = a.date ? new Date(a.date + 'T00:00:00').getDay() : -1;
        if (dow === 0) {
          next[key] = { daily: 0, vt: 0, vr: 0, dsr: 0, moto: 0, hazard: 0, va: 0, ajcusto: 0, _sunday: true };
          return;
        }
        // Só auto-preenche se: nunca preenchido OU totalmente zerado E não foi editado manualmente
        const isBlank = !existing || rowTotal(existing) === 0;
        const wasManuallyEdited = existing?._manual === true;
        if (isBlank && !wasManuallyEdited) {
          next[key] = calcAutoForReason(a.adjustment_reason_id, payrollForm, isMotocyclist);
        }
      });
      return next;
    });
  // Só roda quando os ajustes de ponto mudam, não em cada keystroke do form
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointAdjustments]);

  // Edição manual: marca a linha como editada manualmente para não ser sobrescrita pelo auto
  const setCell = (key, col, val) => {
    if (readOnly) return;
    setAbsenceDiscounts(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [col]: val, _manual: true },
    }));
  };

  const blurCell = (key, col, val) => {
    if (readOnly) return;
    setAbsenceDiscounts(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [col]: parseFloat(val) || 0, _manual: true },
    }));
  };

  const setObs = (key, val) => {
    setAbsenceDiscounts(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), obs: val },
    }));
  };

  // Recalcula automaticamente uma linha específica (reseta flag manual)
  // Domingo nunca gera desconto
  const recalcRow = (key, reasonId, date) => {
    if (readOnly || !payrollForm) return;
    const dow = date ? new Date(date + 'T00:00:00').getDay() : -1;
    if (dow === 0) {
      setAbsenceDiscounts(prev => ({ ...prev, [key]: { daily: 0, vt: 0, vr: 0, dsr: 0, moto: 0, hazard: 0, _sunday: true } }));
      return;
    }
    setAbsenceDiscounts(prev => ({
      ...prev,
      [key]: { ...calcAutoForReason(reasonId, payrollForm, isMotocyclist), _manual: false },
    }));
  };

  const renderCell = (rowKey, col) => (
    <CellInput
      value={absenceDiscounts[rowKey]?.[col] ?? ''}
      disabled={readOnly}
      onChange={e => setCell(rowKey, col, e.target.value)}
      onBlur={e => blurCell(rowKey, col, e.target.value)}
    />
  );

  const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const getDow = (d) => {
    if (!d) return null;
    return new Date(d + 'T00:00:00').getDay(); // 0=Dom ... 6=Sáb
  };

  const absenceRows = pointAdjustments.filter(a => ABSENCE_REASON_IDS.has(Number(a.adjustment_reason_id)));
  const otherRows = pointAdjustments.filter(a => !ABSENCE_REASON_IDS.has(Number(a.adjustment_reason_id)));
  const allRows = [...absenceRows, ...otherRows];

  // Ajustes que caem em quinzenas bloqueadas (não podem ser recalculados automaticamente)
  const lockedAbsenceRows = absenceRows.filter(a => {
    const day = (a.date || a.start_date) ? parseInt((a.date || a.start_date).split('-')[2], 10) : 0;
    const isFirst = day >= 1 && day <= 15;
    return (isFirst && lockedPeriods.first) || (!isFirst && lockedPeriods.second);
  });

  const grandTotal = totalAbsenceDiscount(absenceDiscounts);

  return (
    <div className="space-y-3">
      {lockedAbsenceRows.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <span className="text-amber-600 font-semibold shrink-0">⚠ Quinzena bloqueada</span>
          <span className="text-amber-700">
            {lockedAbsenceRows.length} ajuste(s) de ponto caem em quinzena(s) já pagas ({lockedAbsenceRows.map(a => {
              const day = (a.date || a.start_date) ? parseInt((a.date || a.start_date).split('-')[2], 10) : 0;
              return day <= 15 ? '1ªQ' : '2ªQ';
            }).filter((v, i, arr) => arr.indexOf(v) === i).join(' e ')}) e não serão recalculados automaticamente para preservar os valores já pagos. Se necessário, edite os valores manualmente.
          </span>
        </div>
      )}
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
              <th className="text-left px-2 py-2 font-medium text-muted-foreground">Dia</th>
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
                <th className="text-right px-2 py-2 font-medium text-destructive">VA</th>
                <th className="text-right px-2 py-2 font-medium text-destructive">Aj. Custo</th>
              </>}
              {!readOnly && <th className="text-center px-2 py-2 font-medium text-muted-foreground">Auto</th>}
              <th className="text-left px-2 py-2 font-medium text-muted-foreground min-w-[120px]">Nota</th>
              <th className="text-right px-3 py-2 font-medium text-foreground bg-muted/60">Total</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((a, i) => {
               const isAbsence = ABSENCE_REASON_IDS.has(Number(a.adjustment_reason_id));
               const key = String(a.date ? `${a.tangerino_id}-${a.date}` : (a.tangerino_id || a.id));
               const total = rowTotal(absenceDiscounts[key]);
               const isManual = absenceDiscounts[key]?._manual === true;
              const dow = getDow(a.date || a.start_date);
              const isSunday = dow === 0;
              return (
                <tr key={`${a.id}-${a.date || a.start_date}`} className={`border-b border-border last:border-0 ${isSunday ? 'bg-muted/20 opacity-60' : isAbsence ? 'bg-destructive/5' : (i % 2 === 0 ? '' : 'bg-muted/10')}`}>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{fmtDate(a.date || a.start_date)}</td>
                  <td className="px-2 py-2 text-xs font-medium whitespace-nowrap">
                    <span className={isSunday ? 'text-muted-foreground line-through' : dow === 6 ? 'text-amber-600' : 'text-foreground'}>
                      {dow !== null ? DOW_LABELS[dow] : '—'}
                    </span>
                    {isSunday && <span className="ml-1 text-[10px] text-muted-foreground">(sem desc.)</span>}
                  </td>
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

                  {isAbsence && isSunday ? (
                    <>
                      <td className="px-2 py-2 text-center text-muted-foreground text-xs" colSpan={isMotocyclist ? (readOnly ? 9 : 10) : (readOnly ? 5 : 6)}>
                        Domingo — sem desconto
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground bg-muted/30">—</td>
                    </>
                  ) : isAbsence ? (
                     <>
                       <td className="px-2 py-1.5">{renderCell(key, 'daily')}</td>
                      <td className="px-2 py-1.5">{renderCell(key, 'vt')}</td>
                      <td className="px-2 py-1.5">{renderCell(key, 'vr')}</td>
                      <td className="px-2 py-1.5">{renderCell(key, 'dsr')}</td>
                      {isMotocyclist && <>
                        <td className="px-2 py-1.5">{renderCell(key, 'moto')}</td>
                        <td className="px-2 py-1.5">{renderCell(key, 'hazard')}</td>
                        <td className="px-2 py-1.5">{renderCell(key, 'va')}</td>
                        <td className="px-2 py-1.5">{renderCell(key, 'ajcusto')}</td>
                      </>}
                      {!readOnly && (() => {
                        const rowDay = a.date ? parseInt(a.date.split('-')[2], 10) : 0;
                        const rowPeriodLocked = rowDay > 0 && (rowDay <= 15 ? !!lockedPeriods.first : !!lockedPeriods.second);
                        return (
                          <td className="px-2 py-1.5 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={rowPeriodLocked}
                              className={`h-7 w-7 ${rowPeriodLocked ? 'opacity-30 cursor-not-allowed' : isManual ? 'text-amber-500 hover:text-primary' : 'text-muted-foreground hover:text-primary'}`}
                              title={rowPeriodLocked ? 'Quinzena já paga — recálculo bloqueado para preservar o valor pago' : isManual ? 'Editado manualmente — clique para recalcular automaticamente' : 'Recalcular automaticamente'}
                              onClick={() => { if (!rowPeriodLocked) recalcRow(key, a.adjustment_reason_id, a.date); }}
                            >
                              <Wand2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        );
                      })()}
                      <td className="px-2 py-1.5">
                        <ObsInput
                          value={absenceDiscounts[key]?.obs || ''}
                          disabled={readOnly}
                          onChange={e => setObs(key, e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-destructive bg-muted/30 whitespace-nowrap">
                        {total > 0 ? formatCurrency(total) : '—'}
                      </td>
                    </>
                  ) : (
                    // Linha não é falta (ajuste informativo)
                    <>
                      <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                      <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                      <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                      <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                      {isMotocyclist && <>
                        <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                        <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                        <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                        <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                      </>}
                      {!readOnly && <td className="px-2 py-2 text-center text-muted-foreground">—</td>}
                      <td className="px-2 py-1.5">
                        <ObsInput
                          value={absenceDiscounts[key]?.obs || ''}
                          disabled={readOnly}
                          onChange={e => setObs(key, e.target.value)}
                        />
                      </td>
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
                <td colSpan={isMotocyclist ? (readOnly ? 12 : 13) : (readOnly ? 8 : 9)} className="px-3 py-2 text-right text-muted-foreground text-xs uppercase tracking-wide">
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
          {Object.values(absenceDiscounts).some(v => v?._manual) && (
            <span className="ml-2 text-amber-600 font-medium">⚠ Algumas linhas foram editadas manualmente (ícone laranja). Clique no ícone <Wand2 className="inline w-3 h-3" /> para recalcular.</span>
          )}
        </p>
      )}
    </div>
  );
}