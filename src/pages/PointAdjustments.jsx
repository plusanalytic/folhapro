import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Download, Search, Calendar, User, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react';
import ImportProgressDialog from '@/components/pointadjustments/ImportProgressDialog';
import { useQuery } from '@tanstack/react-query';

const PAGE_SIZE = 100;

// Motivos de ajuste mais comuns (populado dinamicamente dos dados)
const COMMON_REASONS = [
  'FALTA NÃO JUSTIFICADA',
  'FALTA HORAS',
  'MEIA FALTA',
  'ATESTADO MÉDICO',
  'DECLARAÇÃO DE COMPARECIMENTO',
  'FOLGA',
  'FÉRIAS',
];

export default function PointAdjustments() {
  // Filtros de busca — só busca ao clicar em "Buscar"
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterReason, setFilterReason] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Filtros aplicados (confirmados ao clicar Buscar)
  const [appliedFilters, setAppliedFilters] = useState(null);

  const [page, setPage] = useState(1);
  const [importDialog, setImportDialog] = useState(null);

  // Carrega colaboradores e empresas sempre
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-for-pa'],
    queryFn: () => base44.entities.Employee.list('name', 2000),
  });

  // Busca ajustes apenas quando appliedFilters não é null
  const {
    data: records = [],
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['point-adjustments', appliedFilters],
    queryFn: async () => {
      if (!appliedFilters) return [];

      // Monta query de filtro
      const query = {};

      if (appliedFilters.employee_id) {
        query.employee_id = appliedFilters.employee_id;
      }
      if (appliedFilters.reason) {
        query.adjustment_reason_description = appliedFilters.reason;
      }

      // Busca com filtros base
      let results = await base44.entities.PointAdjustment.filter(query, '-start_date', 5000);

      // Filtros de data e texto aplicados no cliente (após busca)
      if (appliedFilters.dateStart || appliedFilters.dateEnd || appliedFilters.search) {
        results = results.filter(r => {
          const date = r.start_date || '';
          const afterStart = !appliedFilters.dateStart || date >= appliedFilters.dateStart;
          const beforeEnd = !appliedFilters.dateEnd || date <= appliedFilters.dateEnd;
          const q = (appliedFilters.search || '').toLowerCase();
          const matchSearch = !q ||
            (r.employee_name || '').toLowerCase().includes(q) ||
            (r.adjustment_reason_description || '').toLowerCase().includes(q) ||
            (r.observation || '').toLowerCase().includes(q);
          return afterStart && beforeEnd && matchSearch;
        });
      }

      return results;
    },
    enabled: appliedFilters !== null,
  });

  const handleSearch = () => {
    setPage(1);
    setAppliedFilters({
      employee_id: filterEmployee || '',
      dateStart: filterDateStart,
      dateEnd: filterDateEnd,
      reason: filterReason === '_all' ? '' : filterReason,
      search: filterSearch,
    });
  };

  const handleClear = () => {
    setFilterEmployee('');
    setFilterDateStart('');
    setFilterDateEnd('');
    setFilterReason('');
    setFilterSearch('');
    setAppliedFilters(null);
    setPage(1);
  };

  const hasActiveFilters = filterEmployee || filterDateStart || filterDateEnd || filterReason || filterSearch;

  // Coleta motivos únicos dos registros carregados
  const uniqueReasons = [...new Set([
    ...COMMON_REASONS,
    ...records.map(r => r.adjustment_reason_description).filter(Boolean),
  ])].sort();

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const paginated = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('aprova') || s === 'approved') return 'bg-green-100 text-green-700 dark:bg-green-900/30';
    if (s.includes('pendent') || s === 'pending') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30';
    if (s.includes('reject') || s.includes('recusa')) return 'bg-red-100 text-red-700 dark:bg-red-900/30';
    return 'bg-muted text-muted-foreground';
  };

  const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ajustes de Ponto</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {appliedFilters === null
              ? 'Aplique os filtros abaixo para buscar registros'
              : isFetching
                ? 'Buscando...'
                : `${records.length} registro(s) encontrado(s)`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching || !appliedFilters} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
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

      {/* Painel de Filtros */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtros de Busca
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Colaborador */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="w-3 h-3" /> Colaborador
              </Label>
              <Select value={filterEmployee || '_all'} onValueChange={v => setFilterEmployee(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos os colaboradores</SelectItem>
                  {employees
                    .filter(e => e.is_active !== false)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data Inicial */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Data Inicial
              </Label>
              <Input
                type="date"
                className="h-9"
                value={filterDateStart}
                onChange={e => setFilterDateStart(e.target.value)}
              />
            </div>

            {/* Data Final */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Data Final
              </Label>
              <Input
                type="date"
                className="h-9"
                value={filterDateEnd}
                onChange={e => setFilterDateEnd(e.target.value)}
              />
            </div>

            {/* Motivo */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Motivo do Ajuste</Label>
              <Select value={filterReason || '_all'} onValueChange={v => setFilterReason(v === '_all' ? '' : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos os motivos</SelectItem>
                  {uniqueReasons.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Busca por texto */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Busca livre por nome, observação..."
              className="pl-9 h-9"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>

          <div className="flex gap-2 justify-end">
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={handleClear} className="gap-2">
                <X className="w-4 h-4" />
                Limpar
              </Button>
            )}
            <Button size="sm" onClick={handleSearch} className="gap-2 px-6">
              <Search className="w-4 h-4" />
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de resultados */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>Registros de Ajuste</span>
            {appliedFilters !== null && (
              <span className="text-sm font-normal text-muted-foreground">{records.length} resultado(s)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {appliedFilters === null ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
              <Filter className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">Selecione os filtros e clique em Buscar</p>
              <p className="text-xs opacity-70">Use colaborador, datas ou motivo para filtrar os registros</p>
            </div>
          ) : isFetching ? (
            <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Buscando registros...</span>
            </div>
          ) : paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Calendar className="w-8 h-8 opacity-40" />
              <p className="text-sm">Nenhum registro encontrado com os filtros aplicados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground">Colaborador</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Início</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Fim</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Motivo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Observação</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Dia Int.</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r, i) => (
                    <tr key={r.id} className={`border-b border-border hover:bg-muted/20 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium text-foreground text-sm">{r.employee_name || '—'}</p>
                            <p className="text-xs text-muted-foreground">{r.employee_email || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">{fmtDate(r.start_date)}</td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">{fmtDate(r.end_date)}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs font-normal max-w-[160px] truncate" title={r.adjustment_reason_description}>
                          {r.adjustment_reason_description || '—'}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs max-w-[180px] truncate" title={r.observation}>
                        {r.observation || '—'}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}>
                          {r.status || '—'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {r.full_day
                          ? <span className="text-xs text-green-700 font-semibold">Sim</span>
                          : <span className="text-xs text-muted-foreground">Não</span>}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{r.origem || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {!isFetching && totalPages > 1 && records.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages} — {records.length} registros
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
          onDone={() => { setImportDialog(null); if (appliedFilters) refetch(); }}
        />
      )}
    </div>
  );
}