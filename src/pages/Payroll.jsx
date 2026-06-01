import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useReadOnly } from '@/lib/AppUserContext';
import { Lock, Unlock, Search, Eye, Printer, Copy, Loader2, UserCheck, FileArchive, AlertTriangle, UserPlus, Trash2, CheckSquare } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';
import { calcBonificacoes, calcPeriodDebits, getAbsenceByPeriod } from '@/lib/entryDisplayUtils';
import MultiSearchableSelect from '@/components/ui/MultiSearchableSelect';
import PayrollEntryForm from '@/components/payroll/PayrollEntryForm';
import EscritorioPayrollForm from '@/components/payroll/EscritorioPayrollForm';
import MeiPayrollForm from '@/components/payroll/MeiPayrollForm';
import ProLaboreForm from '@/components/payroll/ProLaboreForm';
import { printReceiptDirect } from '@/lib/printReceiptDirect';
import BulkPDFDialog from '@/components/payroll/BulkPDFDialog';
import ConfirmDialog from '@/components/payroll/ConfirmDialog';
import EsporadicoPayrollForm from '@/components/payroll/EsporadicoPayrollForm';
import ClonePayrollDialog from '@/components/payroll/ClonePayrollDialog';
import AddEsporadicoDialog from '@/components/payroll/AddEsporadicoDialog';
import { toast } from 'sonner';

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const fmtMonth = (m) => { const [y, mo] = m.split('-'); return `${MONTHS_PT[parseInt(mo)-1]}/${y.slice(2)}`; };

export default function Payroll() {
  const readOnly = useReadOnly();
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [jobRoles, setJobRoles] = useState([]);
  const [entries, setEntries] = useState([]);
  const [monthCloses, setMonthCloses] = useState([]);
  const [paymentStatuses, setPaymentStatuses] = useState([]);
  const [paymentBlockAlert, setPaymentBlockAlert] = useState(null); // { empName }
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = sessionStorage.getItem('filter_month_payroll');
    if (saved && saved >= '2026-04') return saved;
    const current = new Date().toISOString().slice(0, 7);
    return current >= '2026-04' ? current : '2026-04';
  });
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [selectedWorkplace, setSelectedWorkplace] = useState('all');
  const [selectedJobRole, setSelectedJobRole] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [filterEsporadico, setFilterEsporadico] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [viewOnly, setViewOnly] = useState(false);

  const [cloning, setCloning] = useState(false);
  const [cloneDialog, setCloneDialog] = useState(false);
  const [confirmClose, setConfirmClose] = useState(null); // { type: 'month'|'entry', companyId?, entry? }
  const [confirmReopen, setConfirmReopen] = useState(null); // { type: 'month'|'entry', companyId?, entry? }
  const [bulkPDF, setBulkPDF] = useState(null); // { company, employees }
  const [addEsporadico, setAddEsporadico] = useState(null); // { companyId }
  const [confirmDelete, setConfirmDelete] = useState(null); // { entry, empName }
  const [editingEntryCompanyId, setEditingEntryCompanyId] = useState(null);
  const [selectedEntryIds, setSelectedEntryIds] = useState(new Set());
  const [confirmBulk, setConfirmBulk] = useState(null); // { action: 'close'|'reopen', entryList: [] }

  const load = async () => {
    const [e, c, w, jr, p, m, ps] = await Promise.all([
      base44.entities.Employee.list(),
      base44.entities.Company.list(),
      base44.entities.Workplace.list(),
      base44.entities.JobRole.list(),
      base44.entities.PayrollEntry.filter({ reference_month: selectedMonth }),
      base44.entities.MonthClose.filter({ reference_month: selectedMonth }),
      base44.entities.PaymentStatus.filter({ reference_month: selectedMonth }),
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
    setPaymentStatuses(ps);
  };

  useEffect(() => { load(); setSelectedEntryIds(new Set()); }, [selectedMonth]);
  useEffect(() => { sessionStorage.setItem('filter_month_payroll', selectedMonth); }, [selectedMonth]);

  const isMonthClosed = (companyId) => {
    const mc = monthCloses.find(m => m.company_id === companyId);
    return mc?.status === 'closed';
  };

  // Para esporádicos: pode haver múltiplas entries no mesmo mês (empresas diferentes).
  // getEntry retorna a entry do colaborador para a empresa corrente (usada em contexto de empresa).
  const getEntry = (empId, companyId) => {
    if (companyId) {
      // Busca pela empresa atual; se não achar, busca pela employee_id+mês (caso empresa tenha sido trocada)
      const exact = entries.find(e => e.employee_id === empId && e.company_id === companyId && e.reference_month === selectedMonth);
      if (exact) return exact;
      // Fallback: entry do colaborador neste mês (empresa pode ter sido trocada no sistema)
      return entries.find(e => e.employee_id === empId && e.reference_month === selectedMonth && e.company_id !== companyId);
    }
    return entries.find(e => e.employee_id === empId && e.reference_month === selectedMonth);
  };

  const filteredEmployees = employees.filter(emp => {
    const matchCompany = selectedCompanies.length === 0 || selectedCompanies.includes(emp.company_id);
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
    const existing = editingEntry?.id ? entries.find(e => e.id === editingEntry.id) : getEntry(editingEmployee?.id, editingEntryCompanyId || editingEmployee?.company_id);
    if (existing) {
      await base44.entities.PayrollEntry.update(existing.id, data);
    } else {
      await base44.entities.PayrollEntry.create({ ...data, employee_id: editingEmployee?.id, reference_month: selectedMonth });
    }
    setShowForm(false);
    setEditingEntry(null);
    setEditingEmployee(null);
    setEditingEntryCompanyId(null);
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

  const PAYMENT_BLOCKED_STATUSES = ['AGENDADO', 'PAGO', 'RESCISÃO', 'DESLIGADO', 'FÉRIAS', 'AFASTADO', 'SALDO NEGATIVO'];

  // Só bloqueia a reabertura se AMBAS as quinzenas estiverem com status bloqueante.
  // Se apenas uma estiver bloqueada, permite reabrir — o formulário cuidará de bloquear apenas aquela quinzena.
  const hasPaymentBaixa = (entry) => {
    const ps = paymentStatuses.find(p => p.payroll_entry_id === entry.id);
    return PAYMENT_BLOCKED_STATUSES.includes(ps?.status_q1) && PAYMENT_BLOCKED_STATUSES.includes(ps?.status_q2);
  };

  const handleReopenEmployeeEntry = async (entry, empName) => {
    if (hasPaymentBaixa(entry)) {
      setPaymentBlockAlert({ empName });
      return;
    }
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

  const companiesInView = selectedCompanies.length === 0 ? companies : companies.filter(c => selectedCompanies.includes(c.id));

  // Esporádicos: entries de colaboradores ESPORADICO para a empresa+mês.
  // Retorna { emp, entry } para suportar múltiplas entries do mesmo esporádico.
  const esporadicoPairsByCompany = (companyId) => {
    return entries
      .filter(e => e.company_id === companyId && e.reference_month === selectedMonth)
      .map(e => ({ entry: e, emp: employees.find(emp => emp.id === e.employee_id) }))
      .filter(({ emp }) => emp && emp.contract_type === 'ESPORADICO');
  };

  const toggleSelectEntry = (entryId) => {
    setSelectedEntryIds(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId); else next.add(entryId);
      return next;
    });
  };

  const handleBulkAction = async (action, entryList) => {
    for (const entry of entryList) {
      if (action === 'close') {
        await base44.entities.PayrollEntry.update(entry.id, { status: 'closed' });
      } else {
        if (!hasPaymentBaixa(entry)) {
          await base44.entities.PayrollEntry.update(entry.id, { status: 'open' });
        }
      }
    }
    setSelectedEntryIds(new Set());
    load();
    toast.success(action === 'close' ? `${entryList.length} folha(s) fechada(s)!` : `${entryList.length} folha(s) reaberta(s)!`);
  };

  const handleDeleteEntry = async (entry) => {
    await base44.entities.PayrollEntry.delete(entry.id);
    load();
    toast.success('Folha excluída!');
  };

  const handleCloneFromPrevious = async ({ scope, company_id, employee_id }) => {
    setCloning(true);
    try {
      const payload = { target_month: selectedMonth };
      if (scope === 'company' && company_id) payload.company_id = company_id;
      if (scope === 'employee' && employee_id) payload.employee_id = employee_id;
      const res = await base44.functions.invoke('clonePayrollFromPreviousMonth', payload);
      const data = res.data;
      setCloneDialog(false);
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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">Folha de Pagamento</h1>
            <span className="text-sm font-semibold bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">{fmtMonth(selectedMonth)}</span>
          </div>
          <p className="text-muted-foreground text-sm mt-1">Lançamentos mensais</p>
        </div>
        {!readOnly && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setCloneDialog(true)}
            disabled={cloning}
          >
            {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            Clonar do Mês Anterior
          </Button>
        )}
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
        <MultiSearchableSelect
          values={selectedCompanies}
          onValuesChange={setSelectedCompanies}
          placeholder="Empresa"
          className="w-48"
          allLabel="Todas as Empresas"
          options={[...companies].sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).map(c => ({ value: c.id, label: c.name }))}
        />
        <SearchableSelect
          value={selectedWorkplace}
          onValueChange={setSelectedWorkplace}
          placeholder="Local de Trabalho"
          className="w-48"
          allLabel="Todos os Locais"
          options={workplaces.filter(w => w.tangerino_id).sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).map(w => ({ value: String(w.tangerino_id), label: w.name }))}
        />
        <SearchableSelect
          value={selectedJobRole}
          onValueChange={setSelectedJobRole}
          placeholder="Cargo"
          className="w-48"
          allLabel="Todos os Cargos"
          options={jobRoles.filter(jr => jr.tangerino_id).sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).map(jr => ({ value: String(jr.tangerino_id), label: jr.name }))}
        />
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
        <Select value={filterEsporadico} onValueChange={setFilterEsporadico}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Tipos</SelectItem>
            <SelectItem value="ESPORADICO">Prestador Esporádico</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar colaborador..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {companiesInView.map(company => {
        const closed = isMonthClosed(company.id);
        // Esporádicos são sempre exibidos via espPairs (suportam múltiplas entries na mesma empresa)
        const fixedEmps = filterEsporadico === 'ESPORADICO' ? [] : filteredEmployees.filter(e => e.company_id === company.id && e.contract_type !== 'ESPORADICO');
        // Esporádicos: representados como { emp, entry } para suportar múltiplas entries
        const espPairs = esporadicoPairsByCompany(company.id).filter(({ emp, entry }) => {
          if (!emp.name.toLowerCase().includes(search.toLowerCase())) return false;
          if (selectedWorkplace !== 'all' && !(emp.workplace_list ?? []).map(String).includes(selectedWorkplace)) return false;
          if (selectedJobRole !== 'all' && String(emp.job_role_tangerino_id) !== selectedJobRole) return false;
          if (selectedStatus !== 'all') {
            if (selectedStatus === 'closed' && entry?.status !== 'closed') return false;
            if (selectedStatus === 'launched' && (!entry || entry.status === 'closed')) return false;
            if (selectedStatus === 'pending' && entry) return false;
          }
          return true;
        });
        // Remove esporádicos que já estão em fixedEmps (vinculados à empresa)
        const espPairsFiltered = espPairs.filter(({ emp }) => !fixedEmps.some(f => f.id === emp.id));

        if (fixedEmps.length === 0 && espPairsFiltered.length === 0) return null;

        // Para cálculo do total: entries dos fixedEmps + entries dos pares esporádicos
        const fixedEntries = entries.filter(e => fixedEmps.some(emp => emp.id === e.employee_id) && e.company_id === company.id);
        const espEntries = espPairsFiltered.map(p => p.entry);
        const allCompanyEntries = [...fixedEntries, ...espEntries];
        const totalNet = allCompanyEntries.reduce((s, e) => s + (e.first_period_net || 0) + (e.second_period_net || 0), 0);

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
                  {!readOnly && !closed && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-orange-700 border-orange-200 hover:bg-orange-50"
                      title="Adicionar prestador esporádico a esta empresa neste mês"
                      onClick={() => setAddEsporadico({ companyId: company.id })}
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Prestador
                    </Button>
                  )}
                  {(() => {
                    const companyEntryIdSet = new Set(allCompanyEntries.map(e => e.id));
                    const companySelIds = [...selectedEntryIds].filter(id => companyEntryIdSet.has(id));
                    const selCount = companySelIds.length;
                    const overLimit = selCount > 20;
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className={`gap-1.5 ${selCount > 0 && !overLimit ? 'text-violet-700 border-violet-200 hover:bg-violet-50' : 'text-muted-foreground'}`}
                        title={selCount === 0 ? 'Marque colaboradores com ☑ para gerar PDF em lote (máx. 20)' : overLimit ? 'Máximo 20 colaboradores por vez — reduza a seleção' : `Gerar PDF em lote para ${selCount} colaborador(es)`}
                        disabled={selCount === 0 || overLimit}
                        onClick={() => {
                          const allPairs = [
                            ...fixedEmps.map(emp => ({ emp, entry: getEntry(emp.id, company.id) })),
                            ...espPairsFiltered,
                          ].filter(({ entry }) => entry && companySelIds.includes(entry.id));
                          const selItems = allPairs.map(({ emp, entry }) => {
                            const jr = jobRoles.find(r => r.tangerino_id && String(r.tangerino_id) === String(emp.job_role_tangerino_id));
                            const pt = emp.contract_type === 'ESPORADICO' ? (entry.esporadico_payroll_type || 'ESPORADICO') : (jr?.payroll_type || 'CLT');
                            return { emp: { ...emp, position: emp.position || jr?.name }, entry, payrollType: pt };
                          });
                          setBulkPDF({ company, items: selItems });
                        }}
                      >
                        <FileArchive className="w-3.5 h-3.5" />
                        PDF em Lote{selCount > 0 ? ` (${selCount}${overLimit ? ' ⚠' : ''})` : ''}
                      </Button>
                    );
                  })()}
                  {!readOnly && (closed ? (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirmReopen({ type: 'month', companyId: company.id, companyName: company.name })}>
                      <Unlock className="w-3.5 h-3.5" /> Reabrir Mês
                    </Button>
                  ) : (
                    <Button variant="default" size="sm" className="gap-1.5" onClick={() => setConfirmClose({ type: 'month', companyId: company.id, companyName: company.name })}>
                      <Lock className="w-3.5 h-3.5" /> Fechar Mês
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                   <tr className="border-t border-b border-border bg-muted/30">
                    <th className="p-3 pl-4 w-8"></th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Colaborador</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Cargo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Local</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Sal. Efetivo</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Á Receber 1ªQ</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Descontos 1ªQ</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Á Receber 2ªQ</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Descontos 2ªQ</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Bonificações</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Dias Contrato</th>
                    <th className="text-right p-3 pr-6 font-medium text-muted-foreground">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                   {[
                     ...[...fixedEmps].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(emp => ({ emp, entry: getEntry(emp.id, company.id), isEspPair: false })),
                     ...[...espPairsFiltered].sort((a, b) => a.emp.name.localeCompare(b.emp.name, 'pt-BR')).map(({ emp, entry }) => ({ emp, entry, isEspPair: true })),
                   ].map(({ emp, entry, isEspPair }) => {
                     const effectiveSalary = entry ? (entry.clt_moto_effective_salary || entry.base_salary || 0) : null;
                     const absence = entry ? getAbsenceByPeriod(entry) : { first: 0, second: 0 };
                     const disc1 = entry ? calcPeriodDebits(entry.first_discounts, absence.first) : 0;
                     const disc2 = entry ? calcPeriodDebits(entry.second_discounts, absence.second) : 0;
                     const bonificacoes = entry ? calcBonificacoes(entry) : null;
                     const rowKey = isEspPair && entry ? `esp-${entry.id}` : emp.id;
                     const empJR = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
                     const isCLTMotoRow = empJR?.payroll_type === 'MOTOCICLISTA_CLT';
                     // Para CLT Moto: recomputa firstNet dos itens do grid (evita usar valor salvo incorreto)
                     const firstNetDisplay = (() => {
                      if (!entry) return null;
                      if (!isCLTMotoRow) return entry.first_period_net ?? 0;
                      // Quando a 1ª quinzena está travada (já paga), usa o valor salvo que é a verdade do pagamento
                      if (entry.first_period_base_locked && entry.first_period_net != null) return entry.first_period_net;
                      const d1 = (entry.first_discounts || []).filter(r => r.type !== 'credit').reduce((s, r) => s + (r.amount || 0), 0);
                      const c1 = (entry.first_discounts || []).filter(r => r.type === 'credit').reduce((s, r) => s + (r.amount || 0), 0);
                      return Math.round(((entry.first_period_base || 0) - (entry.first_period_advance || 0) - (d1 - c1) - absence.first) * 100) / 100;
                     })();
                     const secondNetDisplay = (() => {
                       if (!entry) return null;
                       if (!isCLTMotoRow) return entry.second_period_net ?? 0;
                       const denom = entry.full_month_contract_working_days || 1;
                       const worked = entry.contract_working_days || denom;
                       const foodEff = Math.round((entry.food_voucher || 0) / denom * worked * 100) / 100;
                       const costEff = Math.round((entry.cost_allowance || 0) / denom * worked * 100) / 100;
                       const cltExtra = (entry.delivery_bonus || 0) + (entry.delivery_target_bonus || 0) + (entry.attendance_bonus || 0) + (entry.route_sp_bonus || 0) + (entry.overtime || 0);
                       const gDebits2 = (entry.second_discounts || []).filter(r => r.type !== 'credit').reduce((s, r) => s + (r.amount || 0), 0);
                       const gCredits2 = (entry.second_discounts || []).filter(r => r.type === 'credit').reduce((s, r) => s + (r.amount || 0), 0);
                       return (entry.second_period_base || 0) + foodEff + (entry.km_bonus || 0) + costEff - (gDebits2 - gCredits2) - absence.second + cltExtra;
                     })();

                     return (
                       <tr key={rowKey} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                         <td className="p-3 pl-4">
                           {entry && (
                             <Checkbox
                               checked={selectedEntryIds.has(entry.id)}
                               onCheckedChange={() => toggleSelectEntry(entry.id)}
                             />
                           )}
                         </td>
                          <td className="p-3 pl-3">
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
                         <td className="p-3 text-sm text-muted-foreground">
                           {(() => {
                             const list = (emp.workplace_list ?? []).map(id => workplaces.find(w => String(w.tangerino_id) === String(id))?.name).filter(Boolean);
                             return list.length > 0 ? <span title={list.join(', ')}>{list[0]}{list.length > 1 ? ` +${list.length - 1}` : ''}</span> : '—';
                           })()}
                         </td>
                         <td className="p-3 text-right font-mono">{effectiveSalary !== null ? formatCurrency(effectiveSalary) : '—'}</td>
                         <td className={`p-3 text-right font-mono font-semibold ${firstNetDisplay !== null ? (firstNetDisplay < 0 ? 'text-destructive' : 'text-blue-600') : ''}`}>{firstNetDisplay !== null ? formatCurrency(firstNetDisplay) : '—'}</td>
                         <td className="p-3 text-right font-mono">
                           {entry ? (
                             <span className={disc1 > 0 ? 'text-destructive' : 'text-muted-foreground'}>
                               {disc1 > 0 ? formatCurrency(disc1) : '—'}
                             </span>
                           ) : '—'}
                         </td>
                         <td className={`p-3 text-right font-mono font-semibold ${secondNetDisplay !== null ? (secondNetDisplay < 0 ? 'text-destructive' : 'text-green-600') : ''}`}>{secondNetDisplay !== null ? formatCurrency(secondNetDisplay) : '—'}</td>
                         <td className="p-3 text-right font-mono">
                           {entry ? (
                             <span className={disc2 > 0 ? 'text-destructive' : 'text-muted-foreground'}>
                               {disc2 > 0 ? formatCurrency(disc2) : '—'}
                             </span>
                           ) : '—'}
                         </td>
                         <td className="p-3 text-right font-mono">{bonificacoes !== null ? formatCurrency(bonificacoes) : '—'}</td>
                          <td className="p-3 text-center">
                              {(() => {
                                const empJobRole = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
                                const espPayrollType = entry?.esporadico_payroll_type;
                                if (emp.contract_type === 'ESPORADICO' && !espPayrollType && !entry) {
                                  // sem entry ainda, aguardando adição
                                } else if (emp.contract_type !== 'ESPORADICO' && !empJobRole?.payroll_type) {
                                  return <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-300 bg-yellow-50">Sem modelo</Badge>;
                                }
                                if (entry?.status === 'closed') return <Badge variant="destructive" className="text-xs gap-1"><Lock className="w-2.5 h-2.5" />Fechado</Badge>;
                                return <Badge variant={entry ? 'default' : 'outline'} className="text-xs">{entry ? 'Lançado' : 'Pendente'}</Badge>;
                              })()}
                            </td>
                            <td className="p-3 text-center">
                              {entry && (entry.full_month_contract_working_days > 0 || entry.contract_working_days > 0) ? (
                                <div className="text-xs text-muted-foreground space-y-0.5">
                                  <div><span className="text-foreground font-medium">{entry.full_month_contract_working_days ?? '—'}</span> <span>total</span></div>
                                  <div><span className="text-foreground font-medium">{entry.contract_working_days ?? '—'}</span> <span>trab.</span></div>
                                </div>
                              ) : '—'}
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
                                   const pType = emp.contract_type === 'ESPORADICO' ? (entry.esporadico_payroll_type || 'ESPORADICO') : jr?.payroll_type;
                                   printReceiptDirect({ employee: emp, entry, referenceMonth: selectedMonth, company: companies.find(c => c.id === entry.company_id || c.id === emp.company_id), payrollType: pType, jobRoleName: jr?.name });
                                 }}
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </Button>
                                {!readOnly && (entry.status === 'closed' ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Reabrir folha deste colaborador"
                                    onClick={() => {
                                      if (hasPaymentBaixa(entry)) {
                                        setPaymentBlockAlert({ empName: emp.name });
                                      } else {
                                        setConfirmReopen({ type: 'entry', entry, empName: emp.name });
                                      }
                                    }}
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
                                ))}
                                {!readOnly && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Excluir este lançamento"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setConfirmDelete({ entry, empName: emp.name })}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                               </>
                               )}
                               {!readOnly && (() => {
                               const empJobRole = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
                               const hasPayrollType = emp.contract_type === 'ESPORADICO' || !!empJobRole?.payroll_type;
                               return (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={closed || !hasPayrollType || entry?.status === 'closed'}
                                  title={!hasPayrollType ? 'Configure o modelo de folha do cargo antes de lançar.' : entry?.status === 'closed' ? 'Folha fechada. Reabra para editar.' : undefined}
                                  onClick={() => {
                                    setEditingEmployee(emp);
                                    if (emp.contract_type === 'ESPORADICO') {
                                      // Esporádico: pré-preenche company_id da empresa atual
                                      const prefilledEsp = entry || { company_id: company.id };
                                      setEditingEntry(prefilledEsp);
                                      setEditingEntryCompanyId(company.id);
                                    } else {
                                      const jobRoleForEmp = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
                                      const prefilled = (!entry && jobRoleForEmp?.base_salary > 0)
                                        ? { base_salary: jobRoleForEmp.base_salary, clt_moto_base_salary: jobRoleForEmp.base_salary }
                                        : null;
                                      // Se a entry veio de outra empresa (troca de empresa), força company_id novo ao salvar
                                      const entryToEdit = (entry && entry.company_id !== company.id)
                                        ? { ...entry, company_id: company.id }
                                        : (entry || prefilled);
                                      setEditingEntry(entryToEdit);
                                      setEditingEntryCompanyId(null);
                                    }
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

      {selectedEntryIds.size > 0 && (() => {
        const selEntries = entries.filter(e => selectedEntryIds.has(e.id));
        const openOnes   = selEntries.filter(e => e.status !== 'closed');
        const closedOnes = selEntries.filter(e => e.status === 'closed');
        return (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border shadow-xl rounded-xl px-5 py-3 flex items-center gap-4">
            <CheckSquare className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{selectedEntryIds.size} folha(s) selecionada(s)</span>
            {selectedEntryIds.size > 20 && (
              <span className="text-xs text-yellow-600 font-medium">⚠ Máx. 20 por PDF em lote</span>
            )}
            {openOnes.length > 0 && !readOnly && (
              <Button size="sm" variant="default" className="gap-1.5" onClick={() => setConfirmBulk({ action: 'close', entryList: openOnes })}>
                <Lock className="w-3.5 h-3.5" /> Fechar {openOnes.length > 1 ? `(${openOnes.length})` : ''}
              </Button>
            )}
            {closedOnes.length > 0 && !readOnly && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConfirmBulk({ action: 'reopen', entryList: closedOnes })}>
                <Unlock className="w-3.5 h-3.5" /> Reabrir {closedOnes.length > 1 ? `(${closedOnes.length})` : ''}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelectedEntryIds(new Set())}>Cancelar</Button>
          </div>
        );
      })()}

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
          else handleReopenEmployeeEntry(confirmReopen.entry, confirmReopen.empName);
        }}
      />

      <ConfirmDialog
        open={!!confirmBulk}
        onOpenChange={(v) => !v && setConfirmBulk(null)}
        title={confirmBulk?.action === 'close' ? `Fechar ${confirmBulk?.entryList?.length} folha(s)?` : `Reabrir ${confirmBulk?.entryList?.length} folha(s)?`}
        description={confirmBulk?.action === 'close'
          ? `Deseja fechar as ${confirmBulk?.entryList?.length} folhas selecionadas? Após fechar, não será possível editá-las.`
          : `Deseja reabrir as ${confirmBulk?.entryList?.length} folhas selecionadas?`}
        confirmLabel={confirmBulk?.action === 'close' ? 'Fechar Todas' : 'Reabrir Todas'}
        confirmVariant={confirmBulk?.action === 'close' ? 'destructive' : 'default'}
        onConfirm={() => handleBulkAction(confirmBulk.action, confirmBulk.entryList)}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Excluir lançamento?"
        description={`Deseja excluir o lançamento de ${confirmDelete?.empName}? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        confirmVariant="destructive"
        onConfirm={() => handleDeleteEntry(confirmDelete.entry)}
      />

      {addEsporadico && (
        <AddEsporadicoDialog
          companyId={addEsporadico.companyId}
          referenceMonth={selectedMonth}
          existingEntries={entries}
          onAdded={load}
          onClose={() => setAddEsporadico(null)}
        />
      )}

      {cloneDialog && (
        <ClonePayrollDialog
          open={cloneDialog}
          onClose={() => setCloneDialog(false)}
          onConfirm={handleCloneFromPrevious}
          companies={companies}
          employees={employees}
          targetMonth={selectedMonth}
          cloning={cloning}
        />
      )}

      {bulkPDF && (
        <BulkPDFDialog
          company={bulkPDF.company}
          items={bulkPDF.items}
          referenceMonth={selectedMonth}
          onClose={() => setBulkPDF(null)}
        />
      )}



      <AlertDialog open={!!paymentBlockAlert} onOpenChange={v => !v && setPaymentBlockAlert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Folha não pode ser reaberta
            </AlertDialogTitle>
            <AlertDialogDescription>
              A folha de <strong>{paymentBlockAlert?.empName}</strong> não pode ser reaberta pois <strong>ambas as quinzenas</strong> já possuem pagamento registrado.
              <br /><br />
              Para reabrir a folha, acesse o módulo de <strong>Pagamentos</strong> e estorne os pagamentos de ambas as quinzenas antes de tentar reabrir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setPaymentBlockAlert(null)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showForm && editingEmployee && (() => {
        const empJobRole = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(editingEmployee.job_role_tangerino_id)) || null;
        // Para esporádicos: usa o payroll_type gravado na entry; para outros: usa o do cargo
        const pt = editingEmployee.contract_type === 'ESPORADICO'
          ? (editingEntry?.esporadico_payroll_type || 'ESPORADICO')
          : empJobRole?.payroll_type;
        const FormComponent = pt === 'ESCRITORIO' ? EscritorioPayrollForm : pt === 'MOTOCICLISTA_MEI' ? MeiPayrollForm : pt === 'MOTOCICLISTA_CLT' ? PayrollEntryForm : pt === 'SOCIO' ? ProLaboreForm : pt === 'ESPORADICO' ? EsporadicoPayrollForm : PayrollEntryForm;
        // Para esporádicos com modelo de cargo específico, cria um jobRole sintético
        const effectiveJobRole = empJobRole || (editingEmployee.contract_type === 'ESPORADICO' && pt !== 'ESPORADICO'
          ? { payroll_type: pt }
          : null);
        return (
          <FormComponent
            key={`${editingEmployee.id}-${editingEntry?.id ?? 'new'}`}
            employee={editingEmployee}
            workplaces={workplaces}
            entry={editingEntry}
            referenceMonth={selectedMonth}
            readOnly={viewOnly || editingEntry?.status === 'closed' || isMonthClosed(editingEntry?.company_id || editingEmployee?.company_id)}
            onSave={handleSaveEntry}
            onClose={() => { setShowForm(false); setEditingEntry(null); setEditingEmployee(null); setEditingEntryCompanyId(null); setViewOnly(false); }}
            jobRole={effectiveJobRole}
            paymentStatus={paymentStatuses.find(p => p.payroll_entry_id === editingEntry?.id)}
          />
        );
      })()}
    </div>
  );
}