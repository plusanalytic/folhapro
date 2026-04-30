import { useRef } from 'react';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/payrollCalculations';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import * as XLSX from 'xlsx';

export default function FinancialGrid({ entries, employees, companies, selectedMonth, onGenerateReceipt }) {
  const tableRef = useRef();

  const getEmployee = (id) => employees.find(e => e.id === id);
  const getCompany = (id) => companies.find(c => c.id === id);

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

    // ── Grupo por empresa ──
    const companiesInRows = [...new Set(rows.map(r => r.company?.id))];

    companiesInRows.forEach(companyId => {
      const companyRows = rows.filter(r => r.company?.id === companyId);
      const company = companyRows[0]?.company;
      const sheetName = (company?.name || 'Sem Empresa').slice(0, 31);

      const sortedRows = [...companyRows].sort((a, b) => a.emp.name.localeCompare(b.emp.name, 'pt-BR'));

      // Headers em 2 linhas: grupo + campo
      const headerRow1 = [
        '', 'COLABORADOR', '', '', '',
        'REMUNERAÇÃO', '', '',
        '',
        'DADOS BANCÁRIOS', '', '', '', '', ''
      ];
      const headerRow2 = [
        'ADMISSÃO', 'NOME', 'CONTRATO', 'SITUAÇÃO', 'CPF/CNPJ',
        'VALOR BASE', 'BONIFICAÇÃO', 'TOTAL BRUTO',
        'TOTAL LÍQUIDO',
        'BANCO', 'AGÊNCIA', 'CONTA', 'FAVORECIDO', 'PIX', 'EMPRESA'
      ];

      const dataRows = sortedRows.map(({ entry, emp }) => [
        emp.admission_date || '',
        emp.name,
        emp.contract_type,
        entry.status === 'closed' ? 'Fechado' : 'Aberto',
        emp.cpf_cnpj || '',
        entry.base_salary || 0,
        entry.bonus || 0,
        entry.gross_total || 0,
        (entry.first_period_net || 0) + (entry.second_period_net || 0),
        emp.bank_name || '',
        emp.bank_agency || '',
        emp.bank_account || '',
        emp.bank_beneficiary || emp.name,
        emp.pix_key || '',
        company?.name || '',
      ]);

      // Total row
      const totalRow = [
        'TOTAL', '', '', '', '',
        dataRows.reduce((s, r) => s + r[5], 0),
        dataRows.reduce((s, r) => s + r[6], 0),
        dataRows.reduce((s, r) => s + r[7], 0),
        dataRows.reduce((s, r) => s + r[8], 0),
        '', '', '', '', '', '',
      ];

      const wsData = [headerRow1, headerRow2, ...dataRows, totalRow];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Larguras de colunas
      ws['!cols'] = [
        { wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 16 },
        { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 16 },
        { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 18 },
      ];

      // Merge de cabeçalho de grupos
      ws['!merges'] = [
        { s: { r: 0, c: 1 }, e: { r: 0, c: 4 } },   // COLABORADOR
        { s: { r: 0, c: 5 }, e: { r: 0, c: 7 } },   // REMUNERAÇÃO
        { s: { r: 0, c: 8 }, e: { r: 1, c: 8 } },   // TOTAL LÍQUIDO
        { s: { r: 0, c: 9 }, e: { r: 0, c: 14 } },  // DADOS BANCÁRIOS
        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },   // ADMISSÃO
      ];

      // Estilos
      const purple = { fgColor: { rgb: '6B3FAE' } };
      const blue   = { fgColor: { rgb: '1D4ED8' } };
      const green  = { fgColor: { rgb: '15803D' } };
      const gray   = { fgColor: { rgb: '374151' } };
      const totalBg = { fgColor: { rgb: 'EDE9FE' } };
      const white  = { fgColor: { rgb: 'FFFFFF' } };
      const boldWhite = { bold: true, color: { rgb: 'FFFFFF' } };
      const boldPurple = { bold: true, color: { rgb: '6B3FAE' } };

      const applyStyle = (cell, fill, font, alignment) => {
        if (!ws[cell]) return;
        ws[cell].s = {
          fill: { patternType: 'solid', ...fill },
          font: { sz: 10, ...font },
          alignment: { horizontal: alignment || 'center', vertical: 'center', wrapText: true },
          border: { bottom: { style: 'thin', color: { rgb: 'D1D5DB' } }, right: { style: 'thin', color: { rgb: 'D1D5DB' } } }
        };
      };

      const cols = 'ABCDEFGHIJKLMNO';

      // Row 1 (grupo)
      const groupColors = [null, purple, purple, purple, purple, gray, gray, gray, green, gray, gray, gray, gray, gray, gray];
      cols.split('').forEach((col, i) => {
        applyStyle(`${col}1`, groupColors[i] || purple, boldWhite, 'center');
      });

      // Row 2 (campos)
      cols.split('').forEach((col, i) => {
        const bg = i < 5 ? purple : i < 8 ? gray : i === 8 ? green : gray;
        applyStyle(`${col}2`, bg, boldWhite, 'center');
      });

      // Linhas de dados
      dataRows.forEach((_, rowIdx) => {
        const excelRow = rowIdx + 3;
        const isAlt = rowIdx % 2 === 1;
        const rowBg = isAlt ? { fgColor: { rgb: 'F5F3FF' } } : { fgColor: { rgb: 'FFFFFF' } };
        cols.split('').forEach((col, colIdx) => {
          const cell = `${col}${excelRow}`;
          if (!ws[cell]) return;
          ws[cell].s = {
            fill: { patternType: 'solid', ...rowBg },
            font: { sz: 10, color: { rgb: colIdx >= 5 && colIdx <= 8 ? '1E1B4B' : '374151' } },
            alignment: { horizontal: colIdx >= 5 && colIdx <= 8 ? 'right' : 'left', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: 'E5E7EB' } }, right: { style: 'thin', color: { rgb: 'E5E7EB' } } },
            numFmt: colIdx >= 5 && colIdx <= 8 ? '"R$ "#,##0.00' : undefined,
          };
        });
      });

      // Linha de total
      const totalExcelRow = dataRows.length + 3;
      cols.split('').forEach((col, colIdx) => {
        const cell = `${col}${totalExcelRow}`;
        if (!ws[cell]) return;
        ws[cell].s = {
          fill: { patternType: 'solid', ...totalBg },
          font: { sz: 10, bold: true, color: { rgb: '6B3FAE' } },
          alignment: { horizontal: colIdx >= 5 && colIdx <= 8 ? 'right' : 'left', vertical: 'center' },
          border: { top: { style: 'medium', color: { rgb: '6B3FAE' } }, bottom: { style: 'thin', color: { rgb: 'D1D5DB' } } },
          numFmt: colIdx >= 5 && colIdx <= 8 ? '"R$ "#,##0.00' : undefined,
        };
      });

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
              {/* Total Líquido */}
              <th className="p-3 text-right font-semibold text-primary whitespace-nowrap border-l border-border">TOTAL LÍQUIDO</th>
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
                {/* Total Líquido */}
                <td className="p-3 text-right font-mono font-semibold text-primary whitespace-nowrap border-l border-border">{formatCurrency((entry.first_period_net || 0) + (entry.second_period_net || 0))}</td>
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
              <tr><td colSpan={16} className="text-center py-10 text-muted-foreground">Nenhum lançamento para este período</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}