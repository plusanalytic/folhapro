import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { calculatePayroll, formatCurrency, getMonthName, getWorkingDaysInMonth, getWorkingDaysFromDate, getWorkingDaysInMonthSatIncluded, getContractWorkingDays, getFullMonthContractWorkingDays } from '@/lib/payrollCalculations.js';
import PeriodDiscountsTable from './PeriodDiscountsTable';
import InstallmentDialog from './InstallmentDialog';
import AbsenceDiscountsTable, { totalAbsenceDiscount, absenceDiscountByPeriod } from './AbsenceDiscountsTable';
import { base44 } from '@/api/base44Client';

// Regras de visibilidade de campos por modelo de folha
const PAYROLL_TYPE_FIELDS = {
  MOTOCICLISTA_CLT: {
    show: ['meal_voucher', 'food_voucher', 'transport_voucher', 'km_bonus', 'motorcycle_rental', 'hazard_pay', 'bonus', 'other_benefits', 'union_contribution_pct', 'meal_voucher_discount_pct', 'life_insurance', 'inss', 'fgts', 'irrf'],
    hide: ['pj_retention'],
  },
  MOTOCICLISTA_MEI: {
    show: ['km_bonus', 'motorcycle_rental', 'bonus', 'other_benefits', 'pj_retention'],
    hide: ['meal_voucher', 'transport_voucher', 'hazard_pay', 'union_contribution_pct', 'meal_voucher_discount_pct', 'life_insurance', 'inss', 'fgts', 'irrf'],
  },
  ESCRITORIO: {
    show: ['meal_voucher', 'transport_voucher', 'bonus', 'other_benefits', 'union_contribution_pct', 'meal_voucher_discount_pct', 'life_insurance', 'inss', 'fgts', 'irrf'],
    hide: ['km_bonus', 'motorcycle_rental', 'hazard_pay', 'pj_retention'],
  },
  SOCIO: {
    show: ['bonus', 'other_benefits', 'pj_retention'],
    hide: ['meal_voucher', 'transport_voucher', 'km_bonus', 'motorcycle_rental', 'hazard_pay', 'union_contribution_pct', 'meal_voucher_discount_pct', 'life_insurance', 'inss', 'fgts', 'irrf'],
  },
};

function isFieldVisible(payrollType, field) {
  if (!payrollType || !PAYROLL_TYPE_FIELDS[payrollType]) return true;
  const rules = PAYROLL_TYPE_FIELDS[payrollType];
  if (rules.hide?.includes(field)) return false;
  return true;
}

// Input para valor de base quinzenal — permite digitação livre sem travar o cursor
function PeriodBaseInput({ value, onChange }) {
  const [raw, setRaw] = useState(null);
  const display = raw !== null ? raw : (value === 0 ? '0' : String(value ?? 0));
  return (
    <Input
      type="number"
      step="0.01"
      className="font-mono font-bold text-lg h-9"
      value={display}
      onChange={e => setRaw(e.target.value)}
      onBlur={e => {
        const v = parseFloat(e.target.value);
        onChange(isNaN(v) ? 0 : v);
        setRaw(null);
      }}
      onFocus={e => {
        setRaw(String(value ?? 0));
        setTimeout(() => e.target.select(), 0);
      }}
    />
  );
}

// Calcula dias trabalhados default para CLT:
// Se admitido no mês da folha: 30 - (dia_admissão - 1)
function calcDefaultWorkedDays(employee, referenceMonth) {
  if (!employee?.admission_date) return 30;
  const admMonth = employee.admission_date.slice(0, 7);
  if (admMonth === referenceMonth) {
    const admDay = parseInt(employee.admission_date.slice(8, 10), 10);
    return Math.max(1, 30 - (admDay - 1));
  }
  return 30;
}

// Calcula % e desconto INSS CLT automático com base no salário efetivo
function calcAutoINSS(salaryEfetivo) {
  if (salaryEfetivo <= 1621) return { pct: 7.5, discount: 0 };
  if (salaryEfetivo <= 2902.84) return { pct: 9, discount: 24.32 };
  if (salaryEfetivo <= 4354.27) return { pct: 12, discount: 111.40 };
  return { pct: 13, discount: 198.49 };
}

const QUINZENA_BLOCKED_STATUSES = ['AGENDADO', 'PAGO', 'RESCISÃO', 'DESLIGADO', 'FÉRIAS', 'AFASTADO', 'SALDO NEGATIVO'];

export default function PayrollEntryForm({ employee, entry, referenceMonth, onSave, onClose, readOnly = false, jobRole = null, paymentStatus = null, workplaces = [] }) {
  const q1Locked = !readOnly && QUINZENA_BLOCKED_STATUSES.includes(paymentStatus?.status_q1);
  const q2Locked = !readOnly && QUINZENA_BLOCKED_STATUSES.includes(paymentStatus?.status_q2);
  // baseLocked: campos que afetam net_total — bloqueado somente se q2 está bloqueada ou readOnly.
  // Se apenas q1 está paga, os campos ficam livres e a diferença vai para a 2ª quinzena.
  const baseLocked = readOnly || q2Locked;
  // q2ExtraLocked: campos que só impactam a 2ª quinzena (food_voucher, km, ajuda de custo, bonificações CLT moto)
  const q2ExtraLocked = readOnly || q2Locked;

  // Workplace do colaborador (para pré-preencher valores padrão CLT Moto em novos lançamentos)
  const empWorkplace = workplaces.find(w =>
    (employee.workplace_list ?? []).map(String).includes(String(w.tangerino_id))
  );
  // Escala do local: seg_sex (Seg-Sex) ou seg_sab (Seg-Sáb, padrão)
  const scheduleIsSexta = empWorkplace?.work_schedule === 'seg_sex';
  // Dias úteis mês cheio (denominador para valor/dia): respeitam a escala do local
  const defaultFullMonthDays = scheduleIsSexta
    ? getWorkingDaysInMonth(referenceMonth)
    : getFullMonthContractWorkingDays(referenceMonth);

  const workingDays = getWorkingDaysInMonth(referenceMonth);
  // Dias úteis contrato — considera escala do local e admissão no mês
  const defaultContractWorkingDays = scheduleIsSexta
    ? (employee?.admission_date?.slice(0, 7) === referenceMonth
        ? getWorkingDaysFromDate(employee.admission_date, referenceMonth)
        : getWorkingDaysInMonth(referenceMonth))
    : getContractWorkingDays(referenceMonth, employee?.admission_date);
  const [contractWorkingDays, setContractWorkingDays] = useState(
    entry?.contract_working_days ?? defaultContractWorkingDays
  );
  // Dias úteis para VR: proporcional se admissão ocorreu neste mês
  const vrWorkingDays = (() => {
    if (employee?.admission_date && employee.admission_date.slice(0, 7) === referenceMonth) {
      return getWorkingDaysFromDate(employee.admission_date, referenceMonth);
    }
    return workingDays;
  })();
  const payrollType = jobRole?.payroll_type || null;
  const isCLTMoto = payrollType === 'MOTOCICLISTA_CLT';
  const show = (field) => isFieldVisible(payrollType, field);

  // Para CLT moto: dias trabalhados (default 30 ou proporcional na admissão)
  const defaultWorkedDays = calcDefaultWorkedDays(employee, referenceMonth);

  const [form, setForm] = useState({
    company_id: employee.company_id,
    base_salary: entry?.base_salary ?? 0,
    // Para CLT moto: dias trabalhados e salário base informado
    // Se tem lançamento salvo, usa os campos CLT moto salvos; se não, inicializa com base_salary como referência
    clt_moto_base_salary: entry?.id
      ? (entry.clt_moto_base_salary ?? entry.base_salary ?? 0)
      : (isCLTMoto && empWorkplace?.clt_moto_base_salary_default > 0 ? empWorkplace.clt_moto_base_salary_default : 0),
    // Se já tem valor salvo no banco, usa ele. Se é novo lançamento (sem entry), nasce com defaultWorkedDays (30 ou proporcional).
    // O valor 30 é gravado explicitamente no banco ao salvar, garantindo que edições futuras sejam respeitadas.
    clt_moto_worked_days: entry?.clt_moto_worked_days != null ? Number(entry.clt_moto_worked_days) : defaultWorkedDays,
    absences_days: entry?.absences_days ?? 0,
    meal_voucher_day_value: entry?.meal_voucher_day_value ?? (isCLTMoto ? (empWorkplace?.clt_moto_meal_voucher_day_value_default || 0) : 0),
    meal_voucher_days: entry?.meal_voucher_days ?? vrWorkingDays,
    food_voucher: entry?.food_voucher ?? (isCLTMoto ? (empWorkplace?.clt_moto_food_voucher_default || 0) : 0),
    transport_voucher: entry?.transport_voucher ?? 0,
    km_bonus_qty: entry?.km_bonus_qty ?? 0,
    km_bonus_value: entry?.km_bonus_value ?? 0,
    cost_allowance: entry?.cost_allowance ?? (isCLTMoto && empWorkplace?.clt_moto_cost_allowance_default > 0 ? empWorkplace.clt_moto_cost_allowance_default : (jobRole?.payroll_type === 'MOTOCICLISTA_CLT' ? 50 : 0)),
    motorcycle_rental: entry?.motorcycle_rental ?? (isCLTMoto ? (empWorkplace?.clt_moto_motorcycle_rental_default || 0) : 0),
    hazard_pay: entry?.hazard_pay ?? 0,
    bonus: entry?.bonus ?? 0,
    delivery_bonus: entry?.delivery_bonus ?? 0,
    delivery_target_bonus: entry?.delivery_target_bonus ?? 0,
    attendance_bonus: entry?.attendance_bonus ?? 0,
    route_sp_bonus: entry?.route_sp_bonus ?? 0,
    overtime: entry?.overtime ?? 0,
    other_benefits: entry?.other_benefits ?? 0,
    union_contribution_value: entry?.union_contribution_value ?? 0,
    meal_voucher_discount_pct: entry?.meal_voucher_discount_pct ?? (jobRole?.payroll_type === 'MOTOCICLISTA_CLT' ? 6 : 0),
    life_insurance: entry?.life_insurance ?? (jobRole?.payroll_type === 'MOTOCICLISTA_CLT' ? 17.50 : 0),
    inss_pct: entry?.inss_pct ?? 0,
    inss_discount: entry?.inss_discount ?? 0,
    pj_retention: entry?.pj_retention ?? 0,
    first_period_advance: entry?.first_period_advance ?? 0,
    notes: entry?.notes ?? '',
  });

  // Campo editável: Total Dias Úteis Contrato (mês cheio, Seg-Sáb, sem considerar admissão)
  const [fullMonthContractDays, setFullMonthContractDays] = useState(
    entry?.full_month_contract_working_days ?? defaultFullMonthDays
  );

  // Para CLT moto: base_salary efetivo = (clt_moto_base_salary / 30) * clt_moto_worked_days
  // Valor dia usa 4 casas decimais para evitar erro de arredondamento no salário efetivo
  const cltMotoDailyValue = isCLTMoto ? Math.round((form.clt_moto_base_salary / 30) * 10000) / 10000 : 0;
  const cltMotoEffectiveSalary = isCLTMoto
    ? Math.round(cltMotoDailyValue * form.clt_moto_worked_days * 100) / 100
    : form.base_salary;

  // Para CLT moto: base_salary NÃO é sobrescrito pelo efetivo durante a edição.
  // O salário efetivo é apenas calculado para exibição e usado nos cálculos,
  // mas o campo base_salary armazenado permanece sendo o valor do contrato (clt_moto_base_salary).

  // INSS automático para CLT moto (se não foi editado manualmente)
  const [inssManuallyEdited, setInssManuallyEdited] = useState(!!entry?.id);
  // Para novos lançamentos: contribuição assistencial é automática (2%). Para lançamentos salvos: usa o valor salvo.
  const [unionContribManuallyEdited, setUnionContribManuallyEdited] = useState(!!entry);

  // Controla se o usuário editou manualmente a periculosidade
  const [hazardPayManuallyEdited, setHazardPayManuallyEdited] = useState(!!entry?.id);

  // Periculosidade automática: recalcula sempre que o salário efetivo mudar, exceto se editado manualmente
  useEffect(() => {
    if (!isCLTMoto || readOnly || hazardPayManuallyEdited) return;
    if (cltMotoEffectiveSalary > 0) {
      const autoVal = Math.round(cltMotoEffectiveSalary * 0.3 * 100) / 100;
      setForm(f => ({ ...f, hazard_pay: autoVal }));
    }
  }, [cltMotoEffectiveSalary, isCLTMoto, readOnly, hazardPayManuallyEdited]); // eslint-disable-line

  useEffect(() => {
    if (!isCLTMoto || inssManuallyEdited) return;
    const hazard = form.hazard_pay || 0;
    const { pct, discount } = calcAutoINSS(cltMotoEffectiveSalary + hazard);
    setForm(f => ({ ...f, inss_pct: pct, inss_discount: discount }));
  }, [cltMotoEffectiveSalary, form.hazard_pay, isCLTMoto, inssManuallyEdited]); // eslint-disable-line

  // Contribuição assistencial automática: 2% do salário base (somente novos lançamentos)
  useEffect(() => {
    if (unionContribManuallyEdited || readOnly) return;
    const baseSal = isCLTMoto ? cltMotoEffectiveSalary : (form.base_salary || 0);
    if (baseSal > 0) {
      setForm(f => ({ ...f, union_contribution_value: Math.round(baseSal * 0.02 * 100) / 100 }));
    }
  }, [cltMotoEffectiveSalary, form.base_salary, isCLTMoto, unionContribManuallyEdited, readOnly]); // eslint-disable-line

  // Desconto taxa sindical automático para admissão no mês (CLT moto)
  // Só é adicionado quando o usuário confirma o salário base (blur no campo)
  const [unionTaxAutoAdded, setUnionTaxAutoAdded] = useState(false);
  // Guarda o valor dia confirmado (após blur) para não disparar antes do usuário confirmar
  const [confirmedDailyValue, setConfirmedDailyValue] = useState(
    entry?.clt_moto_base_salary > 0 ? Math.round((entry.clt_moto_base_salary / 30) * 10000) / 10000 : 0
  );

  // Descontos quinzenais (lista de {date, description, amount, id})
  const [firstDiscounts, setFirstDiscounts] = useState(entry?.first_discounts ?? []);
  const [secondDiscounts, setSecondDiscounts] = useState(entry?.second_discounts ?? []);

  // Rateio quinzenal: proporção da 1ª quinzena (padrão 0.5 = 50%)
  const [firstPeriodSplit, setFirstPeriodSplit] = useState(entry?.first_period_split ?? 0.5);
  // Override direto do valor base da 1ª quinzena (usado quando net_total = 0)
  const [firstBaseOverride, setFirstBaseOverride] = useState(entry?.first_period_base ?? null);

  // Hora Extra: quantidade em hh:mm e valor hora separados (apenas UI — overtime = qty * hourValue)
  const [overtimeHours, setOvertimeHours] = useState(() => {
    if (entry?.overtime > 0 && entry?.overtime_hour_value > 0) {
      const totalHours = entry.overtime / entry.overtime_hour_value;
      const h = Math.floor(totalHours);
      const m = Math.round((totalHours - h) * 60);
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }
    return '00:00';
  });
  const [overtimeHourValue, setOvertimeHourValue] = useState(entry?.overtime_hour_value ?? 0);

  // Parcelas
  const [installmentDialog, setInstallmentDialog] = useState(null); // 'first' | 'second' | null

  // Ajustes de ponto (faltas) do colaborador no mês
  const [pointAdjustments, setPointAdjustments] = useState([]);
  // Mapa de desconto por ajuste: { [tangerino_id_do_ajuste]: valor }
  const [absenceDiscounts, setAbsenceDiscounts] = useState(entry?.absence_discounts ?? {});

  // Adiciona taxa sindical automaticamente para admissão no mês (somente após confirmar o salário base)
  // Disparado pelo confirmedDailyValue (atualizado no blur do campo salário base)
  useEffect(() => {
    if (!isCLTMoto || unionTaxAutoAdded || readOnly) return;
    if (!employee?.admission_date) return;
    const admMonth = employee.admission_date.slice(0, 7);
    if (admMonth !== referenceMonth) return;
    // Só adiciona se não existe já taxa sindical nos descontos salvos
    const admDay = parseInt(employee.admission_date.slice(8, 10), 10);
    const isFirstQ = admDay <= 15;
    const alreadyHas = (isFirstQ ? firstDiscounts : secondDiscounts).some(d =>
      d.description && (d.description.toLowerCase().includes('taxa sindical') || d.description.toLowerCase().includes('contribuição sindical'))
    );
    if (alreadyHas) { setUnionTaxAutoAdded(true); return; }
    // Aguarda o valor dia confirmado (após o usuário sair do campo)
    if (confirmedDailyValue <= 0) return;
    const taxEntry = {
      date: employee.admission_date,
      description: 'Contribuição Sindical',
      amount: confirmedDailyValue,
      type: 'debit',
      id: Date.now(),
    };
    if (isFirstQ) setFirstDiscounts(prev => [...prev, taxEntry]);
    else setSecondDiscounts(prev => [...prev, taxEntry]);
    setUnionTaxAutoAdded(true);
  }, [isCLTMoto, confirmedDailyValue, unionTaxAutoAdded, employee?.admission_date, referenceMonth, readOnly]);

  useEffect(() => {
    if (!employee.tangerino_id) return;
    // Busca ajustes que se sobrepõem ao mês de referência (inclui mês anterior e próximo)
    const [year, month] = referenceMonth.split('-').map(Number);
    const start = `${referenceMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${referenceMonth}-${String(lastDay).padStart(2, '0')}`;
    
    base44.entities.PointAdjustment.filter({ employee_tangerino_id: Number(employee.tangerino_id) }).then(all => {
      // Filtra ajustes que se sobrepõem ao mês OU ao mês anterior/próximo
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      
      // Expande intervalo para incluir mês anterior e próximo (para capturar faltas que impactam múltiplos períodos)
      const prevMonthStart = new Date(year, month - 2, 1);
      const nextMonthEnd = new Date(year, month + 1, 0);
      
      const overlapping = all.filter(a => {
        const adjStart = new Date(a.start_date);
        const adjEnd = new Date(a.end_date);
        return adjEnd >= prevMonthStart && adjStart <= nextMonthEnd;
      });
      
      // Expande cada ajuste para cada dia do seu período
      const expanded = [];
      for (const adj of overlapping) {
        const adjStart = new Date(adj.start_date);
        const adjEnd = new Date(adj.end_date);
        let current = new Date(adjStart);
        
        while (current <= adjEnd) {
          expanded.push({
            ...adj,
            date: current.toISOString().split('T')[0],
          });
          current.setDate(current.getDate() + 1);
        }
      }
      
      // Filtra apenas dias do mês de referência
      const forMonth = expanded.filter(a => a.date >= start && a.date <= end);
      forMonth.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      
      setPointAdjustments(forMonth);
    });
  }, [employee.tangerino_id, referenceMonth]);

  // Carregar CashOuts do colaborador no mês
  useEffect(() => {
    base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: referenceMonth }).then(cashOuts => {
      const toDeduct = cashOuts.filter(c => c.deduct_from_payroll);
      const fromCashFirst = toDeduct.filter(c => c.period === 'first').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));
      const fromCashSecond = toDeduct.filter(c => c.period === 'second').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));
      // Mescla: mantém manuais já existentes + CashOuts (evita duplicatas por id)
      setFirstDiscounts(prev => {
        const manual = prev.filter(x => !x.fromCashOut);
        return [...manual, ...fromCashFirst];
      });
      setSecondDiscounts(prev => {
        const manual = prev.filter(x => !x.fromCashOut);
        return [...manual, ...fromCashSecond];
      });
    });
  }, [employee.id, referenceMonth]);

  const set = (k, v) => { if (!readOnly) setForm(f => ({ ...f, [k]: v })); };
  const setNum = (k, v) => set(k, parseFloat(v) || 0);

  // Helper para criar props de input numérico com UX melhorada:
  // - Não sai do campo ao digitar (usa set() em vez de setNum() no onChange)
  // - Converte para número só no blur
  // - Permite zerar (mostra "" quando o valor é 0)
  const numericField = useCallback((key, forceDisabled) => {
    const externalVal = form[key] ?? 0;
    return {
      type: 'number',
      step: 'any',
      disabled: forceDisabled !== undefined ? forceDisabled : readOnly,
      className: 'mt-1 font-mono',
      value: externalVal === 0 ? '' : String(externalVal),
      onChange: (e) => set(key, e.target.value),
      onBlur: (e) => setNum(key, e.target.value),
      onFocus: (e) => setTimeout(() => e.target.select(), 0),
    };
  }, [form, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  // crédito reduz o total de desconto, débito aumenta
  const firstDiscountTotal = firstDiscounts.reduce((s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0), 0);
  const secondDiscountTotal = secondDiscounts.reduce((s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0), 0);

  // Total desconto faltas vindo dos ajustes de ponto (nova estrutura multi-coluna)
  const totalDiscount = totalAbsenceDiscount(absenceDiscounts);
  const { first: absenceFirst, second: absenceSecond } = absenceDiscountByPeriod(absenceDiscounts);

  // Valores efetivos CLT Moto:
  // Valor dia = campo total / fullMonthContractDays (mês cheio, sem considerar admissão)
  // Valor efetivo = valor dia × contractWorkingDays (dias trabalhados)
  const denomDays = fullMonthContractDays > 0 ? fullMonthContractDays : 1;
  const foodVoucherDayValue = isCLTMoto
    ? Math.round((form.food_voucher / denomDays) * 10000) / 10000
    : 0;
  const foodVoucherEffective = isCLTMoto
    ? Math.round(foodVoucherDayValue * contractWorkingDays * 100) / 100
    : form.food_voucher;
  const costAllowanceDayValue = isCLTMoto
    ? Math.round((form.cost_allowance / denomDays) * 10000) / 10000
    : 0;
  const costAllowanceEffective = isCLTMoto
    ? Math.round(costAllowanceDayValue * contractWorkingDays * 100) / 100
    : form.cost_allowance;
  const motoRentalDayValue = isCLTMoto
    ? Math.round((form.motorcycle_rental / denomDays) * 10000) / 10000
    : 0;
  const motoRentalEffective = isCLTMoto
    ? Math.round(motoRentalDayValue * contractWorkingDays * 100) / 100
    : form.motorcycle_rental;

  // Para CLT moto: os cálculos usam o salário EFETIVO (proporcional), não o base do contrato
  // Os valores de Aluguel Moto, Ajuda de Custo e VA também usam os valores efetivos
  const calcForm = {
    ...form,
    base_salary: isCLTMoto ? cltMotoEffectiveSalary : form.base_salary,
    motorcycle_rental: isCLTMoto ? motoRentalEffective : form.motorcycle_rental,
    cost_allowance: isCLTMoto ? costAllowanceEffective : form.cost_allowance,
    food_voucher: isCLTMoto ? foodVoucherEffective : form.food_voucher,
    absence_discount: totalDiscount,
    absence_discount_first: absenceFirst,
    absence_discount_second: absenceSecond,
    first_period_discount: firstDiscountTotal,
    second_period_discount: secondDiscountTotal,
    union_contribution_value: form.union_contribution_value,
    first_period_split: firstPeriodSplit,
  };
  const calcRaw = calculatePayroll(calcForm, employee.contract_type, payrollType);
  // Se 1ª quinzena está bloqueada (paga/status bloqueante) OU congelada pelo reajuste, usa o valor do banco
  const isFirstBaseFrozen = (q1Locked || !!entry?.first_period_base_locked) && entry?.first_period_base != null;
  const calc = (() => {
    if (isFirstBaseFrozen && calcRaw.net_total !== 0) {
      const frozenFirstBase = entry.first_period_base;
      const frozenFirstNet = entry.first_period_net ?? frozenFirstBase;
      const newSecondBase = calcRaw.net_total - frozenFirstBase;
      const newSecondNet = newSecondBase + foodVoucherEffective + (calcRaw.km_bonus || 0) + costAllowanceEffective - secondDiscountTotal - absenceSecond;
      return {
        ...calcRaw,
        first_period_base: frozenFirstBase,
        second_period_base: newSecondBase,
        first_period_net: frozenFirstNet,
        second_period_net: newSecondNet,
      };
    }
    if (calcRaw.net_total === 0 && firstBaseOverride !== null) {
      return {
        ...calcRaw,
        first_period_base: firstBaseOverride,
        second_period_base: -firstBaseOverride,
        first_period_net: firstBaseOverride - (form.first_period_advance || 0) - firstDiscountTotal - absenceFirst,
        second_period_net: -firstBaseOverride - secondDiscountTotal - absenceSecond,
      };
    }
    return calcRaw;
  })();

  const handleInstallmentConfirm = async ({ description, installmentValue, startDate, preview, installments }) => {
    const isFirst = installmentDialog === 'first';
    // 1ª parcela: entra direto como desconto na quinzena atual + registrada no CashOut para rastreamento
    const firstEntry = {
      date: startDate,
      description: `${description} (1/${installments})`,
      amount: installmentValue,
      id: Date.now(),
    };
    if (isFirst) setFirstDiscounts(prev => [...prev, firstEntry]);
    else setSecondDiscounts(prev => [...prev, firstEntry]);
    setInstallmentDialog(null);
    // Todas as parcelas (incluindo a 1ª) são registradas no CashOut com source=payroll_installment
    for (let i = 0; i < preview.length; i++) {
      const p = preview[i];
      const day = isFirst ? 15 : 28;
      const date = i === 0 ? startDate : `${p.month}-${String(day).padStart(2, '0')}`;
      await base44.entities.CashOut.create({
        employee_id: employee.id,
        company_id: employee.company_id,
        date,
        description: `${description} (${i + 1}/${installments})`,
        amount: installmentValue,
        reference_month: p.month,
        period: isFirst ? 'first' : 'second',
        notes: `Parcela ${i + 1}/${installments} — parcelamento gerado em ${referenceMonth}`,
        deduct_from_payroll: i > 0, // 1ª já foi aplicada direto na folha
        source: 'payroll_installment',
      });
    }
  };

  // Converte hh:mm + valor/hora em total de hora extra
  const overtimeDecimal = (() => {
    const parts = overtimeHours.split(':');
    const h = parseInt(parts[0]) || 0;
    const m = parseInt(parts[1]) || 0;
    return h + m / 60;
  })();
  const overtimeTotal = Math.round(overtimeDecimal * overtimeHourValue * 100) / 100;

  // HE: base sempre sobre salário CHEIO do contrato + 30% de periculosidade sobre o salário cheio
  const heFullSalary = isCLTMoto ? form.clt_moto_base_salary : form.base_salary;
  const heHazard = isCLTMoto ? Math.round(heFullSalary * 0.3 * 100) / 100 : (form.hazard_pay || 0);
  const heBase = heFullSalary + heHazard;
  const heNormal = Math.round((heBase / 220) * 100) / 100;
  const he50 = Math.round((heBase / 220 * 1.5) * 100) / 100;
  const he100 = Math.round((heBase / 220 * 2) * 100) / 100;

  // Total das bonificações extras (CLT Moto) que são pagas na 2ª quinzena mas não somam ao bruto
  const cltExtraBonusTotal = isCLTMoto
    ? (form.delivery_bonus || 0) + (form.delivery_target_bonus || 0) + (form.attendance_bonus || 0) + (form.route_sp_bonus || 0) + overtimeTotal
    : 0;

  const handleSave = () => {
    onSave({
      ...form,
      ...calc,
      // Para CLT moto: base_salary salvo é o valor do contrato (clt_moto_base_salary), NÃO o efetivo
      base_salary: isCLTMoto ? form.clt_moto_base_salary : form.base_salary,
      clt_moto_effective_salary: isCLTMoto ? cltMotoEffectiveSalary : undefined,
      clt_moto_base_salary: form.clt_moto_base_salary,
      clt_moto_worked_days: parseInt(form.clt_moto_worked_days) || 0,
      meal_voucher_day_value: form.meal_voucher_day_value,
      meal_voucher_days: form.meal_voucher_days,
      meal_voucher: calc.meal_voucher,
      km_bonus_qty: form.km_bonus_qty,
      km_bonus_value: form.km_bonus_value,
      km_bonus: calc.km_bonus || 0,
      cost_allowance: form.cost_allowance,
      motorcycle_rental: form.motorcycle_rental,
      food_voucher: form.food_voucher,
      union_contribution_value: form.union_contribution_value,
      union_contribution: calc.union_contribution,
      meal_voucher_discount: calc.meal_voucher_discount,
      inss_pct: form.inss_pct,
      inss_discount: form.inss_discount,
      inss: calc.inss_net,
      absence_discount: totalDiscount,
      absence_discounts: absenceDiscounts,
      absence_discount_first: absenceFirst,
      absence_discount_second: absenceSecond,
      first_period_discount: firstDiscountTotal,
      second_period_discount: secondDiscountTotal,
      first_discounts: firstDiscounts,
      second_discounts: secondDiscounts,
      // Se base 1ª está congelada: salva o split efetivo para que próximo carregamento recalcule corretamente
      first_period_split: isFirstBaseFrozen && calcRaw.net_total !== 0
        ? Math.round((calc.first_period_base / calcRaw.net_total) * 10000) / 10000
        : firstPeriodSplit,
      first_period_base: calc.first_period_base,
      second_period_base: calc.second_period_base,
      first_period_base_locked: entry?.first_period_base_locked || false,
      // Bonificações extras CLT: somam ao second_period_net mas não ao gross/net total
      delivery_bonus: form.delivery_bonus || 0,
      delivery_target_bonus: form.delivery_target_bonus || 0,
      attendance_bonus: form.attendance_bonus || 0,
      route_sp_bonus: form.route_sp_bonus || 0,
      overtime: isCLTMoto ? overtimeTotal : (form.overtime || 0),
      overtime_hour_value: isCLTMoto ? overtimeHourValue : 0,
      second_period_net: (calc.second_period_net || 0) + cltExtraBonusTotal,
      reference_month: referenceMonth,
      full_month_contract_working_days: fullMonthContractDays,
      contract_working_days: contractWorkingDays,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            {readOnly ? 'Visualização — ' : 'Lançamento — '}{employee.name}
            {(() => {
              const list = (employee.workplace_list ?? []).map(id => workplaces.find(w => String(w.tangerino_id) === String(id))?.name).filter(Boolean);
              return list.length > 0 ? <span className="text-xs font-normal text-blue-600 border border-blue-200 rounded px-2 py-0.5 bg-blue-50">{list.join(', ')}</span> : null;
            })()}
            <Badge variant={employee.contract_type === 'CLT' ? 'default' : 'secondary'}>{employee.contract_type}</Badge>
            <span className="text-sm font-normal text-muted-foreground">{getMonthName(referenceMonth)}</span>
            {employee.birth_date && (
              <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">
                Nasc.: {employee.birth_date.split('-').reverse().join('/')}
              </span>
            )}
            {employee.admission_date && (
              <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">
                Admissão: {employee.admission_date.split('-').reverse().join('/')}
              </span>
            )}
            {employee.termination_date && (
              <span className="text-xs text-destructive border border-destructive/30 rounded px-2 py-0.5">
                Demissão: {employee.termination_date.split('-').reverse().join('/')}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="proventos">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="proventos">Proventos</TabsTrigger>
            <TabsTrigger value="quinzenal">Quinzenal</TabsTrigger>
            <TabsTrigger value="faltas">
              Ajuste de Ponto {pointAdjustments.length > 0 && <span className="ml-1 bg-destructive text-destructive-foreground text-xs rounded-full px-1.5">{pointAdjustments.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
          </TabsList>

          <TabsContent value="proventos" className="space-y-4 mt-4">
            {readOnly && (
              <div className="bg-muted/50 border border-border rounded-lg px-4 py-2 text-sm text-muted-foreground">
                Modo visualização — nenhuma alteração pode ser realizada.
              </div>
            )}
            {!readOnly && (q1Locked || q2Locked) && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 text-sm text-amber-700">
                🔒 {q1Locked && q2Locked ? 'Ambas as quinzenas estão bloqueadas — todos os campos estão desabilitados.' : q1Locked ? '1ª quinzena já paga — você pode alterar proventos livremente. A diferença será aplicada automaticamente na base da 2ª quinzena.' : '2ª quinzena bloqueada — campos que afetam a 2ª quinzena estão desabilitados.'}
              </div>
            )}
            {/* Salário e Faltas — CLT Moto: campos de dias trabalhados */}
            {isCLTMoto && (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Remuneração</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Salário Base Informado (R$)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Valor do contrato</p>
                    <Input
                      type="number" step="any" disabled={baseLocked} className="mt-1 font-mono"
                      value={form.clt_moto_base_salary === 0 ? '' : String(form.clt_moto_base_salary)}
                      onChange={e => { if (!readOnly) setForm(f => ({ ...f, clt_moto_base_salary: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 })); }}
                      onBlur={e => {
                        const v = parseFloat(e.target.value) || 0;
                        setConfirmedDailyValue(Math.round((v / 30) * 10000) / 10000);
                      }}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <Label>Valor Dia (R$)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Salário base ÷ 30</p>
                    <div className="mt-1 px-3 py-2 rounded-md border border-border bg-muted/30 font-mono text-sm font-semibold text-primary">
                      {cltMotoDailyValue.toFixed(4).replace('.', ',')}
                    </div>
                  </div>
                  <div>
                    <Label>Dias Trabalhados (0–30)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {employee?.admission_date?.slice(0,7) === referenceMonth
                        ? `Auto: 30 - (${parseInt(employee.admission_date.slice(8,10))} - 1) = ${defaultWorkedDays}`
                        : 'Padrão: 30'}
                    </p>
                    <Input
                      type="number" step="1" min="0" max="30" disabled={baseLocked} className="mt-1 font-mono"
                      value={form.clt_moto_worked_days_str ?? String(form.clt_moto_worked_days)}
                      onChange={e => {
                        if (!readOnly) {
                          const str = e.target.value;
                          const num = str === '' ? 0 : Math.min(30, Math.max(0, parseInt(str) || 0));
                          setForm(f => ({ ...f, clt_moto_worked_days: num, clt_moto_worked_days_str: str }));
                        }
                      }}
                      onBlur={e => {
                        const num = Math.min(30, Math.max(0, parseInt(e.target.value) || 0));
                        setForm(f => ({ ...f, clt_moto_worked_days: num, clt_moto_worked_days_str: String(num) }));
                      }}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-2">
                  <p className="text-xs text-muted-foreground">
                    Salário Efetivo = R$ {cltMotoDailyValue.toFixed(4).replace('.', ',')} × {form.clt_moto_worked_days} dias
                  </p>
                  <p className="font-mono font-bold text-primary text-lg">{formatCurrency(cltMotoEffectiveSalary)}</p>
                </div>
                {/* Campos de dias úteis para benefícios */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border border-border rounded-lg px-4 py-2 bg-muted/10">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-muted-foreground">Total Dias Úteis Contrato (Seg–Sáb, excl. feriados)</p>
                      <p className="text-xs text-muted-foreground">Mês cheio, sem considerar admissão — usado como denominador para valor/dia</p>
                    </div>
                    <Input
                     type="number" step="1" min="1" max="31" disabled={readOnly}
                     className="w-20 font-mono text-center"
                     value={fullMonthContractDays}
                     onChange={e => { if (!readOnly) setFullMonthContractDays(parseInt(e.target.value) || 1); }}
                     onBlur={e => setFullMonthContractDays(isNaN(parseInt(e.target.value)) ? defaultFullMonthDays : Math.max(0, parseInt(e.target.value)))}
                     onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                    {fullMonthContractDays !== defaultFullMonthDays && !readOnly && (
                     <button className="text-xs text-primary underline whitespace-nowrap" onClick={() => setFullMonthContractDays(defaultFullMonthDays)}>
                       Resetar ({defaultFullMonthDays})
                     </button>
                    )}
                    </div>
                    <div className="flex items-center justify-between border border-border rounded-lg px-4 py-2 bg-muted/10">
                    <div className="flex-1">
                     <p className="text-xs font-medium text-muted-foreground">Dias Úteis Trabalhados Contrato</p>
                     <p className="text-xs text-muted-foreground">Dias efetivos trabalhados — usado para calcular valor efetivo (valor dia × este campo)</p>
                    </div>
                    <Input
                     type="number" step="1" min="0" max="31" disabled={readOnly}
                     className="w-20 font-mono text-center"
                     value={contractWorkingDays}
                     onChange={e => { if (!readOnly) setContractWorkingDays(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0)); }}
                     onBlur={e => setContractWorkingDays(isNaN(parseInt(e.target.value)) ? defaultFullMonthDays : Math.max(0, parseInt(e.target.value)))}
                     onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                    {contractWorkingDays !== defaultFullMonthDays && !readOnly && (
                     <button className="text-xs text-primary underline whitespace-nowrap" onClick={() => setContractWorkingDays(defaultFullMonthDays)}>
                       Resetar ({defaultFullMonthDays})
                     </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {!isCLTMoto && <div>
                <Label>Salário Base / Valor Fixo</Label>
                <Input {...numericField('base_salary', baseLocked)} />
              </div>}
              <div>
                <Label>Desconto de Faltas (R$)</Label>
                {totalDiscount > 0 ? (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 font-mono text-sm font-semibold text-destructive">
                      {formatCurrency(totalDiscount)}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">via Ajuste de Ponto</span>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Preencha os descontos na aba Ajuste de Ponto</p>
                )}
              </div>
            </div>

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Benefícios</p>
            {payrollType && (
              <div className="text-xs px-3 py-1.5 rounded-md bg-accent text-accent-foreground font-medium w-fit">
                Modelo: {{'MOTOCICLISTA_CLT':'Motociclista CLT','MOTOCICLISTA_MEI':'Motociclista MEI','ESCRITORIO':'Escritório','SOCIO':'Sócio'}[payrollType]}
              </div>
            )}

            {/* Vale Refeição com valor dia + dias */}
            {show('meal_voucher') && <div>
              <Label>Vale Refeição</Label>
              <div className="flex gap-2 mt-1 items-center">
                <div className="flex-1">
                  <Input {...numericField('meal_voucher_day_value', baseLocked)} className="font-mono" placeholder="Valor/dia" />
                  <p className="text-xs text-muted-foreground mt-0.5">Valor por dia</p>
                </div>
                <span className="text-muted-foreground font-bold text-lg">×</span>
                <div className="w-24">
                  <Input {...numericField('meal_voucher_days', baseLocked)} className="font-mono text-center" />
                  <p className="text-xs text-muted-foreground mt-0.5 text-center">
                    {!entry && employee?.admission_date?.slice(0, 7) === referenceMonth ? 'Dias (admissão)' : 'Dias úteis'}
                  </p>
                </div>
                <span className="text-muted-foreground">=</span>
                <div className="w-32 bg-muted/40 rounded-lg p-2 text-right">
                  <p className="font-mono font-semibold text-primary">{formatCurrency(calc.meal_voucher)}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </div>}

            {show('food_voucher') && (
              <div>
                <Label>Vale Alimentação</Label>
                <div className="flex gap-2 mt-1 items-end">
                  <div className="flex-1">
                    <Input {...numericField('food_voucher', q2ExtraLocked)} className="font-mono" placeholder="Valor total" />
                    <p className="text-xs text-muted-foreground mt-0.5">Valor total mensal (R$)</p>
                  </div>
                  <span className="text-muted-foreground pb-2">÷</span>
                  <div className="w-24">
                    <Input
                      type="number" step="1" min="1" max="31" disabled={readOnly}
                      className="font-mono text-center"
                      value={fullMonthContractDays}
                      onChange={e => { if (!readOnly) setFullMonthContractDays(parseInt(e.target.value) || 1); }}
                      onBlur={e => setFullMonthContractDays(isNaN(parseInt(e.target.value)) ? defaultFullMonthDays : Math.max(0, parseInt(e.target.value)))}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5 text-center">Total dias úteis</p>
                  </div>
                  <span className="text-muted-foreground pb-2">=</span>
                  <div className="w-40 rounded-lg p-2 text-right border border-secondary/30 bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Valor dia</p>
                    <p className="font-mono font-semibold text-secondary text-sm">{formatCurrency(foodVoucherDayValue)}/dia</p>
                    <p className="text-xs text-muted-foreground mt-1">Valor efetivo ({contractWorkingDays}d trab.)</p>
                    <p className="font-mono font-bold text-secondary">{formatCurrency(foodVoucherEffective)}</p>
                  </div>
                </div>
              </div>
            )}

            {show('km_bonus') && (
              <div>
                <Label>Ajuda de custo pacote de dados</Label>
                <div className="flex gap-2 mt-1 items-end">
                  <div className="flex-1">
                    <Input {...numericField('cost_allowance', q2ExtraLocked)} className="font-mono" placeholder="Valor total" />
                    <p className="text-xs text-muted-foreground mt-0.5">Valor total mensal (R$)</p>
                  </div>
                  <span className="text-muted-foreground pb-2">÷</span>
                  <div className="w-24">
                    <Input
                      type="number" step="1" min="1" max="31" disabled={readOnly}
                      className="font-mono text-center"
                      value={fullMonthContractDays}
                      onChange={e => { if (!readOnly) setFullMonthContractDays(parseInt(e.target.value) || 1); }}
                      onBlur={e => setFullMonthContractDays(isNaN(parseInt(e.target.value)) ? defaultFullMonthDays : Math.max(0, parseInt(e.target.value)))}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5 text-center">Total dias úteis</p>
                  </div>
                  <span className="text-muted-foreground pb-2">=</span>
                  <div className="w-40 rounded-lg p-2 text-right border border-secondary/30 bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Valor dia</p>
                    <p className="font-mono font-semibold text-secondary text-sm">{formatCurrency(costAllowanceDayValue)}/dia</p>
                    <p className="text-xs text-muted-foreground mt-1">Valor efetivo ({contractWorkingDays}d trab.)</p>
                    <p className="font-mono font-bold text-secondary">{formatCurrency(costAllowanceEffective)}</p>
                  </div>
                </div>
              </div>
            )}

            {show('motorcycle_rental') && (
              <div>
                <Label>Aluguel da Motocicleta</Label>
                <div className="flex gap-2 mt-1 items-end">
                  <div className="flex-1">
                    <Input {...numericField('motorcycle_rental', baseLocked)} className="font-mono" placeholder="Valor total" />
                    <p className="text-xs text-muted-foreground mt-0.5">Valor total mensal (R$)</p>
                  </div>
                  <span className="text-muted-foreground pb-2">÷</span>
                  <div className="w-24">
                    <Input
                      type="number" step="1" min="1" max="31" disabled={readOnly}
                      className="font-mono text-center"
                      value={fullMonthContractDays}
                      onChange={e => { if (!readOnly) setFullMonthContractDays(parseInt(e.target.value) || 1); }}
                      onBlur={e => setFullMonthContractDays(isNaN(parseInt(e.target.value)) ? defaultFullMonthDays : Math.max(0, parseInt(e.target.value)))}
                      onFocus={e => setTimeout(() => e.target.select(), 0)}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5 text-center">Total dias úteis</p>
                  </div>
                  <span className="text-muted-foreground pb-2">=</span>
                  <div className="w-40 rounded-lg p-2 text-right border border-secondary/30 bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Valor dia</p>
                    <p className="font-mono font-semibold text-secondary text-sm">{formatCurrency(motoRentalDayValue)}/dia</p>
                    <p className="text-xs text-muted-foreground mt-1">Valor efetivo ({contractWorkingDays}d trab.)</p>
                    <p className="font-mono font-bold text-secondary">{formatCurrency(motoRentalEffective)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {show('transport_voucher') && <div>
                <Label>Vale Transporte</Label>
                <Input {...numericField('transport_voucher', baseLocked)} />
              </div>}
              {show('km_bonus') && <div className="col-span-2">
                <Label>KM Adicional</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <div className="flex-1">
                    <Input {...numericField('km_bonus_qty', q2ExtraLocked)} className="font-mono" placeholder="Qtd. KM" />
                    <p className="text-xs text-muted-foreground mt-0.5">Quantidade de KM</p>
                  </div>
                  <span className="text-muted-foreground font-bold text-lg">×</span>
                  <div className="flex-1">
                    <Input {...numericField('km_bonus_value', q2ExtraLocked)} className="font-mono" placeholder="R$/KM" />
                    <p className="text-xs text-muted-foreground mt-0.5">Valor por KM (R$)</p>
                  </div>
                  <span className="text-muted-foreground">=</span>
                  <div className="w-32 bg-muted/40 rounded-lg p-2 text-right">
                    <p className="font-mono font-semibold text-primary">{formatCurrency(calc.km_bonus || 0)}</p>
                    <p className="text-xs text-muted-foreground">Total KM</p>
                  </div>
                </div>
              </div>}
              {show('hazard_pay') && <div>
                <Label>Periculosidade (30% do salário efetivo)</Label>
                <Input
                  {...numericField('hazard_pay', baseLocked)}
                  onFocus={(e) => { setTimeout(() => e.target.select(), 0); }}
                  onChange={(e) => { set('hazard_pay', e.target.value); setHazardPayManuallyEdited(true); }}
                  onBlur={(e) => { setNum('hazard_pay', e.target.value); setHazardPayManuallyEdited(true); }}
                />
                {isCLTMoto && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(() => {
                      const effectiveSal = cltMotoEffectiveSalary;
                      const autoVal = Math.round(effectiveSal * 0.3 * 100) / 100;
                      return (
                        <>
                          Auto: {formatCurrency(autoVal)} (30% de {formatCurrency(effectiveSal)})
                          {!readOnly && hazardPayManuallyEdited && (
                            <button className="ml-2 text-primary underline" onClick={() => { setForm(f => ({ ...f, hazard_pay: autoVal })); setHazardPayManuallyEdited(false); }}>
                              Resetar
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </p>
                )}
              </div>}
              <div>
                <Label>Bonificação / Prêmio</Label>
                <Input {...numericField('bonus', baseLocked)} />
              </div>
              <div>
                <Label>Outros Benefícios</Label>
                <Input {...numericField('other_benefits', baseLocked)} />
              </div>
            </div>

            {isCLTMoto && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bonificações (pagas na 2ª quinzena — não somam ao bruto)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Label>Bonificação por Entrega</Label>
                      {empWorkplace && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${empWorkplace.clt_moto_delivery_bonus_enabled ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                          {empWorkplace.clt_moto_delivery_bonus_enabled ? 'Sim' : 'Não'} no local
                        </span>
                      )}
                    </div>
                    <Input {...numericField('delivery_bonus', q2ExtraLocked)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Label>Bonificação Meta de Entrega</Label>
                      {empWorkplace && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${empWorkplace.clt_moto_delivery_target_bonus_enabled ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                          {empWorkplace.clt_moto_delivery_target_bonus_enabled ? 'Sim' : 'Não'} no local
                        </span>
                      )}
                    </div>
                    <Input {...numericField('delivery_target_bonus', q2ExtraLocked)} />
                  </div>
                  <div>
                    <Label>Bonificação por Presença</Label>
                    <Input {...numericField('attendance_bonus', q2ExtraLocked)} />
                  </div>
                  <div>
                    <Label>Bonificação Rota SP</Label>
                    <Input {...numericField('route_sp_bonus', q2ExtraLocked)} />
                  </div>
                  <div className="col-span-2">
                    <Label>Hora Extra</Label>
                    {/* Painel informativo de referência */}
                    {heBase > 0 && (
                      <div className="mt-1 mb-2 flex gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-md px-2.5 py-1 text-xs text-blue-700">
                          <span className="font-medium">Normal:</span>
                          <span className="font-mono font-semibold">{formatCurrency(heNormal)}/h</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1 text-xs text-amber-700">
                          <span className="font-medium">HE 50%:</span>
                          <span className="font-mono font-semibold">{formatCurrency(he50)}/h</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-md px-2.5 py-1 text-xs text-orange-700">
                          <span className="font-medium">HE 100%:</span>
                          <span className="font-mono font-semibold">{formatCurrency(he100)}/h</span>
                        </div>
                        <p className="text-xs text-muted-foreground self-center">Base: ({formatCurrency(heFullSalary)} + {formatCurrency(heHazard)} peric.) ÷ 220 = {formatCurrency(heNormal)}</p>
                      </div>
                    )}
                    <div className="flex gap-2 items-end">
                      <div className="w-32">
                        <input
                          type="text"
                          disabled={q2ExtraLocked}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm font-mono shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 mt-1"
                          placeholder="hh:mm"
                          value={overtimeHours}
                          onChange={e => setOvertimeHours(e.target.value)}
                          onBlur={e => {
                            // Normaliza formato hh:mm
                            const val = e.target.value.trim();
                            if (/^\d+:\d{2}$/.test(val)) {
                              const [h, m] = val.split(':').map(Number);
                              setOvertimeHours(`${String(h).padStart(2,'0')}:${String(Math.min(59, m)).padStart(2,'0')}`);
                            } else if (/^\d+$/.test(val)) {
                              setOvertimeHours(`${String(parseInt(val)).padStart(2,'0')}:00`);
                            }
                          }}
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">Qtd. Horas (hh:mm)</p>
                      </div>
                      <span className="text-muted-foreground pb-2">×</span>
                      <div className="w-36">
                        <Input
                          type="number" step="any" disabled={q2ExtraLocked}
                          className="mt-1 font-mono"
                          value={overtimeHourValue === 0 ? '' : String(overtimeHourValue)}
                          onChange={e => setOvertimeHourValue(parseFloat(e.target.value) || 0)}
                          onBlur={e => setOvertimeHourValue(parseFloat(e.target.value) || 0)}
                          onFocus={e => setTimeout(() => e.target.select(), 0)}
                          placeholder="R$/hora"
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">Valor por Hora (R$)</p>
                      </div>
                      <span className="text-muted-foreground pb-2">=</span>
                      <div className="flex-1 bg-muted/40 rounded-lg p-2 text-right">
                        <p className="font-mono font-semibold text-primary">{formatCurrency(overtimeTotal)}</p>
                        <p className="text-xs text-muted-foreground">Total Hora Extra</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descontos</p>
            <div className="grid grid-cols-2 gap-4">
              {show('union_contribution_pct') && <div>
                <Label>Contribuição Assistencial (2% do salário base)</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <Input
                    {...numericField('union_contribution_value', baseLocked)}
                    onChange={e => { set('union_contribution_value', e.target.value); if (!entry) setUnionContribManuallyEdited(true); }}
                    onBlur={e => { setNum('union_contribution_value', e.target.value); if (!entry) setUnionContribManuallyEdited(true); }}
                  />
                  {!readOnly && !entry && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatCurrency(Math.round((isCLTMoto ? cltMotoEffectiveSalary : form.base_salary) * 0.02 * 100) / 100)} (2%)
                      {unionContribManuallyEdited && <button className="ml-1 text-primary underline" onClick={() => setUnionContribManuallyEdited(false)}>Resetar</button>}
                    </span>
                  )}
                </div>
              </div>}
              {show('meal_voucher_discount_pct') && <div>
                <Label>Desconto VR (% sobre total do VR)</Label>
                <div className="flex gap-2 mt-1 items-center">
                  <Input {...numericField('meal_voucher_discount_pct', baseLocked)} className="font-mono" placeholder="%" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.meal_voucher_discount)}</span>
                </div>
              </div>}
              {show('life_insurance') && <div>
                <Label>Seguro de Vida (R$)</Label>
                <Input {...numericField('life_insurance', baseLocked)} />
              </div>}
            </div>

            {(employee.contract_type === 'PJ' || show('pj_retention')) && !['MOTOCICLISTA_CLT','ESCRITORIO'].includes(payrollType) && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Retenções PJ</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Retenção PJ</Label>
                    <Input {...numericField('pj_retention', baseLocked)} />
                  </div>
                </div>
              </>
            )}

            {employee.contract_type === 'CLT' && show('inss') && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">INSS</p>
                {isCLTMoto && !inssManuallyEdited && (
                  <div className="text-xs px-3 py-1.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700">
                    % e desconto calculados automaticamente pela tabela do salário efetivo. Edite para personalizar.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>INSS %</Label>
                    <div className="flex gap-2 mt-1 items-center">
                      <Input
                        {...numericField('inss_pct', baseLocked)}
                        className="font-mono"
                        placeholder="% INSS"
                        onChange={e => { set('inss_pct', e.target.value); if (isCLTMoto) setInssManuallyEdited(true); }}
                        onBlur={e => { setNum('inss_pct', e.target.value); if (isCLTMoto) setInssManuallyEdited(true); }}
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">= {formatCurrency(calc.inss)}</span>
                    </div>
                    {isCLTMoto && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Auto: {calcAutoINSS(cltMotoEffectiveSalary + (form.hazard_pay || 0)).pct}% — base {formatCurrency(cltMotoEffectiveSalary + (form.hazard_pay || 0))} (efetivo + periculosidade)
                        {inssManuallyEdited && !readOnly && <button className="ml-2 text-primary underline" onClick={() => { const a = calcAutoINSS(cltMotoEffectiveSalary + (form.hazard_pay || 0)); setForm(f => ({ ...f, inss_pct: a.pct, inss_discount: a.discount })); setInssManuallyEdited(false); }}>Resetar</button>}
                      </p>
                    )}
                    {!isCLTMoto && <p className="text-xs text-muted-foreground mt-0.5">Deixe 0 para usar tabela progressiva INSS 2026</p>}
                  </div>
                  <div>
                    <Label>Desconto INSS (R$)</Label>
                    <div className="flex gap-2 mt-1 items-center">
                      <Input
                        {...numericField('inss_discount', baseLocked)}
                        className="font-mono"
                        placeholder="Desconto"
                        onChange={e => { set('inss_discount', e.target.value); if (isCLTMoto) setInssManuallyEdited(true); }}
                        onBlur={e => { setNum('inss_discount', e.target.value); if (isCLTMoto) setInssManuallyEdited(true); }}
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Líq: {formatCurrency(calc.inss_net)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Reduz o INSS calculado</p>
                  </div>
                </div>
              </>
            )}

            <Separator />
            <div className="flex items-center justify-between bg-muted/40 rounded-lg px-4 py-3">
              <div>
                <p className="font-bold text-base">Total Bruto</p>
                <p className="text-xs text-muted-foreground">Antes dos descontos</p>
              </div>
              <p className="font-mono font-bold text-foreground text-xl">{formatCurrency(calc.gross_total)}</p>
            </div>

            {/* Detalhe dos descontos entre bruto e líquido */}
            {(() => {
              const items = [];
              if (calc.inss_net > 0) items.push({ label: `INSS${form.inss_discount > 0 ? ` (desc. ${formatCurrency(form.inss_discount)})` : ''}`, value: calc.inss_net });
              if (calc.irrf > 0) items.push({ label: 'IRRF', value: calc.irrf });
              if (calc.union_contribution > 0) items.push({ label: 'Contribuição Assistencial', value: calc.union_contribution });
              if (calc.meal_voucher_discount > 0) items.push({ label: `Desconto VR (${form.meal_voucher_discount_pct}%)`, value: calc.meal_voucher_discount });
              if (form.life_insurance > 0) items.push({ label: 'Seguro de Vida', value: form.life_insurance });
              // Faltas são exibidas nas quinzenas — não entram no bloco de descontos da aba Proventos
              if (items.length === 0) return null;
              const totalDesc = items.reduce((s, i) => s + i.value, 0);
              return (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 space-y-1.5">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-2">Descontos</p>
                  {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-mono text-destructive">- {formatCurrency(item.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t border-destructive/20 pt-1.5 mt-1">
                    <span className="text-destructive">Total Descontos</span>
                    <span className="font-mono text-destructive">- {formatCurrency(totalDesc)}</span>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-3">
              <div>
                <p className="font-bold text-base">Total a Receber</p>
                <p className="text-xs text-muted-foreground">Líquido após todos os descontos</p>
              </div>
              <p className="font-mono font-bold text-primary text-2xl">{formatCurrency(calc.net_total)}</p>
            </div>
          </TabsContent>

          <TabsContent value="quinzenal" className="space-y-5 mt-4">
            {entry?.first_period_base_locked && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-300 rounded-lg px-3 py-2 text-xs text-blue-700 font-medium">
                🔒 Base da 1ª Quinzena congelada pelo reajuste salarial — a diferença foi lançada integralmente na 2ª Quinzena.
              </div>
            )}
            {q1Locked && !readOnly && !entry?.first_period_base_locked && entry?.first_period_base > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-300 rounded-lg px-3 py-2 text-xs text-blue-700 font-medium">
                1ª quinzena já paga — Base congelada. Alterações refletem apenas na 2ª quinzena e o % de rateio será recalculado automaticamente.
              </div>
            )}
            {/* Rateio editável */}
            <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Base 1ª Quinzena</p>
            {(readOnly || entry?.first_period_base_locked || q1Locked) ? (
              <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.first_period_base ?? calc.net_total / 2)}</p>
            ) : (
              <PeriodBaseInput
                value={calc.net_total !== 0 ? (calc.first_period_base ?? calc.net_total / 2) : (firstBaseOverride ?? 0)}
                onChange={v => {
                  if (calc.net_total !== 0) {
                    setFirstPeriodSplit(v / calc.net_total);
                    setFirstBaseOverride(null);
                  } else {
                    setFirstBaseOverride(v);
                  }
                }}
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">{calc.net_total !== 0 ? `${Math.round((calc.first_period_base / calc.net_total) * 100)}% do líquido` : 'valor fixo'}</p>
            </div>
            <div className="bg-muted/30 rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Base 2ª Quinzena</p>
            {(readOnly || q1Locked) ? (
              <p className="font-mono font-bold text-foreground text-lg">{formatCurrency(calc.second_period_base ?? calc.net_total / 2)}</p>
            ) : (
              <PeriodBaseInput
                value={calc.net_total !== 0 ? (calc.second_period_base ?? calc.net_total / 2) : (firstBaseOverride !== null ? -firstBaseOverride : 0)}
                onChange={v => {
                  if (calc.net_total !== 0) {
                    setFirstPeriodSplit(1 - v / calc.net_total);
                    setFirstBaseOverride(null);
                  } else {
                    setFirstBaseOverride(-v);
                  }
                }}
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">{calc.net_total !== 0 ? `${Math.round(((calc.second_period_base ?? (calc.net_total - calc.first_period_base)) / calc.net_total) * 100)}% do líquido` : 'valor fixo'}</p>
            </div>
            </div>
            {firstPeriodSplit !== 0.5 && !q1Locked && (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="text-xs text-amber-700">Rateio personalizado: {Math.round(firstPeriodSplit * 100)}% / {Math.round((1 - firstPeriodSplit) * 100)}%</span>
                {!readOnly && <button className="text-xs text-amber-700 underline" onClick={() => setFirstPeriodSplit(0.5)}>Resetar para 50/50</button>}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1ª Quinzena */}
              <div className="space-y-3 border border-border rounded-xl p-4">
                {q1Locked && (
                 <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-700 font-medium">
                    🔒 1ª Quinzena bloqueada — status: <strong>{paymentStatus?.status_q1}</strong>
                 </div>
                )}
                {paymentStatus?.payment_date_q1 && (
                 <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                   <span className="text-xs text-green-700 font-medium">📅 Data de Pagamento</span>
                   <span className="text-xs font-mono text-green-700 font-semibold">{paymentStatus.payment_date_q1.split('-').reverse().join('/')}</span>
                 </div>
                )}
                <div className="flex items-center justify-between">
                 <p className="font-semibold text-sm">1ª Quinzena (1–15)</p>
                  <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.first_period_base ?? calc.net_total / 2)}</span>
                </div>
                {absenceFirst > 0 && (
                  <div className="flex items-center justify-between bg-destructive/10 rounded-lg px-3 py-2">
                    <span className="text-xs text-destructive font-medium">− Desc. Faltas (dias 1–15)</span>
                    <span className="font-mono text-xs font-semibold text-destructive">- {formatCurrency(absenceFirst)}</span>
                  </div>
                )}
                <div>
                  <Label className="text-xs">Adiantamento</Label>
                  <Input {...numericField('first_period_advance')} disabled={readOnly || q1Locked} className="mt-1 font-mono h-8 text-sm" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Descontos da 1ª Quinzena</p>
                  <PeriodDiscountsTable items={firstDiscounts} onChange={(readOnly || q1Locked) ? () => {} : setFirstDiscounts} readOnly={readOnly || q1Locked} onOpenInstallment={(readOnly || q1Locked) ? undefined : () => setInstallmentDialog('first')} />
                </div>
                <div className={`${calc.first_period_net < 0 ? 'bg-destructive/10' : 'bg-primary/10'} rounded-lg px-4 py-3 flex justify-between items-center`}>
                  <div>
                    <p className="text-xs text-muted-foreground">{calc.first_period_net < 0 ? 'Saldo Negativo 1ª Quinzena' : 'Á Receber 1ª Quinzena'}</p>
                    <p className="text-xs text-muted-foreground">Descontos: {formatCurrency(firstDiscountTotal + form.first_period_advance + absenceFirst)}</p>
                  </div>
                  <p className={`font-mono font-bold text-lg ${calc.first_period_net < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(calc.first_period_net)}</p>
                </div>
              </div>

              {/* 2ª Quinzena */}
              <div className="space-y-3 border border-border rounded-xl p-4">
                {q2Locked && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-700 font-medium">
                    🔒 2ª Quinzena bloqueada — status: <strong>{paymentStatus?.status_q2}</strong>
                  </div>
                )}
                {paymentStatus?.payment_date_q2 && (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <span className="text-xs text-green-700 font-medium">📅 Data de Pagamento</span>
                    <span className="text-xs font-mono text-green-700 font-semibold">{paymentStatus.payment_date_q2.split('-').reverse().join('/')}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">2ª Quinzena (16–30)</p>
                  <span className="text-xs text-muted-foreground">Base: {formatCurrency(calc.second_period_base ?? calc.net_total / 2)}</span>
                </div>
                {show('food_voucher') && foodVoucherEffective > 0 && (
                   <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                     <span className="text-xs text-secondary font-medium">+ Vale Alimentação (pago na 2ª quinzena)</span>
                     <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(foodVoucherEffective)}</span>
                   </div>
                 )}
                {isCLTMoto && (form.delivery_bonus > 0 || form.delivery_target_bonus > 0 || form.attendance_bonus > 0 || form.route_sp_bonus > 0 || form.overtime > 0 || overtimeTotal > 0) && (
                  <div className="space-y-1">
                    {form.delivery_bonus > 0 && (
                      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <span className="text-xs text-amber-700 font-medium">+ Bonificação por Entrega</span>
                        <span className="font-mono text-xs font-semibold text-amber-700">+ {formatCurrency(form.delivery_bonus)}</span>
                      </div>
                    )}
                    {form.delivery_target_bonus > 0 && (
                      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <span className="text-xs text-amber-700 font-medium">+ Bonificação Meta de Entrega</span>
                        <span className="font-mono text-xs font-semibold text-amber-700">+ {formatCurrency(form.delivery_target_bonus)}</span>
                      </div>
                    )}
                    {form.attendance_bonus > 0 && (
                      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <span className="text-xs text-amber-700 font-medium">+ Bonificação por Presença</span>
                        <span className="font-mono text-xs font-semibold text-amber-700">+ {formatCurrency(form.attendance_bonus)}</span>
                      </div>
                    )}
                    {form.route_sp_bonus > 0 && (
                      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <span className="text-xs text-amber-700 font-medium">+ Bonificação Rota SP</span>
                        <span className="font-mono text-xs font-semibold text-amber-700">+ {formatCurrency(form.route_sp_bonus)}</span>
                      </div>
                    )}
                    {overtimeTotal > 0 && (
                      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <span className="text-xs text-amber-700 font-medium">+ Hora Extra ({overtimeHours}h × {formatCurrency(overtimeHourValue)})</span>
                        <span className="font-mono text-xs font-semibold text-amber-700">+ {formatCurrency(overtimeTotal)}</span>
                      </div>
                    )}
                  </div>
                )}
                {absenceSecond > 0 && (
                  <div className="flex items-center justify-between bg-destructive/10 rounded-lg px-3 py-2">
                    <span className="text-xs text-destructive font-medium">− Desc. Faltas (dias 16–31)</span>
                    <span className="font-mono text-xs font-semibold text-destructive">- {formatCurrency(absenceSecond)}</span>
                  </div>
                )}
                {show('km_bonus') && (calc.km_bonus > 0 || form.cost_allowance > 0) && (
                  <div className="space-y-1">
                    {calc.km_bonus > 0 && (
                      <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                        <span className="text-xs text-secondary font-medium">+ KM Adicional ({form.km_bonus_qty} km × {formatCurrency(form.km_bonus_value)})</span>
                        <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(calc.km_bonus)}</span>
                      </div>
                    )}
                    {costAllowanceEffective > 0 && (
                      <div className="flex items-center justify-between bg-secondary/10 rounded-lg px-3 py-2">
                        <span className="text-xs text-secondary font-medium">+ Ajuda de custo pacote de dados</span>
                        <span className="font-mono text-xs font-semibold text-secondary">+ {formatCurrency(costAllowanceEffective)}</span>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Descontos da 2ª Quinzena</p>
                  <PeriodDiscountsTable items={secondDiscounts} onChange={(readOnly || q2Locked) ? () => {} : setSecondDiscounts} readOnly={readOnly || q2Locked} onOpenInstallment={(readOnly || q2Locked) ? undefined : () => setInstallmentDialog('second')} />
                </div>
                <div className={`${(calc.second_period_net + cltExtraBonusTotal) < 0 ? 'bg-destructive/10' : 'bg-primary/10'} rounded-lg px-4 py-3 flex justify-between items-center`}>
                  <div>
                    <p className="text-xs text-muted-foreground">{(calc.second_period_net + cltExtraBonusTotal) < 0 ? 'Saldo Negativo 2ª Quinzena' : 'Á Receber 2ª Quinzena'}</p>
                    <p className="text-xs text-muted-foreground">Descontos: {formatCurrency(secondDiscountTotal + absenceSecond)}</p>
                  </div>
                  <p className={`font-mono font-bold text-lg ${(calc.second_period_net + cltExtraBonusTotal) < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(calc.second_period_net + cltExtraBonusTotal)}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="faltas" className="mt-4">
            {pointAdjustments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <p className="text-sm">Nenhum ajuste de ponto registrado para este colaborador neste mês.</p>
                {!employee.tangerino_id && (
                  <p className="text-xs text-destructive">Colaborador sem vínculo com Tangerino.</p>
                )}
              </div>
            ) : (
              <AbsenceDiscountsTable
                pointAdjustments={pointAdjustments}
                absenceDiscounts={absenceDiscounts}
                setAbsenceDiscounts={setAbsenceDiscounts}
                readOnly={readOnly}
                isMotocyclist={payrollType === 'MOTOCICLISTA_CLT'}
                payrollForm={{
                  ...form,
                  full_month_contract_working_days: fullMonthContractDays,
                  contract_working_days: contractWorkingDays,
                }}
                lockedPeriods={{ first: q1Locked, second: q2Locked }}
              />
            )}
          </TabsContent>

          <TabsContent value="resumo" className="mt-4">
            <div className="space-y-3">
              {form.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Observação</p>
                  <p className="text-sm text-amber-800">{form.notes}</p>
                </div>
              )}
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
              {calc.meal_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Refeição ({form.meal_voucher_days}d × {formatCurrency(form.meal_voucher_day_value)})</span><span className="font-mono">{formatCurrency(calc.meal_voucher)}</span></div>}
              {show('food_voucher') && form.food_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Alimentação</span><span className="font-mono">{formatCurrency(form.food_voucher)}</span></div>}
              {form.transport_voucher > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Vale Transporte</span><span className="font-mono">{formatCurrency(form.transport_voucher)}</span></div>}
              {show('km_bonus') && calc.km_bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">KM Adicional ({form.km_bonus_qty} km × {formatCurrency(form.km_bonus_value)})</span><span className="font-mono">{formatCurrency(calc.km_bonus)}</span></div>}
              {show('km_bonus') && form.cost_allowance > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Ajuda de custo pacote de dados</span><span className="font-mono">{formatCurrency(form.cost_allowance)}</span></div>}
              {form.motorcycle_rental > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Aluguel da Motocicleta</span><span className="font-mono">{formatCurrency(form.motorcycle_rental)}</span></div>}
              {form.hazard_pay > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Periculosidade</span><span className="font-mono">{formatCurrency(form.hazard_pay)}</span></div>}
              {form.bonus > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Bonificação</span><span className="font-mono">{formatCurrency(form.bonus)}</span></div>}
              {form.other_benefits > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Outros</span><span className="font-mono">{formatCurrency(form.other_benefits)}</span></div>}
              <div className="flex justify-between items-center py-2 border-b border-border font-semibold">
                <span>Total Bruto</span>
                <span className="font-mono">{formatCurrency(calc.gross_total)}</span>
              </div>
              {employee.contract_type === 'CLT' && <>
                {calc.inss > 0 && <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-destructive">INSS{form.inss_discount > 0 ? ` (desc. ${formatCurrency(form.inss_discount)})` : ''}</span>
                  <span className="font-mono text-destructive">- {formatCurrency(calc.inss_net)}</span>
                </div>}
                {calc.irrf > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">IRRF</span><span className="font-mono text-destructive">- {formatCurrency(calc.irrf)}</span></div>}
              </>}
              {form.pj_retention > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Retenção PJ</span><span className="font-mono text-destructive">- {formatCurrency(form.pj_retention)}</span></div>}
              {calc.union_contribution > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Contribuição Assistencial</span><span className="font-mono text-destructive">- {formatCurrency(calc.union_contribution)}</span></div>}
              {calc.meal_voucher_discount > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Desconto VR ({form.meal_voucher_discount_pct}%)</span><span className="font-mono text-destructive">- {formatCurrency(calc.meal_voucher_discount)}</span></div>}
              {form.life_insurance > 0 && <div className="flex justify-between py-2 border-b border-border"><span className="text-destructive">Seguro de Vida</span><span className="font-mono text-destructive">- {formatCurrency(form.life_insurance)}</span></div>}

              {/* Descontos Quinzenais */}
              {(firstDiscounts.length > 0 || form.first_period_advance > 0) && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Descontos 1ª Quinzena</p>
                  {form.first_period_advance > 0 && (
                    <div className="flex justify-between py-1 border-b border-border">
                      <span className="text-destructive text-sm">Adiantamento</span>
                      <span className="font-mono text-destructive text-sm">- {formatCurrency(form.first_period_advance)}</span>
                    </div>
                  )}
                  {firstDiscounts.map((d, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-border">
                      <span className={`text-sm ${d.type === 'credit' ? 'text-green-600' : 'text-destructive'}`}>{d.description}</span>
                      <span className={`font-mono text-sm ${d.type === 'credit' ? 'text-green-600' : 'text-destructive'}`}>{d.type === 'credit' ? '+ ' : '- '}{formatCurrency(d.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {secondDiscounts.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Lançamentos 2ª Quinzena</p>
                  {secondDiscounts.map((d, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-border">
                      <span className={`text-sm ${d.type === 'credit' ? 'text-green-600' : 'text-destructive'}`}>{d.description}</span>
                      <span className={`font-mono text-sm ${d.type === 'credit' ? 'text-green-600' : 'text-destructive'}`}>{d.type === 'credit' ? '+ ' : '- '}{formatCurrency(d.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center py-3 bg-primary/10 rounded-lg px-3">
                <span className="font-bold text-lg">Total Líquido</span>
                <span className="font-mono font-bold text-primary text-xl">{formatCurrency(calc.net_total)}</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        </div>
        {installmentDialog && (
          <InstallmentDialog
            open={!!installmentDialog}
            onClose={() => setInstallmentDialog(null)}
            onConfirm={handleInstallmentConfirm}
            referenceMonth={referenceMonth}
            period={installmentDialog}
          />
        )}

        <div className="px-6 pt-4 border-t border-border bg-background shrink-0">
          {(q1Locked || q2Locked) && !readOnly && (
            <div className="mb-2 px-1">
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ Campos da quinzena bloqueada não serão salvos. Apenas a quinzena em aberto pode ser alterada.
              </div>
            </div>
          )}
          {!readOnly && (
            <div className="mb-3">
              <Label className="text-xs">Observação (aparece no PDF)</Label>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={2}
                placeholder="Observação informativa para o recibo..."
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>
          )}
          {entry?.id && <p className="text-xs text-muted-foreground font-mono pb-2">ID da Folha: {entry.id}</p>}
          <div className="flex gap-3 pb-4">
            {readOnly ? (
              <Button variant="outline" className="flex-1" onClick={onClose}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
                <Button className="flex-1" onClick={handleSave}>Salvar Lançamento</Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}