import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link2, MapPin, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

// Inputs definidos FORA do componente pai para evitar perda de foco por remount
function StableInput({ value, onChange, placeholder, className = '' }) {
  return (
    <input
      className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm mt-1 ${className}`}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
    />
  );
}

export default function EmployeeForm({ employee, companies, workplaces = [], jobRoles = [], onSave, onClose, onReload, onDeleted }) {
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

  const [form, setForm] = useState({
    // dados pessoais (editáveis para manuais)
    name: employee?.name || '',
    cpf_cnpj: employee?.cpf_cnpj || '',
    pis: employee?.pis || '',
    gender: employee?.gender || '',
    birth_date: employee?.birth_date || '',
    admission_date: employee?.admission_date || '',
    termination_date: employee?.termination_date || '',
    termination_reason: employee?.termination_reason || '',
    email: employee?.email || '',
    contract_type: employee?.contract_type === 'ESPORADICO' ? employee.contract_type : (employee?.contract_type || ''),
    company_id: employee?.company_id || '',
    base_salary: employee?.base_salary ?? '',
    job_role_tangerino_id: (() => {
      if (!employee?.job_role_tangerino_id) return '';
      const jr = jobRoles.find(r => String(r.tangerino_id) === String(employee.job_role_tangerino_id));
      return jr ? String(jr.id) : '';
    })(),
    // bancários
    bank_name: employee?.bank_name || '',
    bank_agency: employee?.bank_agency || '',
    bank_account: employee?.bank_account || '',
    bank_beneficiary: employee?.bank_beneficiary || '',
    pix_key: employee?.pix_key || '',
    pix_key_type: employee?.pix_key_type || detectPixKeyType(employee?.pix_key || ''),
    is_esporadico: employee?.contract_type === 'ESPORADICO',
  });
  const [syncingWP, setSyncingWP] = useState(false);
  const [localWorkplaceList, setLocalWorkplaceList] = useState(employee?.workplace_list ?? []);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const isManual = !employee?.tangerino_id;

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      // Verificar se tem folhas de pagamento
      const payrolls = await base44.entities.PayrollEntry.filter({ employee_id: employee.id });
      if (payrolls.length > 0) {
        setDeleteError(`Este colaborador possui ${payrolls.length} lançamento(s) de folha de pagamento. Remova os lançamentos antes de excluir.`);
        setDeleting(false);
        return;
      }
      // Verificar se tem saídas de caixa
      const cashouts = await base44.entities.CashOut.filter({ employee_id: employee.id });
      if (cashouts.length > 0) {
        setDeleteError(`Este colaborador possui ${cashouts.length} lançamento(s) de saída de caixa. Remova os lançamentos antes de excluir.`);
        setDeleting(false);
        return;
      }
      // Excluir
      await base44.entities.Employee.delete(employee.id);
      toast.success(`Colaborador "${employee.name}" excluído com sucesso.`);
      onDeleted?.();
      onClose();
    } catch (err) {
      setDeleteError('Erro ao excluir colaborador. Tente novamente.');
      setDeleting(false);
    }
  };

  // Atualização atômica — evita dois setState em sequência (que causaria remount dos inputs)
  const set = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);

  const getCompanyName = (id) => companies.find(c => c.id === id)?.name || '—';

  const getJobRoleName = () => {
    if (employee?.job_role_tangerino_id) {
      const jr = jobRoles.find(r => String(r.tangerino_id) === String(employee.job_role_tangerino_id));
      return jr?.name || employee?.position || '—';
    }
    return employee?.position || '—';
  };

  // De-para: ID Tangerino -> nome do Workplace
  const workplaceById = {};
  for (const w of workplaces) {
    if (w.tangerino_id) workplaceById[String(w.tangerino_id)] = w.name;
  }
  const resolvedWorkplaces = localWorkplaceList
    .map(id => ({ id, name: workplaceById[String(id)] }))
    .filter(item => item.name);

  const handleSyncWorkplace = async () => {
    if (!employee?.id || !employee?.tangerino_id) {
      toast.error('Colaborador não possui ID do Tangerino.');
      return;
    }
    setSyncingWP(true);
    try {
      const res = await base44.functions.invoke('syncEmployeeWorkplace', {
        employee_id: employee.id,
        tangerino_id: employee.tangerino_id,
      });
      const data = res.data;
      if (data.success) {
        setLocalWorkplaceList(data.workplace_list ?? []);
        toast.success(`Locais atualizados! ${data.count} local(is) encontrado(s).`);
        onReload?.();
      } else {
        toast.error(data.error || 'Erro ao atualizar locais.');
      }
    } catch (err) {
      toast.error('Erro ao conectar com a API do Tangerino.');
    } finally {
      setSyncingWP(false);
    }
  };

  const readonlyInput = (label, value) => (
    <div>
      <Label className="text-muted-foreground">{label}</Label>
      <div className="mt-1 px-3 py-2 rounded-md border border-border bg-muted/30 text-sm text-foreground min-h-9">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{employee?.name || 'Colaborador'}</DialogTitle>
            {employee?.tangerino_id && (
              <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50 gap-1">
                <Link2 className="w-2.5 h-2.5" /> Tangerino
              </Badge>
            )}
          </div>
          {employee?.id && <p className="text-xs text-muted-foreground font-mono mt-0.5">ID: {employee.id}</p>}
        </DialogHeader>

        <Tabs defaultValue="dados">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="dados">{isManual ? 'Dados Pessoais' : 'Dados (Tangerino)'}</TabsTrigger>
            <TabsTrigger value="bancarios">Dados Bancários</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4 mt-4">
            {!isManual && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-border">
                Dados sincronizados via Tangerino. Edite diretamente na plataforma Tangerino e sincronize novamente.
              </p>
            )}

            {/* Campo Esporádico */}
            <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
              <div>
                <Label className="text-sm font-medium text-orange-800">Prestador Esporádico</Label>
                <p className="text-xs text-orange-600 mt-0.5">Folha por pontos. Não sincroniza com Tangerino.</p>
              </div>
              <Switch
                checked={form.is_esporadico}
                onCheckedChange={v => set('is_esporadico', v)}
              />
            </div>

            {isManual ? (
              /* ── Campos editáveis para colaboradores manuais ── */
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="mb-1 block">Nome Completo *</Label>
                  <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: João da Silva" />
                </div>

                <div>
                  <Label className="mb-1 block">CPF *</Label>
                  <Input value={form.cpf_cnpj} onChange={e => set('cpf_cnpj', e.target.value)} placeholder="000.000.000-00" />
                </div>
                <div>
                  <Label className="mb-1 block">PIS</Label>
                  <Input value={form.pis} onChange={e => set('pis', e.target.value)} placeholder="000.00000.00-0" />
                </div>

                <div>
                  <Label className="mb-1 block">Gênero</Label>
                  <Select value={form.gender} onValueChange={v => set('gender', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Masculino">Masculino</SelectItem>
                      <SelectItem value="Feminino">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block">Data de Nascimento</Label>
                  <Input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
                </div>

                <div>
                  <Label className="mb-1 block">Data de Admissão</Label>
                  <Input type="date" value={form.admission_date} onChange={e => set('admission_date', e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">E-mail</Label>
                  <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="colaborador@email.com" />
                </div>

                <div className="col-span-2">
                  <Label className="mb-1 block">Cargo</Label>
                  <Select value={form.job_role_tangerino_id} onValueChange={v => set('job_role_tangerino_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o cargo..." /></SelectTrigger>
                    <SelectContent>
                      {[...jobRoles].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(jr => (
                        <SelectItem key={jr.id} value={String(jr.id)}>
                          {jr.name}{jr.payroll_type && <span className="ml-1 text-muted-foreground text-xs">({jr.payroll_type})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-1 block">{form.is_esporadico ? 'Tipo de Contrato' : 'Tipo de Contrato *'}</Label>
                  <Select value={form.is_esporadico ? 'ESPORADICO' : form.contract_type} onValueChange={v => set('contract_type', v)} disabled={form.is_esporadico}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLT">CLT</SelectItem>
                      <SelectItem value="PJ">MEI / PJ</SelectItem>
                      <SelectItem value="ESPORADICO">Esporádico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block">{form.is_esporadico ? 'Empresa (opcional)' : 'Empresa *'}</Label>
                  <Select value={form.company_id} onValueChange={v => set('company_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione a empresa..." /></SelectTrigger>
                    <SelectContent>
                      {[...companies].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-1 block">Salário Base (R$)</Label>
                  <Input type="number" min="0" step="0.01" placeholder="0,00" value={form.base_salary} onChange={e => set('base_salary', e.target.value)} />
                </div>

                <div>
                  <Label className="mb-1 block">Data de Demissão</Label>
                  <Input type="date" value={form.termination_date} onChange={e => set('termination_date', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label className="mb-1 block">Motivo de Demissão</Label>
                  <Input value={form.termination_reason} onChange={e => set('termination_reason', e.target.value)} placeholder="Ex: Pedido de demissão" />
                </div>
              </div>
            ) : (
              /* ── Campos read-only para colaboradores do Tangerino ── */
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">{readonlyInput('Nome Completo', employee?.name)}</div>
                {readonlyInput('CPF', employee?.cpf_cnpj)}
                {readonlyInput('PIS', employee?.pis)}
                {readonlyInput('Gênero', employee?.gender)}
                {readonlyInput('Data de Nascimento', employee?.birth_date)}
                {readonlyInput('Data de Admissão', employee?.admission_date)}
                {employee?.termination_date && (
                  <>
                    {readonlyInput('Data de Demissão', employee.termination_date)}
                    {readonlyInput('Motivo de Demissão', employee.termination_reason || '—')}
                  </>
                )}
                {readonlyInput('Cargo', getJobRoleName())}
                {readonlyInput('Tipo de Contrato', employee?.contract_type)}
                {readonlyInput('Empresa', getCompanyName(employee?.company_id))}
                {readonlyInput('E-mail', employee?.email)}
                <div>
                  <Label className="mb-1 block">Salário Base (R$)</Label>
                  <Input type="number" min="0" step="0.01" placeholder="0,00" value={form.base_salary} onChange={e => set('base_salary', e.target.value)} />
                </div>

                {/* Locais de Trabalho */}
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-muted-foreground">Locais de Trabalho</Label>
                    {employee?.tangerino_id && (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={handleSyncWorkplace} disabled={syncingWP}
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingWP ? 'animate-spin' : ''}`} />
                        {syncingWP ? 'Atualizando...' : 'Atualizar Locais'}
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-9 rounded-md border border-border bg-muted/30 p-2">
                    {resolvedWorkplaces.length > 0
                      ? resolvedWorkplaces.map((item, i) => (
                          <Badge key={i} variant="outline" className="gap-1 text-xs text-blue-700 border-blue-200 bg-blue-50">
                            <MapPin className="w-3 h-3" /> {item.name}
                          </Badge>
                        ))
                      : <span className="text-muted-foreground text-sm">—</span>
                    }
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="bancarios" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Banco</Label>
                <StableInput value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="Nome do banco" />
              </div>
              <div>
                <Label>Agência</Label>
                <StableInput value={form.bank_agency} onChange={e => set('bank_agency', e.target.value)} placeholder="0000" />
              </div>
              <div>
                <Label>Conta</Label>
                <StableInput value={form.bank_account} onChange={e => set('bank_account', e.target.value)} placeholder="00000-0" />
              </div>
              <div>
                <Label>Favorecido</Label>
                <StableInput value={form.bank_beneficiary} onChange={e => set('bank_beneficiary', e.target.value)} placeholder="Nome do favorecido" />
              </div>
              <div>
                <Label>Chave PIX</Label>
                <StableInput
                  value={form.pix_key}
                  onChange={e => {
                    const val = e.target.value;
                    // Detecta o tipo e atualiza tudo em um único setState para evitar remount
                    const detected = detectPixKeyType(val);
                    setForm(f => ({ ...f, pix_key: val, pix_key_type: detected || f.pix_key_type }));
                  }}
                  placeholder="CPF, e-mail, telefone ou chave aleatória"
                />
              </div>
              <div>
                <Label>Tipo de Chave PIX</Label>
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
                {form.pix_key && !form.pix_key_type && (
                  <p className="text-xs text-muted-foreground mt-0.5">Tipo não identificado automaticamente</p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex gap-3 pt-2">
          {isManual && (
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10 gap-1.5"
              onClick={() => { setDeleteError(null); setDeleteConfirm(true); }}
            >
              <Trash2 className="w-4 h-4" /> Excluir
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={() => {
            const { is_esporadico, job_role_tangerino_id, base_salary, ...rest } = form;
            const contract_type = is_esporadico ? 'ESPORADICO' : (rest.contract_type || (employee?.contract_type === 'ESPORADICO' ? 'CLT' : employee?.contract_type));
            const selectedRole = jobRoles.find(jr => String(jr.id) === job_role_tangerino_id);
            const updates = isManual ? {
              ...rest,
              contract_type,
              base_salary: base_salary !== '' ? parseFloat(base_salary) : 0,
              job_role_tangerino_id: selectedRole?.tangerino_id ? String(selectedRole.tangerino_id) : employee?.job_role_tangerino_id,
              position: selectedRole?.name || employee?.position,
              workplace_list: localWorkplaceList,
            } : {
              bank_name: rest.bank_name, bank_agency: rest.bank_agency, bank_account: rest.bank_account,
              bank_beneficiary: rest.bank_beneficiary, pix_key: rest.pix_key, pix_key_type: rest.pix_key_type,
              contract_type, workplace_list: localWorkplaceList,
              base_salary: base_salary !== '' ? parseFloat(base_salary) : (employee?.base_salary ?? 0),
            };
            onSave({ ...employee, ...updates });
          }}>
            Salvar
          </Button>
        </div>
      </DialogContent>

      {/* Dialog de confirmação de exclusão */}
      {deleteConfirm && (
        <Dialog open onOpenChange={() => setDeleteConfirm(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" /> Excluir Colaborador
              </DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir <strong>{employee?.name}</strong>? Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-sm text-destructive">
                {deleteError}
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirm(false)} disabled={deleting}>Cancelar</Button>
              {!deleteError && (
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Excluindo...' : 'Confirmar Exclusão'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}