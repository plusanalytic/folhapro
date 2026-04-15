import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/payrollCalculations';
import { Building2, Users, Banknote, TrendingUp, Calendar, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const [companies, setCompanies] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const currentMonth = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    Promise.all([
      base44.entities.Company.list(),
      base44.entities.Employee.list(),
      base44.entities.PayrollEntry.filter({ reference_month: currentMonth }),
    ]).then(([c, e, p]) => {
      setCompanies(c);
      setEmployees(e.filter(x => x.is_active !== false));
      setEntries(p);
    });
  }, []);

  const totalPayroll = entries.reduce((s, e) => s + (e.net_total || 0), 0);
  const totalGross = entries.reduce((s, e) => s + (e.gross_total || 0), 0);
  const cltCount = employees.filter(e => e.contract_type === 'CLT').length;
  const pjCount = employees.filter(e => e.contract_type === 'PJ').length;

  // Chart data by company
  const chartData = companies.map(c => {
    const companyEntries = entries.filter(e => e.company_id === c.id);
    return {
      name: c.name.length > 12 ? c.name.slice(0, 12) + '…' : c.name,
      bruto: companyEntries.reduce((s, e) => s + (e.gross_total || 0), 0),
      liquido: companyEntries.reduce((s, e) => s + (e.net_total || 0), 0),
    };
  }).filter(d => d.bruto > 0);

  const stats = [
    { label: 'Empresas Ativas', value: companies.filter(c => c.is_active !== false).length, icon: Building2, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Colaboradores', value: employees.length, icon: Users, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { label: 'Folha do Mês', value: formatCurrency(totalPayroll), icon: Banknote, color: 'text-primary', bg: 'bg-accent' },
    { label: 'Lançamentos', value: entries.length, icon: TrendingUp, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral da folha de pagamento</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Folha por Empresa — {currentMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="bruto" name="Bruto" fill="hsl(var(--chart-2))" radius={[4,4,0,0]} />
                  <Bar dataKey="liquido" name="Líquido" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhum lançamento este mês
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Distribuição de Contratos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">CLT</span>
                <span className="font-semibold text-foreground">{cltCount}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: employees.length ? `${(cltCount/employees.length)*100}%` : '0%' }} />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">PJ</span>
                <span className="font-semibold text-foreground">{pjCount}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-chart-2 h-2 rounded-full" style={{ width: employees.length ? `${(pjCount/employees.length)*100}%` : '0%' }} />
              </div>
            </div>
            <div className="pt-4 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Bruto</span>
                <span className="font-medium">{formatCurrency(totalGross)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Líquido</span>
                <span className="font-semibold text-primary">{formatCurrency(totalPayroll)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Acesso Rápido</CardTitle>
          </div>
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