import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { MapPin, RefreshCw, Search, Building2, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

export default function Workplaces() {
  const [workplaces, setWorkplaces] = useState([]);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [savingField, setSavingField] = useState(null); // `${id}-${field}`

  const handleDefaultChange = (id, field, value) => {
    setWorkplaces(prev => prev.map(w => w.id === id ? { ...w, [field]: value } : w));
  };

  const handleDefaultBlur = async (id, field, value) => {
    const key = `${id}-${field}`;
    setSavingField(key);
    const num = parseFloat(String(value).replace(',', '.')) || 0;
    await base44.entities.Workplace.update(id, { [field]: num });
    setWorkplaces(prev => prev.map(w => w.id === id ? { ...w, [field]: num } : w));
    setSavingField(null);
  };

  const load = async () => {
    const data = await base44.entities.Workplace.list();
    setWorkplaces(data);
  };

  useEffect(() => { load(); }, []);

  const filtered = workplaces
    .filter(w => w.name?.toLowerCase().includes(search.toLowerCase()) || (w.cnpj || '').includes(search))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

  const totalActive = workplaces.filter(w => w.is_active !== false).length;
  const totalInactive = workplaces.filter(w => w.is_active === false).length;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('syncWorkplaces', {});
      const data = res.data;
      if (data.success) {
        toast.success(`Sincronização concluída! ${data.created} criados, ${data.updated} atualizados.`);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Locais de Trabalho</h1>
          <p className="text-muted-foreground text-sm mt-1">{workplaces.length} registros importados</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando...' : 'Sincronizar Solides'}
        </Button>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold text-foreground">{workplaces.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ativos</p>
              <p className="text-xl font-bold text-green-600">{totalActive}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inativos</p>
              <p className="text-xl font-bold text-red-600">{totalInactive}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome ou CNPJ..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left p-4 font-medium text-muted-foreground">Local de Trabalho</th>
              <th className="text-left p-4 font-medium text-muted-foreground">CNPJ</th>
              <th className="text-left p-4 font-medium text-muted-foreground">Cidade / Estado</th>
              <th className="text-left p-4 font-medium text-muted-foreground">Código</th>
              <th className="text-center p-4 font-medium text-muted-foreground">Status</th>
              <th className="text-right p-4 font-medium text-muted-foreground text-xs">Sal. Base CLT Moto</th>
              <th className="text-right p-4 font-medium text-muted-foreground text-xs">VR/dia CLT Moto</th>
              <th className="text-right p-4 font-medium text-muted-foreground text-xs">VA CLT Moto</th>
              <th className="text-right p-4 font-medium text-muted-foreground text-xs">Aluguel Moto</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(w => (
              <tr key={w.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <span className="font-medium text-foreground">{w.name}</span>
                  </div>
                </td>
                <td className="p-4 text-muted-foreground font-mono text-xs">{w.cnpj || '—'}</td>
                <td className="p-4 text-muted-foreground">
                  {w.city && w.state ? `${w.city} / ${w.state}` : w.city || w.state || '—'}
                </td>
                <td className="p-4 text-muted-foreground">{w.code || '—'}</td>
                <td className="p-4 text-center">
                  <Badge variant={w.is_active !== false ? 'outline' : 'secondary'} className="text-xs">
                    {w.is_active !== false ? 'Ativo' : 'Inativo'}
                  </Badge>
                </td>
                {['clt_moto_base_salary_default', 'clt_moto_meal_voucher_day_value_default', 'clt_moto_food_voucher_default', 'clt_moto_motorcycle_rental_default'].map(field => (
                  <td key={field} className="p-2 text-right">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={w[field] ?? 0}
                      onChange={e => handleDefaultChange(w.id, field, e.target.value)}
                      onBlur={e => handleDefaultBlur(w.id, field, e.target.value)}
                      className={`w-28 text-right font-mono text-xs h-8 ml-auto transition-colors ${
                        savingField === `${w.id}-${field}` ? 'border-primary' : ''
                      }`}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-muted-foreground">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Nenhum local de trabalho encontrado</p>
                  {!search && <p className="text-sm mt-1">Use "Sincronizar Solides" para importar os locais.</p>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}