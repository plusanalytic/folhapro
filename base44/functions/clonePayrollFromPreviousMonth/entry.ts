import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { target_month, company_id, employee_id } = await req.json();
    if (!target_month) return Response.json({ error: 'target_month is required' }, { status: 400 });

    // Compute previous month (YYYY-MM)
    const [year, month] = target_month.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prev_month = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    // Fetch previous month entries (com filtros opcionais)
    const prevFilter = { reference_month: prev_month };
    if (company_id) prevFilter.company_id = company_id;
    if (employee_id) prevFilter.employee_id = employee_id;
    const prevEntries = await base44.asServiceRole.entities.PayrollEntry.filter(prevFilter);

    if (!prevEntries || prevEntries.length === 0) {
      return Response.json({ cloned: 0, message: `Nenhum lançamento encontrado em ${prev_month}` });
    }

    // Fetch existing entries for target month — serão sobrescritos se já existirem
    const existingEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ reference_month: target_month });
    const existingEntryMap = {}; // employee_id -> entry.id
    for (const e of existingEntries) {
      existingEntryMap[e.employee_id] = e.id;
    }

    // Fetch all employees, job roles and workplaces
    const allEmployees = await base44.asServiceRole.entities.Employee.list();
    const allJobRoles = await base44.asServiceRole.entities.JobRole.list();
    const allWorkplaces = await base44.asServiceRole.entities.Workplace.list();

    const jobRoleMap = {}; // tangerino_id -> payroll_type
    for (const jr of allJobRoles) {
      if (jr.tangerino_id) jobRoleMap[String(jr.tangerino_id)] = jr;
    }
    const workplaceMap = {}; // tangerino_id -> workplace
    for (const w of allWorkplaces) {
      if (w.tangerino_id) workplaceMap[String(w.tangerino_id)] = w;
    }

    // Calcula dias úteis de um mês: includeSat=true (Seg-Sáb), includeSat=false (Seg-Sex)
    function calcWorkingDays(yearMonth, includeSat = true) {
      const [yr, mo] = yearMonth.split('-').map(Number);
      const holidays = new Set(['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25']);
      const daysInMonth = new Date(yr, mo, 0).getDate();
      let count = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(yr, mo - 1, d).getDay();
        if (dow === 0) continue;
        if (!includeSat && dow === 6) continue;
        const mmdd = `${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        if (holidays.has(mmdd)) continue;
        count++;
      }
      return count;
    }
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
    const EXCLUDE_FIELDS = [
      'id', 'created_date', 'updated_date', 'created_by', 'reference_month', 'status',
      // Descontos quinzenais: reconstruídos a partir dos CashOuts do mês alvo
      'first_discounts', 'second_discounts', 'first_period_discount', 'second_period_discount', 'notes',
      // Dias trabalhados: devem resetar para o padrão do novo mês (30), não herdar do mês anterior
      'working_days_month', 'clt_moto_worked_days',
      // Dias úteis de contrato: serão recalculados do local de trabalho para CLT Moto
      'full_month_contract_working_days', 'contract_working_days',
      // Valores calculados: serão recalculados ao abrir a folha
      'gross_total', 'net_total', 'first_period_base', 'second_period_base',
      'first_period_net', 'second_period_net',
      // Flag de congelamento: não deve persistir para o próximo mês
      'first_period_base_locked',
      // Descontos de falta: específicos do mês anterior, não se aplicam ao novo mês
      'absence_discount', 'absence_discount_first', 'absence_discount_second', 'absence_discounts',
    ];

    // Fetch all CashOuts for target month at once
    const targetCashOuts = await base44.asServiceRole.entities.CashOut.filter({ reference_month: target_month });

    let cloned = 0;
    let skipped = 0;
    let skippedFired = 0;
    const errors = [];

    for (const prev of prevEntries) {
      // Se já existe, será sobrescrito (update); caso contrário, criado

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

      // Overrides por tipo de folha
      const empJobRoleTangeId = emp ? String(emp.job_role_tangerino_id) : null;
      const empJobRole = empJobRoleTangeId ? jobRoleMap[empJobRoleTangeId] : null;
      const payrollType = empJobRole?.payroll_type;

      if (payrollType === 'ESCRITORIO') {
        // Salário base do cadastro do colaborador; dias trabalhados = 30 (padrão)
        newEntry.base_salary = (emp && emp.base_salary > 0) ? emp.base_salary : (prev.base_salary || 0);
        newEntry.working_days_month = 30;

      } else if (payrollType === 'MOTOCICLISTA_CLT') {
        // Busca o local de trabalho principal do colaborador
        const empWorkplaceList = emp?.workplace_list || [];
        const workplace = empWorkplaceList.length > 0
          ? workplaceMap[String(empWorkplaceList[0])]
          : null;

        if (workplace) {
          const includeSat = workplace.work_schedule !== 'seg_sex';
          const fullMonthDays = calcWorkingDays(target_month, includeSat);

          if (workplace.clt_moto_base_salary_default > 0) {
            newEntry.clt_moto_base_salary = workplace.clt_moto_base_salary_default;
            newEntry.base_salary = workplace.clt_moto_base_salary_default;
          }
          if (workplace.clt_moto_meal_voucher_day_value_default > 0) {
            newEntry.meal_voucher_day_value = workplace.clt_moto_meal_voucher_day_value_default;
          }
          if (workplace.clt_moto_food_voucher_default > 0) {
            newEntry.food_voucher = workplace.clt_moto_food_voucher_default;
          }
          if (workplace.clt_moto_motorcycle_rental_default > 0) {
            newEntry.motorcycle_rental = workplace.clt_moto_motorcycle_rental_default;
          }
          newEntry.full_month_contract_working_days = fullMonthDays;
          newEntry.contract_working_days = fullMonthDays;
        }
        // clt_moto_worked_days já está em EXCLUDE_FIELDS (= 30 por padrão no form)
      }

      try {
        const existingId = existingEntryMap[prev.employee_id];
        if (existingId) {
          await base44.asServiceRole.entities.PayrollEntry.update(existingId, newEntry);
        } else {
          await base44.asServiceRole.entities.PayrollEntry.create(newEntry);
        }
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
      message: `${cloned} lançamento(s) clonado(s)/atualizados de ${prev_month} para ${target_month}.${skippedFired > 0 ? ` ${skippedFired} ignorado(s) por demissão.` : ''}`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});