import { useState } from 'react';
import { formatCurrency } from '@/lib/payrollCalculations';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Printer } from 'lucide-react';

const STATUS_COLORS = {
  PAGO:      'bg-green-100 text-green-700',
  AGENDADO:  'bg-blue-100 text-blue-700',
  PENDENTE:  'bg-yellow-100 text-yellow-700',
  BLOQUEADO: 'bg-red-100 text-red-700',
};

function PaymentBadge({ status }) {
  if (!status) return null;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  );
}

export default function FinancialGrid({
  entries,
  employees,
  companies,
  jobRoles,
  workplaces,
  paymentStatuses,
  selectedMonth,
  onGenerateReceipt,
}) {
  const [expandedCompany, setExpandedCompany] = useState(null);

  // Group entries by company
  const byCompany = {};
  for (const entry of entries) {
    const emp = employees.find(e => e.id === entry.employee_id);
    if (!emp) continue;
    const companyId = emp.company_id || 'sem-empresa';
    if (!byCompany[companyId]) byCompany[companyId] = [];
    byCompany[companyId].push({ entry, emp });
  }

  const companyList = companies.filter(c => byCompany[c.id]);
  if (byCompany['sem-empresa']) {
    companyList.push({ id: 'sem-empresa', name: 'Sem Empresa' });
  }

  if (companyList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <FileText className="w-10 h-10 opacity-30" />
        <p className="text-sm">Nenhum lançamento encontrado para este período.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {companyList.map(company => {
        const rows = byCompany[company.id] || [];
        const totalFirst  = rows.reduce((s, { entry }) => s + (entry.first_period_net  ?? 0), 0);
        const totalSecond = rows.reduce((s, { entry }) => s + (entry.second_period_net ?? 0), 0);
        const totalNet    = rows.reduce((s, { entry }) => s + (entry.net_total ?? 0), 0);
        const isOpen = expandedCompany === null || expandedCompany === company.id;

        return (
          <div key={company.id} className="border rounded-lg overflow-hidden bg-card">
            {/* Company header */}
            <div
              className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b cursor-pointer select-none"
              onClick={() => setExpandedCompany(isOpen && expandedCompany === company.id ? null : company.id)}
            >
              <span className="font-semibold text-sm">{company.name}</span>
              <div className="flex items-center gap-6 text-xs text-muted-foreground">
                <span>1ª Qz: <span className="font-semibold text-foreground">{formatCurrency(totalFirst)}</span></span>
                <span>2ª Qz: <span className="font-semibold text-foreground">{formatCurrency(totalSecond)}</span></span>
                <span>Total Líquido: <span className="font-semibold text-foreground">{formatCurrency(totalNet)}</span></span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              <table className="w-full text-xs" style={{ tableLayout: 'fixed', minWidth: '900px' }}>
                <colgroup>
                  <col style={{ width: '180px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '90px' }} />
                </colgroup>
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colaborador</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Cargo</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Local</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Salário Base</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">1ª Quinzena</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">2ª Quinzena</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">St. Q1</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">St. Q2</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ entry, emp }) => {
                    const jobRole = jobRoles.find(jr => jr.tangerino_id === emp.job_role_tangerino_id);
                    const workplaceNames = (emp.workplace_list || [])
                      .map(wId => workplaces.find(w => w.tangerino_id === wId)?.name)
                      .filter(Boolean)
                      .join(', ');
                    const ps = paymentStatuses.find(p => p.payroll_entry_id === entry.id);

                    return (
                      <tr key={entry.id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 truncate font-medium">{emp.name}</td>
                        <td className="px-3 py-2 truncate text-muted-foreground">{jobRole?.name || emp.position || '—'}</td>
                        <td className="px-3 py-2 truncate text-muted-foreground">{workplaceNames || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(entry.base_salary ?? 0)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(entry.first_period_net ?? 0)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(entry.second_period_net ?? 0)}</td>
                        <td className="px-3 py-2 text-center"><PaymentBadge status={ps?.status_q1} /></td>
                        <td className="px-3 py-2 text-center"><PaymentBadge status={ps?.status_q2} /></td>
                        <td className="px-3 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Gerar recibo"
                            onClick={() => onGenerateReceipt && onGenerateReceipt(emp, entry)}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/40 border-t-2">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 font-semibold text-xs">Total ({rows.length} colaboradores)</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {formatCurrency(rows.reduce((s, { entry }) => s + (entry.base_salary ?? 0), 0))}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-primary">
                      {formatCurrency(totalFirst)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-primary">
                      {formatCurrency(totalSecond)}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}