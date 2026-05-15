import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { target_month } = await req.json();
    if (!target_month) return Response.json({ error: 'target_month is required' }, { status: 400 });

    // Compute previous month (YYYY-MM)
    const [year, month] = target_month.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prev_month = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    // Fetch previous month entries
    const prevEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ reference_month: prev_month });

    if (!prevEntries || prevEntries.length === 0) {
      return Response.json({ cloned: 0, message: `Nenhum lançamento encontrado em ${prev_month}` });
    }

    // Fetch existing entries for target month to avoid duplicates
    const existingEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ reference_month: target_month });
    const existingEmployeeIds = new Set(existingEntries.map(e => e.employee_id));

    // Fetch all employees to check termination status
    const allEmployees = await base44.asServiceRole.entities.Employee.list();
    const employeeMap = {};
    for (const emp of allEmployees) {
      employeeMap[emp.id] = emp;
    }

    // Helper: verifica se o colaborador foi demitido ANTES do mês alvo.
    // Se foi demitido NO mês alvo → ainda deve aparecer (para pagar dias trabalhados).
    // Se foi demitido em mês ANTERIOR ao alvo → não deve ser clonado.
    function isFiredBeforeMonth(emp, targetMonth) {
      if (!emp) return false;
      if (emp.is_active !== false) return false; // ainda ativo
      if (!emp.termination_date) return false;   // inativo mas sem data: pula
      const termMonth = emp.termination_date.slice(0, 7); // YYYY-MM
      // Só exclui se demitido ANTES do mês alvo (termMonth < targetMonth)
      return termMonth < targetMonth;
    }

    // Helper: verifica se é colaborador esporádico (não deve ser clonado)
    function isEsporadico(emp) {
      if (!emp) return false;
      return emp.contract_type === 'ESPORADICO';
    }

    // Fields to carry over
    const EXCLUDE_FIELDS = ['id', 'created_date', 'updated_date', 'created_by', 'reference_month', 'status',
      'first_discounts', 'second_discounts', 'first_period_discount', 'second_period_discount', 'notes'];

    // Fetch all CashOuts for target month at once
    const targetCashOuts = await base44.asServiceRole.entities.CashOut.filter({ reference_month: target_month });

    let cloned = 0;
    let skipped = 0;
    let skippedFired = 0;
    const errors = [];

    for (const prev of prevEntries) {
      // Skip if already exists for target month
      if (existingEmployeeIds.has(prev.employee_id)) {
        skipped++;
        continue;
      }

      // Skip if employee was fired before target_month
      const emp = employeeMap[prev.employee_id];
      if (isFiredBeforeMonth(emp, target_month)) {
        skippedFired++;
        continue;
      }

      // Skip esporádicos — eles são adicionados manualmente em cada mês
      if (isEsporadico(emp)) {
        skipped++;
        continue;
      }

      // Build first/second discount arrays from CashOut records
      const empCashOuts = targetCashOuts.filter(c => c.employee_id === prev.employee_id);
      const first_discounts = empCashOuts
        .filter(c => c.period === 'first')
        .map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));
      const second_discounts = empCashOuts
        .filter(c => c.period === 'second')
        .map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));

      const first_period_discount = first_discounts.reduce((s, d) => s + (d.amount || 0), 0);
      const second_period_discount = second_discounts.reduce((s, d) => s + (d.amount || 0), 0);

      const newEntry = {
        reference_month: target_month,
        status: 'open',
        first_discounts,
        second_discounts,
        first_period_discount,
        second_period_discount,
      };

      for (const [key, value] of Object.entries(prev)) {
        if (!EXCLUDE_FIELDS.includes(key)) {
          newEntry[key] = value;
        }
      }

      try {
        await base44.asServiceRole.entities.PayrollEntry.create(newEntry);
        cloned++;
      } catch (err) {
        errors.push({ employee_id: prev.employee_id, error: err.message });
      }
    }

    return Response.json({
      cloned,
      skipped,
      skippedFired,
      errors,
      prev_month,
      target_month,
      message: `${cloned} lançamento(s) clonado(s) de ${prev_month} para ${target_month}. ${skipped} já existiam. ${skippedFired > 0 ? `${skippedFired} ignorado(s) por demissão.` : ''}`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});