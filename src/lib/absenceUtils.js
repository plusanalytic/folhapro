/**
 * Expande PointAdjustments para cada dia, considerando overlaps em meses consecutivos
 */
export function expandAdjustmentsByDay(adjustments, referenceMonth) {
  const [year, month] = referenceMonth.split('-').map(Number);
  
  const dailyAdjustments = [];
  
  for (const adj of adjustments) {
    const startDate = new Date(adj.start_date);
    const endDate = new Date(adj.end_date);
    
    // Itera cada dia do período
    let current = new Date(startDate);
    while (current <= endDate) {
      const currentMonth = current.getMonth() + 1;
      const currentYear = current.getFullYear();
      
      // Verifica se o dia pertence ao mês de referência
      // Inclui dias do mês anterior (jan) e do próximo mês (mar)
      const monthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
      
      // Lógica: incluir se for mês de ref OU mês anterior OU próximo mês
      const refMonthDate = new Date(year, month - 1, 1);
      const prevMonth = new Date(refMonthDate);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const nextMonth = new Date(refMonthDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      
      const isPrevMonth = current.getFullYear() === prevMonth.getFullYear() && current.getMonth() === prevMonth.getMonth();
      const isRefMonth = current.getFullYear() === year && current.getMonth() === month - 1;
      const isNextMonth = current.getFullYear() === nextMonth.getFullYear() && current.getMonth() === nextMonth.getMonth();
      
      if (isPrevMonth || isRefMonth || isNextMonth) {
        dailyAdjustments.push({
          ...adj,
          date: current.toISOString().split('T')[0],
          month: monthStr,
        });
      }
      
      current.setDate(current.getDate() + 1);
    }
  }
  
  return dailyAdjustments;
}

/**
 * Agrupa ajustes diários por motivo e calcula descontos
 */
export function groupAdjustmentsByReason(dailyAdjustments) {
  const grouped = {};
  
  for (const adj of dailyAdjustments) {
    const reasonId = adj.adjustment_reason_id;
    if (!grouped[reasonId]) {
      grouped[reasonId] = [];
    }
    grouped[reasonId].push(adj);
  }
  
  return grouped;
}

/**
 * Conta dias de falta por motivo para um mês específico
 */
export function countAbsenceDaysByReason(adjustments, referenceMonth) {
  const expanded = expandAdjustmentsByDay(adjustments, referenceMonth);
  const filtered = expanded.filter(adj => adj.month === referenceMonth);
  return groupAdjustmentsByReason(filtered);
}