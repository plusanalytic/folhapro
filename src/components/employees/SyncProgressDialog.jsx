import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, Loader2, Users, UserCheck, UserX } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function SyncProgressDialog({ open, onClose, onFinished }) {
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [phase, setPhase] = useState(''); // 'active' | 'fired' | ''
  const [progress, setProgress] = useState({ total: 0, done: 0, created: 0, updated: 0, failed: 0 });
  const [phaseResults, setPhaseResults] = useState({ active: null, fired: null });
  const [errorMsg, setErrorMsg] = useState('');
  const pollingRef = useRef(null);

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  useEffect(() => {
    if (!open) {
      // Reset ao fechar
      setStatus('idle');
      setPhase('');
      setProgress({ total: 0, done: 0, created: 0, updated: 0, failed: 0 });
      setPhaseResults({ active: null, fired: null });
      setErrorMsg('');
      return;
    }

    setStatus('running');
    setPhase('active');
    setProgress({ total: 0, done: 0, created: 0, updated: 0, failed: 0 });
    setPhaseResults({ active: null, fired: null });
    setErrorMsg('');

    // Progresso animado enquanto aguarda (a função é longa)
    let fakeTotal = 250;
    let fakeDone = 0;
    pollingRef.current = setInterval(() => {
      fakeDone = Math.min(fakeDone + Math.floor(Math.random() * 3) + 1, fakeTotal - 5);
      setProgress(p => ({ ...p, total: fakeTotal, done: fakeDone }));
    }, 600);

    base44.functions.invoke('syncEmployees', {})
      .then(res => {
        clearInterval(pollingRef.current);
        const d = res.data;
        setProgress({
          total: d.total_from_api ?? (d.created + d.updated + d.failed),
          done: (d.created ?? 0) + (d.updated ?? 0) + (d.failed ?? 0),
          created: d.created ?? 0,
          updated: d.updated ?? 0,
          failed: d.failed ?? 0,
        });
        setPhaseResults({ active: d.active ?? null, fired: d.fired ?? null });
        setPhase('');
        setStatus('done');
        onFinished?.();
      })
      .catch(err => {
        clearInterval(pollingRef.current);
        setErrorMsg(err.message || 'Erro desconhecido');
        setPhase('');
        setStatus('error');
      });

    return () => clearInterval(pollingRef.current);
  }, [open]);

  const phaseLabel = phase === 'active'
    ? 'Sincronizando colaboradores ativos...'
    : phase === 'fired'
    ? 'Sincronizando colaboradores demitidos...'
    : '';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && status !== 'running') onClose(); }}>
      <DialogContent className="max-w-md" onInteractOutside={e => status === 'running' && e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <DialogTitle>Sincronização de Colaboradores</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Barra de progresso */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-foreground">Progresso</span>
              <span className="text-primary font-bold">{pct}%</span>
            </div>
            <Progress value={pct} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.done} processados</span>
              <span>de {progress.total > 0 ? progress.total : '...'} registros</span>
            </div>
          </div>

          {/* Totais combinados */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-green-50 p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{progress.created}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Criados</p>
            </div>
            <div className="rounded-lg border border-border bg-blue-50 p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{progress.updated}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Atualizados</p>
            </div>
            <div className="rounded-lg border border-border bg-red-50 p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{progress.failed}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Falhas</p>
            </div>
          </div>

          {/* Resultados por fase (só quando concluído) */}
          {status === 'done' && phaseResults.active && phaseResults.fired && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs font-semibold text-foreground">Ativos</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  +{phaseResults.active.created} criados • {phaseResults.active.updated} atualizados
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <UserX className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-xs font-semibold text-foreground">Demitidos</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  +{phaseResults.fired.created} criados • {phaseResults.fired.updated} atualizados
                </p>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-2 rounded-lg border border-border p-3">
            {status === 'running' && (
              <>
                <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {phaseLabel || 'Sincronizando registros com o Solides Tangerino...'} Não feche esta janela.
                </span>
              </>
            )}
            {status === 'done' && (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm text-green-700 font-medium">Sincronização concluída com sucesso!</span>
              </>
            )}
            {status === 'error' && (
              <>
                <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span className="text-sm text-red-600">{errorMsg || 'Erro durante a sincronização.'}</span>
              </>
            )}
          </div>

          {(status === 'done' || status === 'error') && (
            <button
              onClick={onClose}
              className="w-full rounded-md border border-border bg-muted/40 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Fechar
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}