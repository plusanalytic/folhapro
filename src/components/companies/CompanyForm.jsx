import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function CompanyForm({ company, onSave, onClose }) {
  const [form, setForm] = useState({
    name: company?.name || '',
    cnpj: company?.cnpj || '',
    address: company?.address || '',
    email: company?.email || '',
    phone: company?.phone || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{company ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Nome da Empresa *</Label>
            <Input className="mt-1" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome da empresa" />
          </div>
          <div>
            <Label>CNPJ</Label>
            <Input className="mt-1" value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <Label>Endereço</Label>
            <Input className="mt-1" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Endereço completo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>E-mail</Label>
              <Input className="mt-1" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@empresa.com" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input className="mt-1" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" onClick={() => onSave(form)} disabled={!form.name}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}