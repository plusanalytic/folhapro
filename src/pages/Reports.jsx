import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';
import FinancialGrid from '@/components/reports/FinancialGrid.jsx';
import PDFReceiptDialog from '@/components/reports/PDFReceiptDialog';
import { jsPDF } from 'jspdf';

export default function Reports() {
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [jobRoles, setJobRoles] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [paymentStatuses, setPaymentStatuses] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [receiptType, setReceiptType] = useState(null);

  const load = async () => {
    const [e, c, jr, w, p, ps] = await Promise.all([
      base44.entities.Employee.list(),
      base44.entities.Company.list(),
      base44.entities.JobRole.list(),
      base44.entities.Workplace.list(),
      base44.entities.PayrollEntry.filter({ reference_month: selectedMonth }),
      base44.entities.PaymentStatus.filter({ reference_month: selectedMonth }),
    ]);
    setEmployees(e.filter(x => x.is_active !== false));
    setCompanies(c.filter(x => x.is_active !== false));
    setJobRoles(jr);
    setWorkplaces(w);
    setEntries(p);
    setPaymentStatuses(ps);
  };

  useEffect(() => { load(); }, [selectedMonth]);

  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  const filteredEntries = entries.filter(e => {
    if (selectedCompany === 'all') return true;
    const emp = employees.find(emp => emp.id === e.employee_id);
    return emp?.company_id === selectedCompany;
  });

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Relatorio Financeiro - ' + getMonthName(selectedMonth), 14, 16);

    const byCompany = {};
    for (const entry of filteredEntries) {
      const emp = employees.find(e => e.id === entry.employee_id);
      if (!emp) continue;
      const company = companies.find(c => c.id === emp.company_id);
      const key = company ? company.name : 'Sem Empresa';
      if (!byCompany[key]) byCompany[key] = [];
      byCompany[key].push({ entry, emp });
    }

    const headers = ['Colaborador', 'Cargo', 'Local', 'Sal. Base', '1a Qz', '2a Qz', 'St. Q1', 'St. Q2'];
    const colWidths = [50, 38, 32, 26, 26, 26, 18, 18];
    const colX = colWidths.reduce((acc, w, i) => {
      acc.push(i === 0 ? 14 : acc[i - 1] + colWidths[i - 1]);
      return acc;
    }, []);
    const fmt = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

    let y = 26;
    for (const companyName of Object.keys(byCompany)) {
      const rows = byCompany[companyName];
      if (y > 175) { doc.addPage(); y = 16; }
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(companyName, 14, y);
      y += 6;

      doc.setFontSize(7);
      doc.setFillColor(220, 220, 235);
      doc.rect(14, y - 4, 272, 6, 'F');
      headers.forEach((h, i) => doc.text(h, colX[i], y));
      y += 5;
      doc.setFont('helvetica', 'normal');

      for (const row of rows) {
        if (y > 185) { doc.addPage(); y = 16; }
        const emp = row.emp;
        const entry = row.entry;
        const jr = jobRoles.find(j => j.tangerino_id === emp.job_role_tangerino_id);
        const wp = (emp.workplace_list || []).map(wId => workplaces.find(w => w.tangerino_id === wId)).filter(Boolean).map(w => w.name).join(', ');
        const ps = paymentStatuses.find(p => p.payroll_entry_id === entry.id);
        const cells = [
          emp.name,
          jr ? jr.name : (emp.position || '-'),
          wp || '-',
          fmt(entry.base_salary),
          fmt(entry.first_period_net),
          fmt(entry.second_period_net),
          ps ? (ps.status_q1 || '-') : '-',
          ps ? (ps.status_q2 || '-') : '-',
        ];
        cells.forEach((val, i) => doc.text(String(val).substring(0, 22), colX[i], y));
        y += 5;
      }

      doc.setFont('helvetica', 'bold');
      const tBase = rows.reduce((s, r) => s + (r.entry.base_salary || 0), 0);
      const tQ1 = rows.reduce((s, r) => s + (r.entry.first_period_net || 0), 0);
      const tQ2 = rows.reduce((s, r) => s + (r.entry.second_period_net || 0), 0);
      doc.text('Total (' + rows.length + '):', colX[0], y);
      doc.text(fmt(tBase), colX[3], y);
      doc.text(fmt(tQ1), colX[4], y);
      doc.text(fmt(tQ2), colX[5], y);
      y += 9;
      doc.setFont('helvetica', 'normal');
    }

    doc.save('relatorio-' + selectedMonth + '.pdf');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatórios &amp; Documentos</h1>
        <p className="text-muted-foreground text-sm mt-1">Grade financeira e geração de recibos</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m} value={m}>{getMonthName(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={exportPDF} disabled={filteredEntries.length === 0}>
          <Download className="w-4 h-4 mr-2" /> Exportar PDF
        </Button>
      </div>

      <FinancialGrid
        entries={filteredEntries}
        employees={employees}
        companies={companies}
        jobRoles={jobRoles}
        workplaces={workplaces}
        paymentStatuses={paymentStatuses}
        selectedMonth={selectedMonth}
        onGenerateReceipt={(emp, type) => { setSelectedEmployee(emp); setReceiptType(type); }}
      />

      {selectedEmployee && receiptType && (
        <PDFReceiptDialog
          employee={selectedEmployee}
          entry={entries.find(e => e.employee_id === selectedEmployee.id)}
          receiptType={receiptType}
          referenceMonth={selectedMonth}
          onClose={() => { setSelectedEmployee(null); setReceiptType(null); }}
        />
      )}
    </div>
  );
}