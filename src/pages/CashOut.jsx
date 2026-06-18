import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useReadOnly } from '@/lib/AppUserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2, ArrowDownCircle, Search, Pencil, Lock, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/payrollCalculations';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import MultiSearchableSelect from '@/components/ui/MultiSearchableSelect';

function getPeriod(dateStr) {
  const day = parseInt(dateStr.split('-')[2]);
  return day <= 15 ? 'first' : 'second';
}

function getMonthFromDate(dateStr) {
  return dateStr.substring(0, 7);
}

const BLOCKED_STATUSES = ['AGENDADO', 'PAGO', 'RESCISÃO', 'DESLIGADO', 'FÉRIAS', 'AFASTADO', 'SALDO NEGATIVO', 'COBRIDOR'];
const EMPTY_FORM = { company_id: '', employee_id: '', date: '', description: '', amount: '', notes: '', deduct_from_payroll: false };
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const fmtMonth = (m) => { const [y, mo] = m.split('-'); return `${MONTHS_PT[parseInt(mo)-1]}/${y.slice(2)}`; };

export default function CashOut() {
  const readOnly = useReadOnly();
  const [cashOuts, setCashOuts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [filterCompanies, setFilterCompanies] = useState([]);
  const [filterEmployees, setFilterEmployees] = useState([]);
  const [filterMonths, setFilterMonths] = useState(() => {
    const saved = sessionStorage.getItem('filter_month_cashout');
    return saved ? [saved] : [new Date().toISOString().substring(0, 7)];
  });
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [blockedAlert, setBlockedAlert] = useState(null);
  const [deleteInstallDialog, setDeleteInstallDialog] = useState(null); // { cashOut }

  useEffect(() => { sessionStorage.setItem('filter_month_cashout', filterMonths[0] || ''); }, [filterMonths]);

  useEffect(() => {
    Promise.all([
      base44.entities.CashOut.list('-date', 1000),
      base44.entities.Employee.list('name', 2000),
      base44.entities.Company.list('name', 100),
    ]).then(([co, em, cp]) => { setCashOuts(co); setEmployees(em); setCompanies(cp.filter(c => c.is_active !== false)); });
  }, []);

  const employeeMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const companyMap = Object.fromEntries(companies.map(c => [c.id, c]));

  const monthOptions = useMemo(() => {
    const now = new Date();
    const set = new Set();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      set.add(d.toISOString().slice(0, 7));
    }
    cashOuts.forEach(c => { if (c.date) set.add(c.date.substring(0, 7)); });
    return [...set].sort((a, b) => b.localeCompare(a)).map(m => {
      const [y, mo] = m.split('-');
      return { value: m, label: `${MONTHS_PT[parseInt(mo)-1]}/${y.slice(2)}` };
    });
  }, [cashOuts]);

  // Separa por fonte
  const regularCashOuts = cashOuts.filter(c => c.source !== 'payroll_installment');
  const installmentCashOuts = cashOuts.filter(c => c.source === 'payroll_installment');

  const applyFilters = (list) => list.filter(c => {
    const emp = employeeMap[c.employee_id];
    const companyId = emp?.company_id || c.company_id;
    if (filterCompanies.length > 0 && !filterCompanies.includes(companyId)) return false;
    if (filterEmployees.length > 0 && !filterEmployees.includes(c.employee_id)) return false;
    if (filterMonths.length > 0 && !filterMonths.some(m => c.date?.startsWith(m))) return false;
    if (search && !emp?.name?.toLowerCase().includes(search.toLowerCase()) && !c.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredRegular = applyFilters(regularCashOuts);
  const filteredInstallments = applyFilters(installmentCashOuts);

  const formEmployees = form.company_id
    ? employees.filter(e => e.company_id === form.company_id && e.is_active !== false)
    : employees.filter(e => e.is_active !== false);

  const updatePayrollEntry = async (employeeId, referenceMonth) => {
    const payEntries = await base44.entities.PayrollEntry.filter({ employee_id: employeeId, reference_month: referenceMonth });
    if (!payEntries.length) return;
    const entry = payEntries[0];
    const allCashOuts = await base44.entities.CashOut.filter({ employee_id: employeeId, reference_month: referenceMonth });
    const deductCashOuts = allCashOuts.filter(c => c.deduct_from_payroll);
    const firstNonCashout = (entry.first_discounts || []).filter(r => r.source !== 'cashout');
    const secondNonCashout = (entry.second_discounts || []).filter(r => r.source !== 'cashout');
    const firstCashouts = deductCashOuts.filter(c => c.period === 'first').map(c => ({ type: 'debit', label: c.description, amount: c.amount, source: 'cashout', source_id: c.id }));
    const secondCashouts = deductCashOuts.filter(c => c.period === 'second').map(c => ({ type: 'debit', label: c.description, amount: c.amount, source: 'cashout', source_id: c.id }));
    const newFirst = [...firstNonCashout, ...firstCashouts];
    const newSecond = [...secondNonCashout, ...secondCashouts];
    const calcDiscount = (arr) => arr.filter(r => r.type !== 'credit').reduce((s,r) => s + (r.amount||0), 0) - arr.filter(r => r.type === 'credit').reduce((s,r) => s + (r.amount||0), 0);
    const newFirstDiscount = calcDiscount(newFirst);
    const newSecondDiscount = calcDiscount(newSecond);
    const oldFirstDiscount = entry.first_period_discount || 0;
    const oldSecondDiscount = entry.second_period_discount || 0;
    const newFirstNet = Math.round(((entry.first_period_net || 0) - (newFirstDiscount - oldFirstDiscount)) * 100) / 100;
    const newSecondNet = Math.round(((entry.second_period_net || 0) - (newSecondDiscount - oldSecondDiscount)) * 100) / 100;
    await base44.entities.PayrollEntry.update(entry.id, {
      first_discounts: newFirst,
      second_discounts: newSecond,
      first_period_discount: newFirstDiscount,
      second_period_discount: newSecondDiscount,
      first_period_net: newFirstNet,
      second_period_net: newSecondNet,
    });
  };

  const handleSave = async () => {
    if (!form.company_id || !form.date || !form.description || !form.amount) {
      toast.error('Preencha empresa, data, descrição e valor');
      return;
    }
    if (form.deduct_from_payroll && !form.employee_id) {
      toast.error('Selecione um colaborador para descontar da folha');
      return;
    }
    if (form.deduct_from_payroll && form.employee_id && form.date) {
      const refMonth = getMonthFromDate(form.date);
      const period = getPeriod(form.date);
      const payEntries = await base44.entities.PayrollEntry.filter({ employee_id: form.employee_id, reference_month: refMonth });
      if (payEntries.length > 0) {
        const psArr = await base44.entities.PaymentStatus.filter({ payroll_entry_id: payEntries[0].id });
        if (psArr.length > 0) {
          const ps = psArr[0];
          const statusToCheck = period === 'first' ? ps.status_q1 : ps.status_q2;
          if (BLOCKED_STATUSES.includes(statusToCheck)) {
            const periodLabel = period === 'first' ? '1ª Quinzena' : '2ª Quinzena';
            setBlockedAlert({ period: periodLabel, status: statusToCheck, empName: employeeMap[form.employee_id]?.name });
            return;
          }
        }
      }
    }
    setLoading(true);
    const emp = form.employee_id ? employeeMap[form.employee_id] : null;
    const deductFromPayroll = form.deduct_from_payroll && !!form.employee_id;
    const record = {
      company_id: form.company_id || emp?.company_id || '',
      employee_id: form.employee_id || '',
      date: form.date,
      description: form.description,
      amount: parseFloat(form.amount),
      reference_month: getMonthFromDate(form.date),
      period: getPeriod(form.date),
      notes: form.notes || '',
      deduct_from_payroll: deductFromPayroll,
      source: 'cashout',
    };
    if (editingId) {
      const updated = await base44.entities.CashOut.update(editingId, record);
      setCashOuts(prev => prev.map(c => c.id === editingId ? updated : c));
      toast.success('Lançamento atualizado');
    } else {
      const saved = await base44.entities.CashOut.create(record);
      setCashOuts(prev => [saved, ...prev]);
      toast.success('Saída lançada com sucesso');
    }
    if (deductFromPayroll) {
      await updatePayrollEntry(form.employee_id, getMonthFromDate(form.date));
      toast.info('Folha do colaborador atualizada automaticamente');
    }
    setForm(EMPTY_FORM);
    setEmployeeSearch('');
    setEditingId(null);
    setShowForm(false);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    const co = cashOuts.find(c => c.id === id);
    await base44.entities.CashOut.delete(id);
    setCashOuts(prev => prev.filter(c => c.id !== id));
    toast.success('Removido');
    if (co?.deduct_from_payroll && co?.employee_id && co?.reference_month) {
      await updatePayrollEntry(co.employee_id, co.reference_month);
    }
  };

  const openEdit = (c) => {
    const emp = employeeMap[c.employee_id];
    setEditingId(c.id);
    setForm({
      company_id: c.company_id || emp?.company_id || '',
      employee_id: c.employee_id || '',
      date: c.date,
      description: c.description,
      amount: c.amount,
      notes: c.notes || '',
      deduct_from_payroll: c.deduct_from_payroll || false,
    });
    setEmployeeSearch(emp?.name || '');
    setShowForm(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEmployeeSearch('');
    setShowForm(true);
  };

  // Extrai número da parcela a partir da descrição "Desc (2/5)"
  const parseInstallmentLabel = (desc) => {
    const match = desc?.match(/\((\d+)\/(\d+)\)$/);
    if (!match) return null;
    return { current: parseInt(match[1]), total: parseInt(match[2]) };
  };

  const Filters = () => (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar colaborador ou descrição..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <MultiSearchableSelect
            values={filterMonths}
            onValuesChange={setFilterMonths}
            placeholder="Mês"
            className="w-48"
            allLabel="Todos os Meses"
            options={monthOptions}
          />
          <MultiSearchableSelect
            values={filterCompanies}
            onValuesChange={v => { setFilterCompanies(v); setFilterEmployees([]); }}
            placeholder="Empresa"
            className="w-44"
            allLabel="Todas as Empresas"
            options={companies.map(c => ({ value: c.id, label: c.name }))}
          />
          <MultiSearchableSelect
            values={filterEmployees}
            onValuesChange={setFilterEmployees}
            placeholder="Colaborador"
            className="w-52"
            allLabel="Todos os Colaboradores"
            options={(filterCompanies.length > 0 ? employees.filter(e => filterCompanies.includes(e.company_id)) : employees).map(e => ({ value: e.id, label: e.name }))}
          />
        </div>
      </CardContent>
    </Card>
  );

  const CashOutGrid = ({ items, showInstallmentBadge = false }) => (
    <Card>
      <CardContent className="pt-4 pb-2">
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-left px-4 py-3 font-medium">Empresa / Colaborador</th>
                <th className="text-left px-4 py-3 font-medium">Descrição</th>
                {showInstallmentBadge && <th className="text-left px-4 py-3 font-medium">Parcela</th>}
                <th className="text-left px-4 py-3 font-medium">Quinzena</th>
                <th className="text-left px-4 py-3 font-medium">Desconto Folha</th>
                <th className="text-right px-4 py-3 font-medium">Valor</th>
                {!readOnly && !showInstallmentBadge && <th className="w-10" />}
                {showInstallmentBadge && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={showInstallmentBadge ? 8 : 7} className="text-center text-muted-foreground py-10 text-sm">
                    Nenhum lançamento encontrado
                  </td>
                </tr>
              )}
              {items.map(c => {
                const emp = c.employee_id ? employeeMap[c.employee_id] : null;
                const company = companyMap[emp?.company_id || c.company_id];
                const installment = parseInstallmentLabel(c.description);
                const isFirstInstallment = installment?.current === 1;
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{c.date}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{emp?.name ?? <span className="text-muted-foreground italic">Sem colaborador</span>}</p>
                      <p className="text-xs text-muted-foreground">{company?.name ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.description}</td>
                    {showInstallmentBadge && (
                      <td className="px-4 py-3">
                        {installment ? (
                          <div className="flex flex-col gap-1">
                            <Badge className={`text-xs w-fit ${isFirstInstallment ? 'bg-green-100 text-green-700 border-green-300' : 'bg-blue-100 text-blue-700 border-blue-300'}`}>
                              {installment.current}ª / {installment.total}
                            </Badge>
                            {isFirstInstallment && (
                              <span className="text-xs text-green-600 font-medium">✓ Aplicada na folha</span>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {c.period === 'first' ? '1ª Quinzena (1–15)' : '2ª Quinzena (16–30)'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {c.deduct_from_payroll && c.employee_id ? (
                        <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-300">Sim</Badge>
                      ) : isFirstInstallment ? (
                        <Badge className="text-xs bg-green-100 text-green-700 border-green-300">Direto na folha</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Não</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-destructive">
                      - {formatCurrency(c.amount)}
                    </td>
                    <td className="px-2 py-3 flex gap-1">
                      {!readOnly && !showInstallmentBadge && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => openEdit(c)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(c.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                       {/* Parcelas de folha só podem ser excluídas pela folha de pagamento */}
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-destructive/10 rounded-xl flex items-center justify-center">
            <ArrowDownCircle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">Saída de Caixa</h1>
              {filterMonths.length === 1 && <span className="text-sm font-semibold bg-destructive/10 text-destructive px-3 py-1 rounded-full border border-destructive/20">{fmtMonth(filterMonths[0])}</span>}
              {filterMonths.length > 1 && <span className="text-sm font-semibold bg-destructive/10 text-destructive px-3 py-1 rounded-full border border-destructive/20">{filterMonths.length} meses</span>}
            </div>
            <p className="text-sm text-muted-foreground">Lançamentos de saída vinculados a empresas ou colaboradores</p>
          </div>
        </div>
        {!readOnly && (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> Novo Lançamento
          </Button>
        )}
      </div>

      <Filters />

      <Tabs defaultValue="cashout">
        <TabsList className="mb-4">
          <TabsTrigger value="cashout" className="gap-2">
            <ArrowDownCircle className="w-4 h-4" />
            Saída de Caixa
            <Badge variant="secondary" className="ml-1 text-xs">{filteredRegular.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="installments" className="gap-2">
            <CreditCard className="w-4 h-4" />
            Parcelas de Folha
            <Badge variant="secondary" className="ml-1 text-xs">{filteredInstallments.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cashout" className="space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Total no período</p>
                <p className="font-mono font-bold text-destructive text-xl">{formatCurrency(filteredRegular.reduce((s,c) => s + (c.amount||0), 0))}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Lançamentos</p>
                <p className="font-bold text-xl">{filteredRegular.length}</p>
              </CardContent>
            </Card>
          </div>
          <CashOutGrid items={filteredRegular} showInstallmentBadge={false} />
        </TabsContent>

        <TabsContent value="installments" className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
            <CreditCard className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Parcelas geradas pela Folha de Pagamento</p>
              <p className="text-xs mt-0.5 text-blue-700">Estes lançamentos foram criados automaticamente ao parcelar descontos nas folhas. A <strong>1ª parcela</strong> já foi aplicada diretamente na folha; as demais serão descontadas nos meses subsequentes via CashOut.</p>
              <p className="text-xs mt-1 font-semibold text-blue-800">🔒 Para excluir parcelas, acesse a folha de pagamento do colaborador e utilize o botão de exclusão no desconto correspondente.</p>
            </div>
          </div>
          {/* Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Total no período</p>
                <p className="font-mono font-bold text-destructive text-xl">{formatCurrency(filteredInstallments.reduce((s,c) => s + (c.amount||0), 0))}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">Parcelas</p>
                <p className="font-bold text-xl">{filteredInstallments.length}</p>
              </CardContent>
            </Card>
          </div>
          <CashOutGrid items={filteredInstallments} showInstallmentBadge={true} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!blockedAlert} onOpenChange={v => !v && setBlockedAlert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-destructive" />
              Quinzena bloqueada para desconto
            </AlertDialogTitle>
            <AlertDialogDescription>
              Não é possível lançar um desconto em folha para <strong>{blockedAlert?.empName}</strong> na <strong>{blockedAlert?.period}</strong> pois ela já está com status <strong>{blockedAlert?.status}</strong>.
              <br /><br />
              Para lançar este desconto, a quinzena correspondente precisa estar com status <strong>PENDENTE</strong> no módulo de Pagamentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockedAlert(null)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={open => { setShowForm(open); if (!open) { setEmployeeSearch(''); setShowEmployeeDropdown(false); setEditingId(null); } }}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-col overflow-hidden p-0">
          <div className="flex-1 overflow-y-auto p-6">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-xl">{editingId ? 'Editar Lançamento' : 'Novo Lançamento de Saída'}</DialogTitle>
            </DialogHeader>
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <Label>Empresa <span className="text-destructive">*</span></Label>
                <Select value={form.company_id} onValueChange={v => setForm(f => ({ ...f, company_id: v, employee_id: '', deduct_from_payroll: false }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a empresa..." /></SelectTrigger>
                  <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div>
                <Label>Colaborador <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-9"
                    placeholder="Digite para buscar colaborador..."
                    value={employeeSearch}
                    disabled={!form.company_id}
                    onChange={e => { setEmployeeSearch(e.target.value); setShowEmployeeDropdown(true); if (!e.target.value) setForm(f => ({ ...f, employee_id: '', deduct_from_payroll: false })); }}
                    onFocus={() => setShowEmployeeDropdown(true)}
                  />
                  {showEmployeeDropdown && employeeSearch && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {formEmployees.filter(e => e.name.toLowerCase().includes(employeeSearch.toLowerCase())).map(e => (
                        <button key={e.id} type="button" className="w-full text-left px-4 py-2.5 hover:bg-muted text-sm flex flex-col" onClick={() => { setForm(f => ({ ...f, employee_id: e.id })); setEmployeeSearch(e.name); setShowEmployeeDropdown(false); }}>
                          <span className="font-medium">{e.name}</span>
                          <span className="text-xs text-muted-foreground">{e.contract_type}</span>
                        </button>
                      ))}
                      {formEmployees.filter(e => e.name.toLowerCase().includes(employeeSearch.toLowerCase())).length === 0 && (
                        <div className="px-4 py-3 text-sm text-muted-foreground">Nenhum colaborador encontrado</div>
                      )}
                    </div>
                  )}
                </div>
                {form.employee_id && (
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-primary">✓ {employeeMap[form.employee_id]?.name} selecionado</p>
                    <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => { setForm(f => ({ ...f, employee_id: '', deduct_from_payroll: false })); setEmployeeSearch(''); }}>Remover</button>
                  </div>
                )}
                {!form.company_id && <p className="text-xs text-muted-foreground mt-1">Selecione uma empresa primeiro</p>}
              </div>

              <div>
                <Label>Data do lançamento <span className="text-destructive">*</span></Label>
                <Input type="date" className="mt-1 font-mono" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                {form.date && <p className="text-xs text-muted-foreground mt-1">→ {getPeriod(form.date) === 'first' ? '1ª Quinzena (1–15)' : '2ª Quinzena (16–30)'} · {getMonthFromDate(form.date)}</p>}
              </div>

              <div>
                <Label>Descrição <span className="text-destructive">*</span></Label>
                <Input className="mt-1" placeholder="Ex: Adiantamento, empréstimo..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div>
                <Label>Valor (R$) <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.01" className="mt-1 font-mono" placeholder="0,00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>

              <div className={`flex items-center justify-between rounded-lg border p-4 ${!form.employee_id ? 'opacity-50' : ''}`}>
                <div>
                  <p className="font-medium text-sm">Descontar do colaborador</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{form.employee_id ? 'O valor será descontado da folha de pagamento na quinzena correspondente' : 'Selecione um colaborador para habilitar esta opção'}</p>
                </div>
                <Switch checked={form.deduct_from_payroll} disabled={!form.employee_id} onCheckedChange={v => setForm(f => ({ ...f, deduct_from_payroll: v }))} />
              </div>

              <div>
                <Label>Observação</Label>
                <Textarea className="mt-1 resize-none" rows={3} placeholder="Informações adicionais sobre este lançamento..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-border bg-background shrink-0">
            <Button variant="outline" className="flex-1 max-w-xs" onClick={() => { setShowForm(false); setEmployeeSearch(''); setEditingId(null); }}>Cancelar</Button>
            <Button className="flex-1 max-w-xs" onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : editingId ? 'Atualizar Lançamento' : 'Salvar Lançamento'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}