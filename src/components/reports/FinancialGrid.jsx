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

  // Colunas espelhadas entre tabela e XLSX:
  // ADMISSÃO | NOME | CONTRATO | SITUAÇÃO | CPF/CNPJ
  // VALOR BASE | BONIFICAÇÃO | TOTAL BRUTO
  // ADIANT. 1ªQ | Á RECEBER 1ªQ
  // Á RECEBER 2ªQ
  // TOTAL LÍQUIDO
  // BANCO | AGÊNCIA | CONTA | FAVORECIDO | PIX

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const companiesInRows = [...new Set(rows.map(r => r.company?.id))];

    companiesInRows.forEach(companyId => {
      const companyRows = rows.filter(r => r.company?.id === companyId);
      const company = companyRows[0]?.company;
      const sheetName = (company?.name || 'Sem Empresa').slice(0, 31);
      const sortedRows = [...companyRows].sort((a, b) => a.emp.name.localeCompare(b.emp.name, 'pt-BR'));

      // 17 colunas: A..Q
      const headerRow1 = [
        '', 'COLABORADOR', '', '', '',
        'REMUNERAÇÃO', '', '',
        '1ª QUINZENA', '',
        '2ª QUINZENA',
        'TOTAL LÍQUIDO',
        'DADOS BANCÁRIOS', '', '', '', ''
      ];
      const headerRow2 = [
        'ADMISSÃO', 'NOME', 'CONTRATO', 'SITUAÇÃO', 'CPF/CNPJ',
        'VALOR BASE', 'BONIFICAÇÃO', 'TOTAL BRUTO',
        'ADIANTAMENTO', 'Á RECEBER 1ª Q.',
        'Á RECEBER 2ª Q.',
        'TOTAL LÍQUIDO',
        'BANCO', 'AGÊNCIA', 'CONTA', 'FAVORECIDO', 'PIX'
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
        entry.first_period_advance || 0,
        entry.first_period_net || 0,
        entry.second_period_net || 0,
        (entry.first_period_net || 0) + (entry.second_period_net || 0),
        emp.bank_name || '',
        emp.bank_agency || '',
        emp.bank_account || '',
        emp.bank_beneficiary || emp.name,
        emp.pix_key || '',
      ]);

      const totalRow = [
        'TOTAL', '', '', '', '',
        dataRows.reduce((s, r) => s + r[5], 0),
        dataRows.reduce((s, r) => s + r[6], 0),
        dataRows.reduce((s, r) => s + r[7], 0),
        dataRows.reduce((s, r) => s + r[8], 0),
        dataRows.reduce((s, r) => s + r[9], 0),
        dataRows.reduce((s, r) => s + r[10], 0),
        dataRows.reduce((s, r) => s + r[11], 0),
        '', '', '', '', '',
      ];

      const wsData = [headerRow1, headerRow2, ...dataRows, totalRow];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 16 },
        { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 22 },
      ];

      // Merges de grupo (17 colunas: A=0 .. Q=16)
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },   // ADMISSÃO span 2 rows
        { s: { r: 0, c: 1 }, e: { r: 0, c: 4 } },   // COLABORADOR
        { s: { r: 0, c: 5 }, e: { r: 0, c: 7 } },   // REMUNERAÇÃO
        { s: { r: 0, c: 8 }, e: { r: 0, c: 9 } },   // 1ª QUINZENA
        { s: { r: 0, c: 10 }, e: { r: 1, c: 10 } }, // 2ª QUINZENA span 2 rows
        { s: { r: 0, c: 11 }, e: { r: 1, c: 11 } }, // TOTAL LÍQUIDO span 2 rows
        { s: { r: 0, c: 12 }, e: { r: 0, c: 16 } }, // DADOS BANCÁRIOS
      ];

      const purple  = { fgColor: { rgb: '6B3FAE' } };
      const blue    = { fgColor: { rgb: '1D4ED8' } };
      const green   = { fgColor: { rgb: '15803D' } };
      const teal    = { fgColor: { rgb: '0E7490' } };
      const gray    = { fgColor: { rgb: '374151' } };
      const totalBg = { fgColor: { rgb: 'EDE9FE' } };
      const boldWhite = { bold: true, color: { rgb: 'FFFFFF' } };

      const NCOLS = 17;
      const colsArr = Array.from({ length: NCOLS }, (_, i) => String.fromCharCode(65 + i));

      // Cores por coluna index para row1 e row2
      // 0=purple,1-4=purple,5-7=gray,8-9=blue,10=green,11=teal,12-16=gray
      const colFills = [purple, purple, purple, purple, purple, gray, gray, gray, blue, blue, green, teal, gray, gray, gray, gray, gray];

      const applyStyle = (cell, fill, font, halign) => {
        if (!ws[cell]) ws[cell] = { v: '', t: 's' };
        ws[cell].s = {
          fill: { patternType: 'solid', ...fill },
          font: { sz: 10, ...font },
          alignment: { horizontal: halign || 'center', vertical: 'center', wrapText: true },
          border: { bottom: { style: 'thin', color: { rgb: 'D1D5DB' } }, right: { style: 'thin', color: { rgb: 'D1D5DB' } } }
        };
      };

      colsArr.forEach((col, i) => {
        applyStyle(`${col}1`, colFills[i], boldWhite, 'center');
        applyStyle(`${col}2`, colFills[i], boldWhite, 'center');
      });

      // Linhas de dados
      const numericCols = [5, 6, 7, 8, 9, 10, 11]; // índices das colunas numéricas
      dataRows.forEach((_, rowIdx) => {
        const excelRow = rowIdx + 3;
        const isAlt = rowIdx % 2 === 1;
        const rowBg = isAlt ? { fgColor: { rgb: 'F5F3FF' } } : { fgColor: { rgb: 'FFFFFF' } };
        colsArr.forEach((col, colIdx) => {
          const cell = `${col}${excelRow}`;
          if (!ws[cell]) return;
          const isNum = numericCols.includes(colIdx);
          ws[cell].s = {
            fill: { patternType: 'solid', ...rowBg },
            font: { sz: 10, color: { rgb: isNum ? '1E1B4B' : '374151' } },
            alignment: { horizontal: isNum ? 'right' : 'left', vertical: 'center' },
            border: { bottom: { style: 'thin', color: { rgb: 'E5E7EB' } }, right: { style: 'thin', color: { rgb: 'E5E7EB' } } },
            numFmt: isNum ? '"R$ "#,##0.00' : undefined,
          };
        });
      });

      // Linha de total
      const totalExcelRow = dataRows.length + 3;
      colsArr.forEach((col, colIdx) => {
        const cell = `${col}${totalExcelRow}`;
        if (!ws[cell]) return;
        const isNum = numericCols.includes(colIdx);
        ws[cell].s = {
          fill: { patternType: 'solid', ...totalBg },
          font: { sz: 10, bold: true, color: { rgb: '6B3FAE' } },
          alignment: { horizontal: isNum ? 'right' : 'left', vertical: 'center' },
          border: { top: { style: 'medium', color: { rgb: '6B3FAE' } }, bottom: { style: 'thin', color: { rgb: 'D1D5DB' } } },
          numFmt: isNum ? '"R$ "#,##0.00' : undefined,
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
        <table className="text-xs min-w-max" ref={tableRef}>
          <thead>
            {/* Linha 1 — grupos */}
            <tr className="border-b border-border">
              <th className="p-2 text-center font-bold text-white bg-primary whitespace-nowrap" rowSpan={2}>ADMISSÃO</th>
              <th className="p-2 text-center font-bold text-white bg-primary whitespace-nowrap" colSpan={4}>COLABORADOR</th>
              <th className="p-2 text-center font-bold text-white bg-muted-foreground whitespace-nowrap" colSpan={3}>REMUNERAÇÃO</th>
              <th className="p-2 text-center font-bold text-white bg-blue-700 whitespace-nowrap" colSpan={2}>1ª QUINZENA</th>
              <th className="p-2 text-center font-bold text-white bg-green-700 whitespace-nowrap" rowSpan={2}>Á RECEBER<br/>2ª Q.</th>
              <th className="p-2 text-center font-bold text-white bg-teal-700 whitespace-nowrap" rowSpan={2}>TOTAL<br/>LÍQUIDO</th>
              <th className="p-2 text-center font-bold text-muted-foreground whitespace-nowrap border-l border-border" colSpan={5}>DADOS BANCÁRIOS</th>
              <th className="p-2 text-center font-bold text-muted-foreground whitespace-nowrap border-l border-border" rowSpan={2}>RECIBOS</th>
            </tr>
            {/* Linha 2 — campos */}
            <tr className="border-b border-border bg-muted/30">
              <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">NOME</th>
              <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">CONTRATO</th>
              <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">SITUAÇÃO</th>
              <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">CPF/CNPJ</th>
              <th className="p-2 text-right font-semibold text-muted-foreground whitespace-nowrap">VALOR BASE</th>
              <th className="p-2 text-right font-semibold text-muted-foreground whitespace-nowrap">BONIFICAÇÃO</th>
              <th className="p-2 text-right font-semibold text-muted-foreground whitespace-nowrap">TOTAL BRUTO</th>
              <th className="p-2 text-right font-semibold text-blue-600 whitespace-nowrap">ADIANTAMENTO</th>
              <th className="p-2 text-right font-semibold text-blue-600 whitespace-nowrap">Á RECEBER 1ª Q.</th>
              <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap border-l border-border">BANCO</th>
              <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">AGÊNCIA</th>
              <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">CONTA</th>
              <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">FAVORECIDO</th>
              <th className="p-2 text-left font-semibold text-muted-foreground whitespace-nowrap">PIX</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, emp }, idx) => {
              const liquidoTotal = (entry.first_period_net || 0) + (entry.second_period_net || 0);
              return (
                <tr key={entry.id} className={`border-b border-border last:border-0 hover:bg-muted/10 transition-colors ${idx % 2 === 1 ? 'bg-accent/20' : ''}`}>
                  <td className="p-2 whitespace-nowrap text-xs">{emp.admission_date ? new Date(emp.admission_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="p-2 font-medium whitespace-nowrap">{emp.name}</td>
                  <td className="p-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${emp.contract_type === 'CLT' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {emp.contract_type}
                    </span>
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${entry.status === 'closed' ? 'bg-red-100 text-red-600 dark:bg-red-900/20' : 'bg-green-100 text-green-600 dark:bg-green-900/20'}`}>
                      {entry.status === 'closed' ? 'Fechado' : 'Aberto'}
                    </span>
                  </td>
                  <td className="p-2 font-mono whitespace-nowrap text-xs">{emp.cpf_cnpj || '—'}</td>
                  <td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(entry.base_salary)}</td>
                  <td className="p-2 text-right font-mono whitespace-nowrap">{formatCurrency(entry.bonus)}</td>
                  <td className="p-2 text-right font-mono font-semibold whitespace-nowrap">{formatCurrency(entry.gross_total)}</td>
                  <td className="p-2 text-right font-mono whitespace-nowrap text-blue-600">{formatCurrency(entry.first_period_advance)}</td>
                  <td className="p-2 text-right font-mono font-semibold text-blue-600 whitespace-nowrap">{formatCurrency(entry.first_period_net)}</td>
                  <td className="p-2 text-right font-mono font-semibold text-green-600 whitespace-nowrap">{formatCurrency(entry.second_period_net)}</td>
                  <td className="p-2 text-right font-mono font-bold text-primary whitespace-nowrap">{formatCurrency(liquidoTotal)}</td>
                  <td className="p-2 whitespace-nowrap border-l border-border">{emp.bank_name || '—'}</td>
                  <td className="p-2 whitespace-nowrap">{emp.bank_agency || '—'}</td>
                  <td className="p-2 whitespace-nowrap">{emp.bank_account || '—'}</td>
                  <td className="p-2 whitespace-nowrap">{emp.bank_beneficiary || emp.name}</td>
                  <td className="p-2 font-mono text-xs whitespace-nowrap">{emp.pix_key || '—'}</td>
                  <td className="p-2 text-center whitespace-nowrap border-l border-border">
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
              <tr><td colSpan={18} className="text-center py-10 text-muted-foreground">Nenhum lançamento para este período</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}