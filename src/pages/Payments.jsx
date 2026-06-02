import { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, CreditCard, Download, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import MultiSearchableSelect from '@/components/ui/MultiSearchableSelect';
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

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const fmtMonth = (m) => { const [y, mo] = m.split('-'); return `${MONTHS_PT[parseInt(mo)-1]}/${y.slice(2)}`; };

function getFirstNetDisplay(entry, employees, jobRoles) {
  const emp = employees.find(e => e.id === entry.employee_id);
  const jr = jobRoles.find(j => j.tangerino_id && String(j.tangerino_id) === String(emp?.job_role_tangerino_id));
  if (jr?.payroll_type !== 'MOTOCICLISTA_CLT') return entry.first_period_net ?? 0;
  const d1 = (entry.first_discounts || []).filter(r => r.type !== 'credit').reduce((s, r) => s + (r.amount || 0), 0);
  const c1 = (entry.first_discounts || []).filter(r => r.type === 'credit').reduce((s, r) => s + (r.amount || 0), 0);
  const absence = getAbsenceByPeriod(entry);
  return Math.round(((entry.first_period_base || 0) - (entry.first_period_advance || 0) - (d1 - c1) - absence.first) * 100) / 100;
}

function getSecondNetDisplay(entry, employees, jobRoles) {
  const emp = employees.find(e => e.id === entry.employee_id);
  const jr = jobRoles.find(j => j.tangerino_id && String(j.tangerino_id) === String(emp?.job_role_tangerino_id));
  if (jr?.payroll_type !== 'MOTOCICLISTA_CLT') return entry.second_period_net || 0;
  const denom = entry.full_month_contract_working_days || 1;
  const worked = entry.contract_working_days || denom;
  const foodEff = Math.round((entry.food_voucher || 0) / denom * worked * 100) / 100;
  const costEff = Math.round((entry.cost_allowance || 0) / denom * worked * 100) / 100;
  const gDebits = (entry.second_discounts || []).filter(r => r.type !== 'credit').reduce((s, r) => s + (r.amount || 0), 0);
  const gCredits = (entry.second_discounts || []).filter(r => r.type === 'credit').reduce((s, r) => s + (r.amount || 0), 0);
  const absence = getAbsenceByPeriod(entry);
  const cltExtra = (entry.delivery_bonus || 0) + (entry.delivery_target_bonus || 0) + (entry.attendance_bonus || 0) + (entry.route_sp_bonus || 0) + (entry.overtime || 0);
  return (entry.second_period_base || 0) + foodEff + (entry.km_bonus || 0) + costEff - (gDebits - gCredits) - absence.second + cltExtra;
}

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
  const [selectedMonth, setSelectedMonth] = useState(() => sessionStorage.getItem('filter_month_payments') || new Date().toISOString().slice(0, 7));

  // ── Draft filters (o que o usuário está editando) ─────────────────────────
  const [draftSearch, setDraftSearch] = useState('');
  const [draftCompanies, setDraftCompanies] = useState([]);
  const [draftJobRole, setDraftJobRole] = useState('all');
  const [draftWorkplace, setDraftWorkplace] = useState('all');
  const [draftStatusQ1, setDraftStatusQ1] = useState('all');
  const [draftStatusQ2, setDraftStatusQ2] = useState('all');
  const [draftBanks, setDraftBanks] = useState([]);

  // ── Active filters (aplicados ao grid após "Buscar") ──────────────────────
  const [activeSearch, setActiveSearch] = useState('');
  const [activeCompanies, setActiveCompanies] = useState([]);
  const [activeJobRole, setActiveJobRole] = useState('all');
  const [activeWorkplace, setActiveWorkplace] = useState('all');
  const [activeStatusQ1, setActiveStatusQ1] = useState('all');
  const [activeStatusQ2, setActiveStatusQ2] = useState('all');
  const [activeBanks, setActiveBanks] = useState([]);

  // ── Filtro de quinzena (visibilidade de colunas) ──────────────────────────
  const [selectedPeriod, setSelectedPeriod] = useState('all'); // 'all' | 'q1' | 'q2'

  const [saving, setSaving] = useState({});
  const [revertConfirm, setRevertConfirm] = useState(null);

  const handleBuscar = () => {
    setActiveSearch(draftSearch);
    setActiveCompanies(draftCompanies);
    setActiveJobRole(draftJobRole);
    setActiveWorkplace(draftWorkplace);
    setActiveStatusQ1(draftStatusQ1);
    setActiveStatusQ2(draftStatusQ2);
    setActiveBanks(draftBanks);
  };

  const load = async () => {
    const [e, c, jr, w, p] = await Promise.all([
      base44.entities.Employee.list(),
      base44.entities.Company.list(),
      base44.entities.JobRole.list(),
      base44.entities.Workplace.list(),
      base44.entities.PayrollEntry.filter({ reference_month: selectedMonth }),
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
  useEffect(() => { sessionStorage.setItem('filter_month_payments', selectedMonth); }, [selectedMonth]);

  const getEmployee = (id) => employees.find(e => e.id === id);
  const getJobRoleName = (emp) => jobRoles.find(jr => String(jr.tangerino_id) === String(emp?.job_role_tangerino_id))?.name || '—';
  const getWorkplaceNames = (emp) => (emp?.workplace_list ?? []).map(id => workplaces.find(w => String(w.tangerino_id) === String(id))?.name).filter(Boolean).join(', ') || '—';
  const getCompanyName = (entry) => {
    const emp = getEmployee(entry?.employee_id);
    const isEsporadico = emp?.contract_type === 'ESPORADICO';
    const id = isEsporadico ? entry?.company_id : (emp?.company_id || entry?.company_id);
    return companies.find(c => c.id === id)?.name || '—';
  };
  const getPayStatus = (entryId) => paymentStatuses.find(p => p.payroll_entry_id === entryId);

  // Opções de banco: bancos únicos dos colaboradores presentes nas folhas carregadas
  const bankOptions = useMemo(() => {
    const banks = new Set();
    entries.forEach(entry => {
      const emp = getEmployee(entry.employee_id);
      if (emp?.bank_name) banks.add(emp.bank_name);
    });
    return [...banks].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(b => ({ value: b, label: b }));
  }, [entries, employees]);

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
    if (currentStatus === 'PAGO' && newStatus !== 'PAGO') {
      const emp = getEmployee(entry.employee_id);
      setRevertConfirm({
        entry, quinzena,
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

  const filteredEntries = entries.filter(entry => {
    const emp = getEmployee(entry.employee_id);
    if (!emp) return false;
    const ps = getPayStatus(entry.id);
    const hasModifiedStatus = !!(ps && (
      (ps.status_q1 && ps.status_q1 !== 'PENDENTE') ||
      (ps.status_q2 && ps.status_q2 !== 'PENDENTE') ||
      ps.payment_date_q1 || ps.payment_date_q2 ||
      ps.obs_q1 || ps.obs_q2
    ));
    if (entry.status !== 'closed' && !hasModifiedStatus) return false;
    const matchSearch = !activeSearch || emp.name.toLowerCase().includes(activeSearch.toLowerCase());
    const effectiveCompanyId = (emp?.contract_type !== 'ESPORADICO' && emp?.company_id) ? emp.company_id : entry.company_id;
    const matchCompany = activeCompanies.length === 0 || activeCompanies.includes(entry.company_id) || activeCompanies.includes(effectiveCompanyId);
    const matchJobRole = activeJobRole === 'all' || String(emp.job_role_tangerino_id) === activeJobRole;
    const matchWorkplace = activeWorkplace === 'all' || (emp.workplace_list ?? []).map(String).includes(activeWorkplace);
    const matchStatusQ1 = activeStatusQ1 === 'all' || (ps?.status_q1 || 'PENDENTE') === activeStatusQ1;
    const matchStatusQ2 = activeStatusQ2 === 'all' || (ps?.status_q2 || 'PENDENTE') === activeStatusQ2;
    const matchBank = activeBanks.length === 0 || activeBanks.includes(emp.bank_name || '');
    return matchSearch && matchCompany && matchJobRole && matchWorkplace && matchStatusQ1 && matchStatusQ2 && matchBank;
  });

  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const empA = getEmployee(a.employee_id);
    const empB = getEmployee(b.employee_id);
    return (empA?.name || '').localeCompare(empB?.name || '', 'pt-BR');
  });

  const showQ1 = selectedPeriod !== 'q2';
  const showQ2 = selectedPeriod !== 'q1';
  const totalCols = 5 + (showQ1 ? 4 : 0) + (showQ2 ? 4 : 0) + 1 + 6;
  const tableMinWidth = 615 + (showQ1 ? 500 : 0) + (showQ2 ? 500 : 0) + 110 + 685;

  const totalQ1 = sortedEntries.reduce((s, e) => s + getFirstNetDisplay(e, employees, jobRoles), 0);
  const totalQ2 = sortedEntries.reduce((s, e) => s + getSecondNetDisplay(e, employees, jobRoles), 0);
  const totalBonificacoes = sortedEntries.reduce((s, e) => s + calcBonificacoes(e), 0);

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
        '1ª Q - Á Receber': getFirstNetDisplay(entry, employees, jobRoles),
        '1ª Q - Descontos/Acréscimos': calcPeriodDebits(entry.first_discounts, getAbsenceByPeriod(entry).first),
        '1ª Q - Status': ps?.status_q1 || 'PENDENTE',
        '1ª Q - Data Pagamento': formatDate(ps?.payment_date_q1),
        '1ª Q - OBS': ps?.obs_q1 || '',
        '2ª Q - Á Receber': getSecondNetDisplay(entry, employees, jobRoles),
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary" /> Pagamentos
            <span className="text-sm font-semibold bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">{fmtMonth(selectedMonth)}</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gestão de pagamentos por quinzena — apenas folhas fechadas</p>
        </div>
      </div>

      {/* ── Filtros (linha 1) ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m} value={m}>{getMonthName(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <MultiSearchableSelect
            values={draftCompanies}
            onValuesChange={setDraftCompanies}
            placeholder="Empresa"
            className="w-44"
            allLabel="Todas as Empresas"
            options={[...companies].sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).map(c => ({ value: c.id, label: c.name }))}
          />
          <SearchableSelect
            value={draftJobRole}
            onValueChange={setDraftJobRole}
            placeholder="Cargo"
            className="w-44"
            allLabel="Todos os Cargos"
            options={jobRoles.filter(jr => jr.tangerino_id).sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).map(jr => ({ value: String(jr.tangerino_id), label: jr.name }))}
          />
          <SearchableSelect
            value={draftWorkplace}
            onValueChange={setDraftWorkplace}
            placeholder="Local"
            className="w-44"
            allLabel="Todos os Locais"
            options={workplaces.filter(w => w.tangerino_id).sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).map(w => ({ value: String(w.tangerino_id), label: w.name }))}
          />
          <Select value={draftStatusQ1} onValueChange={setDraftStatusQ1}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status 1ª Q" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status 1ª Quinzena</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={draftStatusQ2} onValueChange={setDraftStatusQ2}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status 2ª Q" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status 2ª Quinzena</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <MultiSearchableSelect
            values={draftBanks}
            onValuesChange={setDraftBanks}
            placeholder="Banco"
            className="w-44"
            allLabel="Todos os Bancos"
            options={bankOptions}
          />
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar colaborador..." className="pl-9" value={draftSearch} onChange={e => setDraftSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleBuscar()}
            />
          </div>
          <Button onClick={handleBuscar} className="gap-2">
            <Search className="w-4 h-4" /> Buscar
          </Button>
        </div>

        {/* ── Filtro de Quinzena (linha 2 - formato bloco) ── */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground font-medium">Quinzena:</span>
          {[
            { value: 'all', label: 'TODAS' },
            { value: 'q1', label: '1ª QUINZENA' },
            { value: 'q2', label: '2ª QUINZENA' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setSelectedPeriod(opt.value)}
              className={`px-5 py-1.5 rounded text-sm font-semibold border transition-colors ${
                selectedPeriod === opt.value
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Totais ── */}
      <div className="flex gap-4 flex-wrap">
        {showQ1 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
            <p className="text-xs text-blue-600">Total 1ª Quinzena</p>
            <p className="font-mono font-bold text-blue-700 text-lg">{formatCurrency(totalQ1)}</p>
          </div>
        )}
        {showQ2 && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2">
            <p className="text-xs text-green-600">Total 2ª Quinzena</p>
            <p className="font-mono font-bold text-green-700 text-lg">{formatCurrency(totalQ2)}</p>
          </div>
        )}
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

      {/* ── Tabela ── */}
      <div className="overflow-auto rounded-xl border border-border bg-card max-h-[65vh]">
        <table className="text-xs w-full" style={{ tableLayout: 'fixed', minWidth: `${tableMinWidth}px` }}>
          <colgroup>
            <col style={{ width: '180px' }} />
            <col style={{ width: '85px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '110px' }} />
            {showQ1 && <>
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '150px' }} />
            </>}
            {showQ2 && <>
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '150px' }} />
            </>}
            <col style={{ width: '110px' }} />
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
              {showQ1 && <th className="p-2 text-center font-bold text-white bg-blue-700" colSpan={4}>1ª QUINZENA</th>}
              {showQ2 && <th className="p-2 text-center font-bold text-white bg-green-700" colSpan={4}>2ª QUINZENA</th>}
              <th className="p-2 text-center font-bold text-white bg-amber-600" rowSpan={2}>BONIFICAÇÕES</th>
              <th className="p-2 text-center font-bold text-white bg-slate-600" colSpan={6}>DADOS BANCÁRIOS</th>
            </tr>
            <tr className="border-b border-border bg-muted/30">
              {showQ1 && <>
                <th className="p-2 text-right font-semibold text-blue-600 text-xs">Á RECEBER</th>
                <th className="p-2 text-right font-semibold text-blue-600 text-xs">DESCONTOS</th>
                <th className="p-2 text-center font-semibold text-blue-600 text-xs">STATUS / DT PAGAMENTO</th>
                <th className="p-2 text-center font-semibold text-blue-600 text-xs">OBS</th>
              </>}
              {showQ2 && <>
                <th className="p-2 text-right font-semibold text-green-600 text-xs">Á RECEBER</th>
                <th className="p-2 text-right font-semibold text-green-600 text-xs">DESCONTOS</th>
                <th className="p-2 text-center font-semibold text-green-600 text-xs">STATUS / DT PAGAMENTO</th>
                <th className="p-2 text-center font-semibold text-green-600 text-xs">OBS</th>
              </>}
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
              const empJR = jobRoles.find(j => j.tangerino_id && String(j.tangerino_id) === String(emp?.job_role_tangerino_id));
              const isMEI = empJR?.payroll_type === 'MOTOCICLISTA_MEI';
              const absence = getAbsenceByPeriod(entry);
              const disc1 = calcPeriodDebits(entry.first_discounts, absence.first) + (isMEI ? (entry.life_insurance || 0) : 0);
              const disc2 = calcPeriodDebits(entry.second_discounts, absence.second);
              return (
                <tr key={entry.id} className={`border-b border-border last:border-0 hover:bg-muted/10 ${idx % 2 === 1 ? 'bg-accent/20' : ''}`}>
                  <td className="p-2 font-medium truncate" title={emp.name}>{emp.name}</td>
                  <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(emp.admission_date)}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={getCompanyName(entry)}>{getCompanyName(entry)}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={getJobRoleName(emp)}>{getJobRoleName(emp)}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={getWorkplaceNames(emp)}>{getWorkplaceNames(emp)}</td>

                  {/* 1ª Quinzena */}
                  {showQ1 && <>
                    <td className={`p-2 text-right font-mono font-semibold whitespace-nowrap ${getFirstNetDisplay(entry, employees, jobRoles) < 0 ? 'text-destructive' : 'text-blue-600'}`}>
                      {formatCurrency(getFirstNetDisplay(entry, employees, jobRoles))}
                    </td>
                    <td className="p-2 text-right font-mono whitespace-nowrap">
                      {disc1 > 0 ? <span className="text-destructive">{formatCurrency(disc1)}</span> : '—'}
                    </td>
                    <td className="p-2">
                      <InlineSelect value={status1} onChange={v => handleStatusChange(entry, 'q1', v)} disabled={false} />
                      {isPago1 && <InlineDatePago value={ps?.payment_date_q1 || ''} onSave={v => updatePayStatus(entry, { payment_date_q1: v })} />}
                    </td>
                    <td className="p-2 overflow-hidden">
                      <InlineObs value={ps?.obs_q1 || ''} onSave={v => updatePayStatus(entry, { obs_q1: v })} disabled={false} />
                    </td>
                  </>}

                  {/* 2ª Quinzena */}
                  {showQ2 && <>
                    <td className="p-2 text-right font-mono font-semibold text-green-600 whitespace-nowrap">
                      {formatCurrency(getSecondNetDisplay(entry, employees, jobRoles))}
                    </td>
                    <td className="p-2 text-right font-mono whitespace-nowrap">
                      {disc2 > 0 ? <span className="text-destructive">{formatCurrency(disc2)}</span> : '—'}
                    </td>
                    <td className="p-2">
                      <InlineSelect value={status2} onChange={v => handleStatusChange(entry, 'q2', v)} disabled={false} />
                      {isPago2 && <InlineDatePago value={ps?.payment_date_q2 || ''} onSave={v => updatePayStatus(entry, { payment_date_q2: v })} />}
                    </td>
                    <td className="p-2 overflow-hidden">
                      <InlineObs value={ps?.obs_q2 || ''} onSave={v => updatePayStatus(entry, { obs_q2: v })} disabled={false} />
                    </td>
                  </>}

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
              <tr><td colSpan={totalCols} className="text-center py-12 text-muted-foreground">
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