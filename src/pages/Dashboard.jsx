import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';
import { Building2, Users, Banknote, TrendingUp, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList
} from 'recharts';

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
  const [filterMonth, setFilterMonth] = useState(() => {
    const cur = new Date().toISOString().slice(0, 7);
    return cur >= FIRST_MONTH ? cur : FIRST_MONTH;
  });
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterJobRole, setFilterJobRole] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterPayrollType, setFilterPayrollType] = useState('all');

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
      if (entry.reference_month !== filterMonth) return false;

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
  }, [allEntries, filterMonth, filterCompany, filterEmployee, filterJobRole, filterPayrollType, employees, jobRoles]);

  // KPIs
  const totalBruto = filteredEntries.reduce((s, e) => s + (e.gross_total || 0), 0);
  const total1Q = filteredEntries.reduce((s, e) => s + (e.first_period_net || 0), 0);
  const total2Q = filteredEntries.reduce((s, e) => s + (e.second_period_net || 0), 0);
  const totalLiquido = total1Q + total2Q;

  // Chart 1: Líquido por empresa
  const chartByCompany = useMemo(() => {
    return companies.map(c => {
      const compEntries = filteredEntries.filter(e => {
        const emp = employees.find(em => em.id === e.employee_id);
        return emp?.company_id === c.id;
      });
      const liquido = compEntries.reduce((s, e) => s + (e.first_period_net || 0) + (e.second_period_net || 0), 0);
      return {
        name: c.name.length > 14 ? c.name.slice(0, 14) + '…' : c.name,
        liquido,
      };
    }).filter(d => d.liquido > 0);
  }, [filteredEntries, companies, employees]);

  // Chart 2: Valor por quinzena (últimos meses)
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
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => <SelectItem key={m} value={m}>{getMonthName(m)}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterCompany} onValueChange={v => { setFilterCompany(v); setFilterEmployee('all'); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Empresas</SelectItem>
            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterJobRole} onValueChange={setFilterJobRole}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Cargo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Cargos</SelectItem>
            {jobRoles.filter(jr => jr.tangerino_id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(jr => (
              <SelectItem key={jr.id} value={String(jr.tangerino_id)}>{jr.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterEmployee} onValueChange={setFilterEmployee}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Colaborador" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Colaboradores</SelectItem>
            {employeesForFilter.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(e => (
              <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterPayrollType} onValueChange={setFilterPayrollType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo de Folha" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tipos</SelectItem>
            {payrollTypes.map(pt => (
              <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Empresas Ativas</p>
                <p className="text-2xl font-bold text-foreground mt-1">{companies.length}</p>
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
                <p className="text-2xl font-bold text-foreground mt-1">{employees.length}</p>
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Chart 1: Líquido por empresa */}
        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Valor Líquido por Empresa — {getMonthName(filterMonth)}</CardTitle>
          </CardHeader>
          <CardContent>
            {chartByCompany.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartByCompany} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="liquido" name="Líquido" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="liquido" position="top" formatter={v => `R$${(v/1000).toFixed(1)}k`} style={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">Nenhum lançamento neste período</div>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Valor por quinzena */}
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
      </div>

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