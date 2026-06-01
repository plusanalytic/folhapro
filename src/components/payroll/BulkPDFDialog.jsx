import { useState, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { FileArchive, Loader2, CheckCircle2, XCircle, Download, StopCircle } from 'lucide-react';
import { getMonthName } from '@/lib/payrollCalculations';
import { HoleriteContent, MeiHoleriteContent, EscritorioHoleriteContent } from '@/components/reports/ReceiptContents';
import ProLaboreReceiptContent from '@/components/reports/ProLaboreReceiptContent';
import EsporadicoReceiptContent from '@/components/reports/EsporadicoReceiptContent';
import { buildMergedPayrollEntry } from '@/lib/buildMergedPayrollEntry';

// Pré-carrega as libs uma vez só (evita import repetido por colaborador)
let _html2canvas = null;
let _jsPDF = null;
async function getLibs() {
  if (!_html2canvas) _html2canvas = (await import('html2canvas')).default;
  if (!_jsPDF) _jsPDF = (await import('jspdf')).jsPDF;
  return { html2canvas: _html2canvas, jsPDF: _jsPDF };
}

// Container offscreen reutilizável — mesmo estilo do recibo individual
let _sharedContainer = null;
let _sharedRoot = null;
function getSharedContainer() {
  if (!_sharedContainer) {
    _sharedContainer = document.createElement('div');
    _sharedContainer.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;z-index:-1;';
    document.body.appendChild(_sharedContainer);
    _sharedRoot = createRoot(_sharedContainer);
  }
  return { container: _sharedContainer, root: _sharedRoot };
}

async function renderComponentToPDFBlob(ReactComponent, props) {
  return new Promise(async (resolve, reject) => {
    const { container, root } = getSharedContainer();
    root.render(<ReactComponent {...props} />);
    await new Promise(r => setTimeout(r, 600));
    try {
      const { html2canvas, jsPDF } = await getLibs();
      const canvas = await html2canvas(container, {
        scale: 1.5, useCORS: true, backgroundColor: '#ffffff',
        logging: false, width: 794, windowWidth: 794,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.88);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();   // 210mm
      const pageH = pdf.internal.pageSize.getHeight(); // 297mm
      const imgH = (canvas.height / canvas.width) * pdfW;

      // Cada recibo = exatamente 1 página (igual ao window.print do recibo individual).
      // Se o conteúdo couber em A4, posiciona normalmente.
      // Se for mais alto, escala proporcionalmente para caber sem cortar nenhuma linha.
      if (imgH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH);
      } else {
        const scale = pageH / imgH;
        const scaledW = pdfW * scale;
        const xOffset = (pdfW - scaledW) / 2;
        pdf.addImage(imgData, 'JPEG', xOffset, 0, scaledW, pageH);
      }
      resolve(pdf.output('blob'));
    } catch (err) {
      reject(err);
    }
  });
}

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

          let Component;
          const componentProps = { employee: emp, entry: mergedEntry, month: referenceMonth, company, paymentStatus };
          if (payrollType === 'ESCRITORIO') Component = EscritorioHoleriteContent;
          else if (payrollType === 'MOTOCICLISTA_MEI') Component = MeiHoleriteContent;
          else if (payrollType === 'SOCIO') Component = ProLaboreReceiptContent;
          else if (payrollType === 'ESPORADICO') Component = EsporadicoReceiptContent;
          else Component = HoleriteContent;

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