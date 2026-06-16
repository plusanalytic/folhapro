import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { MapPin, RefreshCw, Search, Building2, CheckCircle, XCircle, Save } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function Workplaces() {
  const [workplaces, setWorkplaces] = useState([]);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState(null);
  // Edições pendentes (não salvas) por id de workplace
  const [pendingEdits, setPendingEdits] = useState({});

  const isDirty = (id) => !!pendingEdits[id];

  const handleDefaultChange = (id, field, value) => {
    setPendingEdits(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
    setWorkplaces(prev => prev.map(w => w.id === id ? { ...w, [field]: value } : w));
  };

  const handleScheduleChange = async (id, value) => {
    setPendingEdits(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), work_schedule: value },
    }));
    setWorkplaces(prev => prev.map(w => w.id === id ? { ...w, work_schedule: value } : w));
  };

  const handleSaveRow = async (id) => {
    const edits = pendingEdits[id];
    if (!edits) return;
    setSavingId(id);
    const normalized = {};
    for (const [k, v] of Object.entries(edits)) {
      if (typeof v === 'boolean') normalized[k] = v;
      else normalized[k] = typeof v === 'string' ? (parseFloat(v.replace(',', '.')) || 0) : v;
    }
    await base44.entities.Workplace.update(id, normalized);
    setWorkplaces(prev => prev.map(w => w.id === id ? { ...w, ...normalized } : w));
    setPendingEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    setSavingId(null);
    toast.success('Local de trabalho salvo com sucesso!');
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

  const NumCell = ({ id, field, value }) => (
    <Input
      type="number"
      step="0.01"
      min="0"
      value={value ?? 0}
      onChange={e => handleDefaultChange(id, field, e.target.value)}
      className={`w-28 text-right font-mono text-xs h-8 ml-auto transition-colors ${
        isDirty(id) ? 'border-amber-400' : ''
      }`}
    />
  );

  const BoolCell = ({ id, field, value }) => (
    <Select
      value={value ? 'sim' : 'nao'}
      onValueChange={v => handleDefaultChange(id, field, v === 'sim')}
    >
      <SelectTrigger className={`w-20 h-8 text-xs ${isDirty(id) ? 'border-amber-400' : ''}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="sim">Sim</SelectItem>
        <SelectItem value="nao">Não</SelectItem>
      </SelectContent>
    </Select>
  );

  const CommonCells = ({ w }) => (
    <>
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
    </>
  );

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

      {/* Tabs por tipo de folha */}
      <Tabs defaultValue="clt_moto">
        <TabsList className="mb-2">
          <TabsTrigger value="clt_moto">🏍️ Motociclista CLT</TabsTrigger>
          <TabsTrigger value="escritorio">🏢 Escritório</TabsTrigger>
        </TabsList>

        {/* ── ABA: Motociclista CLT ── */}
        <TabsContent value="clt_moto">
          <div className="text-xs text-muted-foreground mb-3 px-1">
            Parâmetros padrão para <strong>novos lançamentos</strong> de folha <strong>Motociclista CLT</strong>.
            Os valores são aplicados automaticamente ao lançar ou clonar a folha (podem ser alterados manualmente depois).
          </div>
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
                  <th className="text-right p-4 font-medium text-muted-foreground text-xs">Ajuda Custo Dados</th>
                  <th className="text-center p-4 font-medium text-muted-foreground text-xs">Bon. Entrega</th>
                  <th className="text-center p-4 font-medium text-muted-foreground text-xs">Bon. Meta Entrega</th>
                  <th className="text-center p-4 font-medium text-muted-foreground text-xs">Escala</th>
                  <th className="text-center p-4 font-medium text-muted-foreground text-xs">Ação</th>
                  </tr>
              </thead>
              <tbody>
                {filtered.map(w => (
                  <tr key={w.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <CommonCells w={w} />
                    {['clt_moto_base_salary_default', 'clt_moto_meal_voucher_day_value_default', 'clt_moto_food_voucher_default', 'clt_moto_motorcycle_rental_default', 'clt_moto_cost_allowance_default'].map(field => (
                       <td key={field} className="p-2 text-right">
                         <NumCell id={w.id} field={field} value={w[field]} />
                       </td>
                     ))}
                     <td className="p-2 text-center">
                       <BoolCell id={w.id} field="clt_moto_delivery_bonus_enabled" value={w.clt_moto_delivery_bonus_enabled} />
                     </td>
                     <td className="p-2 text-center">
                       <BoolCell id={w.id} field="clt_moto_delivery_target_bonus_enabled" value={w.clt_moto_delivery_target_bonus_enabled} />
                     </td>
                    <td className="p-2 text-center">
                      <Select
                        value={w.work_schedule || 'seg_sab'}
                        onValueChange={v => handleScheduleChange(w.id, v)}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="seg_sab">Seg – Sáb</SelectItem>
                          <SelectItem value="seg_sex">Seg – Sex</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        size="sm"
                        variant={isDirty(w.id) ? 'default' : 'outline'}
                        className="h-8 gap-1.5 text-xs"
                        disabled={!isDirty(w.id) || savingId === w.id}
                        onClick={() => handleSaveRow(w.id)}
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingId === w.id ? 'Salvando...' : 'Salvar'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-muted-foreground">
                      <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>Nenhum local de trabalho encontrado</p>
                      {!search && <p className="text-sm mt-1">Use "Sincronizar Solides" para importar os locais.</p>}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── ABA: Escritório ── */}
        <TabsContent value="escritorio">
          <div className="text-xs text-muted-foreground mb-3 px-1">
            Parâmetros padrão para <strong>novos lançamentos</strong> de folha <strong>Escritório</strong>.
            Os valores são aplicados automaticamente ao lançar ou clonar a folha. Se a folha já existir e for editada, os valores não são recalculados — prevalece o que o usuário salvou.
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left p-4 font-medium text-muted-foreground">Local de Trabalho</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">CNPJ</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Cidade / Estado</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Código</th>
                  <th className="text-center p-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-right p-4 font-medium text-muted-foreground text-xs">Bon. Produtividade (R$)</th>
                  <th className="text-right p-4 font-medium text-muted-foreground text-xs">Bon. Presença (R$)</th>
                  <th className="text-center p-4 font-medium text-muted-foreground text-xs">Ação</th>
                  </tr>
              </thead>
              <tbody>
                {filtered.map(w => (
                  <tr key={w.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <CommonCells w={w} />
                    {['escritorio_bonus_default', 'escritorio_attendance_bonus_default'].map(field => (
                      <td key={field} className="p-2 text-right">
                        <NumCell id={w.id} field={field} value={w[field]} />
                      </td>
                    ))}
                    <td className="p-2 text-center">
                      <Button
                        size="sm"
                        variant={isDirty(w.id) ? 'default' : 'outline'}
                        className="h-8 gap-1.5 text-xs"
                        disabled={!isDirty(w.id) || savingId === w.id}
                        onClick={() => handleSaveRow(w.id)}
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingId === w.id ? 'Salvando...' : 'Salvar'}
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>Nenhum local de trabalho encontrado</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}