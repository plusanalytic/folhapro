import { useRef } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/payrollCalculations';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import * as XLSX from 'xlsx';

const STATUS_LABELS = { PENDENTE: 'Pendente', AGENDADO: 'Agendado', PAGO: 'Pago', BLOQUEADO: 'Bloqueado' };
const STATUS_COLORS = {
  PAGO: 'bg-green-100 text-green-700',
  PENDENTE: 'bg-yellow-100 text-yellow-700',
  AGENDADO: 'bg-blue-100 text-blue-700',
  BLOQUEADO: 'bg-red-100 text-red-700',
};

export default function FinancialGrid({ entries, employees, companies, jobRoles = [], workplaces = [], paymentStatuses = [], selectedMonth, onGenerateReceipt }) {
  const tableRef = useRef();

  const getEmployee = (id) => employees.find(e => e.id === id);
  const getCompany = (id) => companies.find(c => c.id === id);
  const getJobRoleName = (emp) => {
    if (!emp?.job_role_tangerino_id || !jobRoles.length) return '—';
    return jobRoles.find(jr => String(jr.tangerino_id) === String(emp.job_role_tangerino_id))?.name || '—';
  };
  const getWorkplaceNames = (emp) => {
    if (!emp?.workplace_list?.length || !workplaces.length) return '—';
    return (emp.workplace_list ?? []).map(id => workplaces.find(w => String(w.tangerino_id) === String(id))?.name).filter(Boolean).join(', ') || '—';
  };
  const getPayStatus = (entryId) => paymentStatuses.find(p => p.payroll_entry_id === entryId);

  const rows = [...entries].sort((a, b) => {
    const empA = employees.find(e => e.id === a.employee_id);
    const empB = employees.find(e => e.id === b.employee_id);
    return (empA?.name || '').localeCompare(empB?.name || '', 'pt-BR');
  }).map(entry => {
    const emp = getEmployee(entry.employee_id);
    if (!emp) return null;
    const company = getCompany(emp.company_id);
    return { entry, emp, company };
  }).filter(Boolean);

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const companiesInRows = [...new Set(rows.map(r => r.company?.id))];

    companiesInRows.forEach(companyId => {
      const companyRows = rows.filter(r => r.company?.id === companyId);
      const company = companyRows[0]?.company;
      const sheetName = (company?.name || 'Sem Empresa').slice(0, 31);
      const sortedRows = [...companyRows].sort((a, b) => a.emp.name.localeCompare(b.emp.name, 'pt-BR'));

      const headerRow1 = ['', 'COLABORADOR', '', '', '', '1ª QUINZENA', '', '', '2ª QUINZENA', '', '', 'TOTAL LÍQUIDO', 'DADOS BANCÁRIOS', '', '', '', ''];
      const headerRow2 = [
        'ADMISSÃO', 'NOME', 'CARGO', 'LOCAL', 'CPF/CNPJ',
        'Á RECEBER 1ª Q.', 'STATUS 1Q', 'OBS 1Q',
        'Á RECEBER 2ª Q.', 'STATUS 2Q', 'OBS 2Q',
        'TOTAL LÍQUIDO',
        'BANCO', 'AGÊNCIA', 'CONTA', 'FAVORECIDO', 'PIX'
      ];

      const dataRows = sortedRows.map(({ entry, emp }) => {
        const ps = getPayStatus(entry.id);
        return [
          emp.admission_date || '',
          emp.name,
          getJobRoleName(emp),
          getWorkplaceNames(emp),
          emp.cpf_cnpj || '',
          entry.first_period_net || 0,
          ps?.status_q1 || 'PENDENTE',
          ps?.obs_q1 || '',
          entry.second_period_net || 0,
          ps?.status_q2 || 'PENDENTE',
          ps?.obs_q2 || '',
          (entry.first_period_net || 0) + (entry.second_period_net || 0),
          emp.bank_name || '',
          emp.bank_agency || '',
          emp.bank_account || '',
          emp.bank_beneficiary || emp.name,
          emp.pix_key || '',
        ];
      });

      const totalRow = [
        'TOTAL', '', '', '', '',
        dataRows.reduce((s, r) => s + r[5], 0), '', '',
        dataRows.reduce((s, r) => s + r[8], 0), '', '',
        dataRows.reduce((s, r) => s + r[11], 0),
        '', '', '', '', '',
      ];

      const wsData = [headerRow1, headerRow2, ...dataRows, totalRow];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 22 }, { wch: 16 },
        { wch: 16 }, { wch: 12 }, { wch: 20 },
        { wch: 16 }, { wch: 12 }, { wch: 20 },
        { wch: 16 },
        { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 22 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `folha-${selectedMonth}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Grade Financeira</h2>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportXLSX}>
          <Download className="w-4 h-4" /> Exportar XLSX
        </Button>
      </div>

      <div className="overflow-auto rounded-xl border border-border bg-card max-h-[70vh]">
        <table className="text-xs w-full" ref={tableRef} style={{ tableLayout: 'fixed', minWidth: '1100px' }}>
          <colgroup>
            <col style={{ width: '100px' }} />
            <col style={{ width: '180px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '80px' }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border">
              <th className="p-2 text-center font-bold text-white bg-primary" rowSpan={2}>ADMISSÃO</th>
              <th className="p-2 text-center font-bold text-white bg-primary" colSpan={4}>COLABORADOR</th>
              <th className="p-2 text-center font-bold text-white bg-blue-700" colSpan={2}>1ª QUINZENA</th>
              <th className="p-2 text-center font-bold text-white bg-green-700" colSpan={2}>2ª QUINZENA</th>
              <th className="p-2 text-center font-bold text-white bg-teal-700" rowSpan={2}>TOTAL<br/>LÍQUIDO</th>
              <th className="p-2 text-center font-bold text-muted-foreground border-l border-border" rowSpan={2}>RECIBOS</th>
            </tr>
            <tr className="border-b border-border bg-muted/30">
              <th className="p-2 text-left font-semibold text-muted-foreground text-xs truncate">NOME</th>
              <th className="p-2 text-left font-semibold text-muted-foreground text-xs truncate">CARGO</th>
              <th className="p-2 text-left font-semibold text-muted-foreground text-xs truncate">LOCAL</th>
              <th className="p-2 text-left font-semibold text-muted-foreground text-xs truncate">CPF/CNPJ</th>
              <th className="p-2 text-right font-semibold text-blue-600 text-xs">Á RECEBER</th>
              <th className="p-2 text-center font-semibold text-blue-600 text-xs">STATUS</th>
              <th className="p-2 text-right font-semibold text-green-600 text-xs">Á RECEBER</th>
              <th className="p-2 text-center font-semibold text-green-600 text-xs">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, emp }, idx) => {
              const liquidoTotal = (entry.first_period_net || 0) + (entry.second_period_net || 0);
              const ps = getPayStatus(entry.id);
              return (
                <tr key={entry.id} className={`border-b border-border last:border-0 hover:bg-muted/10 transition-colors ${idx % 2 === 1 ? 'bg-accent/20' : ''}`}>
                  <td className="p-2 text-xs truncate">{emp.admission_date ? new Date(emp.admission_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="p-2 font-medium truncate" title={emp.name}>{emp.name}</td>
                  <td className="p-2 truncate text-xs text-muted-foreground" title={getJobRoleName(emp)}>{getJobRoleName(emp)}</td>
                  <td className="p-2 truncate text-xs text-muted-foreground" title={getWorkplaceNames(emp)}>{getWorkplaceNames(emp)}</td>
                  <td className="p-2 font-mono text-xs truncate">{emp.cpf_cnpj || '—'}</td>
                  <td className="p-2 text-right font-mono font-semibold text-blue-600 whitespace-nowrap">{formatCurrency(entry.first_period_net)}</td>
                  <td className="p-2 text-center">
                    {ps?.status_q1 ? (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[ps.status_q1] || ''}`}>
                        {STATUS_LABELS[ps.status_q1]}
                      </span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="p-2 text-right font-mono font-semibold text-green-600 whitespace-nowrap">{formatCurrency(entry.second_period_net)}</td>
                  <td className="p-2 text-center">
                    {ps?.status_q2 ? (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[ps.status_q2] || ''}`}>
                        {STATUS_LABELS[ps.status_q2]}
                      </span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-primary whitespace-nowrap">{formatCurrency(liquidoTotal)}</td>
                  <td className="p-2 text-center border-l border-border">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1 h-7">
                          <FileText className="w-3 h-3" /> PDF
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => onGenerateReceipt(emp, 'holerite')}>Holerite</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onGenerateReceipt(emp, 'moto')}>Recibo Aluguel Moto</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onGenerateReceipt(emp, 'vale_refeicao')}>Recibo Vale Refeição</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={12} className="text-center py-10 text-muted-foreground">Nenhum lançamento para este período</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}