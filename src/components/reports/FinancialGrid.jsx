import { useRef } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/payrollCalculations';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function FinancialGrid({ entries, employees, companies, selectedMonth, onGenerateReceipt }) {
  const tableRef = useRef();

  const getEmployee = (id) => employees.find(e => e.id === id);
  const getCompany = (id) => companies.find(c => c.id === id);

  const rows = entries.map(entry => {
    const emp = getEmployee(entry.employee_id);
    if (!emp) return null;
    const company = getCompany(emp.company_id);
    return { entry, emp, company };
  }).filter(Boolean);

  const exportCSV = () => {
    const headers = [
      'INICIO', 'PRESTADOR', 'CONTRATO', 'SITUAÇÃO', 'VALOR FIXO', 'BONIFICAÇÃO', 'TOTAL MENSAL',
      'ADIANTAMENTO 1º15', 'Á RECEBER 1º15', 'NOTA 1º15',
      'PAGAMENTO 2º15', 'VALOR 2º15', 'NOTA 2º15',
      'NOME DO BANCO', 'AGÊNCIA', 'CONTA', 'FAVORECIDO', 'CHAVE PIX', 'CPF/CNPJ FAVORECIDO'
    ];
    const csvRows = rows.map(({ entry, emp }) => [
      emp.admission_date || '',
      emp.name,
      emp.contract_type,
      entry.status === 'closed' ? 'Fechado' : 'Aberto',
      entry.base_salary || 0,
      entry.bonus || 0,
      entry.gross_total || 0,
      entry.first_period_advance || 0,
      entry.first_period_net || 0,
      entry.first_period_note || '',
      entry.first_period_discount || 0,
      entry.second_period_net || 0,
      entry.second_period_note || '',
      emp.bank_name || '',
      emp.bank_agency || '',
      emp.bank_account || '',
      emp.bank_beneficiary || '',
      emp.pix_key || '',
      emp.cpf_cnpj || '',
    ].map(v => `"${v}"`).join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `folha-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Grade Financeira</h2>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
          <Download className="w-4 h-4" /> Exportar CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="text-xs min-w-[1800px]" ref={tableRef}>
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="p-3 text-left font-semibold text-muted-foreground whitespace-nowrap">INICIO</th>
              <th className="p-3 text-left font-semibold text-muted-foreground whitespace-nowrap">PRESTADOR</th>
              <th className="p-3 text-left font-semibold text-muted-foreground whitespace-nowrap">CONTRATO</th>
              <th className="p-3 text-left font-semibold text-muted-foreground whitespace-nowrap">SITUAÇÃO</th>
              <th className="p-3 text-right font-semibold text-muted-foreground whitespace-nowrap">VALOR FIXO</th>
              <th className="p-3 text-right font-semibold text-muted-foreground whitespace-nowrap">BONIFICAÇÃO</th>
              <th className="p-3 text-right font-semibold text-muted-foreground whitespace-nowrap">TOTAL MENSAL</th>
              {/* 1º 15 */}
              <th className="p-3 text-right font-semibold text-blue-500 whitespace-nowrap border-l border-blue-200 dark:border-blue-900">ADIANTAMENTO 1º15</th>
              <th className="p-3 text-right font-semibold text-blue-500 whitespace-nowrap">Á RECEBER 1º15</th>
              <th className="p-3 text-left font-semibold text-blue-500 whitespace-nowrap">NOTA 1º15</th>
              {/* Descontos 1º15 */}
              <th className="p-3 text-right font-semibold text-red-500 whitespace-nowrap border-l border-red-200 dark:border-red-900">PAGAMENTO 1º15</th>
              <th className="p-3 text-right font-semibold text-red-500 whitespace-nowrap">VALOR DESC 1º15</th>
              <th className="p-3 text-left font-semibold text-red-500 whitespace-nowrap">NOTA DESC 1º15</th>
              {/* 2º 15 */}
              <th className="p-3 text-right font-semibold text-green-600 whitespace-nowrap border-l border-green-200 dark:border-green-900">Á RECEBER 2º15</th>
              <th className="p-3 text-right font-semibold text-green-600 whitespace-nowrap">VALOR 2º15</th>
              <th className="p-3 text-left font-semibold text-green-600 whitespace-nowrap">NOTA 2º15</th>
              {/* Bancários */}
              <th className="p-3 text-left font-semibold text-muted-foreground whitespace-nowrap border-l border-border">BANCO</th>
              <th className="p-3 text-left font-semibold text-muted-foreground whitespace-nowrap">AGÊNCIA</th>
              <th className="p-3 text-left font-semibold text-muted-foreground whitespace-nowrap">CONTA</th>
              <th className="p-3 text-left font-semibold text-muted-foreground whitespace-nowrap">FAVORECIDO</th>
              <th className="p-3 text-left font-semibold text-muted-foreground whitespace-nowrap">CHAVE PIX</th>
              <th className="p-3 text-left font-semibold text-muted-foreground whitespace-nowrap">CPF/CNPJ</th>
              <th className="p-3 text-center font-semibold text-muted-foreground whitespace-nowrap border-l border-border">RECIBOS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, emp }) => (
              <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                <td className="p-3 whitespace-nowrap">{emp.admission_date ? new Date(emp.admission_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                <td className="p-3 font-medium whitespace-nowrap">{emp.name}</td>
                <td className="p-3 whitespace-nowrap">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${emp.contract_type === 'CLT' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {emp.contract_type}
                  </span>
                </td>
                <td className="p-3 whitespace-nowrap">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${entry.status === 'closed' ? 'bg-red-100 text-red-600 dark:bg-red-900/20' : 'bg-green-100 text-green-600 dark:bg-green-900/20'}`}>
                    {entry.status === 'closed' ? 'Fechado' : 'Aberto'}
                  </span>
                </td>
                <td className="p-3 text-right font-mono whitespace-nowrap">{formatCurrency(entry.base_salary)}</td>
                <td className="p-3 text-right font-mono whitespace-nowrap">{formatCurrency(entry.bonus)}</td>
                <td className="p-3 text-right font-mono font-semibold whitespace-nowrap">{formatCurrency(entry.gross_total)}</td>
                {/* 1º15 */}
                <td className="p-3 text-right font-mono whitespace-nowrap border-l border-blue-100 dark:border-blue-900/30">{formatCurrency(entry.first_period_advance)}</td>
                <td className="p-3 text-right font-mono font-semibold text-blue-600 whitespace-nowrap">{formatCurrency(entry.first_period_net)}</td>
                <td className="p-3 text-muted-foreground italic whitespace-nowrap max-w-24 truncate">{entry.first_period_note || '—'}</td>
                {/* Descontos 1º15 */}
                <td className="p-3 text-right font-mono whitespace-nowrap border-l border-red-100 dark:border-red-900/30">{formatCurrency(entry.first_period_advance)}</td>
                <td className="p-3 text-right font-mono text-destructive whitespace-nowrap">{formatCurrency(entry.first_period_discount)}</td>
                <td className="p-3 text-muted-foreground italic whitespace-nowrap max-w-24 truncate">—</td>
                {/* 2º15 */}
                <td className="p-3 text-right font-mono whitespace-nowrap border-l border-green-100 dark:border-green-900/30">{formatCurrency(entry.second_period_net)}</td>
                <td className="p-3 text-right font-mono font-semibold text-green-600 whitespace-nowrap">{formatCurrency(entry.second_period_net)}</td>
                <td className="p-3 text-muted-foreground italic whitespace-nowrap max-w-24 truncate">{entry.second_period_note || '—'}</td>
                {/* Bancários */}
                <td className="p-3 whitespace-nowrap border-l border-border">{emp.bank_name || '—'}</td>
                <td className="p-3 whitespace-nowrap">{emp.bank_agency || '—'}</td>
                <td className="p-3 whitespace-nowrap">{emp.bank_account || '—'}</td>
                <td className="p-3 whitespace-nowrap">{emp.bank_beneficiary || emp.name}</td>
                <td className="p-3 font-mono text-xs whitespace-nowrap">{emp.pix_key || '—'}</td>
                <td className="p-3 font-mono text-xs whitespace-nowrap">{emp.cpf_cnpj || '—'}</td>
                <td className="p-3 text-center whitespace-nowrap border-l border-border">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1 h-7">
                        <FileText className="w-3 h-3" /> PDF
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => onGenerateReceipt(emp, 'holerite')}>
                        Holerite
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onGenerateReceipt(emp, 'moto')}>
                        Recibo Aluguel Moto
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onGenerateReceipt(emp, 'vale_refeicao')}>
                        Recibo Vale Refeição
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={23} className="text-center py-10 text-muted-foreground">Nenhum lançamento para este período</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}