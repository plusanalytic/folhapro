import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Shield, Plus, Pencil, Trash2, UserCheck, UserX, CheckSquare, Square, Eye, EyeOff } from 'lucide-react';

const ALL_MODULES = [
  { key: 'dashboard',         label: 'Dashboard' },
  { key: 'companies',         label: 'Empresas' },
  { key: 'employees',         label: 'Colaboradores' },
  { key: 'payroll',           label: 'Folha de Pagamento' },
  { key: 'payments',          label: 'Pagamentos' },
  { key: 'cashout',           label: 'Descontos / Cash Out' },
  { key: 'reports',           label: 'Relatórios' },
  { key: 'job-roles',         label: 'Cargos' },
  { key: 'workplaces',        label: 'Locais de Trabalho' },
  { key: 'point-adjustments', label: 'Ajuste de Ponto' },
  { key: 'settings',          label: 'Configurações' },
  { key: 'access',            label: 'Gestão de Acessos' },
  { key: 'readjustment',         label: 'Reajuste Salarial' },
  { key: 'reverse-readjustment', label: 'Redução Salarial' },
  { key: 'payroll-audit-log',    label: 'Log de Auditoria' },
];

const PROFILE_LABELS = {
  admin:  { label: 'Admin',  color: 'bg-purple-100 text-purple-700 border-purple-300' },
  padrao: { label: 'Padrão', color: 'bg-blue-100 text-blue-700 border-blue-300' },
};

const empty = () => ({
  username: '',
  password: '',
  full_name: '',
  user_email: '',
  profile: 'padrao',
  allowed_modules: ALL_MODULES.map(m => m.key),
  is_active: true,
  notes: '',
});

function AccessForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial ? { ...initial } : empty());
  const [saving, setSaving]   = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const toggleModule = (key) => {
    setForm(f => ({
      ...f,
      allowed_modules: f.allowed_modules.includes(key)
        ? f.allowed_modules.filter(k => k !== key)
        : [...f.allowed_modules, key],
    }));
  };

  const handleSave = async () => {
    if (!form.username.trim()) { toast.error('Informe o nome de usuário'); return; }
    if (!form.password.trim()) { toast.error('Informe a senha'); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Usuário (login) *</Label>
          <Input className="mt-1" placeholder="usuario" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">Senha *</Label>
          <div className="relative mt-1">
            <Input
              type={showPwd ? 'text' : 'password'}
              placeholder="••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="pr-8"
            />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPwd(v => !v)}>
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Nome Completo</Label>
          <Input className="mt-1" placeholder="Nome do usuário" value={form.full_name || ''} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">E-mail</Label>
          <Input className="mt-1" placeholder="email@empresa.com" value={form.user_email || ''} onChange={e => setForm(f => ({ ...f, user_email: e.target.value }))} />
        </div>
      </div>

      <div>
        <Label className="text-xs">Perfil de Acesso *</Label>
        <Select value={form.profile} onValueChange={v => setForm(f => ({ ...f, profile: v }))}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin — Leitura, inclusão, alteração e exclusão</SelectItem>
            <SelectItem value="padrao">Padrão — Somente leitura</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Módulos Permitidos</Label>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2 gap-1" onClick={() => setForm(f => ({ ...f, allowed_modules: ALL_MODULES.map(m => m.key) }))}>
              <CheckSquare className="w-3 h-3" /> Todos
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2 gap-1" onClick={() => setForm(f => ({ ...f, allowed_modules: [] }))}>
              <Square className="w-3 h-3" /> Nenhum
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border border-border rounded-lg p-3 bg-muted/20 max-h-48 overflow-y-auto">
          {ALL_MODULES.map(m => {
            const checked = form.allowed_modules.includes(m.key);
            return (
              <label key={m.key} className="flex items-center gap-2 cursor-pointer select-none text-sm rounded px-2 py-1 hover:bg-accent/50" onClick={() => toggleModule(m.key)}>
                <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                  {checked && <span className="text-white text-xs font-bold leading-none">✓</span>}
                </span>
                {m.label}
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={String(form.is_active)} onValueChange={v => setForm(f => ({ ...f, is_active: v === 'true' }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Ativo</SelectItem>
              <SelectItem value="false">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Observações</Label>
          <Input className="mt-1" placeholder="Opcional..." value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  );
}

export default function AccessManagement({ currentAppUser }) {
  const [accesses, setAccesses]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState(null);
  const [search, setSearch]         = useState('');

  const isAdmin = currentAppUser?.profile === 'admin';

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.UserAccess.list();
    setAccesses(data);
    setLoading(false);
  };

  const handleSave = async (form) => {
    if (editing?.id) {
      await base44.entities.UserAccess.update(editing.id, form);
      toast.success('Acesso atualizado!');
    } else {
      await base44.entities.UserAccess.create(form);
      toast.success('Acesso criado!');
    }
    setDialogOpen(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remover este acesso?')) return;
    await base44.entities.UserAccess.delete(id);
    toast.success('Acesso removido!');
    load();
  };

  const handleToggleActive = async (item) => {
    await base44.entities.UserAccess.update(item.id, { is_active: !item.is_active });
    setAccesses(prev => prev.map(a => a.id === item.id ? { ...a, is_active: !a.is_active } : a));
    toast.success(item.is_active ? 'Acesso desativado' : 'Acesso ativado');
  };

  const filtered = accesses.filter(a =>
    (a.username || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.user_email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" /> Gestão de Acessos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie usuários, senhas, perfis e módulos permitidos</p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Usuário
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-purple-600" />
            <span className="font-semibold text-purple-700 text-sm">Perfil Admin</span>
          </div>
          <p className="text-xs text-purple-600">Acesso total: leitura, inclusão, alteração e exclusão em todos os módulos autorizados.</p>
        </div>
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-blue-700 text-sm">Perfil Padrão</span>
          </div>
          <p className="text-xs text-blue-600">Somente leitura: pode visualizar mas não incluir, alterar ou excluir registros.</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Buscar por usuário, nome ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-72" />
        <span className="text-sm text-muted-foreground self-center">{filtered.length} usuário(s)</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="p-3 text-left font-semibold">Usuário</th>
                <th className="p-3 text-left font-semibold">Nome / E-mail</th>
                <th className="p-3 text-center font-semibold">Perfil</th>
                <th className="p-3 text-left font-semibold">Módulos</th>
                <th className="p-3 text-center font-semibold">Status</th>
                {isAdmin && <th className="p-3 text-center font-semibold">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const profile = PROFILE_LABELS[item.profile] || { label: item.profile, color: 'bg-gray-100 text-gray-700 border-gray-300' };
                const modules = (item.allowed_modules || []).map(k => ALL_MODULES.find(m => m.key === k)?.label).filter(Boolean);
                return (
                  <tr key={item.id} className={`border-b border-border last:border-0 hover:bg-muted/10 ${idx % 2 === 1 ? 'bg-accent/10' : ''}`}>
                    <td className="p-3 font-mono font-medium">{item.username}</td>
                    <td className="p-3">
                      <div className="font-medium text-sm">{item.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{item.user_email || ''}</div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-xs font-semibold rounded px-2 py-0.5 border ${profile.color}`}>{profile.label}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {modules.length === ALL_MODULES.length
                          ? <span className="text-xs text-green-600 font-medium">Todos os módulos</span>
                          : modules.length === 0
                            ? <span className="text-xs text-destructive">Nenhum módulo</span>
                            : modules.map(m => <span key={m} className="text-xs bg-muted rounded px-1.5 py-0.5">{m}</span>)
                        }
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {item.is_active
                        ? <span className="text-xs font-semibold text-green-600 bg-green-100 border border-green-300 rounded px-2 py-0.5">Ativo</span>
                        : <span className="text-xs font-semibold text-red-600 bg-red-100 border border-red-300 rounded px-2 py-0.5">Inativo</span>
                      }
                    </td>
                    {isAdmin && (
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => { setEditing(item); setDialogOpen(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title={item.is_active ? 'Desativar' : 'Ativar'} onClick={() => handleToggleActive(item)}>
                            {item.is_active ? <UserX className="w-3.5 h-3.5 text-orange-500" /> : <UserCheck className="w-3.5 h-3.5 text-green-600" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Remover" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="text-center py-12 text-muted-foreground">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Nenhum usuário cadastrado</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              {editing?.id ? 'Editar Usuário' : 'Novo Usuário'}
            </DialogTitle>
          </DialogHeader>
          <AccessForm
            initial={editing}
            onSave={handleSave}
            onClose={() => { setDialogOpen(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}