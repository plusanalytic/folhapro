import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Copy, Loader2 } from 'lucide-react';

export default function ClonePayrollDialog({ open, onClose, onConfirm, companies = [], employees = [], targetMonth, cloning }) {
  const [scope, setScope] = useState('all');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const activeEmployees = employees.filter(e => e.is_active !== false || e.termination_date);

  const handleConfirm = () => {
    onConfirm({
      scope,
      company_id: scope === 'company' ? selectedCompanyId : undefined,
      employee_id: scope === 'employee' ? selectedEmployeeId : undefined,
    });
  };

  const canConfirm = scope === 'all'
    || (scope === 'company' && selectedCompanyId)
    || (scope === 'employee' && selectedEmployeeId);

  const prevDate = new Date(targetMonth + '-01');
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const fmtM = (m) => { const [y, mo] = m.split('-'); return `${MONTHS_PT[parseInt(mo)-1]}/${y.slice(2)}`; };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-4 h-4" />
            Clonar do Mês Anterior
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <p className="text-sm text-muted-foreground">
            Clonar folhas de <strong>{fmtM(prevMonth)}</strong> para <strong>{fmtM(targetMonth)}</strong>.
            Apenas colaboradores sem lançamento no mês alvo serão clonados.
          </p>

          <div className="space-y-2">
            <Label>Escopo da clonagem</Label>
            <Select value={scope} onValueChange={v => { setScope(v); setSelectedCompanyId(''); setSelectedEmployeeId(''); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as folhas</SelectItem>
                <SelectItem value="company">Apenas uma empresa</SelectItem>
                <SelectItem value="employee">Apenas um colaborador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'company' && (
            <div className="space-y-2">
              <Label>Empresa</Label>
              <SearchableSelect
                value={selectedCompanyId || '_none'}
                onValueChange={v => setSelectedCompanyId(v === '_none' ? '' : v)}
                allLabel="Selecione uma empresa..."
                allValue="_none"
                className="w-full"
                options={[...companies].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(c => ({ value: c.id, label: c.name }))}
              />
            </div>
          )}

          {scope === 'employee' && (
            <div className="space-y-2">
              <Label>Colaborador</Label>
              <SearchableSelect
                value={selectedEmployeeId || '_none'}
                onValueChange={v => setSelectedEmployeeId(v === '_none' ? '' : v)}
                allLabel="Selecione um colaborador..."
                allValue="_none"
                className="w-full"
                options={[...activeEmployees].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(e => ({ value: e.id, label: e.name }))}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={cloning}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || cloning} className="gap-2">
            {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            Clonar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}