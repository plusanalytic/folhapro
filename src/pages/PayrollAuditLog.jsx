import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, Filter, RefreshCw, FileText, Clock, User, Building2, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ACTION_LABELS = {
  create:       { label: 'Lançamento criado',      color: 'bg-green-100 text-green-800 border-green-200' },
  update:       { label: 'Folha editada',           color: 'bg-blue-100 text-blue-800 border-blue-200' },
  delete:       { label: 'Lançamento excluído',     color: 'bg-red-100 text-red-800 border-red-200' },
  close:        { label: 'Folha fechada',           color: 'bg-orange-100 text-orange-800 border-orange-200' },
  reopen:       { label: 'Folha reaberta',          color: 'bg-purple-100 text-purple-800 border-purple-200' },
  close_month:  { label: 'Mês fechado',             color: 'bg-red-100 text-red-800 border-red-200' },
  reopen_month: { label: 'Mês reaberto',            color: 'bg-purple-100 text-purple-800 border-purple-200' },
  clone:        { label: 'Clonagem do mês anterior',color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
};

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const fmtMonth = (m) => {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  return `${MONTHS_PT[parseInt(mo) - 1]}/${y}`;
};

function ActionBadge({ action }) {
  const cfg = ACTION_LABELS[action] || { label: action, color: 'bg-gray-100 text-gray-800 border-gray-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = log.details && Object.keys(log.details).length > 0;

  const fmtDate = (d) => {
    try {
      const date = new Date(d);
      return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return d || '—';
    }
  };

  return (
    <div className="border-b border-border last:border-0">
      <div
        className={`flex items-start gap-4 px-4 py-3 hover:bg-muted/20 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* Ícone de expansão */}
        <div className="mt-0.5 w-4 shrink-0">
          {hasDetails ? (
            expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
          ) : null}
        </div>

        {/* Data e hora */}
        <div className="w-36 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{fmtDate(log.created_date)}</span>
          </div>
        </div>

        {/* Ação */}
        <div className="w-44 shrink-0">
          <ActionBadge action={log.action} />
        </div>

        {/* Descrição */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{log.description}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {log.employee_name && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="w-3 h-3" /> {log.employee_name}
              </span>
            )}
            {log.company_name && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Building2 className="w-3 h-3" /> {log.company_name}
              </span>
            )}
            {log.reference_month && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {fmtMonth(log.reference_month)}
              </span>
            )}
          </div>
        </div>

        {/* Usuário */}
        <div className="w-40 shrink-0 text-right">
          <span className="text-xs text-muted-foreground">
            {log.user_name || 'Sistema'}
          </span>
        </div>
      </div>

      {/* Detalhes expandidos */}
      {expanded && hasDetails && (
        <div className="px-12 pb-3">
          <div className="bg-muted/30 rounded-lg p-3 text-xs space-y-1">
            {log.details.changed_fields && Array.isArray(log.details.changed_fields) ? (
              <div>
                <span className="text-muted-foreground font-medium block mb-1.5">Campos alterados:</span>
                <div className="flex flex-wrap gap-1.5">
                  {log.details.changed_fields.map(f => (
                    <span key={f} className="bg-blue-100 text-blue-800 border border-blue-200 rounded px-2 py-0.5 font-mono text-xs">{f}</span>
                  ))}
                </div>
              </div>
            ) : (
              Object.entries(log.details).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-muted-foreground min-w-32 font-medium">{k}:</span>
                  <span className="text-foreground break-all font-mono">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PayrollAuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const load = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.PayrollAuditLog.list('-created_date', 500);
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Meses disponíveis no log
  const availableMonths = [...new Set(logs.map(l => l.reference_month).filter(Boolean))].sort().reverse();

  const filtered = logs.filter(log => {
    if (filterAction !== 'all' && log.action !== filterAction) return false;
    if (filterMonth !== 'all' && log.reference_month !== filterMonth) return false;
    if (search) {
      const s = search.toLowerCase();
      const match =
        (log.description || '').toLowerCase().includes(s) ||
        (log.employee_name || '').toLowerCase().includes(s) ||
        (log.company_name || '').toLowerCase().includes(s) ||
        (log.user_name || '').toLowerCase().includes(s);
      if (!match) return false;
    }
    return true;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Log de Auditoria</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Histórico completo de alterações no módulo de Folha de Pagamento
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Resumo rápido */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(ACTION_LABELS).slice(0, 4).map(([action, cfg]) => {
          const count = logs.filter(l => l.action === action).length;
          return (
            <Card key={action} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setFilterAction(filterAction === action ? 'all' : action)}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{cfg.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por colaborador, empresa, usuário..."
            className="pl-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <Select value={filterAction} onValueChange={v => { setFilterAction(v); setPage(0); }}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Tipo de ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {Object.entries(ACTION_LABELS).map(([action, cfg]) => (
              <SelectItem key={action} value={action}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={v => { setFilterMonth(v); setPage(0); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Mês de referência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {availableMonths.map(m => (
              <SelectItem key={m} value={m}>{fmtMonth(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterAction !== 'all' || filterMonth !== 'all' || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterAction('all'); setFilterMonth('all'); setSearch(''); setPage(0); }}>
            Limpar filtros
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} registro(s)</span>
      </div>

      {/* Tabela de logs */}
      <Card className="overflow-hidden">
        {/* Cabeçalho da tabela */}
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground">
          <div className="w-4 shrink-0" />
          <div className="w-36 shrink-0">Data e Hora</div>
          <div className="w-44 shrink-0">Ação</div>
          <div className="flex-1">Descrição / Colaborador</div>
          <div className="w-40 text-right">Usuário</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Carregando histórico...</span>
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <FileText className="w-10 h-10 opacity-20" />
            <p className="font-medium">Nenhum registro encontrado</p>
            <p className="text-sm">
              {logs.length === 0
                ? 'O log de auditoria será preenchido conforme as alterações forem feitas na folha.'
                : 'Tente ajustar os filtros de busca.'}
            </p>
          </div>
        ) : (
          <div>
            {paginated.map(log => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </Card>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}