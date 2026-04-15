import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Pencil, Building2, Search, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import CompanyForm from '@/components/companies/CompanyForm';

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empresas</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie as empresas clientes</p>
        </div>
        <Button onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Empresa
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar empresa..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(company => (
          <Card key={company.id} className={`border-border transition-all hover:border-primary/30 ${!company.is_active ? 'opacity-60' : ''}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex gap-1.5">
                  <Badge variant={company.is_active !== false ? 'default' : 'secondary'} className="text-xs">
                    {company.is_active !== false ? 'Ativa' : 'Inativa'}
                  </Badge>
                </div>
              </div>
              <h3 className="font-semibold text-foreground">{company.name}</h3>
              {company.cnpj && <p className="text-xs text-muted-foreground mt-0.5">CNPJ: {company.cnpj}</p>}
              {company.email && <p className="text-xs text-muted-foreground">{company.email}</p>}
              {company.phone && <p className="text-xs text-muted-foreground">{company.phone}</p>}
              <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => { setEditing(company); setShowForm(true); }}>
                  <Pencil className="w-3 h-3" /> Editar
                </Button>
                <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => toggleActive(company)}>
                  <Power className="w-3 h-3" /> {company.is_active !== false ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nenhuma empresa encontrada</p>
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