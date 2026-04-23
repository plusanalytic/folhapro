import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Pencil, Users, Search, RefreshCw, UserCheck, UserX, Briefcase, Building2, ChevronLeft, ChevronRight, MapPin, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/payrollCalculations';
import EmployeeForm from '@/components/employees/EmployeeForm';
import SyncProgressDialog from '@/components/employees/SyncProgressDialog';

const PAGE_SIZE = 20;

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [jobRoles, setJobRoles] = useState([]);
  const [search, _setSearch] = useState('');
  const [filterCompany, _setFilterCompany] = useState('all');
  const [filterContract, _setFilterContract] = useState('all');
  const [filterWorkplace, _setFilterWorkplace] = useState('all');

  const setSearch = (v) => { _setSearch(v); setCurrentPage(1); };
  const setFilterCompany = (v) => { _setFilterCompany(v); setCurrentPage(1); };
  const setFilterContract = (v) => { _setFilterContract(v); setCurrentPage(1); };
  const setFilterWorkplace = (v) => { _setFilterWorkplace(v); setCurrentPage(1); };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const load = async () => {
    const [e, c, w, jr] = await Promise.all([
      base44.entities.Employee.list(),
      base44.entities.Company.list(),
      base44.entities.Workplace.list(),
      base44.entities.JobRole.list(),
    ]);
    setEmployees(e);
    setCompanies(c);
    setWorkplaces(w);
    setJobRoles(jr);
  };
  useEffect(() => { load(); }, []);

  const filtered = employees
    .filter(emp => {
      const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase()) || (emp.cpf_cnpj || '').includes(search);
      const matchCompany = filterCompany === 'all' || emp.company_id === filterCompany;
      const matchContract = filterContract === 'all' || emp.contract_type === filterContract;
      const matchWorkplace = filterWorkplace === 'all' || (emp.workplace_list ?? []).map(String).includes(filterWorkplace);
      return matchSearch && matchCompany && matchContract && matchWorkplace;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const getCompanyName = (id) => companies.find(c => c.id === id)?.name || '—';

  // Mapa: tangerino_id -> nome do cargo
  const jobRoleByTangerinoId = {};
  for (const jr of jobRoles) {
    if (jr.tangerino_id) jobRoleByTangerinoId[String(jr.tangerino_id)] = jr.name;
  }
  const getJobRoleName = (emp) => {
    if (emp.job_role_tangerino_id) return jobRoleByTangerinoId[String(emp.job_role_tangerino_id)] || emp.position || '—';
    return emp.position || '—';
  };

  // De-para: ID Tangerino -> nome do Workplace local
  const workplaceById = {};
  for (const w of workplaces) {
    if (w.tangerino_id) workplaceById[String(w.tangerino_id)] = w.name;
  }
  const getWorkplaceNames = (list) => (list ?? []).map(id => workplaceById[String(id)]).filter(Boolean);

  // Stats
  const totalActive = employees.filter(e => e.is_active !== false).length;
  const totalInactive = employees.filter(e => e.is_active === false).length;
  const totalCLT = employees.filter(e => e.contract_type === 'CLT' && e.is_active !== false).length;
  const totalPJ = employees.filter(e => e.contract_type === 'PJ' && e.is_active !== false).length;
  const companiesWithEmployees = new Set(employees.filter(e => e.is_active !== false).map(e => e.company_id)).size;

  const handleSave = async (data) => {
    if (editing) await base44.entities.Employee.update(editing.id, data);
    setShowForm(false);
    setEditing(null);
    load();
  };



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Colaboradores</h1>
          <p className="text-muted-foreground text-sm mt-1">{employees.length} registros importados</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setShowSyncDialog(true)}>
          <RefreshCw className="w-4 h-4" />
          Sincronizar Solides
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold text-foreground">{employees.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ativos</p>
              <p className="text-xl font-bold text-green-600">{totalActive}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
              <UserX className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inativos</p>
              <p className="text-xl font-bold text-red-600">{totalInactive}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CLT / PJ</p>
              <p className="text-xl font-bold text-foreground">{totalCLT} <span className="text-sm font-normal text-muted-foreground">/ {totalPJ}</span></p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Empresas</p>
              <p className="text-xl font-bold text-foreground">{companiesWithEmployees}</p>
            </div>
          </CardContent>
        </Card>
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
        <Select value={filterWorkplace} onValueChange={setFilterWorkplace}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Local de Trabalho" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Locais</SelectItem>
            {workplaces.filter(w => w.tangerino_id).map(w => (
              <SelectItem key={w.id} value={String(w.tangerino_id)}>{w.name}</SelectItem>
            ))}
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
              <th className="text-left p-4 font-medium text-muted-foreground">Locais</th>
              <th className="text-right p-4 font-medium text-muted-foreground">Salário Base</th>
              <th className="text-center p-4 font-medium text-muted-foreground">Status</th>
              <th className="text-right p-4 font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(emp => (
              <tr key={emp.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-primary">
                      {emp.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{emp.name}</p>
                      {getJobRoleName(emp) !== '—' && (
                        <p className="text-xs text-muted-foreground">{getJobRoleName(emp)}</p>
                      )}
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
                <td className="p-4">
                  <div className="flex flex-wrap gap-1 max-w-xs">
                    {(() => {
                      const names = getWorkplaceNames(emp.workplace_list);
                      if (names.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
                      return <>
                        {names.slice(0, 2).map((name, i) => (
                          <Badge key={i} variant="outline" className="text-xs gap-1 text-blue-700 border-blue-200 bg-blue-50">
                            <MapPin className="w-2.5 h-2.5" />{name}
                          </Badge>
                        ))}
                        {names.length > 2 && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">+{names.length - 2}</Badge>
                        )}
                      </>;
                    })()}
                  </div>
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
              <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Nenhum colaborador encontrado</p>
                {!search && <p className="text-sm mt-1">Use "Sincronizar Solides" para importar colaboradores.</p>}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{filtered.length} colaboradores • página {currentPage} de {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <EmployeeForm
          employee={editing}
          companies={companies}
          workplaces={workplaces}
          jobRoles={jobRoles}
          onSave={handleSave}
          onReload={load}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <SyncProgressDialog
        open={showSyncDialog}
        onClose={() => setShowSyncDialog(false)}
        onFinished={load}
      />
    </div>
  );
}