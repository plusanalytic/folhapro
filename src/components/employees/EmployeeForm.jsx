import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link2, MapPin } from 'lucide-react';

export default function EmployeeForm({ employee, companies, workplaces = [], onSave, onClose }) {
  const [form, setForm] = useState({
    base_salary: employee?.base_salary || '',
    bank_name: employee?.bank_name || '',
    bank_agency: employee?.bank_agency || '',
    bank_account: employee?.bank_account || '',
    bank_beneficiary: employee?.bank_beneficiary || '',
    pix_key: employee?.pix_key || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const getCompanyName = (id) => companies.find(c => c.id === id)?.name || '—';

  // De-para: ID Tangerino -> nome do Workplace
  const workplaceById = {};
  for (const w of workplaces) {
    if (w.tangerino_id) workplaceById[String(w.tangerino_id)] = w.name;
  }
  const resolvedWorkplaces = (employee?.workplace_list ?? [])
    .map(id => workplaceById[String(id)])
    .filter(Boolean);

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
              {readonlyInput('Cargo', employee?.position)}
              {readonlyInput('Tipo de Contrato', employee?.contract_type)}
              {readonlyInput('Empresa', getCompanyName(employee?.company_id))}
              {readonlyInput('E-mail', employee?.email)}
              <div className="col-span-2">
                <Label className="text-muted-foreground">Locais de Trabalho</Label>
                <div className="mt-1 flex flex-wrap gap-2 min-h-9">
                  {resolvedWorkplaces.length > 0
                    ? resolvedWorkplaces.map((name, i) => (
                        <Badge key={i} variant="outline" className="gap-1 text-xs text-blue-700 border-blue-200 bg-blue-50">
                          <MapPin className="w-3 h-3" /> {name}
                        </Badge>
                      ))
                    : <span className="text-muted-foreground text-sm">—</span>
                  }
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Salário Base</Label>
                <Input
                  className="mt-1"
                  type="number"
                  step="0.01"
                  value={form.base_salary}
                  onChange={e => set('base_salary', parseFloat(e.target.value) || '')}
                  placeholder="0,00"
                />
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
          <Button className="flex-1" onClick={() => onSave({ ...employee, ...form })}>
            Salvar Dados Bancários
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}