import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Search, UserPlus, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

const PAYROLL_TYPES = [
  { value: 'ESPORADICO', label: 'Esporádico' },
  { value: 'MOTOCICLISTA_CLT', label: 'Motociclista CLT' },
  { value: 'MOTOCICLISTA_MEI', label: 'Motociclista MEI' },
  { value: 'ESCRITORIO', label: 'Escritório' },
  { value: 'SOCIO', label: 'Sócio' },
];

export default function AddEsporadicoDialog({ companyId, referenceMonth, onAdded, onClose }) {
  const [allEsporadicos, setAllEsporadicos] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('list'); // 'list' | 'payroll_type'
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [payrollType, setPayrollType] = useState('ESPORADICO');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.Employee.list().then(list => {
      setAllEsporadicos(list.filter(e => e.contract_type === 'ESPORADICO' && e.is_active !== false));
      setLoading(false);
    });
  }, []);

  const filtered = allEsporadicos.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.cpf_cnpj || '').includes(search)
  );

  const handleSelectEmp = (emp) => {
    setSelectedEmp(emp);
    setPayrollType('ESPORADICO');
    setStep('payroll_type');
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await base44.entities.PayrollEntry.create({
        employee_id: selectedEmp.id,
        company_id: companyId,
        reference_month: referenceMonth,
        base_salary: selectedEmp.base_salary || 0,
        esporadico_payroll_type: payrollType,
        status: 'open',
      });
      toast.success(`${selectedEmp.name} adicionado à folha como "${PAYROLL_TYPES.find(p => p.value === payrollType)?.label}"!`);
      onAdded();
      onClose();
    } catch (err) {
      toast.error('Erro ao adicionar prestador.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            {step === 'payroll_type' && (
              <Button variant="ghost" size="icon" onClick={() => setStep('list')}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            <div>
              <h2 className="text-lg font-semibold">
                {step === 'list' ? 'Adicionar Prestador Esporádico' : `Tipo de Folha — ${selectedEmp?.name}`}
              </h2>
              <p className="text-sm text-muted-foreground">
                {step === 'list' ? 'O mesmo prestador pode ser adicionado para empresas diferentes' : 'Selecione o modelo de folha para este lançamento'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {step === 'list' ? (
          <>
            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nome ou CPF/CNPJ..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {loading && <p className="text-center text-muted-foreground py-8 text-sm">Carregando...</p>}
              {!loading && filtered.length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  Nenhum prestador esporádico encontrado.
                  <br />
                  <span className="text-xs">Cadastre colaboradores com contrato "ESPORÁDICO" em Colaboradores.</span>
                </p>
              )}
              {filtered.map(emp => (
                <div key={emp.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-primary">
                      {emp.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.cpf_cnpj || 'CPF não informado'} · {emp.position || 'Sem cargo'}</p>
                    </div>
                  </div>
                  <Button size="sm" className="gap-1.5" onClick={() => handleSelectEmp(emp)}>
                    <UserPlus className="w-3.5 h-3.5" /> Selecionar
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 p-6 space-y-6">
            <div className="bg-muted/40 rounded-lg px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-sm font-semibold text-primary">
                {selectedEmp?.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">{selectedEmp?.name}</p>
                <p className="text-xs text-muted-foreground">{selectedEmp?.cpf_cnpj || 'CPF não informado'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Modelo de Folha de Pagamento</Label>
              <Select value={payrollType} onValueChange={setPayrollType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYROLL_TYPES.map(pt => (
                    <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Define qual formulário de lançamento será usado para este prestador neste mês.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('list')}>Voltar</Button>
              <Button className="flex-1" onClick={handleConfirm} disabled={saving}>
                {saving ? 'Adicionando...' : 'Confirmar e Adicionar'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}