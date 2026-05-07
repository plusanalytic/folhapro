import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link2, MapPin, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function EmployeeForm({ employee, companies, workplaces = [], jobRoles = [], onSave, onClose, onReload }) {
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
    bank_name: employee?.bank_name || '',
    bank_agency: employee?.bank_agency || '',
    bank_account: employee?.bank_account || '',
    bank_beneficiary: employee?.bank_beneficiary || '',
    pix_key: employee?.pix_key || '',
    pix_key_type: employee?.pix_key_type || detectPixKeyType(employee?.pix_key || ''),
  });
  const [syncingWP, setSyncingWP] = useState(false);
  const [localWorkplaceList, setLocalWorkplaceList] = useState(employee?.workplace_list ?? []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
        </DialogHeader>

        <Tabs defaultValue="dados">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="dados">Dados (Tangerino)</TabsTrigger>
            <TabsTrigger value="bancarios">Dados Bancários</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-border">
              Dados sincronizados via Tangerino. Edite diretamente na plataforma Tangerino e sincronize novamente.
            </p>
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

              {/* Locais de Trabalho com botão de atualizar */}
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-muted-foreground">Locais de Trabalho</Label>
                  {employee?.tangerino_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={handleSyncWorkplace}
                      disabled={syncingWP}
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
              <div>
                <Label>Chave PIX</Label>
                <Input
                  className="mt-1"
                  value={form.pix_key}
                  onChange={e => {
                    const val = e.target.value;
                    set('pix_key', val);
                    const detected = detectPixKeyType(val);
                    if (detected) set('pix_key_type', detected);
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
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={() => onSave({ ...employee, ...form })}>
            Salvar Dados Bancários
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}