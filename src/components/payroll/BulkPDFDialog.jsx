import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { FileArchive, Loader2, CheckCircle2, XCircle, Download } from 'lucide-react';
import { formatCurrency, getMonthName, calculatePayroll, calculateEscritorioPayroll } from '@/lib/payrollCalculations';
import { absenceDiscountByPeriod } from '@/components/payroll/AbsenceDiscountsTable';

// Renderiza o HTML de um recibo para um iframe oculto e captura via html2canvas + jsPDF

async function generatePDFBlob(htmlContent, employeeName, month) {
  // Cria iframe invisível para renderizar o HTML
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '100vw';
    iframe.style.bottom = '100vh';
    iframe.style.width = '794px'; // A4 largura em px a 96dpi
    iframe.style.height = '1122px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head>
      <style>* { margin:0; padding:0; box-sizing:border-box; } body { background:#fff; }</style>
    </head><body>${htmlContent}</body></html>`);
    doc.close();

    setTimeout(async () => {
      try {
        const html2canvas = (await import('html2canvas')).default;
        const { jsPDF } = await import('jspdf');

        const canvas = await html2canvas(doc.body, {
          scale: 1.5,
          useCORS: true,
          backgroundColor: '#ffffff',
          width: 794,
          windowWidth: 794,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = (canvas.height * pdfW) / canvas.width;

        // Se o conteúdo for maior que uma página, adiciona páginas extras
        const pageHeight = pdf.internal.pageSize.getHeight();
        let yPos = 0;
        while (yPos < pdfH) {
          if (yPos > 0) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, -yPos, pdfW, pdfH);
          yPos += pageHeight;
        }

        const blob = pdf.output('blob');
        document.body.removeChild(iframe);
        resolve(blob);
      } catch (err) {
        document.body.removeChild(iframe);
        reject(err);
      }
    }, 600);
  });
}

// Constrói o HTML do recibo baseado no tipo de folha
function buildReceiptHTML(employee, entry, company, payrollType, referenceMonth) {
  const monthName = getMonthName(referenceMonth);
  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const firstNet = entry?.first_period_net ?? 0;
  const secondNet = entry?.second_period_net ?? 0;
  const total = firstNet + secondNet;

  const rows = [];
  if (entry?.base_salary) rows.push(['Salário/Remuneração Base', fmt(entry.base_salary)]);
  if ((entry?.meal_voucher ?? 0) > 0) rows.push(['Vale Refeição', fmt(entry.meal_voucher)]);
  if ((entry?.food_voucher ?? 0) > 0) rows.push(['Vale Alimentação', fmt(entry.food_voucher)]);
  if ((entry?.transport_voucher ?? 0) > 0) rows.push(['Vale Transporte', fmt(entry.transport_voucher)]);
  if ((entry?.motorcycle_rental ?? 0) > 0) rows.push(['Aluguel da Motocicleta', fmt(entry.motorcycle_rental)]);
  if ((entry?.hazard_pay ?? 0) > 0) rows.push(['Periculosidade', fmt(entry.hazard_pay)]);
  if ((entry?.life_insurance ?? 0) > 0) rows.push(['Seguro de Vida', fmt(entry.life_insurance)]);
  if ((entry?.cost_allowance ?? 0) > 0) rows.push(['Ajuda de Custo', fmt(entry.cost_allowance)]);
  if ((entry?.bonus ?? 0) > 0) rows.push(['Bonificação / Prêmio', fmt(entry.bonus)]);

  const tableRows = rows.map(([label, val]) =>
    `<tr><td style="padding:5px 10px;border-bottom:1px solid #e8e4f5">${label}</td><td style="padding:5px 10px;text-align:right;border-bottom:1px solid #e8e4f5;color:#2563eb;font-family:monospace">${val}</td></tr>`
  ).join('');

  return `
  <div style="width:210mm;min-height:297mm;padding:12mm;font-family:Arial,sans-serif;font-size:11px;color:#1a1a2e;background:#fff;box-sizing:border-box;">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #6a3eaf;padding-bottom:10px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:44px;height:44px;background:linear-gradient(135deg,#6a3eaf,#239BB6);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:16px;">${(company?.name||'FP').slice(0,2).toUpperCase()}</div>
        <div>
          <div style="font-weight:bold;font-size:14px;color:#6a3eaf">${company?.name||''}</div>
          ${company?.cnpj ? `<div style="color:#666;font-size:10px">CNPJ: ${company.cnpj}</div>` : ''}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:bold;font-size:15px;color:#6a3eaf;text-transform:uppercase;letter-spacing:1px">Recibo de Pagamento</div>
        <div style="color:#666;font-size:11px;margin-top:2px">${monthName}</div>
        <div style="color:#888;font-size:10px;margin-top:1px">${payrollType}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;background:#f5f3ff;border-radius:8px;padding:10px 14px;margin-bottom:14px;">
      <div><div style="color:#888;font-size:9px;text-transform:uppercase;margin-bottom:2px">Colaborador</div><div style="font-weight:bold">${employee.name}</div></div>
      <div><div style="color:#888;font-size:9px;text-transform:uppercase;margin-bottom:2px">CPF/CNPJ</div><div style="font-weight:bold">${employee.cpf_cnpj||'—'}</div></div>
      <div><div style="color:#888;font-size:9px;text-transform:uppercase;margin-bottom:2px">Cargo</div><div style="font-weight:bold">${employee.position||'—'}</div></div>
      <div><div style="color:#888;font-size:9px;text-transform:uppercase;margin-bottom:2px">Contrato</div><div style="font-weight:bold">${employee.contract_type||'—'}</div></div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px;">
      <thead>
        <tr>
          <th style="background:#6a3eaf;color:#fff;padding:7px 10px;text-align:left;border-radius:6px 0 0 0;width:62%">Descrição</th>
          <th style="background:#6a3eaf;color:#fff;padding:7px 10px;text-align:right;border-radius:0 6px 0 0;width:38%">Valor (R$)</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
      <div style="border:2px solid #6a3eaf;border-radius:8px;overflow:hidden;">
        <div style="background:#6a3eaf;color:#fff;padding:6px 12px;font-size:10px;font-weight:bold;text-transform:uppercase">1ª Quinzena (1–15)</div>
        <div style="padding:8px 12px;display:flex;justify-content:space-between;font-weight:bold;font-size:12px">
          <span style="color:#6a3eaf">A Receber</span>
          <span style="font-family:monospace;color:#6a3eaf">${fmt(firstNet)}</span>
        </div>
      </div>
      <div style="border:2px solid #6a3eaf;border-radius:8px;overflow:hidden;">
        <div style="background:#6a3eaf;color:#fff;padding:6px 12px;font-size:10px;font-weight:bold;text-transform:uppercase">2ª Quinzena (16–30)</div>
        <div style="padding:8px 12px;display:flex;justify-content:space-between;font-weight:bold;font-size:12px">
          <span style="color:#6a3eaf">A Receber</span>
          <span style="font-family:monospace;color:#6a3eaf">${fmt(secondNet)}</span>
        </div>
      </div>
    </div>

    <div style="background:linear-gradient(135deg,#6a3eaf,#239BB6);border-radius:10px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;color:#fff;">
      <div style="font-size:10px;opacity:0.85;text-transform:uppercase;letter-spacing:1px">TOTAL A RECEBER (1ª + 2ª Quinzena)</div>
      <div style="font-size:24px;font-weight:bold;font-family:monospace">${fmt(total)}</div>
    </div>

    ${(employee.bank_name || employee.pix_key) ? `
    <div style="border:1px solid #e8e4f5;border-radius:8px;padding:10px 14px;margin-bottom:16px;background:#fafafa;">
      <div style="color:#888;font-size:9px;text-transform:uppercase;margin-bottom:6px">Dados para Pagamento</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:10px;">
        ${employee.bank_name ? `<div><span style="color:#888">Banco: </span><strong>${employee.bank_name}</strong></div>` : ''}
        ${employee.bank_agency ? `<div><span style="color:#888">Agência: </span><strong>${employee.bank_agency}</strong></div>` : ''}
        ${employee.bank_account ? `<div><span style="color:#888">Conta: </span><strong>${employee.bank_account}</strong></div>` : ''}
        ${employee.pix_key ? `<div><span style="color:#888">PIX: </span><strong>${employee.pix_key}</strong></div>` : ''}
      </div>
    </div>` : ''}

    ${entry?.notes ? `
    <div style="border:1px solid #e8e4f5;border-radius:8px;padding:8px 14px;margin-bottom:14px;background:#fdf9ff;">
      <div style="color:#6a3eaf;font-size:9px;text-transform:uppercase;margin-bottom:4px;font-weight:bold">Observação</div>
      <div style="font-size:10px;color:#444">${entry.notes}</div>
    </div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px;">
      <div style="text-align:center">
        <div style="border-top:1px solid #999;padding-top:6px;margin-top:32px">
          <div style="font-weight:bold;font-size:11px">${company?.name||'______________________________'}</div>
          <div style="color:#888;font-size:10px">Empregador / Responsável</div>
        </div>
      </div>
      <div style="text-align:center">
        <div style="border-top:1px solid #999;padding-top:6px;margin-top:32px">
          <div style="font-weight:bold;font-size:11px">${employee.name}</div>
          <div style="color:#888;font-size:10px">Colaborador — ${employee.cpf_cnpj||''}</div>
        </div>
        <div style="margin-top:8px;color:#888;font-size:10px">Data: _____ / _____ / _________</div>
      </div>
    </div>
  </div>`;
}

export default function BulkPDFDialog({ company, employees, entries, jobRoles, referenceMonth, onClose }) {
  const [status, setStatus] = useState('idle'); // idle | generating | done | error
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);

  // Colaboradores com lançamento
  const empWithEntries = employees.filter(emp => {
    const entry = entries.find(e => e.employee_id === emp.id && e.reference_month === referenceMonth);
    return !!entry;
  });

  const addLog = (msg, type = 'info') => setLog(prev => [...prev, { msg, type }]);

  const blobsRef = useRef([]);

  const handleGenerate = async () => {
    if (empWithEntries.length === 0) return;
    setStatus('generating');
    setProgress(0);
    setLog([]);
    setDownloadUrl(null);
    blobsRef.current = [];

    try {
      for (let i = 0; i < empWithEntries.length; i++) {
        const emp = empWithEntries[i];
        const entry = entries.find(e => e.employee_id === emp.id && e.reference_month === referenceMonth);
        const jr = jobRoles.find(r => r.tangerino_id && String(r.tangerino_id) === String(emp.job_role_tangerino_id));
        const payrollType = jr?.payroll_type || 'CLT';
        const empWithPos = { ...emp, position: emp.position || jr?.name };

        addLog(`Gerando PDF: ${emp.name}...`);

        const html = buildReceiptHTML(empWithPos, entry, company, payrollType, referenceMonth);
        const blob = await generatePDFBlob(html, emp.name, referenceMonth);
        const safeName = emp.name.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').trim().replace(/\s+/g, '_');
        blobsRef.current.push({ blob, name: `${safeName}.pdf` });

        addLog(`✓ ${emp.name}`, 'success');
        setProgress(Math.round(((i + 1) / empWithEntries.length) * 100));
      }

      // Usa fflate (dependência transitiva do vite) para criar o ZIP
      const { zipSync } = await import('https://esm.sh/fflate@0.8.2');
      const files = {};
      for (const { blob, name } of blobsRef.current) {
        const buf = await blob.arrayBuffer();
        files[name] = new Uint8Array(buf);
      }
      const zipped = zipSync(files, { level: 0 });
      const zipBlob = new Blob([zipped], { type: 'application/zip' });
      const url = URL.createObjectURL(zipBlob);
      setDownloadUrl(url);
      setStatus('done');
      addLog(`Concluído! ${empWithEntries.length} PDF(s) gerados.`, 'success');
    } catch (err) {
      setStatus('error');
      addLog(`Erro: ${err.message}`, 'error');
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
            <p className="text-muted-foreground">
              {empWithEntries.length} colaborador(es) com lançamento encontrado(s).
              {employees.length - empWithEntries.length > 0 && (
                <span className="ml-1 text-yellow-600">({employees.length - empWithEntries.length} sem lançamento serão ignorados)</span>
              )}
            </p>
          </div>

          {empWithEntries.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Nenhum lançamento encontrado para esta empresa neste mês.
            </div>
          ) : (
            <>
              {status === 'idle' && (
                <Button className="w-full gap-2" onClick={handleGenerate}>
                  <FileArchive className="w-4 h-4" />
                  Gerar {empWithEntries.length} PDF(s) e Compactar em ZIP
                </Button>
              )}

              {status === 'generating' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Gerando PDFs... {progress}%
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              {status === 'done' && (
                <Button className="w-full gap-2" onClick={handleDownload} variant="default">
                  <Download className="w-4 h-4" />
                  Baixar ZIP com {empWithEntries.length} PDF(s)
                </Button>
              )}

              {status === 'error' && (
                <Button className="w-full gap-2" onClick={handleGenerate} variant="outline">
                  Tentar Novamente
                </Button>
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