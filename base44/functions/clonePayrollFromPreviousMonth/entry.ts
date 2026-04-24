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
    const prevDate = new Date(year, month - 2, 1); // month-2 because JS months are 0-indexed
    const prev_month = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    // Fetch previous month entries
    const prevEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ reference_month: prev_month });

    if (!prevEntries || prevEntries.length === 0) {
      return Response.json({ cloned: 0, message: `Nenhum lançamento encontrado em ${prev_month}` });
    }

    // Fetch existing entries for target month to avoid duplicates
    const existingEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ reference_month: target_month });
    const existingEmployeeIds = new Set(existingEntries.map(e => e.employee_id));

    // Fields to carry over (exclude computed/meta fields)
    const EXCLUDE_FIELDS = ['id', 'created_date', 'updated_date', 'created_by', 'reference_month', 'status',
      'first_discounts', 'second_discounts', 'notes'];

    let cloned = 0;
    let skipped = 0;
    const errors = [];

    for (const prev of prevEntries) {
      if (existingEmployeeIds.has(prev.employee_id)) {
        skipped++;
        continue;
      }

      const newEntry = {
        reference_month: target_month,
        status: 'open',
        first_discounts: [],
        second_discounts: [],
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
      errors,
      prev_month,
      target_month,
      message: `${cloned} lançamento(s) clonado(s) de ${prev_month} para ${target_month}. ${skipped} já existiam.`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});