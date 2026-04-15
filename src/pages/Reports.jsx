import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';
import FinancialGrid from '@/components/reports/FinancialGrid';
import PDFReceiptDialog from '@/components/reports/PDFReceiptDialog';

export default function Reports() {
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [receiptType, setReceiptType] = useState(null);

  const load = async () => {
    const [e, c, p] = await Promise.all([
      base44.entities.Employee.list(),
      base44.entities.Company.list(),
      base44.entities.PayrollEntry.filter({ reference_month: selectedMonth }),
    ]);
    setEmployees(e.filter(x => x.is_active !== false));
    setCompanies(c.filter(x => x.is_active !== false));
    setEntries(p);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatórios & Documentos</h1>
        <p className="text-muted-foreground text-sm mt-1">Grade financeira e geração de recibos</p>
      </div>

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

      <FinancialGrid
        entries={filteredEntries}
        employees={employees}
        companies={companies}
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