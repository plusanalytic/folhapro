import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

// Definido FORA do componente para evitar remount a cada keystroke
function Field({ label, children }) {
  return (
    <div>
      <Label className="mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

const EMPTY = {
  name: '',
  cpf_cnpj: '',
  pis: '',
  gender: '',
  birth_date: '',
  admission_date: '',
  job_role_tangerino_id: '',
  contract_type: '',
  company_id: '',
  email: '',
  base_salary: '',
  // bancários
  bank_name: '',
  bank_agency: '',
  bank_account: '',
  bank_beneficiary: '',
  pix_key: '',
};

export default function ManualEmployeeForm({ companies = [], jobRoles = [], onSave, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('dados');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nome é obrigatório.'); setTab('dados'); return; }
    if (!form.company_id) { toast.error('Selecione a empresa.'); setTab('dados'); return; }
    if (!form.contract_type) { toast.error('Selecione o tipo de contrato.'); setTab('dados'); return; }

    // Bloqueio de CPF duplicado
    if (form.cpf_cnpj.trim()) {
      const existing = await base44.entities.Employee.filter({ cpf_cnpj: form.cpf_cnpj.trim() });
      if (existing && existing.length > 0) {
        toast.error(`Já existe um colaborador cadastrado com este CPF: ${existing[0].name}`);
        setTab('dados');
        return;
      }
    }

    setSaving(true);
    try {
      const selectedRole = jobRoles.find(jr => String(jr.id) === form.job_role_tangerino_id);
      const payload = {
        name: form.name.trim(),
        cpf_cnpj: form.cpf_cnpj.trim() || undefined,
        pis: form.pis.trim() || undefined,
        gender: form.gender || undefined,
        birth_date: form.birth_date || undefined,
        admission_date: form.admission_date || undefined,
        job_role_tangerino_id: selectedRole?.tangerino_id ? String(selectedRole.tangerino_id) : undefined,
        position: selectedRole?.name || undefined,
        contract_type: form.contract_type,
        company_id: form.company_id,
        email: form.email.trim() || undefined,
        base_salary: form.base_salary ? parseFloat(form.base_salary) : 0,
        bank_name: form.bank_name.trim() || undefined,
        bank_agency: form.bank_agency.trim() || undefined,
        bank_account: form.bank_account.trim() || undefined,
        bank_beneficiary: form.bank_beneficiary.trim() || undefined,
        pix_key: form.pix_key.trim() || undefined,
        is_active: true,
      };

      await base44.entities.Employee.create(payload);
      toast.success('Colaborador cadastrado com sucesso!');
      onSave?.();
      onClose();
    } catch (err) {
      toast.error('Erro ao salvar colaborador.');
    } finally {
      setSaving(false);
    }
  };

  const sortedRoles = [...jobRoles].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const sortedCompanies = [...companies].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Novo Colaborador
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
            <TabsTrigger value="bancarios">Dados Bancários</TabsTrigger>
          </TabsList>

          {/* ── ABA DADOS ── */}
          <TabsContent value="dados" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Nome Completo *">
                  <Input
                    placeholder="Ex: João da Silva"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                  />
                </Field>
              </div>

              <Field label="CPF">
                <Input
                  placeholder="000.000.000-00"
                  value={form.cpf_cnpj}
                  onChange={e => set('cpf_cnpj', e.target.value)}
                />
              </Field>

              <Field label="PIS">
                <Input
                  placeholder="000.00000.00-0"
                  value={form.pis}
                  onChange={e => set('pis', e.target.value)}
                />
              </Field>

              <Field label="Gênero">
                <Select value={form.gender} onValueChange={v => set('gender', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Masculino">Masculino</SelectItem>
                    <SelectItem value="Feminino">Feminino</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Data de Nascimento">
                <Input
                  type="date"
                  value={form.birth_date}
                  onChange={e => set('birth_date', e.target.value)}
                />
              </Field>

              <Field label="Data de Admissão">
                <Input
                  type="date"
                  value={form.admission_date}
                  onChange={e => set('admission_date', e.target.value)}
                />
              </Field>

              <Field label="E-mail">
                <Input
                  type="email"
                  placeholder="colaborador@email.com"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                />
              </Field>

              <div className="col-span-2">
                <Field label="Cargo (Solides / Tangerino)">
                  <Select value={form.job_role_tangerino_id} onValueChange={v => set('job_role_tangerino_id', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cargo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedRoles.map(jr => (
                        <SelectItem key={jr.id} value={String(jr.id)}>
                          {jr.name}
                          {jr.payroll_type && (
                            <span className="ml-1 text-muted-foreground text-xs">({jr.payroll_type})</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Tipo de Contrato *">
                <Select value={form.contract_type} onValueChange={v => set('contract_type', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLT">CLT</SelectItem>
                    <SelectItem value="PJ">MEI / PJ</SelectItem>
                    <SelectItem value="ESPORADICO">Esporádico</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Empresa *">
                <Select value={form.company_id} onValueChange={v => set('company_id', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a empresa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedCompanies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Salário Base (R$)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={form.base_salary}
                  onChange={e => set('base_salary', e.target.value)}
                />
              </Field>
            </div>
          </TabsContent>

          {/* ── ABA BANCÁRIOS ── */}
          <TabsContent value="bancarios" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Banco">
                <Input
                  placeholder="Nome do banco"
                  value={form.bank_name}
                  onChange={e => set('bank_name', e.target.value)}
                />
              </Field>

              <Field label="Agência">
                <Input
                  placeholder="0000"
                  value={form.bank_agency}
                  onChange={e => set('bank_agency', e.target.value)}
                />
              </Field>

              <Field label="Conta">
                <Input
                  placeholder="00000-0"
                  value={form.bank_account}
                  onChange={e => set('bank_account', e.target.value)}
                />
              </Field>

              <Field label="Favorecido">
                <Input
                  placeholder="Nome do favorecido"
                  value={form.bank_beneficiary}
                  onChange={e => set('bank_beneficiary', e.target.value)}
                />
              </Field>

              <div className="col-span-2">
                <Field label="Chave PIX">
                  <Input
                    placeholder="CPF, e-mail, telefone ou chave aleatória"
                    value={form.pix_key}
                    onChange={e => set('pix_key', e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex gap-3 pt-2 border-t border-border mt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Cadastrar Colaborador'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}