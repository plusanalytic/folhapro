/**
 * Utilitários para exibição de totais de bonificações e descontos quinzenais
 * usados tanto na página Folha de Pagamento quanto em Pagamentos.
 */

/**
 * Calcula o total de bonificações de um PayrollEntry.
 * Inclui: créditos do grid quinzenal + VA + KM + ajuda de custo +
 * bônus produtividade + bônus presença + bônus aniversário + bonificação/prêmio +
 * convênio médico + reajuste de cota + outros benefícios.
 */
export function calcBonificacoes(entry) {
  if (!entry) return 0;

  // Créditos lançados nos grids quinzenais (type === 'credit')
  const gridCredits1 = (entry.first_discounts || [])
    .filter(r => r.type === 'credit')
    .reduce((s, r) => s + (r.amount || 0), 0);

  const gridCredits2 = (entry.second_discounts || [])
    .filter(r => r.type === 'credit')
    .reduce((s, r) => s + (r.amount || 0), 0);

  return (
    gridCredits1 +
    gridCredits2 +
    (entry.meal_voucher || 0) +           // Vale Refeição
    (entry.food_voucher || 0) +           // Vale Alimentação
    (entry.km_bonus || 0) +               // Total KM adicional/excedente
    (entry.cost_allowance || 0) +         // Ajuda de custo
    (entry.bonus || 0) +                  // Bonificação / Prêmio (produtividade)
    (entry.delivery_bonus || 0) +         // Bonificação por Entrega (CLT Moto)
    (entry.delivery_target_bonus || 0) +  // Bonificação Meta de Entrega (CLT Moto)
    (entry.attendance_bonus || 0) +       // Bonificação por Presença
    (entry.overtime || 0) +               // Hora Extra
    (entry.birthday_bonus || 0) +         // Bonificação de aniversário
    (entry.medical_plan || 0) +           // Convênio Médico
    (entry.quota_adjustment || 0) +       // Reajuste de cota (pró-labore)
    (entry.other_benefits || 0)           // Outros benefícios
  );
}

/**
 * Calcula o total de descontos de débito de um período quinzenal.
 * Inclui: lançamentos de débito no grid + desconto de faltas do ajuste de ponto.
 *
 * @param {Array} gridItems - entry.first_discounts ou entry.second_discounts
 * @param {number} absenceDiscount - desconto de faltas correspondente à quinzena
 */
export function calcPeriodDebits(gridItems = [], absenceDiscount = 0) {
  const gridDebits = gridItems
    .filter(r => r.type !== 'credit')
    .reduce((s, r) => s + (r.amount || 0), 0);

  return gridDebits + absenceDiscount;
}

/**
 * Retorna o desconto de faltas por quinzena a partir do entry.
 *
 * Prioridade:
 * 1. Se o entry tem `absence_discounts` (objeto keyed por tangerino_id-YYYY-MM-DD),
 *    calcula diretamente a partir dele separando por dia (1–15 = 1ªQ, 16–31 = 2ªQ).
 *    Isso é a fonte mais precisa e funciona mesmo sem os campos pré-calculados.
 * 2. Fallback: usa absence_discount_first / absence_discount_second se existirem.
 * 3. Último recurso: divide absence_discount total ao meio.
 */
export function getAbsenceByPeriod(entry) {
  if (!entry) return { first: 0, second: 0 };

  // Prioridade 1: recalcula a partir do objeto de descontos de ponto (mais preciso)
  if (entry.absence_discounts && typeof entry.absence_discounts === 'object' && Object.keys(entry.absence_discounts).length > 0) {
    let first = 0;
    let second = 0;
    for (const [key, disc] of Object.entries(entry.absence_discounts)) {
      if (!disc || typeof disc !== 'object') continue;
      const total = ['daily', 'vt', 'vr', 'dsr', 'moto', 'hazard'].reduce((s, k) => s + (parseFloat(disc[k]) || 0), 0);
      const dateMatch = key.match(/(\d{4}-\d{2}-(\d{2}))$/);
      const day = dateMatch ? parseInt(dateMatch[2], 10) : 0;
      if (day >= 1 && day <= 15) {
        first += total;
      } else {
        second += total;
      }
    }
    return {
      first: Math.round(first * 100) / 100,
      second: Math.round(second * 100) / 100,
    };
  }

  // Prioridade 2: campos pré-calculados (salvos pelos formulários mais recentes)
  if (entry.absence_discount_first != null || entry.absence_discount_second != null) {
    return {
      first: entry.absence_discount_first ?? 0,
      second: entry.absence_discount_second ?? 0,
    };
  }

  // Prioridade 3: divide o total ao meio (registros muito antigos)
  const total = entry.absence_discount ?? 0;
  const half = Math.round(total / 2 * 100) / 100;
  return { first: half, second: total - half };
}