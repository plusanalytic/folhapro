// INSS 2026 - Tabela Progressiva
export const INSS_TABLE_2026 = [
  { max: 1518.00, rate: 0.075 },
  { max: 2793.88, rate: 0.09 },
  { max: 4190.83, rate: 0.12 },
  { max: 8157.41, rate: 0.14 },
];

// IRRF 2026 - Tabela Progressiva
export const IRRF_TABLE_2026 = [
  { max: 2824.00, rate: 0, deduction: 0 },
  { max: 3751.05, rate: 0.075, deduction: 211.80 },
  { max: 4664.68, rate: 0.15, deduction: 492.95 },
  { max: 6101.06, rate: 0.225, deduction: 842.38 },
  { max: Infinity, rate: 0.275, deduction: 1147.23 },
];

export const IRRF_DEPENDENT_DEDUCTION = 189.59;
export const FGTS_RATE = 0.08;

export function calculateINSS(salary) {
  if (salary <= 0) return 0;
  let inss = 0;
  let prev = 0;
  for (const bracket of INSS_TABLE_2026) {
    if (salary > bracket.max) {
      inss += (bracket.max - prev) * bracket.rate;
      prev = bracket.max;
    } else {
      inss += (salary - prev) * bracket.rate;
      break;
    }
  }
  return Math.round(inss * 100) / 100;
}

export function calculateIRRF(salary, inss, dependents = 0) {
  const base = salary - inss - (dependents * IRRF_DEPENDENT_DEDUCTION);
  if (base <= 0) return 0;
  for (const bracket of IRRF_TABLE_2026) {
    if (base <= bracket.max) {
      const irrf = base * bracket.rate - bracket.deduction;
      return Math.max(0, Math.round(irrf * 100) / 100);
    }
  }
  return 0;
}

export function calculateFGTS(salary) {
  return Math.round(salary * FGTS_RATE * 100) / 100;
}

// ─── Cálculo da Páscoa (algoritmo de Butcher/Oudin) ──────────────────────────
function calcEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Retorna Set de feriados para um ano (MM-DD), incluindo feriados móveis
function getHolidaysForYear(year) {
  const fixed = ['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'];
  const holidays = new Set(fixed);
  const easter = calcEaster(year);
  const fmt = (d) => `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  // Sexta-Feira Santa
  const goodFriday = new Date(easter); goodFriday.setDate(easter.getDate() - 2);
  holidays.add(fmt(goodFriday));
  // Corpus Christi (60 dias após Páscoa)
  const corpusChristi = new Date(easter); corpusChristi.setDate(easter.getDate() + 60);
  holidays.add(fmt(corpusChristi));
  return holidays;
}

// Calcula dias úteis de um mês (seg-sex, sem feriados nacionais fixos + móveis)
export function getWorkingDaysInMonth(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const holidays = getHolidaysForYear(year);
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const mmdd = `${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidays.has(mmdd)) continue;
    count++;
  }
  return count;
}

/**
 * Retorna dias úteis a partir de uma data de início até o fim do mês.
 * Usado para calcular VR proporcional quando há admissão no mês da folha.
 * @param {string} fromDate - data de início no formato 'YYYY-MM-DD'
 * @param {string} yearMonth - mês de referência 'YYYY-MM'
 */
export function getWorkingDaysFromDate(fromDate, yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const startDay = parseInt(fromDate.slice(8, 10), 10);
  const holidays = getHolidaysForYear(year);
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = startDay; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const mmdd = `${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidays.has(mmdd)) continue;
    count++;
  }
  return count;
}

/**
 * Dias úteis contrato (Seg-Sáb, excl. feriados).
 * Se o colaborador foi admitido no mesmo mês da folha, conta apenas a partir do dia de admissão.
 * @param {string} yearMonth - 'YYYY-MM'
 * @param {string|null} admissionDate - 'YYYY-MM-DD' ou null
 */
export function getContractWorkingDays(yearMonth, admissionDate = null) {
  const [year, month] = yearMonth.split('-').map(Number);
  const holidays = getHolidaysForYear(year);
  const daysInMonth = new Date(year, month, 0).getDate();
  // Se admitido neste mês, começa a contar a partir do dia de admissão
  let startDay = 1;
  if (admissionDate && admissionDate.slice(0, 7) === yearMonth) {
    startDay = parseInt(admissionDate.slice(8, 10), 10);
  }
  let count = 0;
  for (let d = startDay; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (dow === 0) continue; // exclui domingo
    const mmdd = `${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidays.has(mmdd)) continue;
    count++;
  }
  return count;
}

// Calcula dias úteis de um mês contando Seg-Sáb (exclui domingo e feriados)
export function getWorkingDaysInMonthSatIncluded(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const holidays = getHolidaysForYear(year);
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (dow === 0) continue;
    const mmdd = `${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidays.has(mmdd)) continue;
    count++;
  }
  return count;
}

/**
 * Dias úteis contrato (Seg-Sáb, excl. feriados) — mês cheio, sem considerar admissão.
 */
export function getFullMonthContractWorkingDays(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const holidays = getHolidaysForYear(year);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (dow === 0) continue;
    const mmdd = `${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidays.has(mmdd)) continue;
    count++;
  }
  return count;
}

export function calculateAbsenceDiscount(salary, absenceDays, workingDaysInMonth = 30) {
  if (absenceDays <= 0) return 0;
  const dailyRate = salary / workingDaysInMonth;
  return Math.round(dailyRate * absenceDays * 100) / 100;
}

// Calcula folha modelo ESCRITORIO (convenção coletiva CLT)
export function calculateEscritorioPayroll(entry) {
  const piso = entry.base_salary || 0;
  const mealVoucher = Math.round((entry.meal_voucher_day_value || 0) * (entry.meal_voucher_days || 0) * 100) / 100;
  const transportVoucher = Math.round((entry.transport_voucher_day_value || 0) * (entry.transport_voucher_days || 0) * 100) / 100;

  // Custo total convenção coletiva (apenas piso + VR)
  const totalConvencao = piso + mealVoucher;

  // Descontos convenção
  const transportVoucherDiscount = Math.round(transportVoucher * ((entry.transport_voucher_discount_pct || 0) / 100) * 100) / 100;
  const mealVoucherDiscount = Math.round(mealVoucher * ((entry.meal_voucher_discount_pct || 0) / 100) * 100) / 100;

  // INSS sobre piso salarial
  const inssPct = entry.inss_pct || 0;
  const inssGross = Math.round(piso * (inssPct / 100) * 100) / 100;
  const inssDeduction = entry.inss_deduction || 0;
  const inssNet = Math.max(0, Math.round((inssGross - inssDeduction) * 100) / 100);

  const totalDescConvencao = transportVoucherDiscount + mealVoucherDiscount + inssNet;
  const liquidoConvencao = totalConvencao - totalDescConvencao;

  // Outros benefícios
  const dental = entry.dental_plan || 0;
  const foodVoucher = entry.food_voucher || 0;
  const birthdayBonus = entry.birthday_bonus || 0;
  const bonus = entry.bonus || 0;
  const attendanceBonus = entry.attendance_bonus || 0;
  // extra_bonus: bonificação extra que SOMA ao salário para base de rateio quinzenal
  const extraBonus = entry.extra_bonus || 0;
  // VT Fixo: valor fixo ÷ dias úteis × dias trabalhados
  const fixedVTTotal = entry.fixed_transport_voucher || 0;
  const fixedVTWorkingDays = entry.fixed_transport_voucher_working_days_month || 0;
  const fixedVTWorkedDays = entry.fixed_transport_voucher_worked_days || 0;
  const fixedVTDayValue = (fixedVTTotal > 0 && fixedVTWorkingDays > 0) ? fixedVTTotal / fixedVTWorkingDays : 0;
  const fixedVTResult = Math.round(fixedVTDayValue * fixedVTWorkedDays * 100) / 100;
  // Todos os benefícios extras exibidos na seção "Outros Benefícios"
  const totalOutrosBeneficios = transportVoucher + dental + foodVoucher + bonus + attendanceBonus + birthdayBonus + fixedVTResult;

  // Desconto de faltas por quinzena (faltas não afetam bruto/net_total — descontadas nas quinzenas)
  const absenceFirst = entry.absence_discount_first || 0;
  const absenceSecond = entry.absence_discount_second || 0;
  const absenceDiscount = absenceFirst + absenceSecond; // apenas para retorno informativo

  // gross_total e net_total baseados na convenção coletiva (SEM faltas — faltas vão nas quinzenas)
  // extra_bonus entra no gross/net para ser rateado nas quinzenas
  const grossTotal = totalConvencao + extraBonus;
  const netTotal = liquidoConvencao + extraBonus;

  // Total final a pagar ao colaborador (líquido convenção + extra_bonus + outros benefícios)
  const totalPagar = netTotal + totalOutrosBeneficios;

  // FGTS informativo
  const fgts = calculateFGTS(piso);
  const irrf = 0;

  // Quinzenal: base = líquido (com extra_bonus) × split (padrão 50/50)
  // bonus e birthday_bonus são adicionados DIRETAMENTE na 2ª quinzena (não entram na base do split)
  // Faltas descontadas na quinzena correspondente
  const splitEsc = (entry.first_period_split != null) ? entry.first_period_split : 0.5;
  const baseQuinzenal = Math.round(netTotal * splitEsc * 100) / 100;
  const baseQuinzenalSecond = Math.round(netTotal * (1 - splitEsc) * 100) / 100;
  const firstPeriodAdvance = entry.first_period_advance || 0;
  const firstPeriodNet = baseQuinzenal - firstPeriodAdvance - (entry.first_period_discount || 0) - absenceFirst;
  const secondPeriodNet = baseQuinzenalSecond + foodVoucher + bonus + attendanceBonus + birthdayBonus - (entry.second_period_discount || 0) - absenceSecond;

  return {
    meal_voucher: mealVoucher,
    transport_voucher: transportVoucher,
    fixed_transport_voucher_result: fixedVTResult,
    fixed_transport_voucher_day_value: Math.round(fixedVTDayValue * 10000) / 10000,
    total_convencao: Math.round(totalConvencao * 100) / 100,
    inss: inssGross,
    inss_net: inssNet,
    inss_deduction: inssDeduction,
    transport_voucher_discount: transportVoucherDiscount,
    meal_voucher_discount: mealVoucherDiscount,
    total_desc_convencao: Math.round(totalDescConvencao * 100) / 100,
    liquido_convencao: Math.round(liquidoConvencao * 100) / 100,
    total_outros_beneficios: Math.round(totalOutrosBeneficios * 100) / 100,
    extra_bonus: extraBonus,
    gross_total: Math.round(grossTotal * 100) / 100,
    net_total: Math.round(netTotal * 100) / 100,
    total_pagar: Math.round(totalPagar * 100) / 100,
    fgts,
    irrf,
    absence_discount: absenceDiscount,
    union_contribution: 0,
    first_period_base: baseQuinzenal,
    second_period_base: baseQuinzenalSecond,
    first_period_net: Math.round(firstPeriodNet * 100) / 100,
    second_period_net: Math.round(secondPeriodNet * 100) / 100,
  };
}

export function calculatePayroll(entry, contractType, payrollType = null) {
  const salary = entry.base_salary || 0;
  // Se houver absence_discount direto (vindo dos ajustes de ponto), usa ele; senão calcula por dias
  const absenceDiscount = (entry.absence_discount != null && entry.absence_discount > 0)
    ? entry.absence_discount
    : calculateAbsenceDiscount(salary, entry.absences_days || 0);

  // Vale Refeição = valor dia * dias
  const mealVoucher = Math.round((entry.meal_voucher_day_value || 0) * (entry.meal_voucher_days || 0) * 100) / 100;
  // KM adicional = quantidade × valor unitário
  const kmBonus = Math.round((entry.km_bonus_qty || 0) * (entry.km_bonus_value || 0) * 100) / 100;
  const costAllowance = entry.cost_allowance || 0;

  // Contribuição Assistencial — valor fixo em R$
  const unionContribution = entry.union_contribution_value != null ? (entry.union_contribution_value || 0) : 35;
  // Desconto VR (%) sobre total do VR
  const mealVoucherDiscount = Math.round(mealVoucher * ((entry.meal_voucher_discount_pct || 0) / 100) * 100) / 100;
  // Seguro de vida
  const lifeInsurance = entry.life_insurance || 0;

  // ─── MOTOCICLISTA CLT ────────────────────────────────────────────────────────
  if (payrollType === 'MOTOCICLISTA_CLT') {
    // Gross = Piso + Aluguel Moto + VR + Periculosidade
    const grossTotal = salary + (entry.motorcycle_rental || 0) + mealVoucher + (entry.hazard_pay || 0);

    // INSS sobre (piso + periculosidade) — sem desconto de faltas
    const inssBase = salary + (entry.hazard_pay || 0);
    let inss = 0;
    if (entry.inss_pct != null && entry.inss_pct > 0) {
      inss = Math.round(inssBase * (entry.inss_pct / 100) * 100) / 100;
    }
    // Aplica desconto da tabela progressiva CLT
    const inssDiscount = Math.min(entry.inss_discount || 0, inss);
    const inssNet = Math.max(0, inss - inssDiscount);
    const fgts = calculateFGTS(salary);

    // Net = Gross - INSS líquido - Contrib. Assistencial - Desc. VR - Seg. Vida
    // (desconto de faltas NÃO entra aqui — é descontado nas quinzenas individualmente)
    const netTotal = grossTotal - inssNet - unionContribution - mealVoucherDiscount - lifeInsurance;

    // Quinzenal: net_total rateado pelo split (padrão 50/50)
    // 1ª quinzena: + food_voucher, - adiantamento, - descontos 1ª
    // 2ª quinzena: + KM + ajuda de custo, - descontos 2ª
    const foodVoucherVal = entry.food_voucher || 0;
    const firstPeriodAdvance = entry.first_period_advance || 0;
    const absenceFirst = entry.absence_discount_first || 0;
    const absenceSecond = entry.absence_discount_second || 0;
    const splitFirst = (entry.first_period_split != null) ? entry.first_period_split : 0.5;
    const splitSecond = 1 - splitFirst;
    const firstBase = Math.round(netTotal * splitFirst * 100) / 100;
    const secondBase = Math.round(netTotal * splitSecond * 100) / 100;
    const firstPeriodNet = firstBase - firstPeriodAdvance - (entry.first_period_discount || 0) - absenceFirst;
    const secondPeriodNet = secondBase + foodVoucherVal + kmBonus + costAllowance - (entry.second_period_discount || 0) - absenceSecond;

    return {
      absence_discount: absenceDiscount,
      inss_base: Math.round(inssBase * 100) / 100,
      inss,
      inss_net: inssNet,
      fgts,
      irrf: 0,
      meal_voucher: mealVoucher,
      km_bonus: kmBonus,
      union_contribution: unionContribution,
      meal_voucher_discount: mealVoucherDiscount,
      gross_total: Math.round(grossTotal * 100) / 100,
      net_total: Math.round(netTotal * 100) / 100,
      first_period_base: firstBase,
      second_period_base: secondBase,
      first_period_net: Math.round(firstPeriodNet * 100) / 100,
      second_period_net: Math.round(secondPeriodNet * 100) / 100,
    };
    }

  // ─── OUTROS MODELOS ──────────────────────────────────────────────────────────
  // Faltas são descontadas nas quinzenas — não reduzem o bruto nem a base do INSS

  let inss = 0, fgts = 0, irrf = 0, pjRetention = 0;

  if (contractType === 'CLT') {
    // Base de cálculo INSS = salário base + periculosidade
    const inssBase = salary + (entry.hazard_pay || 0);
    if (entry.inss_pct != null && entry.inss_pct > 0) {
      inss = Math.round(inssBase * (entry.inss_pct / 100) * 100) / 100;
    }
    fgts = calculateFGTS(salary);
    irrf = calculateIRRF(salary, inss);
  } else {
    pjRetention = entry.pj_retention || 0;
  }

  const totalBenefits = mealVoucher + (entry.transport_voucher || 0) +
    kmBonus + (entry.motorcycle_rental || 0) + (entry.hazard_pay || 0) +
    (entry.bonus || 0) + (entry.other_benefits || 0) + costAllowance;

  const grossTotal = salary + totalBenefits;

  const inssDiscount = Math.min(entry.inss_discount || 0, inss);
  const inssNet = Math.max(0, inss - inssDiscount);

  const totalDiscounts = inssNet + irrf + pjRetention + unionContribution + mealVoucherDiscount + lifeInsurance;
  const netTotal = grossTotal - totalDiscounts;

  // Quinzenal split — desconto de faltas aplicado na quinzena correspondente
  const foodVoucherVal = entry.food_voucher || 0;
  const firstPeriodAdvance = entry.first_period_advance || 0;
  const absenceFirst = entry.absence_discount_first || 0;
  const absenceSecond = entry.absence_discount_second || 0;
  const splitFirst2 = (entry.first_period_split != null) ? entry.first_period_split : 0.5;
  const splitSecond2 = 1 - splitFirst2;
  const firstBase2 = Math.round(netTotal * splitFirst2 * 100) / 100;
  const secondBase2 = Math.round(netTotal * splitSecond2 * 100) / 100;
  const firstPeriodNet = firstBase2 - firstPeriodAdvance - (entry.first_period_discount || 0) - absenceFirst;
  const secondPeriodNet = secondBase2 + foodVoucherVal + kmBonus + costAllowance - (entry.second_period_discount || 0) - absenceSecond;

  return {
    absence_discount: absenceDiscount,
    inss,
    inss_net: inssNet,
    fgts,
    irrf,
    meal_voucher: mealVoucher,
    km_bonus: kmBonus,
    union_contribution: unionContribution,
    meal_voucher_discount: mealVoucherDiscount,
    gross_total: Math.round(grossTotal * 100) / 100,
    net_total: Math.round(netTotal * 100) / 100,
    first_period_base: firstBase2,
    second_period_base: secondBase2,
    first_period_net: Math.round(firstPeriodNet * 100) / 100,
    second_period_net: Math.round(secondPeriodNet * 100) / 100,
  };
}

// ─── PRÓ-LABORE ──────────────────────────────────────────────────────────────
// INSS Pró-Labore: alíquota fixa de 11% sobre o valor do pró-labore (sem tabela progressiva)
export const PRO_LABORE_INSS_RATE = 0.11;

export function calculateProLabore(entry) {
  const proLaboreBase  = entry.base_salary       || 0;
  const quotaAdjust    = entry.quota_adjustment   || 0;  // Reajuste de cota
  const birthdayBonus  = entry.birthday_bonus     || 0;
  const profitDist     = entry.profit_distribution || 0; // Distribuição de lucros
  const firstAdvance   = entry.first_period_advance || 0;
  const otherDiscounts = entry.other_discounts    || 0;  // Outros descontos
  const inssCustomPct  = entry.inss_pct;                 // % customizado (null = usa 11%)
  // IRRF manual: se o campo foi explicitamente definido (inclusive 0), usa o valor salvo.
  // Só usa cálculo automático quando o campo é null/undefined (novo lançamento).
  const irrfCustom     = (entry.irrf != null) ? entry.irrf : null;

  // INSS fixo 11% (ou % customizado) sobre pró-labore base — sem cálculo automático se em branco/zerado
  const inssPct  = (inssCustomPct != null && inssCustomPct > 0) ? inssCustomPct / 100 : 0;
  const inss     = inssPct > 0 ? Math.round(proLaboreBase * inssPct * 100) / 100 : 0;

  const grossTotal = Math.round((proLaboreBase + quotaAdjust) * 100) / 100;
  const irrf       = (irrfCustom !== null) ? irrfCustom : calculateIRRF(grossTotal, inss);
  const netLabore  = Math.round((grossTotal - inss - irrf) * 100) / 100;

  // Total líquido a receber = líquido do pró-labore + distribuição de lucros - adiantamento - outros descontos
  const netTotal = Math.round((netLabore + profitDist - firstAdvance - otherDiscounts) * 100) / 100;

  return {
    gross_total: grossTotal,
    inss,
    irrf,
    net_labore: netLabore,   // líquido apenas do pró-labore
    net_total: netTotal,     // total líquido a receber
    profit_distribution: profitDist,
  };
}

export function numberToWords(value) {
  const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
    'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  if (value === 0) return 'zero';
  if (value === 100) return 'cem';

  const intPart = Math.floor(value);
  const decPart = Math.round((value - intPart) * 100);

  function convertHundreds(n) {
    if (n === 0) return '';
    if (n < 20) return units[n];
    if (n < 100) {
      const t = Math.floor(n / 10);
      const u = n % 10;
      return u === 0 ? tens[t] : `${tens[t]} e ${units[u]}`;
    }
    const h = Math.floor(n / 100);
    const rest = n % 100;
    if (rest === 0) return hundreds[h];
    return `${hundreds[h]} e ${convertHundreds(rest)}`;
  }

  function convertThousands(n) {
    if (n === 0) return '';
    if (n < 1000) return convertHundreds(n);
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    const tStr = thousands === 1 ? 'mil' : `${convertHundreds(thousands)} mil`;
    if (rest === 0) return tStr;
    return `${tStr} e ${convertHundreds(rest)}`;
  }

  let result = convertThousands(intPart);
  result += intPart === 1 ? ' real' : ' reais';

  if (decPart > 0) {
    result += ` e ${convertHundreds(decPart)}`;
    result += decPart === 1 ? ' centavo' : ' centavos';
  }

  return result;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export function getMonthName(yearMonth) {
  const [year, month] = yearMonth.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}