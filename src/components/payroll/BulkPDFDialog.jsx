import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { FileArchive, Loader2, CheckCircle2, XCircle, Download, StopCircle } from 'lucide-react';
import { getMonthName } from '@/lib/payrollCalculations';
import { renderComponentToPDFBlob, getReceiptComponent } from '@/lib/pdfUtils.jsx';
import { buildMergedPayrollEntry } from '@/lib/buildMergedPayrollEntry';



/**
 * items: [{ emp, entry, payrollType }] — pré-resolvidos pelo pai.
 * Qualquer alteração nos componentes de recibo ou na lógica de merge
 * (lib/buildMergedPayrollEntry.js) reflete aqui automaticamente.
 */
export default function BulkPDFDialog({ company, items, referenceMonth, onClose }) {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [currentName, setCurrentName] = useState('');
  const [log, setLog] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [successCount, setSuccessCount] = useState(0);
  const cancelledRef = useRef(false);

  const addLog = useCallback((msg, type = 'info') => setLog(prev => [...prev, { msg, type }]), []);

  const handleCancel = () => {
    cancelledRef.current = true;
    setStatus('cancelled');
    addLog('Geração cancelada pelo usuário.', 'error');
  };

  const handleGenerate = async () => {
    if (!items || items.length === 0) return;
    setStatus('generating');
    setProgress(0);
    setCurrentName('');
    setLog([]);
    setDownloadUrl(null);
    setSuccessCount(0);
    cancelledRef.current = false;

    const failed = [];
    let generated = 0;

    try {
      // Streaming ZIP com fflate — PDFs são gravados conforme gerados, sem acumular em memória
      const { Zip, ZipDeflate } = await import('https://esm.sh/fflate@0.8.2');
      const zipChunks = [];
      let zipResolve;
      const zipDone = new Promise(r => { zipResolve = r; });
      const zip = new Zip((err, data, final) => {
        if (data) zipChunks.push(data);
        if (final) zipResolve();
      });

      for (let i = 0; i < items.length; i++) {
        if (cancelledRef.current) break;

        // Yield para manter UI responsiva entre cada colaborador
        await new Promise(r => setTimeout(r, 30));

        const { emp, entry, payrollType } = items[i];
        setCurrentName(emp.name);
        addLog(`Gerando PDF: ${emp.name}...`);

        try {
          // Mesma fonte de verdade do recibo individual (lib/buildMergedPayrollEntry.js)
          const { mergedEntry, paymentStatus } = await buildMergedPayrollEntry(emp, entry, payrollType);

          const Component = getReceiptComponent(payrollType);
          const componentProps = { employee: emp, entry: mergedEntry, month: referenceMonth, company, paymentStatus };

          const blob = await renderComponentToPDFBlob(Component, componentProps);

          // Stream direto para ZIP — libera memória imediatamente após cada PDF
          const safeName = emp.name.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').trim().replace(/\s+/g, '_');
          const file = new ZipDeflate(`${safeName}.pdf`, { level: 0 });
          zip.add(file);
          const buf = await blob.arrayBuffer();
          file.push(new Uint8Array(buf), true);

          generated++;
          addLog(`✓ ${emp.name}`, 'success');
        } catch (err) {
          // Erro isolado: registra no log e continua com os demais
          failed.push(emp.name);
          addLog(`✗ Erro: ${emp.name} — ${err.message}`, 'error');
        }

        setProgress(Math.round(((i + 1) / items.length) * 100));
        await new Promise(r => setTimeout(r, 10));
      }

      if (cancelledRef.current) return;

      addLog('Finalizando ZIP...', 'info');
      await new Promise(r => setTimeout(r, 30));
      zip.end();
      await zipDone;

      setSuccessCount(generated);
      const zipBlob = new Blob(zipChunks, { type: 'application/zip' });
      setDownloadUrl(URL.createObjectURL(zipBlob));
      setStatus(failed.length > 0 ? 'done_with_errors' : 'done');
      setCurrentName('');

      if (failed.length > 0) {
        addLog(`⚠ ${generated} PDF(s) gerado(s). ${failed.length} com erro: ${failed.join(', ')}`, 'error');
      } else {
        addLog(`✅ Concluído! ${generated} PDF(s) gerado(s).`, 'success');
      }
    } catch (err) {
      setStatus('error');
      setCurrentName('');
      addLog(`Erro fatal: ${err.message}`, 'error');
    }
  };

  const handleDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `folha_${company.name.replace(/\s+/g, '_')}_${referenceMonth}.zip`;
    a.click();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-primary" />
            PDF em Lote — {company.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/40 rounded-lg px-4 py-3 text-sm space-y-1">
            <p className="font-medium">Mês de referência: <span className="text-primary">{getMonthName(referenceMonth)}</span></p>
            <p className="text-muted-foreground">{items?.length ?? 0} colaborador(es) selecionado(s).</p>
            <p className="text-xs text-muted-foreground">PDFs idênticos ao botão "Imprimir Recibo" de cada colaborador.</p>
          </div>

          {!items || items.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Nenhum colaborador selecionado.</div>
          ) : (
            <>
              {status === 'idle' && (
                <Button className="w-full gap-2" onClick={handleGenerate}>
                  <FileArchive className="w-4 h-4" />
                  Gerar {items.length} PDF(s) e Compactar em ZIP
                </Button>
              )}

              {status === 'generating' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span>{progress}% — {currentName && <span className="text-foreground font-medium">{currentName}</span>}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive gap-1" onClick={handleCancel}>
                      <StopCircle className="w-4 h-4" /> Cancelar
                    </Button>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              {status === 'cancelled' && (
                <Button className="w-full gap-2" onClick={handleGenerate} variant="outline">Reiniciar Geração</Button>
              )}

              {(status === 'done' || status === 'done_with_errors') && (
                <Button
                  className="w-full gap-2"
                  onClick={handleDownload}
                  variant={status === 'done_with_errors' ? 'outline' : 'default'}
                >
                  <Download className="w-4 h-4" />
                  Baixar ZIP com {successCount} PDF(s)
                </Button>
              )}

              {status === 'error' && (
                <Button className="w-full gap-2" onClick={handleGenerate} variant="outline">Tentar Novamente</Button>
              )}

              {log.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 space-y-1">
                  {log.map((l, i) => (
                    <div key={i} className={`text-xs flex items-center gap-1.5 ${l.type === 'success' ? 'text-green-600' : l.type === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {l.type === 'success' ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : l.type === 'error' ? <XCircle className="w-3 h-3 shrink-0" /> : <span className="w-3 h-3 shrink-0" />}
                      {l.msg}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}