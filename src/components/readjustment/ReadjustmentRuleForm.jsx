import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';

export default function ReadjustmentRuleForm({ rule, onSave, onClose }) {
  const [companies, setCompanies] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({
    description: rule?.description ?? '',
    reference_month: rule?.reference_month ?? '',
    readjustment_scope: rule?.readjustment_scope ?? 'all',
    company_id: rule?.company_id ?? '',
    employee_id: rule?.employee_id ?? '',
    effective_salary_pct: rule?.effective_salary_pct ?? 3,
    meal_voucher_day_value_pct: rule?.meal_voucher_day_value_pct ?? 30,
    food_voucher_day_value_pct: rule?.food_voucher_day_value_pct ?? 30,
    motorcycle_rental_pct: rule?.motorcycle_rental_pct ?? 5,
    hazard_pay_pct_on_salary: rule?.hazard_pay_pct_on_salary ?? 30,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.Company.filter({ is_active: true }).then(setCompanies);
    base44.entities.Employee.filter({ is_active: true, contract_type: 'CLT' }).then(setEmployees);
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.reference_month) return alert('Informe o mês de referência');
    setSaving(true);
    const data = { ...form };
    if (data.readjustment_scope !== 'company') data.company_id = '';
    if (data.readjustment_scope !== 'employee') data.employee_id = '';
    if (rule?.id) {
      await base44.entities.ReadjustmentRule.update(rule.id, data);
    } else {
      await base44.entities.ReadjustmentRule.create({ ...data, status: 'draft' });
    }
    setSaving(false);
    onSave();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule?.id ? 'Editar Reajuste' : 'Novo Reajuste'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Descrição</Label>
            <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Reajuste Anual Maio 2026" />
          </div>

          <div>
            <Label>Mês de Referência</Label>
            <Input type="month" value={form.reference_month} onChange={e => set('reference_month', e.target.value)} />
          </div>

          <div>
            <Label>Escopo</Label>
            <Select value={form.readjustment_scope} onValueChange={v => set('readjustment_scope', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os colaboradores CLT Moto</SelectItem>
                <SelectItem value="company">Empresa específica</SelectItem>
                <SelectItem value="employee">Colaborador específico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.readjustment_scope === 'company' && (
            <div>
              <Label>Empresa</Label>
              <Select value={form.company_id} onValueChange={v => set('company_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.readjustment_scope === 'employee' && (
            <div>
              <Label>Colaborador</Label>
              <Select value={form.employee_id} onValueChange={v => set('employee_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Percentuais de Reajuste</p>
            {[
              { key: 'effective_salary_pct', label: 'Salário Efetivo (%)' },
              { key: 'meal_voucher_day_value_pct', label: 'Vale Refeição — valor/dia (%)' },
              { key: 'food_voucher_day_value_pct', label: 'Vale Alimentação efetivo (%)' },
              { key: 'motorcycle_rental_pct', label: 'Aluguel da Moto efetivo (%)' },
              { key: 'hazard_pay_pct_on_salary', label: 'Periculosidade sobre salário efetivo (%)' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <Label className="flex-1 text-sm">{label}</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="w-24 text-right"
                  value={form[key]}
                  onChange={e => set(key, parseFloat(e.target.value) || 0)}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}