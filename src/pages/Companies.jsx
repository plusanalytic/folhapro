import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Pencil, Building2, Search, Power, RefreshCw, CheckCircle2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import CompanyForm from '@/components/companies/CompanyForm';
import { toast } from 'sonner';

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const load = () => base44.entities.Company.list('-created_date').then(setCompanies);
  useEffect(() => { load(); }, []);

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.cnpj || '').includes(search)
  );

  const handleSave = async (data) => {
    if (editing) {
      await base44.entities.Company.update(editing.id, data);
    } else {
      await base44.entities.Company.create(data);
    }
    setShowForm(false);
    setEditing(null);
    load();
  };

  const toggleActive = async (company) => {
    await base44.entities.Company.update(company.id, { is_active: !company.is_active });
    load();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('syncCompanies', {});
      const data = res.data;
      if (data.success) {
        toast.success(
          `Sincronização concluída! ${data.created} criadas, ${data.updated} atualizadas.`
        );
        load();
      } else {
        toast.error(data.error || 'Erro na sincronização.');
      }
    } catch (err) {
      toast.error('Erro ao conectar com a API do Tangerino.');
    } finally {
      setSyncing(false);
    }
  };

  const totalActive = companies.filter(c => c.is_active !== false).length;
  const totalSynced = companies.filter(c => c.tangerino_id).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empresas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {companies.length} empresa{companies.length !== 1 ? 's' : ''} cadastrada{companies.length !== 1 ? 's' : ''} &bull; {totalActive} ativa{totalActive !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Tangerino'}
          </Button>

        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold">{companies.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ativas</p>
              <p className="text-xl font-bold">{totalActive}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Link2 className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sync Tangerino</p>
              <p className="text-xl font-bold">{totalSynced}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CNPJ..."
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(company => (
          <Card
            key={company.id}
            className={`border-border transition-all hover:border-primary/40 hover:shadow-sm ${!company.is_active ? 'opacity-60' : ''}`}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex gap-1.5 flex-wrap justify-end">
                  <Badge variant={company.is_active !== false ? 'default' : 'secondary'} className="text-xs">
                    {company.is_active !== false ? 'Ativa' : 'Inativa'}
                  </Badge>
                  {company.tangerino_id && (
                    <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50 gap-1">
                      <Link2 className="w-2.5 h-2.5" /> Tangerino
                    </Badge>
                  )}
                </div>
              </div>

              <h3 className="font-semibold text-foreground leading-tight">{company.name}</h3>
              {company.cnpj && (
                <p className="text-xs text-muted-foreground mt-0.5">CNPJ: {company.cnpj}</p>
              )}
              {company.email && (
                <p className="text-xs text-muted-foreground truncate">{company.email}</p>
              )}
              {company.phone && (
                <p className="text-xs text-muted-foreground">{company.phone}</p>
              )}
              {company.address && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{company.address}</p>
              )}
              {company.tangerino_id && (
                <p className="text-xs text-muted-foreground mt-1">
                  ID Tangerino: <span className="font-mono">{company.tangerino_id}</span>
                </p>
              )}

              <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => { setEditing(company); setShowForm(true); }}
                >
                  <Pencil className="w-3 h-3" /> Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => toggleActive(company)}
                >
                  <Power className="w-3 h-3" />
                  {company.is_active !== false ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Nenhuma empresa encontrada</p>
            <p className="text-sm mt-1">
            {search ? 'Tente outro termo de busca.' : 'Use o botão "Sincronizar Tangerino" para importar empresas.'}
            </p>
          </div>
        )}
      </div>

      {showForm && (
        <CompanyForm
          company={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}