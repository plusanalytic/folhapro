import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Users, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/payrollCalculations';
import EmployeeForm from '@/components/employees/EmployeeForm';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterContract, setFilterContract] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const [e, c] = await Promise.all([base44.entities.Employee.list(), base44.entities.Company.list()]);
    setEmployees(e);
    setCompanies(c);
  };
  useEffect(() => { load(); }, []);

  const filtered = employees.filter(emp => {
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase()) || (emp.cpf_cnpj || '').includes(search);
    const matchCompany = filterCompany === 'all' || emp.company_id === filterCompany;
    const matchContract = filterContract === 'all' || emp.contract_type === filterContract;
    return matchSearch && matchCompany && matchContract;
  });

  const getCompanyName = (id) => companies.find(c => c.id === id)?.name || '—';

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.Employee.update(editing.id, data);
    } else {
      await base44.entities.Employee.create(data);
    }
    setShowForm(false);
    setEditing(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Colaboradores</h1>
          <p className="text-muted-foreground text-sm mt-1">{employees.filter(e => e.is_active !== false).length} ativos</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Colaborador
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar nome ou CPF/CNPJ..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Empresas</SelectItem>
            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterContract} onValueChange={setFilterContract}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Contrato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="CLT">CLT</SelectItem>
            <SelectItem value="PJ">PJ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left p-4 font-medium text-muted-foreground">Colaborador</th>
              <th className="text-left p-4 font-medium text-muted-foreground">Empresa</th>
              <th className="text-left p-4 font-medium text-muted-foreground">CPF/CNPJ</th>
              <th className="text-left p-4 font-medium text-muted-foreground">Contrato</th>
              <th className="text-right p-4 font-medium text-muted-foreground">Salário Base</th>
              <th className="text-center p-4 font-medium text-muted-foreground">Status</th>
              <th className="text-right p-4 font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(emp => (
              <tr key={emp.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-primary">
                      {emp.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{emp.name}</p>
                      {emp.position && <p className="text-xs text-muted-foreground">{emp.position}</p>}
                    </div>
                  </div>
                </td>
                <td className="p-4 text-muted-foreground">{getCompanyName(emp.company_id)}</td>
                <td className="p-4 text-muted-foreground font-mono text-xs">{emp.cpf_cnpj || '—'}</td>
                <td className="p-4">
                  <Badge variant={emp.contract_type === 'CLT' ? 'default' : 'secondary'} className="text-xs">
                    {emp.contract_type}
                  </Badge>
                </td>
                <td className="p-4 text-right font-mono font-medium">{formatCurrency(emp.base_salary)}</td>
                <td className="p-4 text-center">
                  <Badge variant={emp.is_active !== false ? 'outline' : 'secondary'} className="text-xs">
                    {emp.is_active !== false ? 'Ativo' : 'Inativo'}
                  </Badge>
                </td>
                <td className="p-4 text-right">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(emp); setShowForm(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Nenhum colaborador encontrado</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <EmployeeForm
          employee={editing}
          companies={companies}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}