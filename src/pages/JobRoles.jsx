import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useReadOnly } from '@/lib/AppUserContext';
import { Briefcase, Save } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/payrollCalculations';
import { toast } from 'sonner';

const PAYROLL_TYPE_LABELS = {
  MOTOCICLISTA_CLT: 'Motociclista CLT',
  MOTOCICLISTA_MEI: 'Motociclista MEI',
  ESCRITORIO: 'Escritório',
  SOCIO: 'Sócio',
};

const PAYROLL_TYPE_COLORS = {
  MOTOCICLISTA_CLT: 'bg-blue-100 text-blue-700 border-blue-200',
  MOTOCICLISTA_MEI: 'bg-orange-100 text-orange-700 border-orange-200',
  ESCRITORIO: 'bg-green-100 text-green-700 border-green-200',
  SOCIO: 'bg-purple-100 text-purple-700 border-purple-200',
};

// Modelos disponíveis
const AVAILABLE_TYPES = ['MOTOCICLISTA_CLT', 'MOTOCICLISTA_MEI', 'ESCRITORIO', 'SOCIO'];
const COMING_SOON_TYPES = [];

export default function JobRoles() {
  const readOnly = useReadOnly();
  const [jobRoles, setJobRoles] = useState([]);
  const [saving, setSaving] = useState({});
  const [salaryEdits, setSalaryEdits] = useState({});

  useEffect(() => {
    base44.entities.JobRole.list().then(setJobRoles);
  }, []);

  const handleTypeChange = async (jobRole, payroll_type) => {
    setSaving(s => ({ ...s, [jobRole.id]: true }));
    try {
      const updated = await base44.entities.JobRole.update(jobRole.id, { payroll_type: payroll_type === 'none' ? null : payroll_type });
      setJobRoles(prev => prev.map(jr => jr.id === jobRole.id ? { ...jr, payroll_type: updated.payroll_type } : jr));
      toast.success(`Cargo "${jobRole.name}" atualizado.`);
    } catch {
      toast.error('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(s => ({ ...s, [jobRole.id]: false }));
    }
  };

  const handleSaveSalary = async (jobRole) => {
    const raw = salaryEdits[jobRole.id];
    if (raw === undefined) return;
    const value = parseFloat(String(raw).replace(',', '.')) || 0;
    setSaving(s => ({ ...s, [`salary_${jobRole.id}`]: true }));
    try {
      await base44.entities.JobRole.update(jobRole.id, { base_salary: value });
      setJobRoles(prev => prev.map(jr => jr.id === jobRole.id ? { ...jr, base_salary: value } : jr));
      setSalaryEdits(s => { const n = { ...s }; delete n[jobRole.id]; return n; });
      toast.success(`Salário base de "${jobRole.name}" salvo.`);
    } catch {
      toast.error('Erro ao salvar salário. Tente novamente.');
    } finally {
      setSaving(s => ({ ...s, [`salary_${jobRole.id}`]: false }));
    }
  };

  const configured = jobRoles.filter(jr => jr.payroll_type);
  const unconfigured = jobRoles.filter(jr => !jr.payroll_type);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cargos e Modelos de Folha</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Associe cada cargo ao modelo de folha de pagamento correspondente.
          </p>
        </div>
        <div className="flex gap-2 text-sm text-muted-foreground">
          <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium">{configured.length} configurados</span>
          <span className="bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-full text-xs font-medium">{unconfigured.length} sem modelo</span>
        </div>
      </div>

      {/* Legenda dos modelos */}
      <div className="flex flex-wrap gap-2 items-center">
        {AVAILABLE_TYPES.map(key => (
          <span key={key} className={`px-3 py-1 rounded-full text-xs font-semibold border ${PAYROLL_TYPE_COLORS[key]}`}>
            {PAYROLL_TYPE_LABELS[key]}
          </span>
        ))}
        {COMING_SOON_TYPES.map(key => (
          <span key={key} className="px-3 py-1 rounded-full text-xs font-semibold border border-dashed border-muted-foreground/30 text-muted-foreground/50">
            {PAYROLL_TYPE_LABELS[key]} (em breve)
          </span>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left p-4 font-medium text-muted-foreground">Cargo</th>
              <th className="text-left p-4 font-medium text-muted-foreground">ID Tangerino</th>
              <th className="text-left p-4 font-medium text-muted-foreground w-64">Modelo de Folha</th>
              <th className="text-left p-4 font-medium text-muted-foreground w-56">Salário Base Padrão</th>
              <th className="text-center p-4 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {jobRoles.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-12 text-muted-foreground">
                  <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Nenhum cargo encontrado.</p>
                  <p className="text-sm mt-1">Sincronize os colaboradores para importar cargos.</p>
                </td>
              </tr>
            )}
            {jobRoles
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
              .map(jr => (
                <tr key={jr.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                        <Briefcase className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium text-foreground">{jr.name}</span>
                    </div>
                  </td>
                  <td className="p-4 font-mono text-xs text-muted-foreground">{jr.tangerino_id || '—'}</td>
                  <td className="p-4">
                    <Select
                      value={jr.payroll_type || 'none'}
                      onValueChange={val => handleTypeChange(jr, val)}
                      disabled={saving[jr.id] || readOnly}
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Selecionar modelo..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Sem modelo —</SelectItem>
                        {AVAILABLE_TYPES.map(key => (
                          <SelectItem key={key} value={key}>{PAYROLL_TYPE_LABELS[key]}</SelectItem>
                        ))}
                        {COMING_SOON_TYPES.map(key => (
                          <SelectItem key={key} value={key} disabled>{PAYROLL_TYPE_LABELS[key]} (em breve)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-32 font-mono text-sm h-8"
                        placeholder="0,00"
                        disabled={readOnly}
                        value={salaryEdits[jr.id] !== undefined ? salaryEdits[jr.id] : (jr.base_salary > 0 ? jr.base_salary : '')}
                        onChange={e => !readOnly && setSalaryEdits(s => ({ ...s, [jr.id]: e.target.value }))}
                        onBlur={() => { if (!readOnly && salaryEdits[jr.id] !== undefined) handleSaveSalary(jr); }}
                        onKeyDown={e => { if (!readOnly && e.key === 'Enter') handleSaveSalary(jr); }}
                      />
                      {salaryEdits[jr.id] !== undefined && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-primary"
                          disabled={saving[`salary_${jr.id}`]}
                          onClick={() => handleSaveSalary(jr)}
                          title="Salvar salário base"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {jr.base_salary > 0 && salaryEdits[jr.id] === undefined && (
                        <span className="text-xs text-muted-foreground font-mono">{formatCurrency(jr.base_salary)}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    {jr.payroll_type ? (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${PAYROLL_TYPE_COLORS[jr.payroll_type]}`}>
                        {PAYROLL_TYPE_LABELS[jr.payroll_type]}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200">
                        Sem modelo
                      </span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}