import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Lock, Unlock, Search, Eye, Printer, Copy, Loader2, UserCheck, FileArchive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';
import PayrollEntryForm from '@/components/payroll/PayrollEntryForm';
import EscritorioPayrollForm from '@/components/payroll/EscritorioPayrollForm';
import MeiPayrollForm from '@/components/payroll/MeiPayrollForm';
import ProLaboreForm from '@/components/payroll/ProLaboreForm';
import PDFReceiptDialog from '@/components/reports/PDFReceiptDialog';
import BulkPDFDialog from '@/components/payroll/BulkPDFDialog';
import ConfirmDialog from '@/components/payroll/ConfirmDialog';
import { toast } from 'sonner';

export default function Payroll() {
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [jobRoles, setJobRoles] = useState([]);
  const [entries, setEntries] = useState([]);
  const [monthCloses, setMonthCloses] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const current = new Date().toISOString().slice(0, 7);
    return current >= '2026-04' ? current : '2026-04';
  });
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedWorkplace, setSelectedWorkplace] = useState('all');
  const [selectedJobRole, setSelectedJobRole] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [printReceipt, setPrintReceipt] = useState(null); // { employee, entry, company }
  const [cloning, setCloning] = useState(false);
  const [confirmClose, setConfirmClose] = useState(null); // { type: 'month'|'entry', companyId?, entry? }
  const [confirmReopen, setConfirmReopen] = useState(null); // { type: 'month'|'entry', companyId?, entry? }
  const [bulkPDF, setBulkPDF] = useState(null); // { company, employees }

  const load = async () => {
    const [e, c, w, jr, p, m] = await Promise.all([
      base44.entities.Employee.list(),
      base44.entities.Company.list(),
      base44.entities.Workplace.list(),
      base44.entities.JobRole.list(),
      base44.entities.PayrollEntry.filter({ reference_month: selectedMonth }),
      base44.entities.MonthClose.filter({ reference_month: selectedMonth }),
    ]);
    // Regra de exibição na folha:
    // - Ativo (is_active !== false): sempre aparece
    // - Demitido com termination_date: aparece no mês da demissão e nos anteriores; some do mês seguinte em diante
    // - Demitido sem termination_date, mas com is_active=false: não aparece
    // Nota: usa termination_date independentemente de is_active, para cobrir casos onde
    // o campo is_active pode ainda não ter sido setado mas a data de demissão já existe.
    setEmployees(e.filter(x => {
      if (x.termination_date) {
        // Tem data de demissão: aparece somente até o mês da demissão (inclusive)
        const termMonth = x.termination_date.slice(0, 7);
        return termMonth >= selectedMonth;
      }
      // Sem data de demissão: só aparece se estiver ativo
      return x.is_active !== false;
    }));
    setCompanies(c.filter(x => x.is_active !== false));
    setWorkplaces(w);
    setJobRoles(jr);
    setEntries(p);
    setMonthCloses(m);
  };

  useEffect(() => { load(); }, [selectedMonth]);

  const isMonthClosed = (companyId) => {
    const mc = monthCloses.find(m => m.company_id === companyId);
    return mc?.status === 'closed';
  };

  const getEntry = (empId) => entries.find(e => e.employee_id === empId && e.reference_month === selectedMonth);

  const filteredEmployees = employees.filter(emp => {
    const matchCompany = selectedCompany === 'all' || emp.company_id === selectedCompany;
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase());
    const matchWorkplace = selectedWorkplace === 'all' || (emp.workplace_list ?? []).map(String).includes(selectedWorkplace);
    const matchJobRole = selectedJobRole === 'all' || String(emp.job_role_tangerino_id) === selectedJobRole;
    if (selectedStatus !== 'all') {
      const entry = getEntry(emp.id);
      const empJobRole = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
      if (!empJobRole?.payroll_type) {
        if (selectedStatus !== 'pending') return false;
      } else if (selectedStatus === 'closed' && entry?.status !== 'closed') return false;
      else if (selectedStatus === 'launched' && (!entry || entry.status === 'closed')) return false;
      else if (selectedStatus === 'pending' && entry) return false;
    }
    return matchCompany && matchSearch && matchWorkplace && matchJobRole;
  });
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

  const handleCloseEmployeeEntry = async (entry) => {
    await base44.entities.PayrollEntry.update(entry.id, { status: 'closed' });
    load();
    toast.success('Folha do colaborador fechada!');
  };

  const handleReopenEmployeeEntry = async (entry) => {
    await base44.entities.PayrollEntry.update(entry.id, { status: 'open' });
    load();
    toast.success('Folha do colaborador reaberta!');
  };

  const handleReopenMonth = async (companyId) => {
    const existing = monthCloses.find(m => m.company_id === companyId);
    if (existing) {
      await base44.entities.MonthClose.update(existing.id, { status: 'open', reopened_at: new Date().toISOString() });
      load();
      toast.success('Mês reaberto!');
    }
  };

  // Lista de meses: do mês atual até abril/2026 (inclusive), sem ir antes disso
  const FIRST_MONTH = '2026-04';
  const months = [];
  {
    const now = new Date();
    let y = now.getFullYear();
    let mo = now.getMonth() + 1; // 1-based
    while (true) {
      const m = `${y}-${String(mo).padStart(2, '0')}`;
      months.push(m);
      if (m === FIRST_MONTH) break;
      mo--;
      if (mo === 0) { mo = 12; y--; }
      if (`${y}-${String(mo).padStart(2, '0')}` < FIRST_MONTH) break;
    }
  }

  const companiesInView = selectedCompany === 'all' ? companies : companies.filter(c => c.id === selectedCompany);

  const handleCloneFromPrevious = async () => {
    setCloning(true);
    try {
      const res = await base44.functions.invoke('clonePayrollFromPreviousMonth', { target_month: selectedMonth });
      const data = res.data;
      if (data.cloned === 0 && data.skipped === 0) {
        toast.info(data.message || 'Nenhum lançamento encontrado no mês anterior.');
      } else {
        toast.success(data.message || `${data.cloned} lançamentos clonados!`);
        load();
      }
    } catch (err) {
      toast.error('Erro ao clonar: ' + err.message);
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Folha de Pagamento</h1>
          <p className="text-muted-foreground text-sm mt-1">Lançamentos mensais</p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleCloneFromPrevious}
          disabled={cloning}
        >
          {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
          Clonar do Mês Anterior
        </Button>
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
        <Select value={selectedWorkplace} onValueChange={setSelectedWorkplace}>
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
        <Select value={selectedJobRole} onValueChange={setSelectedJobRole}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Cargo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Cargos</SelectItem>
            {jobRoles.filter(jr => jr.tangerino_id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(jr => (
              <SelectItem key={jr.id} value={String(jr.tangerino_id)}>{jr.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="launched">Lançado</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="closed">Fechado</SelectItem>
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
        const totalNet = companyEntries.reduce((s, e) => s + (e.first_period_net || 0) + (e.second_period_net || 0), 0);

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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Total: <strong className="text-foreground">{formatCurrency(totalNet)}</strong></span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50"
                    title="Gerar PDF em lote para todos os colaboradores desta empresa"
                    onClick={() => setBulkPDF({ company, employees: companyEmps })}
                  >
                    <FileArchive className="w-3.5 h-3.5" /> PDF em Lote
                  </Button>
                  {closed ? (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirmReopen({ type: 'month', companyId: company.id, companyName: company.name })}>
                      <Unlock className="w-3.5 h-3.5" /> Reabrir Mês
                    </Button>
                  ) : (
                    <Button variant="default" size="sm" className="gap-1.5" onClick={() => setConfirmClose({ type: 'month', companyId: company.id, companyName: company.name })}>
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
                      <th className="text-left p-3 font-medium text-muted-foreground">Cargo</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Salário Base</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Bruto</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Descontos</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Líquido</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right p-3 pr-6 font-medium text-muted-foreground">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...companyEmps].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(emp => {
                      const entry = getEntry(emp.id);
                      const totalDiscounts = entry ? ((entry.inss || 0) + (entry.irrf || 0) + (entry.pj_retention || 0) + (entry.first_period_discount || 0) + (entry.second_period_discount || 0)) : 0;
                      const liquidoTotal = entry ? ((entry.first_period_net || 0) + (entry.second_period_net || 0)) : null;
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
                          <td className="p-3 text-sm text-muted-foreground">
                            {jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id))?.name || '—'}
                          </td>
                          <td className="p-3 text-right font-mono">{entry ? formatCurrency(entry.base_salary) : '—'}</td>
                          <td className="p-3 text-right font-mono">{entry ? formatCurrency(entry.gross_total) : '—'}</td>
                          <td className="p-3 text-right font-mono text-destructive">{entry ? formatCurrency(totalDiscounts) : '—'}</td>
                          <td className="p-3 text-right font-mono font-semibold text-primary">{liquidoTotal !== null ? formatCurrency(liquidoTotal) : '—'}</td>
                          <td className="p-3 text-center">
                            {(() => {
                              const empJobRole = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
                              if (!empJobRole?.payroll_type) {
                                return <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-300 bg-yellow-50">Sem modelo</Badge>;
                              }
                              if (entry?.status === 'closed') return <Badge variant="destructive" className="text-xs gap-1"><Lock className="w-2.5 h-2.5" />Fechado</Badge>;
                              return <Badge variant={entry ? 'default' : 'outline'} className="text-xs">{entry ? 'Lançado' : 'Pendente'}</Badge>;
                            })()}
                          </td>
                          <td className="p-3 pr-6 text-right">
                            <div className="flex gap-1.5 justify-end">
                             {entry && (
                               <>
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   title="Visualizar"
                                   onClick={() => { setEditingEmployee(emp); setEditingEntry(entry); setViewOnly(true); setShowForm(true); }}
                                 >
                                   <Eye className="w-3.5 h-3.5" />
                                 </Button>
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   title="Imprimir Recibo"
                                   onClick={() => {
                                    const jr = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
                                    setPrintReceipt({ employee: emp, entry, company: companies.find(c => c.id === emp.company_id), payrollType: jr?.payroll_type, jobRoleName: jr?.name });
                                  }}
                                 >
                                   <Printer className="w-3.5 h-3.5" />
                                 </Button>
                                 {entry.status === 'closed' ? (
                                   <Button
                                     variant="ghost"
                                     size="sm"
                                     title="Reabrir folha deste colaborador"
                                     onClick={() => setConfirmReopen({ type: 'entry', entry, empName: emp.name })}
                                   >
                                     <Unlock className="w-3.5 h-3.5" />
                                   </Button>
                                 ) : (
                                   <Button
                                     variant="ghost"
                                     size="sm"
                                     title="Fechar folha deste colaborador"
                                     onClick={() => setConfirmClose({ type: 'entry', entry, empName: emp.name })}
                                   >
                                     <UserCheck className="w-3.5 h-3.5" />
                                   </Button>
                                 )}
                               </>
                             )}
                             {(() => {
                               const empJobRole = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
                               const hasPayrollType = !!empJobRole?.payroll_type;
                               return (
                                 <Button
                                   variant="outline"
                                   size="sm"
                                   disabled={closed || !hasPayrollType || entry?.status === 'closed'}
                                   title={!hasPayrollType ? 'Configure o modelo de folha do cargo antes de lançar.' : entry?.status === 'closed' ? 'Folha fechada. Reabra para editar.' : undefined}
                                   onClick={() => {
                                     setEditingEmployee(emp);
                                     // Pré-preenche salário base do cargo SOMENTE se não há lançamento ainda
                                     // (se já existe entry com base_salary > 0, não sobrepõe)
                                     const jobRoleForEmp = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
                                     const prefilled = (!entry && jobRoleForEmp?.base_salary > 0)
                                       ? { base_salary: jobRoleForEmp.base_salary, clt_moto_base_salary: jobRoleForEmp.base_salary }
                                       : null;
                                     setEditingEntry(entry || prefilled);
                                     setViewOnly(false);
                                     setShowForm(true);
                                   }}
                                 >
                                   {entry ? 'Editar' : 'Lançar'}
                                 </Button>
                               );
                             })()}
                            </div>
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

      <ConfirmDialog
        open={!!confirmClose}
        onOpenChange={(v) => !v && setConfirmClose(null)}
        title={confirmClose?.type === 'month' ? 'Fechar mês?' : 'Fechar folha?'}
        description={
          confirmClose?.type === 'month'
            ? `Deseja fechar o mês de ${getMonthName(selectedMonth)} para ${confirmClose?.companyName}? Após fechar, não será possível editar as folhas de pagamento.`
            : `Deseja fechar a folha de ${confirmClose?.empName}? Após fechar, não será possível editar as informações.`
        }
        confirmLabel="Fechar"
        confirmVariant="destructive"
        onConfirm={() => {
          if (confirmClose?.type === 'month') handleCloseMonth(confirmClose.companyId);
          else handleCloseEmployeeEntry(confirmClose.entry);
        }}
      />

      <ConfirmDialog
        open={!!confirmReopen}
        onOpenChange={(v) => !v && setConfirmReopen(null)}
        title={confirmReopen?.type === 'month' ? 'Reabrir mês?' : 'Reabrir folha?'}
        description={
          confirmReopen?.type === 'month'
            ? `Deseja reabrir o mês de ${getMonthName(selectedMonth)} para ${confirmReopen?.companyName}?`
            : `Deseja reabrir a folha de ${confirmReopen?.empName}?`
        }
        confirmLabel="Reabrir"
        onConfirm={() => {
          if (confirmReopen?.type === 'month') handleReopenMonth(confirmReopen.companyId);
          else handleReopenEmployeeEntry(confirmReopen.entry);
        }}
      />

      {bulkPDF && (
        <BulkPDFDialog
          company={bulkPDF.company}
          employees={bulkPDF.employees}
          entries={entries}
          jobRoles={jobRoles}
          referenceMonth={selectedMonth}
          onClose={() => setBulkPDF(null)}
        />
      )}

      {printReceipt && (
        <PDFReceiptDialog
          employee={printReceipt.employee}
          entry={printReceipt.entry}
          company={printReceipt.company}
          referenceMonth={selectedMonth}
          receiptType="holerite"
          payrollType={printReceipt.payrollType}
          jobRoleName={printReceipt.jobRoleName}
          onClose={() => setPrintReceipt(null)}
        />
      )}

      {showForm && editingEmployee && (() => {
        const empJobRole = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(editingEmployee.job_role_tangerino_id)) || null;
        const pt = empJobRole?.payroll_type;
        const FormComponent = pt === 'ESCRITORIO' ? EscritorioPayrollForm : pt === 'MOTOCICLISTA_MEI' ? MeiPayrollForm : pt === 'SOCIO' ? ProLaboreForm : PayrollEntryForm;
        return (
          <FormComponent
            key={`${editingEmployee.id}-${editingEntry?.id ?? 'new'}`}
            employee={editingEmployee}
            entry={editingEntry}
            referenceMonth={selectedMonth}
            readOnly={viewOnly || editingEntry?.status === 'closed' || isMonthClosed(editingEmployee?.company_id)}
            onSave={handleSaveEntry}
            onClose={() => { setShowForm(false); setEditingEntry(null); setEditingEmployee(null); setViewOnly(false); }}
            jobRole={empJobRole}
          />
        );
      })()}
    </div>
  );
}