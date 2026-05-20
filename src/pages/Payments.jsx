import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, CreditCard, Download, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Button } from '@/components/ui/button';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';
import { calcBonificacoes, calcPeriodDebits, getAbsenceByPeriod } from '@/lib/entryDisplayUtils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const STATUS_OPTIONS = ['PENDENTE', 'AGENDADO', 'PAGO', 'BLOQUEADO', 'RESCISÃO', 'DESLIGADO', 'FÉRIAS', 'AFASTADO', 'SALDO NEGATIVO', 'COBRIDOR'];
const STATUS_COLORS = {
  PAGO: 'bg-green-100 text-green-700 border-green-300',
  PENDENTE: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  AGENDADO: 'bg-blue-100 text-blue-700 border-blue-300',
  BLOQUEADO: 'bg-red-100 text-red-700 border-red-300',
  'RESCISÃO': 'bg-orange-100 text-orange-700 border-orange-300',
  DESLIGADO: 'bg-gray-100 text-gray-600 border-gray-300',
  'FÉRIAS': 'bg-teal-100 text-teal-700 border-teal-300',
  AFASTADO: 'bg-purple-100 text-purple-700 border-purple-300',
  'SALDO NEGATIVO': 'bg-rose-100 text-rose-700 border-rose-300',
  'COBRIDOR': 'bg-indigo-100 text-indigo-700 border-indigo-300',
};

function InlineSelect({ value, onChange, disabled }) {
  return (
    <select
      className={`text-xs font-medium rounded px-2 py-1 border cursor-pointer ${STATUS_COLORS[value] || 'bg-muted text-muted-foreground border-border'}`}
      value={value || 'PENDENTE'}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    >
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

function RevertPaymentDialog({ open, onConfirm, onCancel, empName, quinzena }) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Estornar Pagamento?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja estornar o pagamento da <strong>{quinzena}</strong> de <strong>{empName}</strong>?
            <br /><br />
            Esta ação irá limpar a data de pagamento e retornar o status para <strong>PENDENTE</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-orange-500 hover:bg-orange-600 text-white"
            onClick={onConfirm}
          >
            Confirmar Estorno
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InlineObs({ value, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  if (disabled) return <span className="text-xs text-muted-foreground block w-full text-center" title={value || ''}>{value || '—'}</span>;
  if (!editing) return (
    <span
      className="text-xs text-muted-foreground cursor-pointer hover:text-foreground hover:underline block w-full text-center"
      onClick={() => { setDraft(value || ''); setEditing(true); }}
      title={value || 'Clique para adicionar observação'}
    >
      {value || '+ obs'}
    </span>
  );
  return (
    <input
      autoFocus
      className="text-xs border border-primary rounded px-2 py-1 w-full min-w-0 block"
      style={{ boxSizing: 'border-box' }}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { onSave(draft); setEditing(false); }}
      onKeyDown={e => { if (e.key === 'Enter') { onSave(draft); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
    />
  );
}

function InlineDatePago({ value, onSave }) {
  return (
    <div className="mt-1">
      <label className="text-xs text-green-700 font-medium block mb-0.5">Data de pagamento:</label>
      <input
        type="date"
        className="text-xs border border-green-400 rounded px-1 py-1 w-full block bg-green-50 text-green-800"
        value={value || ''}
        onChange={e => onSave(e.target.value)}
      />
    </div>
  );
}

export default function Payments() {
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [jobRoles, setJobRoles] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [entries, setEntries] = useState([]);
  const [paymentStatuses, setPaymentStatuses] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedJobRole, setSelectedJobRole] = useState('all');
  const [selectedWorkplace, setSelectedWorkplace] = useState('all');
  const [search, setSearch] = useState('');
  const [filterStatusQ1, setFilterStatusQ1] = useState('all');
  const [filterStatusQ2, setFilterStatusQ2] = useState('all');
  const [saving, setSaving] = useState({});
  const [revertConfirm, setRevertConfirm] = useState(null); // { entry, quinzena: 'q1'|'q2', empName }

  const load = async () => {
    const [e, c, jr, w, p] = await Promise.all([
      base44.entities.Employee.list(),
      base44.entities.Company.list(),
      base44.entities.JobRole.list(),
      base44.entities.Workplace.list(),
      base44.entities.PayrollEntry.filter({ reference_month: selectedMonth, status: 'closed' }),
    ]);
    setEmployees(e);
    setCompanies(c.filter(x => x.is_active !== false));
    setJobRoles(jr);
    setWorkplaces(w);
    setEntries(p);
    const ps = await base44.entities.PaymentStatus.filter({ reference_month: selectedMonth });
    setPaymentStatuses(ps);
  };

  useEffect(() => { load(); }, [selectedMonth]);

  const getEmployee = (id) => employees.find(e => e.id === id);
  const getJobRoleName = (emp) => jobRoles.find(jr => String(jr.tangerino_id) === String(emp?.job_role_tangerino_id))?.name || '—';
  const getWorkplaceNames = (emp) => (emp?.workplace_list ?? []).map(id => workplaces.find(w => String(w.tangerino_id) === String(id))?.name).filter(Boolean).join(', ') || '—';
  const getCompanyName = (entry) => {
    // Para não-esporádicos: usa company_id do colaborador (sempre atualizado).
    // Para esporádicos: usa company_id da folha (podem trabalhar em empresas diferentes).
    const emp = getEmployee(entry?.employee_id);
    const isEsporadico = emp?.contract_type === 'ESPORADICO';
    const id = isEsporadico ? entry?.company_id : (emp?.company_id || entry?.company_id);
    return companies.find(c => c.id === id)?.name || '—';
  };
  const getPayStatus = (entryId) => paymentStatuses.find(p => p.payroll_entry_id === entryId);

  const updatePayStatus = useCallback(async (entry, updates) => {
    const emp = getEmployee(entry.employee_id);
    const existing = paymentStatuses.find(p => p.payroll_entry_id === entry.id);
    const key = entry.id + Object.keys(updates).join('');
    setSaving(s => ({ ...s, [key]: true }));
    try {
      if (existing) {
        await base44.entities.PaymentStatus.update(existing.id, updates);
        setPaymentStatuses(prev => prev.map(p => p.id === existing.id ? { ...p, ...updates } : p));
      } else {
        const created = await base44.entities.PaymentStatus.create({
          payroll_entry_id: entry.id,
          employee_id: entry.employee_id,
          company_id: entry.company_id || emp?.company_id,
          reference_month: selectedMonth,
          ...updates,
        });
        setPaymentStatuses(prev => [...prev, created]);
      }
    } catch {
      toast.error('Erro ao salvar status de pagamento');
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  }, [paymentStatuses, employees, selectedMonth]);

  const handleStatusChange = useCallback((entry, quinzena, newStatus) => {
    const statusField = quinzena === 'q1' ? 'status_q1' : 'status_q2';
    const dateField = quinzena === 'q1' ? 'payment_date_q1' : 'payment_date_q2';
    const ps = paymentStatuses.find(p => p.payroll_entry_id === entry.id);
    const currentStatus = ps?.[statusField] || 'PENDENTE';

    // Revert from PAGO → show confirm dialog
    if (currentStatus === 'PAGO' && newStatus !== 'PAGO') {
      const emp = getEmployee(entry.employee_id);
      setRevertConfirm({
        entry,
        quinzena,
        empName: emp?.name || '',
        quinzenaLabel: quinzena === 'q1' ? '1ª Quinzena' : '2ª Quinzena',
        onConfirm: () => {
          updatePayStatus(entry, { [statusField]: newStatus, [dateField]: '' });
          setRevertConfirm(null);
        },
      });
      return;
    }
    updatePayStatus(entry, { [statusField]: newStatus });
  }, [paymentStatuses, employees, updatePayStatus]);

  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }

  const exportXLSX = () => {
    const rows = sortedEntries.map(entry => {
      const emp = getEmployee(entry.employee_id);
      const ps = getPayStatus(entry.id);
      return {
        'Colaborador': emp?.name || '—',
        'Empresa': getCompanyName(entry),
        'Admissão': formatDate(emp?.admission_date),
        'Cargo': getJobRoleName(emp),
        'Local': getWorkplaceNames(emp),
        '1ª Q - Á Receber': entry.first_period_net || 0,
        '1ª Q - Descontos/Acréscimos': calcPeriodDebits(entry.first_discounts, getAbsenceByPeriod(entry).first),
        '1ª Q - Status': ps?.status_q1 || 'PENDENTE',
        '1ª Q - Data Pagamento': formatDate(ps?.payment_date_q1),
        '1ª Q - OBS': ps?.obs_q1 || '',
        '2ª Q - Á Receber': entry.second_period_net || 0,
        '2ª Q - Descontos/Acréscimos': calcPeriodDebits(entry.second_discounts, getAbsenceByPeriod(entry).second),
        '2ª Q - Status': ps?.status_q2 || 'PENDENTE',
        '2ª Q - Data Pagamento': formatDate(ps?.payment_date_q2),
        '2ª Q - OBS': ps?.obs_q2 || '',
        'Total Bonificações': calcBonificacoes(entry),
        'Banco': emp?.bank_name || '',
        'Agência': emp?.bank_agency || '',
        'Conta': emp?.bank_account || '',
        'Favorecido': emp?.bank_beneficiary || '',
        'Chave PIX': emp?.pix_key || '',
        'Tipo PIX': emp?.pix_key_type || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pagamentos');
    XLSX.writeFile(wb, `pagamentos_${selectedMonth}.xlsx`);
  };

  const filteredEntries = entries.filter(entry => {
    const emp = getEmployee(entry.employee_id);
    if (!emp) return false;
    const ps = getPayStatus(entry.id);
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase());
    // Verifica empresa pela entry OU pelo company_id atual do colaborador (cobre troca de empresa)
    const effectiveCompanyId = (emp?.contract_type !== 'ESPORADICO' && emp?.company_id) ? emp.company_id : entry.company_id;
    const matchCompany = selectedCompany === 'all' || entry.company_id === selectedCompany || effectiveCompanyId === selectedCompany;
    const matchJobRole = selectedJobRole === 'all' || String(emp.job_role_tangerino_id) === selectedJobRole;
    const matchWorkplace = selectedWorkplace === 'all' || (emp.workplace_list ?? []).map(String).includes(selectedWorkplace);
    const matchStatusQ1 = filterStatusQ1 === 'all' || (ps?.status_q1 || 'PENDENTE') === filterStatusQ1;
    const matchStatusQ2 = filterStatusQ2 === 'all' || (ps?.status_q2 || 'PENDENTE') === filterStatusQ2;
    return matchSearch && matchCompany && matchJobRole && matchWorkplace && matchStatusQ1 && matchStatusQ2;
  });

  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const empA = getEmployee(a.employee_id);
    const empB = getEmployee(b.employee_id);
    return (empA?.name || '').localeCompare(empB?.name || '', 'pt-BR');
  });

  const totalQ1 = sortedEntries.reduce((s, e) => s + (e.first_period_net || 0), 0);
  const totalQ2 = sortedEntries.reduce((s, e) => s + (e.second_period_net || 0), 0);
  const totalBonificacoes = sortedEntries.reduce((s, e) => s + calcBonificacoes(e), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary" /> Pagamentos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de pagamentos por quinzena — apenas folhas fechadas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map(m => <SelectItem key={m} value={m}>{getMonthName(m)}</SelectItem>)}
          </SelectContent>
        </Select>
        <SearchableSelect
          value={selectedCompany}
          onValueChange={setSelectedCompany}
          placeholder="Empresa"
          className="w-44"
          allLabel="Todas as Empresas"
          options={[...companies].sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).map(c => ({ value: c.id, label: c.name }))}
        />
        <SearchableSelect
          value={selectedJobRole}
          onValueChange={setSelectedJobRole}
          placeholder="Cargo"
          className="w-44"
          allLabel="Todos os Cargos"
          options={jobRoles.filter(jr => jr.tangerino_id).sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).map(jr => ({ value: String(jr.tangerino_id), label: jr.name }))}
        />
        <SearchableSelect
          value={selectedWorkplace}
          onValueChange={setSelectedWorkplace}
          placeholder="Local"
          className="w-44"
          allLabel="Todos os Locais"
          options={workplaces.filter(w => w.tangerino_id).sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).map(w => ({ value: String(w.tangerino_id), label: w.name }))}
        />
        <Select value={filterStatusQ1} onValueChange={setFilterStatusQ1}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status 1ª Q" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Status 1ª Quinzena</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatusQ2} onValueChange={setFilterStatusQ2}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status 2ª Q" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Status 2ª Quinzena</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar colaborador..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Totais */}
      <div className="flex gap-4 flex-wrap">
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
          <p className="text-xs text-blue-600">Total 1ª Quinzena</p>
          <p className="font-mono font-bold text-blue-700 text-lg">{formatCurrency(totalQ1)}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2">
          <p className="text-xs text-green-600">Total 2ª Quinzena</p>
          <p className="font-mono font-bold text-green-700 text-lg">{formatCurrency(totalQ2)}</p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
          <p className="text-xs text-primary">Total Geral</p>
          <p className="font-mono font-bold text-primary text-lg">{formatCurrency(totalQ1 + totalQ2)}</p>
        </div>
        {totalBonificacoes > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
            <p className="text-xs text-amber-600">Total Bonificações</p>
            <p className="font-mono font-bold text-amber-700 text-lg">{formatCurrency(totalBonificacoes)}</p>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{sortedEntries.length} folhas fechadas</span>
          <Button variant="outline" size="sm" onClick={exportXLSX} className="gap-2">
            <Download className="w-4 h-4" /> Exportar XLSX
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-auto rounded-xl border border-border bg-card max-h-[65vh]">
        <table className="text-xs w-full" style={{ tableLayout: 'fixed', minWidth: '1680px' }}>
          <colgroup>
            <col style={{ width: '180px' }} />
            <col style={{ width: '85px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '110px' }} />
            {/* Q1 */}
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '150px' }} />
            {/* Q2 */}
            <col style={{ width: '100px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '150px' }} />
            {/* Bonificações */}
            <col style={{ width: '110px' }} />
            {/* Dados bancários */}
            <col style={{ width: '110px' }} />
            <col style={{ width: '85px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '140px' }} />
            <col style={{ width: '110px' }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border">
              <th className="p-2 text-left font-bold text-white bg-primary" rowSpan={2}>COLABORADOR</th>
              <th className="p-2 text-center font-bold text-white bg-primary" rowSpan={2}>ADMISSÃO</th>
              <th className="p-2 text-center font-bold text-white bg-primary" rowSpan={2}>EMPRESA</th>
              <th className="p-2 text-center font-bold text-white bg-primary" rowSpan={2}>CARGO</th>
              <th className="p-2 text-center font-bold text-white bg-primary" rowSpan={2}>LOCAL</th>
              <th className="p-2 text-center font-bold text-white bg-blue-700" colSpan={4}>1ª QUINZENA</th>
              <th className="p-2 text-center font-bold text-white bg-green-700" colSpan={4}>2ª QUINZENA</th>
              <th className="p-2 text-center font-bold text-white bg-amber-600" rowSpan={2}>BONIFICAÇÕES</th>
              <th className="p-2 text-center font-bold text-white bg-slate-600" colSpan={6}>DADOS BANCÁRIOS</th>
            </tr>
            <tr className="border-b border-border bg-muted/30">
              <th className="p-2 text-right font-semibold text-blue-600 text-xs">Á RECEBER</th>
              <th className="p-2 text-right font-semibold text-blue-600 text-xs">DESCONTOS</th>
              <th className="p-2 text-center font-semibold text-blue-600 text-xs">STATUS / DT PAGAMENTO</th>
              <th className="p-2 text-center font-semibold text-blue-600 text-xs">OBS</th>
              <th className="p-2 text-right font-semibold text-green-600 text-xs">Á RECEBER</th>
              <th className="p-2 text-right font-semibold text-green-600 text-xs">DESCONTOS</th>
              <th className="p-2 text-center font-semibold text-green-600 text-xs">STATUS / DT PAGAMENTO</th>
              <th className="p-2 text-center font-semibold text-green-600 text-xs">OBS</th>
              <th className="p-2 text-center font-semibold text-slate-500 text-xs">BANCO</th>
              <th className="p-2 text-center font-semibold text-slate-500 text-xs">AGÊNCIA</th>
              <th className="p-2 text-center font-semibold text-slate-500 text-xs">CONTA</th>
              <th className="p-2 text-center font-semibold text-slate-500 text-xs">FAVORECIDO</th>
              <th className="p-2 text-center font-semibold text-slate-500 text-xs">CHAVE PIX</th>
              <th className="p-2 text-center font-semibold text-slate-500 text-xs">TIPO PIX</th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry, idx) => {
              const emp = getEmployee(entry.employee_id);
              if (!emp) return null;
              const ps = getPayStatus(entry.id);
              const status1 = ps?.status_q1 || 'PENDENTE';
              const status2 = ps?.status_q2 || 'PENDENTE';
              const isPago1 = status1 === 'PAGO';
              const isPago2 = status2 === 'PAGO';
              return (
                <tr key={entry.id} className={`border-b border-border last:border-0 hover:bg-muted/10 ${idx % 2 === 1 ? 'bg-accent/20' : ''}`}>
                  <td className="p-2 font-medium truncate" title={emp.name}>{emp.name}</td>
                  <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(emp.admission_date)}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={getCompanyName(entry)}>{getCompanyName(entry)}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={getJobRoleName(emp)}>{getJobRoleName(emp)}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={getWorkplaceNames(emp)}>{getWorkplaceNames(emp)}</td>
                  {/* 1ª Quinzena */}
                  <td className="p-2 text-right font-mono font-semibold text-blue-600 whitespace-nowrap">{formatCurrency(entry.first_period_net)}</td>
                  <td className="p-2 text-right font-mono whitespace-nowrap">
                   {(() => {
                     const absence = getAbsenceByPeriod(entry);
                     const d = calcPeriodDebits(entry.first_discounts, absence.first);
                     return d > 0 ? <span className="text-destructive">{formatCurrency(d)}</span> : '—';
                   })()}
                  </td>
                  <td className="p-2">
                    <InlineSelect
                      value={status1}
                      onChange={v => handleStatusChange(entry, 'q1', v)}
                      disabled={false}
                    />
                    {isPago1 && (
                      <InlineDatePago
                        value={ps?.payment_date_q1 || ''}
                        onSave={v => updatePayStatus(entry, { payment_date_q1: v })}
                      />
                    )}
                  </td>
                  <td className="p-2 overflow-hidden">
                    <InlineObs
                      value={ps?.obs_q1 || ''}
                      onSave={v => updatePayStatus(entry, { obs_q1: v })}
                      disabled={false}
                    />
                  </td>
                  {/* 2ª Quinzena */}
                  <td className="p-2 text-right font-mono font-semibold text-green-600 whitespace-nowrap">{formatCurrency(entry.second_period_net)}</td>
                  <td className="p-2 text-right font-mono whitespace-nowrap">
                    {(() => {
                      const absence = getAbsenceByPeriod(entry);
                      const d = calcPeriodDebits(entry.second_discounts, absence.second);
                      return d > 0 ? <span className="text-destructive">{formatCurrency(d)}</span> : '—';
                    })()}
                  </td>
                  <td className="p-2">
                    <InlineSelect
                      value={status2}
                      onChange={v => handleStatusChange(entry, 'q2', v)}
                      disabled={false}
                    />
                    {isPago2 && (
                      <InlineDatePago
                        value={ps?.payment_date_q2 || ''}
                        onSave={v => updatePayStatus(entry, { payment_date_q2: v })}
                      />
                    )}
                  </td>
                  <td className="p-2 overflow-hidden">
                    <InlineObs
                      value={ps?.obs_q2 || ''}
                      onSave={v => updatePayStatus(entry, { obs_q2: v })}
                      disabled={false}
                    />
                  </td>
                  {/* Bonificações */}
                  <td className="p-2 text-right font-mono whitespace-nowrap text-amber-700">
                    {(() => { const b = calcBonificacoes(entry); return b > 0 ? formatCurrency(b) : '—'; })()}
                  </td>
                  {/* Dados Bancários */}
                  <td className="p-2 text-xs text-muted-foreground truncate" title={emp.bank_name}>{emp.bank_name || '—'}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={emp.bank_agency}>{emp.bank_agency || '—'}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={emp.bank_account}>{emp.bank_account || '—'}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={emp.bank_beneficiary}>{emp.bank_beneficiary || '—'}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={emp.pix_key}>{emp.pix_key || '—'}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate">{emp.pix_key_type || '—'}</td>
                </tr>
              );
            })}
            {sortedEntries.length === 0 && (
              <tr><td colSpan={20} className="text-center py-12 text-muted-foreground">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Nenhuma folha fechada encontrada para este período</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <RevertPaymentDialog
        open={!!revertConfirm}
        empName={revertConfirm?.empName || ''}
        quinzena={revertConfirm?.quinzenaLabel || ''}
        onConfirm={revertConfirm?.onConfirm}
        onCancel={() => setRevertConfirm(null)}
      />
    </div>
  );
}