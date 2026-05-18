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
    (entry.food_voucher || 0) +           // Vale Alimentação
    (entry.km_bonus || 0) +               // Total KM adicional
    (entry.cost_allowance || 0) +         // Ajuda de custo
    (entry.bonus || 0) +                  // Bonificação / Prêmio (produtividade)
    (entry.attendance_bonus || 0) +       // Bonificação por presença
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
 * Os campos absence_discount_first / absence_discount_second são persistidos
 * pelos formulários de folha. Para modelos que não separam por quinzena,
 * retorna metade do total em cada período como fallback.
 */
export function getAbsenceByPeriod(entry) {
  if (!entry) return { first: 0, second: 0 };
  const first = entry.absence_discount_first ?? 0;
  const second = entry.absence_discount_second ?? 0;
  return { first, second };
}