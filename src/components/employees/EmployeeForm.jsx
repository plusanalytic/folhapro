import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function EmployeeForm({ employee, companies, onSave, onClose }) {
  const [form, setForm] = useState({
    name: employee?.name || '',
    cpf_cnpj: employee?.cpf_cnpj || '',
    contract_type: employee?.contract_type || 'CLT',
    company_id: employee?.company_id || '',
    base_salary: employee?.base_salary || '',
    position: employee?.position || '',
    admission_date: employee?.admission_date || '',
    bank_name: employee?.bank_name || '',
    bank_agency: employee?.bank_agency || '',
    bank_account: employee?.bank_account || '',
    bank_beneficiary: employee?.bank_beneficiary || '',
    pix_key: employee?.pix_key || '',
    is_active: employee?.is_active !== false,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? 'Editar Colaborador' : 'Novo Colaborador'}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="dados">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
            <TabsTrigger value="bancarios">Dados Bancários</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome Completo *</Label>
                <Input className="mt-1" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome completo" />
              </div>
              <div>
                <Label>CPF / CNPJ *</Label>
                <Input className="mt-1" value={form.cpf_cnpj} onChange={e => set('cpf_cnpj', e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div>
                <Label>Tipo de Contrato *</Label>
                <Select value={form.contract_type} onValueChange={v => set('contract_type', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLT">CLT</SelectItem>
                    <SelectItem value="PJ">PJ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Empresa *</Label>
                <Select value={form.company_id} onValueChange={v => set('company_id', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {companies.filter(c => c.is_active !== false).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cargo</Label>
                <Input className="mt-1" value={form.position} onChange={e => set('position', e.target.value)} placeholder="Cargo / Função" />
              </div>
              <div>
                <Label>Salário Base / Valor Fixo</Label>
                <Input className="mt-1" type="number" step="0.01" value={form.base_salary} onChange={e => set('base_salary', parseFloat(e.target.value) || '')} placeholder="0,00" />
              </div>
              <div>
                <Label>Data de Admissão</Label>
                <Input className="mt-1" type="date" value={form.admission_date} onChange={e => set('admission_date', e.target.value)} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bancarios" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Banco</Label>
                <Input className="mt-1" value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="Nome do banco" />
              </div>
              <div>
                <Label>Agência</Label>
                <Input className="mt-1" value={form.bank_agency} onChange={e => set('bank_agency', e.target.value)} placeholder="0000" />
              </div>
              <div>
                <Label>Conta</Label>
                <Input className="mt-1" value={form.bank_account} onChange={e => set('bank_account', e.target.value)} placeholder="00000-0" />
              </div>
              <div>
                <Label>Favorecido</Label>
                <Input className="mt-1" value={form.bank_beneficiary} onChange={e => set('bank_beneficiary', e.target.value)} placeholder="Nome do favorecido" />
              </div>
              <div className="col-span-2">
                <Label>Chave PIX</Label>
                <Input className="mt-1" value={form.pix_key} onChange={e => set('pix_key', e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={() => onSave(form)} disabled={!form.name || !form.contract_type || !form.company_id}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}