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

// Calcula dias úteis de um mês (seg-sex, sem feriados nacionais fixos)
export function getWorkingDaysInMonth(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  // Feriados nacionais fixos (MM-DD)
  const nationalHolidays = ['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'];
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay(); // 0=dom, 6=sab
    if (dow === 0 || dow === 6) continue;
    const mmdd = `${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (nationalHolidays.includes(mmdd)) continue;
    // Páscoa - Sexta-feira Santa (variável, aproximação simples ignorada por ora)
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

  // Outros benefícios (inclui VT)
  const dental = entry.dental_plan || 0;
  const foodVoucher = entry.food_voucher || 0;
  const birthdayBonus = entry.birthday_bonus || 0;
  const totalOutrosBeneficios = transportVoucher + dental + foodVoucher + birthdayBonus;

  // gross_total e net_total refletem apenas a Convenção Coletiva (piso + VR)
  const grossTotal = totalConvencao;
  const netTotal = totalConvencao - totalDescConvencao;

  // Total final a pagar ao colaborador (líquido convenção + outros benefícios)
  const totalPagar = netTotal + totalOutrosBeneficios;

  // FGTS informativo
  const fgts = calculateFGTS(piso);
  const irrf = 0;

  // Quinzenal baseado no líquido da convenção
  const firstPeriodAdvance = entry.first_period_advance || 0;
  const firstPeriodNet = (netTotal / 2) - firstPeriodAdvance - (entry.first_period_discount || 0);
  const secondPeriodNet = (netTotal / 2) - (entry.second_period_discount || 0);

  return {
    meal_voucher: mealVoucher,
    transport_voucher: transportVoucher,
    total_convencao: Math.round(totalConvencao * 100) / 100,
    inss: inssGross,
    inss_net: inssNet,
    inss_deduction: inssDeduction,
    transport_voucher_discount: transportVoucherDiscount,
    meal_voucher_discount: mealVoucherDiscount,
    total_desc_convencao: Math.round(totalDescConvencao * 100) / 100,
    liquido_convencao: Math.round(liquidoConvencao * 100) / 100,
    total_outros_beneficios: Math.round(totalOutrosBeneficios * 100) / 100,
    gross_total: Math.round(grossTotal * 100) / 100,
    net_total: Math.round(netTotal * 100) / 100,
    total_pagar: Math.round(totalPagar * 100) / 100,
    fgts,
    irrf,
    absence_discount: 0,
    union_contribution: 0,
    first_period_net: Math.round(firstPeriodNet * 100) / 100,
    second_period_net: Math.round(secondPeriodNet * 100) / 100,
  };
}

export function calculatePayroll(entry, contractType) {
  const salary = entry.base_salary || 0;
  const absenceDiscount = calculateAbsenceDiscount(salary, entry.absences_days || 0);
  const salaryAfterAbsence = salary - absenceDiscount;

  let inss = 0, fgts = 0, irrf = 0, pjRetention = 0;

  if (contractType === 'CLT') {
    // Base de cálculo INSS = salário base + periculosidade
    const inssBase = salaryAfterAbsence + (entry.hazard_pay || 0);
    if (entry.inss_pct != null && entry.inss_pct > 0) {
      // INSS manual (% editável pelo usuário)
      inss = Math.round(inssBase * (entry.inss_pct / 100) * 100) / 100;
    } else {
      inss = calculateINSS(inssBase);
    }
    fgts = calculateFGTS(salaryAfterAbsence);
    irrf = calculateIRRF(salaryAfterAbsence, inss);
  } else {
    pjRetention = entry.pj_retention || 0;
  }

  // Vale Refeição = valor dia * dias
  const mealVoucher = Math.round((entry.meal_voucher_day_value || 0) * (entry.meal_voucher_days || 0) * 100) / 100;

  const totalBenefits = mealVoucher + (entry.transport_voucher || 0) +
    (entry.km_bonus || 0) + (entry.motorcycle_rental || 0) + (entry.hazard_pay || 0) +
    (entry.bonus || 0) + (entry.other_benefits || 0);

  const grossTotal = salaryAfterAbsence + totalBenefits;

  // Contribuição Assistencial (%) sobre piso salarial (base_salary)
  const unionContribution = Math.round(salary * ((entry.union_contribution_pct || 0) / 100) * 100) / 100;
  // Desconto VR (%) sobre total do VR
  const mealVoucherDiscount = Math.round(mealVoucher * ((entry.meal_voucher_discount_pct || 0) / 100) * 100) / 100;
  // Seguro de vida
  const lifeInsurance = entry.life_insurance || 0;

  // Desconto manual sobre o INSS (reduz o valor do INSS a ser descontado)
  const inssDiscount = Math.min(entry.inss_discount || 0, inss);
  const inssNet = Math.max(0, inss - inssDiscount);

  const totalDiscounts = inssNet + irrf + pjRetention + unionContribution + mealVoucherDiscount + lifeInsurance;
  const netTotal = grossTotal - totalDiscounts;

  // Quinzenal split — descontos quinzenais NÃO afetam o net_total, apenas o valor de cada quinzena
  const firstPeriodAdvance = entry.first_period_advance || 0;
  const firstPeriodNet = (netTotal / 2) - firstPeriodAdvance - (entry.first_period_discount || 0);
  const secondPeriodNet = (netTotal / 2) - (entry.second_period_discount || 0);

  return {
    absence_discount: absenceDiscount,
    inss,
    inss_net: inssNet,
    fgts,
    irrf,
    meal_voucher: mealVoucher,
    union_contribution: unionContribution,
    meal_voucher_discount: mealVoucherDiscount,
    gross_total: Math.round(grossTotal * 100) / 100,
    net_total: Math.round(netTotal * 100) / 100,
    first_period_net: Math.round(firstPeriodNet * 100) / 100,
    second_period_net: Math.round(secondPeriodNet * 100) / 100,
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