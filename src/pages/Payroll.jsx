import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Lock, Unlock, Search, Filter, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';
import PayrollEntryForm from '@/components/payroll/PayrollEntryForm';

import { toast } from 'sonner';

export default function Payroll() {
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [entries, setEntries] = useState([]);
  const [monthCloses, setMonthCloses] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);


  const load = async () => {
    const [e, c, p, m] = await Promise.all([
      base44.entities.Employee.list(),
      base44.entities.Company.list(),
      base44.entities.PayrollEntry.filter({ reference_month: selectedMonth }),
      base44.entities.MonthClose.filter({ reference_month: selectedMonth }),
    ]);
    setEmployees(e.filter(x => x.is_active !== false));
    setCompanies(c.filter(x => x.is_active !== false));
    setEntries(p);
    setMonthCloses(m);
  };

  useEffect(() => { load(); }, [selectedMonth]);

  const isMonthClosed = (companyId) => {
    const mc = monthCloses.find(m => m.company_id === companyId);
    return mc?.status === 'closed';
  };

  const filteredEmployees = employees.filter(emp => {
    const matchCompany = selectedCompany === 'all' || emp.company_id === selectedCompany;
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase());
    return matchCompany && matchSearch;
  });

  const getEntry = (empId) => entries.find(e => e.employee_id === empId && e.reference_month === selectedMonth);
  const getCompanyName = (id) => companies.find(c => c.id === id)?.name || '—';

  const handleSaveEntry = async (data) => {
    const existing = getEntry(editingEmployee?.id);
    if (existing) {
      await base44.entities.PayrollEntry.update(existing.id, data);
    } else {
      await base44.entities.PayrollEntry.create({ ...data, employee_id: editingEmployee?.id, reference_month: selectedMonth });
    }
    setShowForm(false);
    setEditingEntry(null);
    setEditingEmployee(null);
    load();
    toast.success('Lançamento salvo!');
  };

  const handleCloseMonth = async (companyId) => {
    const existing = monthCloses.find(m => m.company_id === companyId);
    if (existing) {
      await base44.entities.MonthClose.update(existing.id, { status: 'closed', closed_at: new Date().toISOString() });
    } else {
      await base44.entities.MonthClose.create({ company_id: companyId, reference_month: selectedMonth, status: 'closed', closed_at: new Date().toISOString() });
    }
    load();
    toast.success('Mês fechado com sucesso!');
  };

  const handleReopenMonth = async (companyId) => {
    const existing = monthCloses.find(m => m.company_id === companyId);
    if (existing) {
      await base44.entities.MonthClose.update(existing.id, { status: 'open', reopened_at: new Date().toISOString() });
      load();
      toast.success('Mês reaberto!');
    }
  };

  // Generate months list
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  const companiesInView = selectedCompany === 'all' ? companies : companies.filter(c => c.id === selectedCompany);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Folha de Pagamento</h1>
          <p className="text-muted-foreground text-sm mt-1">Lançamentos mensais</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => (
              <SelectItem key={m} value={m}>{getMonthName(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedCompany} onValueChange={setSelectedCompany}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Empresas</SelectItem>
            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar colaborador..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {companiesInView.map(company => {
        const companyEmps = filteredEmployees.filter(e => e.company_id === company.id);
        if (companyEmps.length === 0) return null;
        const closed = isMonthClosed(company.id);
        const companyEntries = entries.filter(e => companyEmps.some(emp => emp.id === e.employee_id));
        const totalNet = companyEntries.reduce((s, e) => s + (e.net_total || 0), 0);

        return (
          <Card key={company.id} className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">{company.name}</CardTitle>
                  <Badge variant={closed ? 'destructive' : 'outline'} className="text-xs gap-1">
                    {closed ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    {closed ? 'Fechado' : 'Aberto'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Total: <strong className="text-foreground">{formatCurrency(totalNet)}</strong></span>
                  {closed ? (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleReopenMonth(company.id)}>
                      <Unlock className="w-3.5 h-3.5" /> Reabrir Mês
                    </Button>
                  ) : (
                    <Button variant="default" size="sm" className="gap-1.5" onClick={() => handleCloseMonth(company.id)}>
                      <Lock className="w-3.5 h-3.5" /> Fechar Mês
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-b border-border bg-muted/30">
                      <th className="text-left p-3 pl-6 font-medium text-muted-foreground">Colaborador</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Contrato</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Salário Base</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Bruto</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Descontos</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Líquido</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 pr-6 font-medium text-muted-foreground">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companyEmps.map(emp => {
                      const entry = getEntry(emp.id);
                      const totalDiscounts = entry ? ((entry.inss || 0) + (entry.irrf || 0) + (entry.pj_retention || 0) + (entry.first_period_discount || 0) + (entry.second_period_discount || 0)) : 0;
                      return (
                        <tr key={emp.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                          <td className="p-3 pl-6">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-primary">
                                {emp.name.slice(0, 2).toUpperCase()}
                              </div>
                              <span className="font-medium">{emp.name}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge variant={emp.contract_type === 'CLT' ? 'default' : 'secondary'} className="text-xs">{emp.contract_type}</Badge>
                          </td>
                          <td className="p-3 text-right font-mono">{formatCurrency(emp.base_salary)}</td>
                          <td className="p-3 text-right font-mono">{entry ? formatCurrency(entry.gross_total) : '—'}</td>
                          <td className="p-3 text-right font-mono text-destructive">{entry ? formatCurrency(totalDiscounts) : '—'}</td>
                          <td className="p-3 text-right font-mono font-semibold text-primary">{entry ? formatCurrency(entry.net_total) : '—'}</td>
                          <td className="p-3 text-center">
                            <Badge variant={entry ? 'default' : 'outline'} className="text-xs">
                              {entry ? 'Lançado' : 'Pendente'}
                            </Badge>
                          </td>
                          <td className="p-3 pr-6 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={closed}
                              onClick={() => { setEditingEmployee(emp); setEditingEntry(entry || null); setShowForm(true); }}
                            >
                              {entry ? 'Editar' : 'Lançar'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {showForm && editingEmployee && (
        <PayrollEntryForm
          employee={editingEmployee}
          entry={editingEntry}
          referenceMonth={selectedMonth}
          onSave={handleSaveEntry}
          onClose={() => { setShowForm(false); setEditingEntry(null); setEditingEmployee(null); }}
        />
      )}
    </div>
  );
}