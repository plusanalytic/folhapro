import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, getMonthName } from '@/lib/payrollCalculations';
import { toast } from 'sonner';

const STATUS_OPTIONS = ['PENDENTE', 'AGENDADO', 'PAGO', 'BLOQUEADO'];

const STATUS_COLORS = {
  PENDENTE:  'bg-yellow-100 text-yellow-700 border-yellow-300',
  AGENDADO:  'bg-blue-100 text-blue-700 border-blue-300',
  PAGO:      'bg-green-100 text-green-700 border-green-300',
  BLOQUEADO: 'bg-red-100 text-red-700 border-red-300',
};

function InlineStatusSelect({ value, onChange, disabled }) {
  return (
    <select
      className={`text-xs font-semibold border rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring ${STATUS_COLORS[value] || 'bg-muted text-muted-foreground border-border'}`}
      value={value || 'PENDENTE'}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    >
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

function InlineObsInput({ value, onChange, disabled }) {
  const [local, setLocal] = useState(value || '');
  const [editing, setEditing] = useState(false);

  useEffect(() => { setLocal(value || ''); }, [value]);

  if (disabled) return <span className="text-xs text-muted-foreground">{value || '—'}</span>;

  return editing ? (
    <input
      autoFocus
      className="text-xs border border-primary/40 rounded px-2 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-primary"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { onChange(local); setEditing(false); }}
      onKeyDown={e => { if (e.key === 'Enter') { onChange(local); setEditing(false); } if (e.key === 'Escape') { setLocal(value || ''); setEditing(false); } }}
    />
  ) : (
    <span
      className="text-xs text-muted-foreground cursor-pointer hover:text-foreground hover:underline min-w-[60px] inline-block"
      onClick={() => setEditing(true)}
      title="Clique para editar"
    >
      {local || <span className="italic">Adicionar obs...</span>}
    </span>
  );
}

export default function Payments() {
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [jobRoles, setJobRoles] = useState([]);
  const [entries, setEntries] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedWorkplace, setSelectedWorkplace] = useState('all');
  const [selectedJobRole, setSelectedJobRole] = useState('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState({});

  const load = async () => {
    const [e, c, w, jr, p, pay] = await Promise.all([
      base44.entities.Employee.list(),
      base44.entities.Company.list(),
      base44.entities.Workplace.list(),
      base44.entities.JobRole.list(),
      base44.entities.PayrollEntry.filter({ reference_month: selectedMonth }),
      base44.entities.PayrollPayment.filter({ reference_month: selectedMonth }),
    ]);
    setEmployees(e);
    setCompanies(c.filter(x => x.is_active !== false));
    setWorkplaces(w);
    setJobRoles(jr);
    // Apenas lançamentos fechados aparecem aqui
    setEntries(p.filter(x => x.status === 'closed'));
    setPayments(pay);
  };

  useEffect(() => { load(); }, [selectedMonth]);

  const FIRST_MONTH = '2026-04';
  const months = [];
  {
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
  }

  const getEmployee = (id) => employees.find(e => e.id === id);
  const getCompany = (id) => companies.find(c => c.id === id);
  const getJobRoleName = (emp) => {
    if (!emp?.job_role_tangerino_id) return '—';
    const jr = jobRoles.find(j => j.tangerino_id && String(j.tangerino_id) === String(emp.job_role_tangerino_id));
    return jr?.name || emp?.position || '—';
  };
  const getWorkplaceNames = (emp) => {
    if (!emp?.workplace_list?.length) return '—';
    return emp.workplace_list.map(id => workplaces.find(w => w.tangerino_id && String(w.tangerino_id) === String(id))?.name).filter(Boolean).join(', ') || '—';
  };
  const getPayment = (entryId) => payments.find(p => p.payroll_entry_id === entryId);

  const rows = entries.map(entry => {
    const emp = getEmployee(entry.employee_id);
    if (!emp) return null;
    const company = getCompany(emp.company_id);
    return { entry, emp, company };
  }).filter(Boolean);

  const filteredRows = rows.filter(({ emp }) => {
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase());
    const matchCompany = selectedCompany === 'all' || emp.company_id === selectedCompany;
    const matchWorkplace = selectedWorkplace === 'all' || (emp.workplace_list ?? []).map(String).includes(selectedWorkplace);
    const matchJobRole = selectedJobRole === 'all' || String(emp.job_role_tangerino_id) === selectedJobRole;
    return matchSearch && matchCompany && matchWorkplace && matchJobRole;
  }).sort((a, b) => a.emp.name.localeCompare(b.emp.name, 'pt-BR'));

  const updatePayment = async (entryId, empId, field, value) => {
    const key = `${entryId}-${field}`;
    setSaving(s => ({ ...s, [key]: true }));
    try {
      const existing = getPayment(entryId);
      if (existing) {
        // Não permite reabrir se já PAGO (segurança)
        if (field === 'status_first' && existing.status_first === 'PAGO' && value !== 'PAGO') {
          const entry = entries.find(e => e.id === entryId);
          if (entry?.status === 'closed') {
            toast.error('Pagamento 1ª quinzena já registrado como PAGO. Não é possível alterar.');
            return;
          }
        }
        if (field === 'status_second' && existing.status_second === 'PAGO' && value !== 'PAGO') {
          const entry = entries.find(e => e.id === entryId);
          if (entry?.status === 'closed') {
            toast.error('Pagamento 2ª quinzena já registrado como PAGO. Não é possível alterar.');
            return;
          }
        }
        const updated = await base44.entities.PayrollPayment.update(existing.id, { [field]: value });
        setPayments(prev => prev.map(p => p.id === existing.id ? { ...p, [field]: value } : p));
      } else {
        const created = await base44.entities.PayrollPayment.create({
          payroll_entry_id: entryId,
          employee_id: empId,
          company_id: employees.find(e => e.id === empId)?.company_id,
          reference_month: selectedMonth,
          status_first: 'PENDENTE',
          status_second: 'PENDENTE',
          [field]: value,
        });
        setPayments(prev => [...prev, created]);
      }
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  };

  // Totais
  const totalQ1 = filteredRows.reduce((s, r) => s + (r.entry.first_period_net || 0), 0);
  const totalQ2 = filteredRows.reduce((s, r) => s + (r.entry.second_period_net || 0), 0);
  const totalLiq = totalQ1 + totalQ2;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pagamentos</h1>
        <p className="text-muted-foreground text-sm mt-1">Controle de pagamentos por quinzena — apenas folhas fechadas</p>
      </div>

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
        <Select value={selectedWorkplace} onValueChange={setSelectedWorkplace}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Local" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Locais</SelectItem>
            {workplaces.filter(w => w.tangerino_id).map(w => (
              <SelectItem key={w.id} value={String(w.tangerino_id)}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedJobRole} onValueChange={setSelectedJobRole}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Cargo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Cargos</SelectItem>
            {jobRoles.filter(jr => jr.tangerino_id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(jr => (
              <SelectItem key={jr.id} value={String(jr.tangerino_id)}>{jr.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar colaborador..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-blue-50 p-3 text-center">
          <p className="text-xs text-muted-foreground">Total 1ª Quinzena</p>
          <p className="font-mono font-bold text-blue-700 text-lg">{formatCurrency(totalQ1)}</p>
        </div>
        <div className="rounded-lg border border-border bg-green-50 p-3 text-center">
          <p className="text-xs text-muted-foreground">Total 2ª Quinzena</p>
          <p className="font-mono font-bold text-green-700 text-lg">{formatCurrency(totalQ2)}</p>
        </div>
        <div className="rounded-lg border border-border bg-primary/10 p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Líquido</p>
          <p className="font-mono font-bold text-primary text-lg">{formatCurrency(totalLiq)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-auto max-h-[65vh]">
          <table className="text-xs w-full min-w-max">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-primary text-white">
                <th className="p-2 text-left font-medium whitespace-nowrap">NOME</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">EMPRESA</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">CARGO</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">LOCAL</th>
                <th className="p-2 text-right font-medium whitespace-nowrap bg-blue-700">Á RECEBER 1ª Q.</th>
                <th className="p-2 text-center font-medium whitespace-nowrap bg-blue-600">STATUS 1ª Q.</th>
                <th className="p-2 text-left font-medium whitespace-nowrap bg-blue-500">OBS 1ª Q.</th>
                <th className="p-2 text-right font-medium whitespace-nowrap bg-green-700">Á RECEBER 2ª Q.</th>
                <th className="p-2 text-center font-medium whitespace-nowrap bg-green-600">STATUS 2ª Q.</th>
                <th className="p-2 text-left font-medium whitespace-nowrap bg-green-500">OBS 2ª Q.</th>
                <th className="p-2 text-right font-medium whitespace-nowrap">TOTAL LÍQUIDO</th>
                <th className="p-2 text-left font-medium whitespace-nowrap border-l border-white/20">BANCO</th>
                <th className="p-2 text-left font-medium whitespace-nowrap">PIX</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ entry, emp, company }, idx) => {
                const pay = getPayment(entry.id);
                const statusFirst = pay?.status_first || 'PENDENTE';
                const statusSecond = pay?.status_second || 'PENDENTE';
                const liquidoTotal = (entry.first_period_net || 0) + (entry.second_period_net || 0);
                const isPagoFirst = statusFirst === 'PAGO';
                const isPagoSecond = statusSecond === 'PAGO';
                return (
                  <tr key={entry.id} className={`border-b border-border last:border-0 hover:bg-muted/10 transition-colors ${idx % 2 === 1 ? 'bg-accent/20' : ''}`}>
                    <td className="p-2 font-medium whitespace-nowrap max-w-[180px] truncate" title={emp.name}>{emp.name}</td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap text-xs">{company?.name || '—'}</td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap text-xs max-w-[130px] truncate">{getJobRoleName(emp)}</td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap text-xs max-w-[120px] truncate">{getWorkplaceNames(emp)}</td>
                    <td className="p-2 text-right font-mono font-semibold text-blue-600 whitespace-nowrap">{formatCurrency(entry.first_period_net)}</td>
                    <td className="p-2 text-center whitespace-nowrap">
                      <InlineStatusSelect
                        value={statusFirst}
                        onChange={v => updatePayment(entry.id, emp.id, 'status_first', v)}
                        disabled={isPagoFirst}
                      />
                    </td>
                    <td className="p-2 whitespace-nowrap min-w-[120px]">
                      <InlineObsInput
                        value={pay?.obs_first}
                        onChange={v => updatePayment(entry.id, emp.id, 'obs_first', v)}
                        disabled={isPagoFirst}
                      />
                    </td>
                    <td className="p-2 text-right font-mono font-semibold text-green-600 whitespace-nowrap">{formatCurrency(entry.second_period_net)}</td>
                    <td className="p-2 text-center whitespace-nowrap">
                      <InlineStatusSelect
                        value={statusSecond}
                        onChange={v => updatePayment(entry.id, emp.id, 'status_second', v)}
                        disabled={isPagoSecond}
                      />
                    </td>
                    <td className="p-2 whitespace-nowrap min-w-[120px]">
                      <InlineObsInput
                        value={pay?.obs_second}
                        onChange={v => updatePayment(entry.id, emp.id, 'obs_second', v)}
                        disabled={isPagoSecond}
                      />
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-primary whitespace-nowrap">{formatCurrency(liquidoTotal)}</td>
                    <td className="p-2 whitespace-nowrap border-l border-border text-xs">{emp.bank_name || '—'}</td>
                    <td className="p-2 font-mono text-xs whitespace-nowrap">{emp.pix_key || '—'}</td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr><td colSpan={13} className="text-center py-10 text-muted-foreground">
                  Nenhuma folha fechada para este período
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}