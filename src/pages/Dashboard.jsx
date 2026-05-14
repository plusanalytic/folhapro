import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';
import { Building2, Users, Banknote, TrendingUp, ChevronRight, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList
} from 'recharts';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const FIRST_MONTH = '2026-04';

function buildMonthList() {
  const months = [];
  const now = new Date();
  let y = now.getFullYear();
  let mo = now.getMonth() + 1;
  while (true) {
    const m = `${y}-${String(mo).padStart(2, '0')}`;
    months.push(m);
    if (m === FIRST_MONTH) break;
    mo--;
    if (mo === 0) { mo = 12; y--; }
    if (`${y}-${String(mo).padStart(2, '0')}` < FIRST_MONTH) break;
  }
  return months;
}

export default function Dashboard() {
  const [companies, setCompanies] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [jobRoles, setJobRoles] = useState([]);
  const [allEntries, setAllEntries] = useState([]);

  // Filters
  const [filterMonths, setFilterMonths] = useState(() => {
    const cur = new Date().toISOString().slice(0, 7);
    return [cur >= FIRST_MONTH ? cur : FIRST_MONTH];
  });
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterJobRole, setFilterJobRole] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterPayrollType, setFilterPayrollType] = useState('all');

  // For backwards compat: single month used in chart contexts
  const filterMonth = filterMonths[0] || FIRST_MONTH;

  const months = useMemo(buildMonthList, []);

  useEffect(() => {
    Promise.all([
      base44.entities.Company.list(),
      base44.entities.Employee.list(),
      base44.entities.JobRole.list(),
      base44.entities.PayrollEntry.list(),
    ]).then(([c, e, jr, p]) => {
      setCompanies(c.filter(x => x.is_active !== false));
      setEmployees(e.filter(x => x.is_active !== false));
      setJobRoles(jr);
      setAllEntries(p);
    });
  }, []);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return allEntries.filter(entry => {
      if (filterMonths.length > 0 && !filterMonths.includes(entry.reference_month)) return false;

      const emp = employees.find(e => e.id === entry.employee_id);
      if (!emp) return false;

      if (filterCompany !== 'all' && emp.company_id !== filterCompany) return false;
      if (filterEmployee !== 'all' && entry.employee_id !== filterEmployee) return false;

      if (filterJobRole !== 'all') {
        if (String(emp.job_role_tangerino_id) !== filterJobRole) return false;
      }

      if (filterPayrollType !== 'all') {
        const jr = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
        if (jr?.payroll_type !== filterPayrollType) return false;
      }

      return true;
    });
  }, [allEntries, filterMonths, filterCompany, filterEmployee, filterJobRole, filterPayrollType, employees, jobRoles]);

  // KPIs filtered
  const totalBruto = filteredEntries.reduce((s, e) => s + (e.gross_total || 0), 0);
  const total1Q = filteredEntries.reduce((s, e) => s + (e.first_period_net || 0), 0);
  const total2Q = filteredEntries.reduce((s, e) => s + (e.second_period_net || 0), 0);
  const totalLiquido = total1Q + total2Q;

  // KPI: empresas e colaboradores filtrados
  const filteredCompanyIds = useMemo(() => {
    if (filterCompany !== 'all') return new Set([filterCompany]);
    const ids = new Set();
    filteredEntries.forEach(e => {
      const emp = employees.find(em => em.id === e.employee_id);
      if (emp?.company_id) ids.add(emp.company_id);
    });
    return ids;
  }, [filteredEntries, filterCompany, employees]);

  const filteredEmployeeIds = useMemo(() => {
    const ids = new Set();
    filteredEntries.forEach(e => { if (e.employee_id) ids.add(e.employee_id); });
    return ids;
  }, [filteredEntries]);

  // Chart: Valor por quinzena (últimos meses)
  const chartByPeriod = useMemo(() => {
    const result = [];
    months.slice(0, 6).reverse().forEach(month => {
      const monthEntries = allEntries.filter(entry => {
        if (entry.reference_month !== month) return false;
        const emp = employees.find(e => e.id === entry.employee_id);
        if (!emp) return false;
        if (filterCompany !== 'all' && emp.company_id !== filterCompany) return false;
        if (filterJobRole !== 'all' && String(emp.job_role_tangerino_id) !== filterJobRole) return false;
        if (filterEmployee !== 'all' && entry.employee_id !== filterEmployee) return false;
        if (filterPayrollType !== 'all') {
          const jr = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
          if (jr?.payroll_type !== filterPayrollType) return false;
        }
        return true;
      });
      const label = getMonthName(month);
      const q1 = monthEntries.reduce((s, e) => s + (e.first_period_net || 0), 0);
      const q2 = monthEntries.reduce((s, e) => s + (e.second_period_net || 0), 0);
      if (q1 > 0 || q2 > 0) {
        result.push({ name: label, '1ª Quinzena': q1, '2ª Quinzena': q2 });
      }
    });
    return result;
  }, [allEntries, months, filterCompany, filterJobRole, filterEmployee, filterPayrollType, employees, jobRoles]);

  // Employees for filter (based on company filter)
  const employeesForFilter = useMemo(() => {
    return employees.filter(e => filterCompany === 'all' || e.company_id === filterCompany);
  }, [employees, filterCompany]);

  const payrollTypes = [
    { value: 'MOTOCICLISTA_CLT', label: 'Motociclista CLT' },
    { value: 'MOTOCICLISTA_MEI', label: 'Motociclista MEI' },
    { value: 'ESCRITORIO', label: 'Escritório' },
    { value: 'SOCIO', label: 'Sócio' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral da folha de pagamento</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Multi-select Mês */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-52 justify-between font-normal">
              <span className="truncate">
                {filterMonths.length === 0 ? 'Selecionar Meses' :
                  filterMonths.length === 1 ? getMonthName(filterMonths[0]) :
                  `${filterMonths.length} meses`}
              </span>
              <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0">
            <div className="max-h-64 overflow-auto">
              {months.map(m => (
                <div
                  key={m}
                  className={cn('flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent', filterMonths.includes(m) && 'bg-accent/50')}
                  onClick={() => setFilterMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                >
                  <Check className={cn('w-4 h-4', filterMonths.includes(m) ? 'opacity-100 text-primary' : 'opacity-0')} />
                  {getMonthName(m)}
                </div>
              ))}
            </div>
            {filterMonths.length > 0 && (
              <div className="border-t p-2">
                <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => setFilterMonths([])}>Limpar seleção</Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Empresa com busca */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-48 justify-between font-normal">
              <span className="truncate">{filterCompany === 'all' ? 'Todas as Empresas' : companies.find(c => c.id === filterCompany)?.name || 'Empresa'}</span>
              <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0">
            <Command>
              <CommandInput placeholder="Buscar empresa..." />
              <CommandEmpty>Nenhuma encontrada</CommandEmpty>
              <CommandGroup className="max-h-52 overflow-auto">
                <CommandItem value="all" onSelect={() => { setFilterCompany('all'); setFilterEmployee('all'); }}>
                  <Check className={cn('mr-2 w-4 h-4', filterCompany === 'all' ? 'opacity-100' : 'opacity-0')} />
                  Todas as Empresas
                </CommandItem>
                {[...companies].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(c => (
                  <CommandItem key={c.id} value={c.name} onSelect={() => { setFilterCompany(c.id); setFilterEmployee('all'); }}>
                    <Check className={cn('mr-2 w-4 h-4', filterCompany === c.id ? 'opacity-100' : 'opacity-0')} />
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Cargo com busca */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-48 justify-between font-normal">
              <span className="truncate">{filterJobRole === 'all' ? 'Todos os Cargos' : jobRoles.find(jr => String(jr.tangerino_id) === filterJobRole)?.name || 'Cargo'}</span>
              <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0">
            <Command>
              <CommandInput placeholder="Buscar cargo..." />
              <CommandEmpty>Nenhum encontrado</CommandEmpty>
              <CommandGroup className="max-h-52 overflow-auto">
                <CommandItem value="all" onSelect={() => setFilterJobRole('all')}>
                  <Check className={cn('mr-2 w-4 h-4', filterJobRole === 'all' ? 'opacity-100' : 'opacity-0')} />
                  Todos os Cargos
                </CommandItem>
                {jobRoles.filter(jr => jr.tangerino_id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(jr => (
                  <CommandItem key={jr.id} value={jr.name} onSelect={() => setFilterJobRole(String(jr.tangerino_id))}>
                    <Check className={cn('mr-2 w-4 h-4', filterJobRole === String(jr.tangerino_id) ? 'opacity-100' : 'opacity-0')} />
                    {jr.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Colaborador com busca */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-48 justify-between font-normal">
              <span className="truncate">{filterEmployee === 'all' ? 'Todos os Colaboradores' : employeesForFilter.find(e => e.id === filterEmployee)?.name || 'Colaborador'}</span>
              <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0">
            <Command>
              <CommandInput placeholder="Buscar colaborador..." />
              <CommandEmpty>Nenhum encontrado</CommandEmpty>
              <CommandGroup className="max-h-52 overflow-auto">
                <CommandItem value="all" onSelect={() => setFilterEmployee('all')}>
                  <Check className={cn('mr-2 w-4 h-4', filterEmployee === 'all' ? 'opacity-100' : 'opacity-0')} />
                  Todos os Colaboradores
                </CommandItem>
                {[...employeesForFilter].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(e => (
                  <CommandItem key={e.id} value={e.name} onSelect={() => setFilterEmployee(e.id)}>
                    <Check className={cn('mr-2 w-4 h-4', filterEmployee === e.id ? 'opacity-100' : 'opacity-0')} />
                    {e.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Tipo com busca */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-48 justify-between font-normal">
              <span className="truncate">{filterPayrollType === 'all' ? 'Todos os Tipos' : payrollTypes.find(pt => pt.value === filterPayrollType)?.label || 'Tipo'}</span>
              <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0">
            <Command>
              <CommandInput placeholder="Buscar tipo..." />
              <CommandEmpty>Nenhum encontrado</CommandEmpty>
              <CommandGroup>
                <CommandItem value="all" onSelect={() => setFilterPayrollType('all')}>
                  <Check className={cn('mr-2 w-4 h-4', filterPayrollType === 'all' ? 'opacity-100' : 'opacity-0')} />
                  Todos os Tipos
                </CommandItem>
                {payrollTypes.map(pt => (
                  <CommandItem key={pt.value} value={pt.label} onSelect={() => setFilterPayrollType(pt.value)}>
                    <Check className={cn('mr-2 w-4 h-4', filterPayrollType === pt.value ? 'opacity-100' : 'opacity-0')} />
                    {pt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Empresas Ativas</p>
                <p className="text-2xl font-bold text-foreground mt-1">{filteredCompanyIds.size || companies.length}</p>
                {filterCompany !== 'all' && <p className="text-xs text-muted-foreground mt-1">filtrado</p>}
              </div>
              <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Colaboradores</p>
                <p className="text-2xl font-bold text-foreground mt-1">{filteredEmployeeIds.size || employees.length}</p>
                {(filterCompany !== 'all' || filterEmployee !== 'all' || filterJobRole !== 'all' || filterPayrollType !== 'all' || filterMonths.length > 0) && <p className="text-xs text-muted-foreground mt-1">filtrado</p>}
              </div>
              <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Valor Bruto Folha</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalBruto)}</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Valor Líquido Folha</p>
                <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(totalLiquido)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  1ª Q: {formatCurrency(total1Q)} · 2ª Q: {formatCurrency(total2Q)}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center">
                <Banknote className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">Valor Líquido por Quinzena</CardTitle>
        </CardHeader>
        <CardContent>
          {chartByPeriod.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartByPeriod} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="1ª Quinzena" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="1ª Quinzena" position="top" formatter={v => `R$${(v/1000).toFixed(1)}k`} style={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} />
                </Bar>
                <Bar dataKey="2ª Quinzena" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="2ª Quinzena" position="top" formatter={v => `R$${(v/1000).toFixed(1)}k`} style={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">Nenhum lançamento encontrado</div>
          )}
        </CardContent>
      </Card>

      {/* Quick Access */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Acesso Rápido</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { to: '/companies', label: 'Cadastrar Empresa', icon: Building2 },
              { to: '/employees', label: 'Novo Colaborador', icon: Users },
              { to: '/payroll', label: 'Lançar Folha', icon: Banknote },
              { to: '/reports', label: 'Ver Relatórios', icon: TrendingUp },
            ].map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent hover:border-primary/30 transition-all group">
                <Icon className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{label}</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground ml-auto group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}