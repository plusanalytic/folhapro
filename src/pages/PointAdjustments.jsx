import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Download, Search, Calendar, Clock, User, ChevronLeft, ChevronRight } from 'lucide-react';
import ImportProgressDialog from '@/components/pointadjustments/ImportProgressDialog';

const PAGE_SIZE = 50;

export default function PointAdjustments() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [page, setPage] = useState(1);
  const [importDialog, setImportDialog] = useState(null); // null | 'full' | 'daily'
  const [employees, setEmployees] = useState([]);
  const [companies, setCompanies] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [recs, emps, comps] = await Promise.all([
      base44.entities.PointAdjustment.list('-date', 5000),
      base44.entities.Employee.list(),
      base44.entities.Company.list(),
    ]);
    setRecords(recs);
    setEmployees(emps);
    setCompanies(comps);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Lookups
  const employeeMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const companyMap = Object.fromEntries(companies.map(c => [c.id, c]));

  // Filtros
  const filtered = records.filter(r => {
    const name = (r.employee_name || employeeMap[r.employee_id]?.name || '').toLowerCase();
    const type = (r.type || '').toLowerCase();
    const reason = (r.reason || '').toLowerCase();
    const q = search.toLowerCase();
    const matchSearch = !q || name.includes(q) || type.includes(q) || reason.includes(q);
    const matchDate = !filterDate || r.date === filterDate;
    return matchSearch && matchDate;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleImportDone = () => { load(); };

  const statusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('aprova') || s === 'approved') return 'bg-green-100 text-green-700 dark:bg-green-900/30';
    if (s.includes('pendent') || s === 'pending') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30';
    if (s.includes('reject') || s.includes('recusa')) return 'bg-red-100 text-red-700 dark:bg-red-900/30';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ajustes de Ponto</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {loading ? 'Carregando...' : `${records.length} registros importados`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportDialog('daily')} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Sync Diário
          </Button>
          <Button size="sm" onClick={() => setImportDialog('full')} className="gap-2">
            <Download className="w-4 h-4" />
            Importar Histórico Completo
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: records.length, color: 'text-foreground' },
          { label: 'Hoje', value: records.filter(r => r.date === new Date().toISOString().slice(0,10)).length, color: 'text-blue-600' },
          { label: 'Este Mês', value: records.filter(r => r.date?.slice(0,7) === new Date().toISOString().slice(0,7)).length, color: 'text-primary' },
          { label: 'Filtrados', value: filtered.length, color: 'text-orange-600' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por colaborador, tipo, motivo..."
                className="pl-9"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Input
                type="date"
                className="w-44"
                value={filterDate}
                onChange={e => { setFilterDate(e.target.value); setPage(1); }}
              />
              {filterDate && (
                <Button variant="ghost" size="sm" onClick={() => setFilterDate('')} className="text-xs px-2">
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>Registros de Ajuste</span>
            <span className="text-sm font-normal text-muted-foreground">{filtered.length} resultado(s)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Carregando registros...</span>
            </div>
          ) : paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Calendar className="w-8 h-8 opacity-40" />
              <p className="text-sm">Nenhum registro encontrado</p>
              <p className="text-xs">Use "Importar Histórico Completo" para buscar os dados do Tangerino</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground">Colaborador</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Hora</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Motivo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Aprovado Por</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r, i) => {
                    const empName = r.employee_name || employeeMap[r.employee_id]?.name || '—';
                    return (
                      <tr key={r.id} className={`border-b border-border hover:bg-muted/20 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium text-foreground">{empName}</span>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">
                          {r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {r.time || '—'}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs font-normal">
                            {r.type || '—'}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground max-w-xs truncate" title={r.reason}>
                          {r.reason || '—'}
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}>
                            {r.status || '—'}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{r.approved_by || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages} — {filtered.length} registros
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de importação */}
      {importDialog && (
        <ImportProgressDialog
          open={!!importDialog}
          mode={importDialog}
          onClose={() => setImportDialog(null)}
          onDone={handleImportDone}
        />
      )}
    </div>
  );
}