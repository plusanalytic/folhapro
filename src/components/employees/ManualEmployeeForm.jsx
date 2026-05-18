import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { UserPlus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

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
  termination_date: '',
  termination_reason: '',
  job_role_tangerino_id: '',
  contract_type: '',
  company_id: '',
  email: '',
  base_salary: '',
  is_esporadico: false,
  // bancários
  bank_name: '',
  bank_agency: '',
  bank_account: '',
  bank_beneficiary: '',
  pix_key: '',
  pix_key_type: '',
};

export default function ManualEmployeeForm({ companies = [], jobRoles = [], onSave, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('dados');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const detectPixKeyType = (key) => {
    if (!key) return '';
    const cleaned = key.replace(/\D/g, '');
    if (/^\d{11}$/.test(cleaned)) return 'CPF';
    if (/^\d{14}$/.test(cleaned)) return 'CNPJ';
    if (/^\+?\d{10,13}$/.test(cleaned) || /^\(\d{2}\)\s?\d{4,5}-?\d{4}$/.test(key)) return 'Telefone';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return 'Email';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return 'Chave Aleatória';
    return '';
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nome é obrigatório.'); setTab('dados'); return; }
    if (!form.cpf_cnpj.trim()) { toast.error('CPF é obrigatório.'); setTab('dados'); return; }
    if (!form.is_esporadico && !form.company_id) { toast.error('Selecione a empresa.'); setTab('dados'); return; }
    if (!form.contract_type) { toast.error('Selecione o tipo de contrato.'); setTab('dados'); return; }

    // Bloqueio de CPF duplicado
    const existing = await base44.entities.Employee.filter({ cpf_cnpj: form.cpf_cnpj.trim() });
    if (existing && existing.length > 0) {
      toast.error(`Já existe um colaborador cadastrado com este CPF: ${existing[0].name}`);
      setTab('dados');
      return;
    }

    setSaving(true);
    try {
      const selectedRole = jobRoles.find(jr => String(jr.id) === form.job_role_tangerino_id);
      const contractType = form.is_esporadico ? 'ESPORADICO' : form.contract_type;

      const payload = {
        name: form.name.trim(),
        cpf_cnpj: form.cpf_cnpj.trim(),
        pis: form.pis.trim() || undefined,
        gender: form.gender || undefined,
        birth_date: form.birth_date || undefined,
        admission_date: form.admission_date || undefined,
        termination_date: form.termination_date || undefined,
        termination_reason: form.termination_reason.trim() || undefined,
        job_role_tangerino_id: selectedRole?.tangerino_id ? String(selectedRole.tangerino_id) : undefined,
        position: selectedRole?.name || undefined,
        contract_type: contractType,
        company_id: form.company_id || undefined,
        email: form.email.trim() || undefined,
        base_salary: form.base_salary ? parseFloat(form.base_salary) : 0,
        bank_name: form.bank_name.trim() || undefined,
        bank_agency: form.bank_agency.trim() || undefined,
        bank_account: form.bank_account.trim() || undefined,
        bank_beneficiary: form.bank_beneficiary.trim() || undefined,
        pix_key: form.pix_key.trim() || undefined,
        pix_key_type: form.pix_key_type || undefined,
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

            {/* Flag Esporádico */}
            <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
              <div>
                <Label className="text-sm font-medium text-orange-800">Prestador Esporádico</Label>
                <p className="text-xs text-orange-600 mt-0.5">Folha por pontos. Empresa não obrigatória.</p>
              </div>
              <Switch
                checked={form.is_esporadico}
                onCheckedChange={v => {
                  set('is_esporadico', v);
                  if (v) set('contract_type', 'ESPORADICO');
                  else if (form.contract_type === 'ESPORADICO') set('contract_type', '');
                }}
              />
            </div>

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

              <Field label="CPF *">
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

              <Field label={form.is_esporadico ? 'Tipo de Contrato' : 'Tipo de Contrato *'}>
                <Select
                  value={form.is_esporadico ? 'ESPORADICO' : form.contract_type}
                  onValueChange={v => set('contract_type', v)}
                  disabled={form.is_esporadico}
                >
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

              <Field label={form.is_esporadico ? 'Empresa (opcional)' : 'Empresa *'}>
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

              <Field label="Data de Demissão">
                <Input
                  type="date"
                  value={form.termination_date}
                  onChange={e => set('termination_date', e.target.value)}
                />
              </Field>

              <div className="col-span-2">
                <Field label="Motivo de Demissão">
                  <Input
                    placeholder="Ex: Pedido de demissão"
                    value={form.termination_reason}
                    onChange={e => set('termination_reason', e.target.value)}
                  />
                </Field>
              </div>
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

              <Field label="Chave PIX">
                <Input
                  placeholder="CPF, e-mail, telefone ou chave aleatória"
                  value={form.pix_key}
                  onChange={e => {
                    const val = e.target.value;
                    const detected = detectPixKeyType(val);
                    setForm(f => ({ ...f, pix_key: val, pix_key_type: detected || f.pix_key_type }));
                  }}
                />
              </Field>

              <Field label="Tipo de Chave PIX">
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.pix_key_type}
                  onChange={e => set('pix_key_type', e.target.value)}
                >
                  <option value="">Selecionar tipo</option>
                  <option value="CPF">CPF</option>
                  <option value="CNPJ">CNPJ</option>
                  <option value="Telefone">Telefone</option>
                  <option value="Email">Email</option>
                  <option value="Chave Aleatória">Chave Aleatória</option>
                </select>
              </Field>
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