import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertCircle, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function ImportProgressDialog({ open, mode, onClose, onDone }) {
  const [status, setStatus] = useState('running'); // running | success | error
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Conectando à API do Tangerino...');
  const called = useRef(false);

  useEffect(() => {
    if (!open || called.current) return;
    called.current = true;

    let fakeProgress = 0;
    // Simula progresso visual enquanto a função roda no backend
    const interval = setInterval(() => {
      fakeProgress += Math.random() * 4;
      if (fakeProgress >= 90) { clearInterval(interval); fakeProgress = 90; }
      setProgress(Math.min(fakeProgress, 90));
      if (fakeProgress < 20) setProgressLabel('Conectando à API do Tangerino...');
      else if (fakeProgress < 45) setProgressLabel('Buscando registros (paginação)...');
      else if (fakeProgress < 70) setProgressLabel('Verificando duplicatas...');
      else setProgressLabel('Gravando no banco de dados...');
    }, 800);

    base44.functions.invoke('syncPointAdjustments', { mode })
      .then(res => {
        clearInterval(interval);
        setProgress(100);
        setProgressLabel('Concluído!');
        setResult(res.data);
        setStatus('success');
        onDone?.();
      })
      .catch(err => {
        clearInterval(interval);
        setStatus('error');
        setErrorMsg(err?.response?.data?.error || err.message || 'Erro desconhecido');
      });
  }, [open]);

  const pct = Math.round(progress);

  return (
    <Dialog open={open} onOpenChange={() => status !== 'running' && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            {mode === 'full' ? 'Importação Completa — Ajustes de Ponto' : 'Sincronização Diária — Ajustes de Ponto'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Barra de progresso */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{progressLabel}</span>
              <span className="font-mono font-semibold text-primary">{pct}%</span>
            </div>
            <Progress value={pct} className="h-3" />
          </div>

          {/* Status */}
          {status === 'running' && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Aguarde, a importação está em andamento. Não feche esta janela.</span>
            </div>
          )}

          {status === 'success' && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700 font-medium">
                <CheckCircle2 className="w-5 h-5" />
                Importação concluída com sucesso!
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted/40 rounded-lg px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{result.fetched ?? '—'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Registros na API</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.created ?? '—'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Novos gravados</p>
                </div>
                <div className="bg-muted/40 rounded-lg px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{result.skipped ?? '—'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Duplicatas ignoradas</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{result.errors ?? '—'}</p>
                  <p className="text-xs text-muted-foreground mt-1">Erros</p>
                </div>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-start gap-3 text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-sm">{errorMsg}</span>
            </div>
          )}

          {status !== 'running' && (
            <Button className="w-full" onClick={onClose}>Fechar</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}