import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, ArrowDownCircle, Search, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/payrollCalculations';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';

function getPeriod(dateStr) {
  const day = parseInt(dateStr.split('-')[2]);
  return day <= 15 ? 'first' : 'second';
}

function getMonthFromDate(dateStr) {
  return dateStr.substring(0, 7);
}

export default function CashOut() {
  const [cashOuts, setCashOuts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().substring(0, 7));
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [form, setForm] = useState({ employee_id: '', date: '', description: '', amount: '', notes: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.CashOut.list('-date', 500),
      base44.entities.Employee.list('name', 500),
      base44.entities.Company.list('name', 100),
    ]).then(([co, em, cp]) => { setCashOuts(co); setEmployees(em); setCompanies(cp); });
  }, []);

  const employeeMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const companyMap = Object.fromEntries(companies.map(c => [c.id, c]));

  const filtered = cashOuts.filter(c => {
    const emp = employeeMap[c.employee_id];
    if (filterCompany !== 'all' && emp?.company_id !== filterCompany) return false;
    if (filterEmployee !== 'all' && c.employee_id !== filterEmployee) return false;
    if (filterMonth && !c.date?.startsWith(filterMonth)) return false;
    if (search && !emp?.name?.toLowerCase().includes(search.toLowerCase()) && !c.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalFiltered = filtered.reduce((s, c) => s + (c.amount || 0), 0);

  const handleSave = async () => {
    if (!form.employee_id || !form.date || !form.description || !form.amount) {
      toast.error('Preencha todos os campos');
      return;
    }
    setLoading(true);
    const emp = employeeMap[form.employee_id];
    const record = {
      employee_id: form.employee_id,
      company_id: emp?.company_id || '',
      date: form.date,
      description: form.description,
      amount: parseFloat(form.amount),
      reference_month: getMonthFromDate(form.date),
      period: getPeriod(form.date),
      notes: form.notes || '',
    };
    const saved = await base44.entities.CashOut.create(record);
    setCashOuts(prev => [saved, ...prev]);
    setForm({ employee_id: '', date: '', description: '', amount: '', notes: '' });
    setEmployeeSearch('');
    setShowForm(false);
    toast.success('Saída lançada com sucesso');
    setLoading(false);
  };

  const handleDelete = async (id) => {
    await base44.entities.CashOut.delete(id);
    setCashOuts(prev => prev.filter(c => c.id !== id));
    toast.success('Removido');
  };

  const filteredEmployees = filterCompany === 'all'
    ? employees
    : employees.filter(e => e.company_id === filterCompany);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-destructive/10 rounded-xl flex items-center justify-center">
            <ArrowDownCircle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Saída de Caixa</h1>
            <p className="text-sm text-muted-foreground">Descontos vinculados a colaboradores por quinzena</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Lançamento
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar colaborador ou descrição..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Input type="month" className="w-44 h-9 font-mono" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
            <Select value={filterCompany} onValueChange={v => { setFilterCompany(v); setFilterEmployee('all'); }}>
              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filteredEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Total no período</p>
            <p className="font-mono font-bold text-destructive text-xl">{formatCurrency(totalFiltered)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Lançamentos</p>
            <p className="font-bold text-xl">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-4 pb-2">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground">
                  <th className="text-left px-4 py-3 font-medium">Data</th>
                  <th className="text-left px-4 py-3 font-medium">Colaborador</th>
                  <th className="text-left px-4 py-3 font-medium">Descrição</th>
                  <th className="text-left px-4 py-3 font-medium">Quinzena</th>
                  <th className="text-right px-4 py-3 font-medium">Valor</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground py-10 text-sm">
                      Nenhum lançamento encontrado
                    </td>
                  </tr>
                )}
                {filtered.map(c => {
                  const emp = employeeMap[c.employee_id];
                  return (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs">{c.date}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{emp?.name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{companyMap[emp?.company_id]?.name}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.description}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">
                          {c.period === 'first' ? '1ª Quinzena (1–15)' : '2ª Quinzena (16–30)'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-destructive">
                        - {formatCurrency(c.amount)}
                      </td>
                      <td className="px-2 py-3">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Form Dialog — tela inteira */}
      <Dialog open={showForm} onOpenChange={open => { setShowForm(open); if (!open) { setEmployeeSearch(''); setShowEmployeeDropdown(false); } }}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-col overflow-hidden p-0">
          <div className="flex-1 overflow-y-auto p-6">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-xl">Novo Lançamento de Saída</DialogTitle>
            </DialogHeader>
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Colaborador com busca por digitação */}
              <div>
                <Label>Colaborador</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-9"
                    placeholder="Digite para buscar colaborador..."
                    value={employeeSearch}
                    onChange={e => {
                      setEmployeeSearch(e.target.value);
                      setShowEmployeeDropdown(true);
                      if (!e.target.value) setForm(f => ({ ...f, employee_id: '' }));
                    }}
                    onFocus={() => setShowEmployeeDropdown(true)}
                  />
                  {showEmployeeDropdown && employeeSearch && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {employees
                        .filter(e => e.name.toLowerCase().includes(employeeSearch.toLowerCase()))
                        .map(e => (
                          <button
                            key={e.id}
                            type="button"
                            className="w-full text-left px-4 py-2.5 hover:bg-muted text-sm flex flex-col"
                            onClick={() => {
                              setForm(f => ({ ...f, employee_id: e.id }));
                              setEmployeeSearch(e.name);
                              setShowEmployeeDropdown(false);
                            }}
                          >
                            <span className="font-medium">{e.name}</span>
                            <span className="text-xs text-muted-foreground">{companyMap[e.company_id]?.name} · {e.contract_type}</span>
                          </button>
                        ))}
                      {employees.filter(e => e.name.toLowerCase().includes(employeeSearch.toLowerCase())).length === 0 && (
                        <div className="px-4 py-3 text-sm text-muted-foreground">Nenhum colaborador encontrado</div>
                      )}
                    </div>
                  )}
                </div>
                {form.employee_id && (
                  <p className="text-xs text-primary mt-1">✓ {employeeMap[form.employee_id]?.name} selecionado</p>
                )}
              </div>

              <div>
                <Label>Data do lançamento</Label>
                <Input type="date" className="mt-1 font-mono" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                {form.date && (
                  <p className="text-xs text-muted-foreground mt-1">
                    → {getPeriod(form.date) === 'first' ? '1ª Quinzena (1–15)' : '2ª Quinzena (16–30)'} · {getMonthFromDate(form.date)}
                  </p>
                )}
              </div>

              <div>
                <Label>Descrição</Label>
                <Input className="mt-1" placeholder="Ex: Adiantamento, empréstimo..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" className="mt-1 font-mono" placeholder="0,00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>

              <div>
                <Label>Observação</Label>
                <Textarea
                  className="mt-1 resize-none"
                  rows={3}
                  placeholder="Informações adicionais sobre este lançamento..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-border bg-background shrink-0 max-w-none">
            <Button variant="outline" className="flex-1 max-w-xs" onClick={() => { setShowForm(false); setEmployeeSearch(''); }}>Cancelar</Button>
            <Button className="flex-1 max-w-xs" onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar Lançamento'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}