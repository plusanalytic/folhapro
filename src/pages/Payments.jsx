import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, CreditCard, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const STATUS_OPTIONS = ['PENDENTE', 'AGENDADO', 'PAGO', 'BLOQUEADO'];
const STATUS_COLORS = {
  PAGO: 'bg-green-100 text-green-700 border-green-300',
  PENDENTE: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  AGENDADO: 'bg-blue-100 text-blue-700 border-blue-300',
  BLOQUEADO: 'bg-red-100 text-red-700 border-red-300',
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
    // Carrega status de pagamento para o mês
    const ps = await base44.entities.PaymentStatus.filter({ reference_month: selectedMonth });
    setPaymentStatuses(ps);
  };

  useEffect(() => { load(); }, [selectedMonth]);

  const getEmployee = (id) => employees.find(e => e.id === id);
  const getJobRoleName = (emp) => jobRoles.find(jr => String(jr.tangerino_id) === String(emp?.job_role_tangerino_id))?.name || '—';
  const getWorkplaceNames = (emp) => (emp?.workplace_list ?? []).map(id => workplaces.find(w => String(w.tangerino_id) === String(id))?.name).filter(Boolean).join(', ') || '—';
  const getPayStatus = (entryId) => paymentStatuses.find(p => p.payroll_entry_id === entryId);

  const updatePayStatus = useCallback(async (entry, field, value) => {
    const emp = getEmployee(entry.employee_id);
    const existing = paymentStatuses.find(p => p.payroll_entry_id === entry.id);
    setSaving(s => ({ ...s, [entry.id + field]: true }));
    try {
      if (existing) {
        const updated = await base44.entities.PaymentStatus.update(existing.id, { [field]: value });
        setPaymentStatuses(prev => prev.map(p => p.id === existing.id ? { ...p, [field]: value } : p));
      } else {
        const created = await base44.entities.PaymentStatus.create({
          payroll_entry_id: entry.id,
          employee_id: entry.employee_id,
          company_id: emp?.company_id,
          reference_month: selectedMonth,
          [field]: value,
        });
        setPaymentStatuses(prev => [...prev, created]);
      }
    } catch (err) {
      toast.error('Erro ao salvar status de pagamento');
    } finally {
      setSaving(s => ({ ...s, [entry.id + field]: false }));
    }
  }, [paymentStatuses, employees, selectedMonth]);

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
        'Admissão': formatDate(emp?.admission_date),
        'Cargo': getJobRoleName(emp),
        'Local': getWorkplaceNames(emp),
        '1ª Quinzena - Á Receber': entry.first_period_net || 0,
        '1ª Quinzena - Status': ps?.status_q1 || 'PENDENTE',
        '1ª Quinzena - OBS': ps?.obs_q1 || '',
        '1ª Quinzena - Banco/PIX': emp?.pix_key || emp?.bank_account || '',
        '2ª Quinzena - Á Receber': entry.second_period_net || 0,
        '2ª Quinzena - Status': ps?.status_q2 || 'PENDENTE',
        '2ª Quinzena - OBS': ps?.obs_q2 || '',
        '2ª Quinzena - Banco/PIX': emp?.pix_key || emp?.bank_account || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pagamentos');
    XLSX.writeFile(wb, `pagamentos_${selectedMonth}.xlsx`);
  };

  // Somente folhas fechadas
  const filteredEntries = entries.filter(entry => {
    const emp = getEmployee(entry.employee_id);
    if (!emp) return false;
    const ps = getPayStatus(entry.id);
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase());
    const matchCompany = selectedCompany === 'all' || emp.company_id === selectedCompany;
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
        <Select value={selectedCompany} onValueChange={setSelectedCompany}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Empresas</SelectItem>
            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedJobRole} onValueChange={setSelectedJobRole}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Cargo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Cargos</SelectItem>
            {jobRoles.filter(jr => jr.tangerino_id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(jr => (
              <SelectItem key={jr.id} value={String(jr.tangerino_id)}>{jr.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedWorkplace} onValueChange={setSelectedWorkplace}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Local" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Locais</SelectItem>
            {workplaces.filter(w => w.tangerino_id).map(w => (
              <SelectItem key={w.id} value={String(w.tangerino_id)}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{sortedEntries.length} folhas fechadas</span>
          <Button variant="outline" size="sm" onClick={exportXLSX} className="gap-2">
            <Download className="w-4 h-4" /> Exportar XLSX
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-border bg-card max-h-[65vh]">
        <table className="text-xs w-full" style={{ tableLayout: 'fixed', minWidth: '1460px' }}>
          <colgroup>
            <col style={{ width: '180px' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '200px' }} />
            <col style={{ width: '130px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '100px' }} />
            <col style={{ width: '200px' }} />
            <col style={{ width: '130px' }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border">
              <th className="p-2 text-left font-bold text-white bg-primary" rowSpan={2}>COLABORADOR</th>
              <th className="p-2 text-center font-bold text-white bg-primary" rowSpan={2}>ADMISSÃO</th>
              <th className="p-2 text-center font-bold text-white bg-primary" rowSpan={2}>CARGO</th>
              <th className="p-2 text-center font-bold text-white bg-primary" rowSpan={2}>LOCAL</th>
              <th className="p-2 text-center font-bold text-white bg-blue-700" colSpan={4}>1ª QUINZENA</th>
              <th className="p-2 text-center font-bold text-white bg-green-700" colSpan={4}>2ª QUINZENA</th>
            </tr>
            <tr className="border-b border-border bg-muted/30">
              <th className="p-2 text-right font-semibold text-blue-600 text-xs">Á RECEBER</th>
              <th className="p-2 text-center font-semibold text-blue-600 text-xs">STATUS</th>
              <th className="p-2 text-center font-semibold text-blue-600 text-xs">OBS</th>
              <th className="p-2 text-center font-semibold text-blue-600 text-xs">BANCO/PIX</th>
              <th className="p-2 text-right font-semibold text-green-600 text-xs">Á RECEBER</th>
              <th className="p-2 text-center font-semibold text-green-600 text-xs">STATUS</th>
              <th className="p-2 text-center font-semibold text-green-600 text-xs">OBS</th>
              <th className="p-2 text-center font-semibold text-green-600 text-xs">BANCO/PIX</th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry, idx) => {
              const emp = getEmployee(entry.employee_id);
              if (!emp) return null;
              const ps = getPayStatus(entry.id);
              const isPago1 = ps?.status_q1 === 'PAGO';
              const isPago2 = ps?.status_q2 === 'PAGO';
              return (
                <tr key={entry.id} className={`border-b border-border last:border-0 hover:bg-muted/10 ${idx % 2 === 1 ? 'bg-accent/20' : ''}`}>
                  <td className="p-2 font-medium truncate" title={emp.name}>{emp.name}</td>
                  <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(emp.admission_date)}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={getJobRoleName(emp)}>{getJobRoleName(emp)}</td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={getWorkplaceNames(emp)}>{getWorkplaceNames(emp)}</td>
                  {/* 1ª Quinzena */}
                  <td className="p-2 text-right font-mono font-semibold text-blue-600 whitespace-nowrap">{formatCurrency(entry.first_period_net)}</td>
                  <td className="p-2 text-center">
                    <InlineSelect
                      value={ps?.status_q1 || 'PENDENTE'}
                      onChange={v => updatePayStatus(entry, 'status_q1', v)}
                      disabled={isPago1}
                    />
                  </td>
                  <td className="p-2 overflow-hidden">
                    <InlineObs
                      value={ps?.obs_q1 || ''}
                      onSave={v => updatePayStatus(entry, 'obs_q1', v)}
                      disabled={isPago1}
                    />
                  </td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={emp.pix_key || emp.bank_account}>
                    {emp.pix_key || emp.bank_account || '—'}
                  </td>
                  {/* 2ª Quinzena */}
                  <td className="p-2 text-right font-mono font-semibold text-green-600 whitespace-nowrap">{formatCurrency(entry.second_period_net)}</td>
                  <td className="p-2 text-center">
                    <InlineSelect
                      value={ps?.status_q2 || 'PENDENTE'}
                      onChange={v => updatePayStatus(entry, 'status_q2', v)}
                      disabled={isPago2}
                    />
                  </td>
                  <td className="p-2 overflow-hidden">
                    <InlineObs
                      value={ps?.obs_q2 || ''}
                      onSave={v => updatePayStatus(entry, 'obs_q2', v)}
                      disabled={isPago2}
                    />
                  </td>
                  <td className="p-2 text-xs text-muted-foreground truncate" title={emp.pix_key || emp.bank_account}>
                    {emp.pix_key || emp.bank_account || '—'}
                  </td>
                </tr>
              );
            })}
            {sortedEntries.length === 0 && (
              <tr><td colSpan={12} className="text-center py-12 text-muted-foreground">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Nenhuma folha fechada encontrada para este período</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}