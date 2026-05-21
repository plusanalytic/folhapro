import { useState, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { FileArchive, Loader2, CheckCircle2, XCircle, Download, StopCircle } from 'lucide-react';
import { getMonthName, calculatePayroll, calculateEscritorioPayroll } from '@/lib/payrollCalculations';
import { absenceDiscountByPeriod } from '@/components/payroll/AbsenceDiscountsTable';
import { base44 } from '@/api/base44Client';

// Importa os mesmos componentes de conteúdo usados no PDFReceiptDialog
// Eles são exportados de um arquivo compartilhado
import { HoleriteContent, MeiHoleriteContent, EscritorioHoleriteContent } from '@/components/reports/ReceiptContents';
import ProLaboreReceiptContent from '@/components/reports/ProLaboreReceiptContent';

// Pré-carrega as libs uma vez só (evita import repetido por colaborador)
let _html2canvas = null;
let _jsPDF = null;
async function getLibs() {
  if (!_html2canvas) _html2canvas = (await import('html2canvas')).default;
  if (!_jsPDF) _jsPDF = (await import('jspdf')).jsPDF;
  return { html2canvas: _html2canvas, jsPDF: _jsPDF };
}

// Container offscreen reutilizável
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

/**
 * Renderiza um componente React em PDF blob — otimizado: libs e container reutilizados.
 * Split A4 por páginas (sub-recibos ficam em páginas separadas pois conteúdo principal
 * já ocupa ~297mm, igual ao comportamento do botão Imprimir Recibo).
 */
async function renderComponentToPDFBlob(ReactComponent, props) {
  return new Promise(async (resolve, reject) => {
    const { container, root } = getSharedContainer();
    root.render(<ReactComponent {...props} />);
    await new Promise(r => setTimeout(r, 600));

    try {
      const { html2canvas, jsPDF } = await getLibs();

      const canvas = await html2canvas(container, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 794,
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.88);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();   // 210mm
      const pageH = pdf.internal.pageSize.getHeight(); // 297mm
      const imgH = (canvas.height / canvas.width) * pdfW;

      // Split A4: cada 297mm = nova página — sub-recibos ficam em páginas próprias
      let yPos = 0;
      while (yPos < imgH) {
        if (yPos > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -yPos, pdfW, imgH);
        yPos += pageH;
      }

      resolve(pdf.output('blob'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Resolve o mergedEntry para um colaborador, exatamente como o PDFReceiptDialog faz.
 */
async function buildMergedEntry(employee, entry, payrollType) {
  const [cashOuts, allPA] = await Promise.all([
    base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: entry.reference_month }),
    base44.entities.PointAdjustment.filter({ employee_id: employee.id }),
  ]);
  const pointAdjustments = allPA.filter(a => (a.start_date || '').startsWith(entry.reference_month));

  const firstFromCash  = cashOuts.filter(c => c.period === 'first').map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));
  const secondFromCash = cashOuts.filter(c => c.period === 'second').map(c => ({ id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true }));

  const savedFirst  = (entry?.first_discounts  ?? []).filter(x => !x.fromCashOut);
  const savedSecond = (entry?.second_discounts ?? []).filter(x => !x.fromCashOut);

  const firstDiscounts  = [...savedFirst,  ...firstFromCash];
  const secondDiscounts = [...savedSecond, ...secondFromCash];

  const firstTotal  = firstDiscounts.reduce((s, x) => x.type === 'credit' ? s - (x.amount || 0) : s + (x.amount || 0), 0);
  const secondTotal = secondDiscounts.reduce((s, x) => x.type === 'credit' ? s - (x.amount || 0) : s + (x.amount || 0), 0);

  const absenceMap = entry?.absence_discounts ?? {};
  const { first: absenceFirst, second: absenceSecond } = absenceDiscountByPeriod(absenceMap);

  if (payrollType === 'ESCRITORIO') {
    const calcEsc = calculateEscritorioPayroll({
      base_salary: entry?.base_salary ?? 0,
      meal_voucher_day_value: entry?.meal_voucher_day_value ?? 0,
      meal_voucher_days: entry?.meal_voucher_days ?? 0,
      meal_voucher_discount_pct: entry?.meal_voucher_discount_pct ?? 0,
      transport_voucher_day_value: entry?.transport_voucher_day_value ?? 0,
      transport_voucher_days: entry?.transport_voucher_days ?? 0,
      transport_voucher_discount_pct: entry?.transport_voucher_discount_pct ?? 0,
      inss_pct: entry?.inss_pct ?? 0,
      inss_deduction: entry?.inss_deduction ?? 0,
      dental_plan: entry?.dental_plan ?? 0,
      food_voucher: entry?.food_voucher ?? 0,
      bonus: entry?.bonus ?? 0,
      birthday_bonus: entry?.birthday_bonus ?? 0,
      absence_discount_first: absenceFirst,
      absence_discount_second: absenceSecond,
      first_period_advance: entry?.first_period_advance ?? 0,
      first_period_discount: firstTotal,
      second_period_discount: secondTotal,
      first_period_split: entry?.first_period_split ?? 0.5,
    });
    return {
      ...entry,
      first_discounts: firstDiscounts, second_discounts: secondDiscounts,
      first_period_discount: firstTotal, second_period_discount: secondTotal,
      absence_discount_first: absenceFirst, absence_discount_second: absenceSecond,
      absence_discount: absenceFirst + absenceSecond,
      first_period_net: calcEsc.first_period_net, second_period_net: calcEsc.second_period_net,
      _pointAdjustments: pointAdjustments,
    };
  }

  if (payrollType === 'MOTOCICLISTA_MEI') {
    const diasQ1    = entry?.working_days_first  ?? 0;
    const diasQ2    = entry?.working_days_second ?? 0;
    const totalDias = diasQ1 + diasQ2 || 1;
    const grossTotal = entry?.gross_total ?? 0;
    const firstBase  = entry?.first_period_base  != null ? entry.first_period_base  : Math.round(grossTotal * (diasQ1 / totalDias) * 100) / 100;
    const secondBase = entry?.second_period_base != null ? entry.second_period_base : Math.round(grossTotal * (diasQ2 / totalDias) * 100) / 100;
    const foodVoucher = entry?.food_voucher ?? 0;
    const lifeIns     = entry?.life_insurance ?? 0;
    const firstAdv    = entry?.first_period_advance ?? 0;
    const kmBonus     = entry?.km_bonus ?? Math.round(((entry?.km_bonus_qty||0)*(entry?.km_bonus_value||0))*100)/100;
    const costAllow   = entry?.cost_allowance ?? 0;

    return {
      ...entry,
      first_discounts: firstDiscounts, second_discounts: secondDiscounts,
      first_period_discount: firstTotal, second_period_discount: secondTotal,
      first_period_base: firstBase, second_period_base: secondBase,
      first_period_net:  Math.round((firstBase - lifeIns - firstAdv - firstTotal) * 100) / 100,
      second_period_net: Math.round((secondBase + kmBonus + costAllow + foodVoucher - secondTotal) * 100) / 100,
      _pointAdjustments: pointAdjustments,
    };
  }

  // CLT moto / demais CLT — lógica idêntica ao PDFReceiptDialog
  const cltMotoBase = entry?.clt_moto_base_salary ?? 0;
  const cltMotoDays = entry?.clt_moto_worked_days != null ? Number(entry.clt_moto_worked_days) : 30;
  const cltMotoEffective = entry?.clt_moto_effective_salary
    ?? (cltMotoBase > 0 ? Math.round((cltMotoBase / 30) * cltMotoDays * 100) / 100 : (entry?.base_salary ?? 0));
  const isCLTMoto = payrollType === 'MOTOCICLISTA_CLT';
  const baseSalaryForCalc = isCLTMoto ? cltMotoEffective : (entry?.base_salary ?? 0);

  const fullMonthDays = entry?.full_month_contract_working_days ?? 0;
  const contractDays  = entry?.contract_working_days ?? 0;
  const motoRatio = (isCLTMoto && fullMonthDays > 0) ? contractDays / fullMonthDays : 1;
  const effFoodVoucher   = Math.round((entry?.food_voucher   ?? 0) * motoRatio * 100) / 100;
  const effCostAllowance = Math.round((entry?.cost_allowance ?? 0) * motoRatio * 100) / 100;
  const effMotoRental    = Math.round((entry?.motorcycle_rental ?? 0) * motoRatio * 100) / 100;

  const calcStd = calculatePayroll({
    base_salary: baseSalaryForCalc,
    absence_discount: 0,
    absence_discount_first: absenceFirst, absence_discount_second: absenceSecond,
    meal_voucher_day_value: entry?.meal_voucher_day_value ?? 0,
    meal_voucher_days: entry?.meal_voucher_days ?? 0,
    food_voucher: effFoodVoucher,
    transport_voucher: entry?.transport_voucher ?? 0,
    km_bonus_qty: entry?.km_bonus_qty ?? 0, km_bonus_value: entry?.km_bonus_value ?? 0,
    cost_allowance: effCostAllowance,
    motorcycle_rental: effMotoRental,
    hazard_pay: entry?.hazard_pay ?? 0,
    bonus: entry?.bonus ?? 0, other_benefits: entry?.other_benefits ?? 0,
    union_contribution_value: entry?.union_contribution_value ?? 35,
    meal_voucher_discount_pct: entry?.meal_voucher_discount_pct ?? 0,
    life_insurance: entry?.life_insurance ?? 0,
    inss_pct: entry?.inss_pct ?? 0, inss_discount: entry?.inss_discount ?? 0,
    pj_retention: entry?.pj_retention ?? 0,
    first_period_advance: entry?.first_period_advance ?? 0,
    first_period_discount: firstTotal, second_period_discount: secondTotal,
    first_period_split: entry?.first_period_split ?? 0.5,
  }, employee.contract_type, payrollType);

  return {
    ...entry,
    first_discounts: firstDiscounts, second_discounts: secondDiscounts,
    first_period_discount: firstTotal, second_period_discount: secondTotal,
    absence_discount_first: absenceFirst, absence_discount_second: absenceSecond,
    absence_discount: absenceFirst + absenceSecond,
    first_period_net: calcStd.first_period_net,
    second_period_net: calcStd.second_period_net + (isCLTMoto ? (entry?.route_sp_bonus ?? 0) : 0),
    food_voucher: effFoodVoucher,
    cost_allowance: effCostAllowance,
    motorcycle_rental: effMotoRental,
    _pointAdjustments: pointAdjustments,
  };
}

export default function BulkPDFDialog({ company, employees, entries, jobRoles, referenceMonth, onClose }) {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [currentName, setCurrentName] = useState('');
  const [log, setLog] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const blobsRef = useRef([]);
  const cancelledRef = useRef(false);

  const empWithEntries = employees.filter(emp =>
    entries.find(e => e.employee_id === emp.id && e.reference_month === referenceMonth)
  );

  const addLog = useCallback((msg, type = 'info') => setLog(prev => [...prev, { msg, type }]), []);

  const handleCancel = () => {
    cancelledRef.current = true;
    setStatus('cancelled');
    addLog('Geração cancelada pelo usuário.', 'error');
  };

  const handleGenerate = async () => {
    if (empWithEntries.length === 0) return;
    setStatus('generating');
    setProgress(0);
    setCurrentName('');
    setLog([]);
    setDownloadUrl(null);
    blobsRef.current = [];
    cancelledRef.current = false;

    try {
      for (let i = 0; i < empWithEntries.length; i++) {
        // Verifica cancelamento antes de cada colaborador
        if (cancelledRef.current) break;

        // Yield para liberar o event loop e atualizar a UI antes de cada renderização
        await new Promise(r => setTimeout(r, 30));

        const emp = empWithEntries[i];
        const entry = entries.find(e => e.employee_id === emp.id && e.reference_month === referenceMonth);
        const jr = jobRoles.find(r => r.tangerino_id && String(r.tangerino_id) === String(emp.job_role_tangerino_id));
        const payrollType = jr?.payroll_type || 'CLT';
        const empWithPos = { ...emp, position: emp.position || jr?.name };

        setCurrentName(emp.name);
        addLog(`Gerando PDF: ${emp.name}...`);

        // Usa a mesma lógica de merge do PDFReceiptDialog
        const mergedEntry = await buildMergedEntry(emp, entry, payrollType);

        // Seleciona o mesmo componente que o PDFReceiptDialog usa
        let Component;
        const componentProps = { employee: empWithPos, entry: mergedEntry, month: referenceMonth, company };

        if (payrollType === 'ESCRITORIO') {
          Component = EscritorioHoleriteContent;
        } else if (payrollType === 'MOTOCICLISTA_MEI') {
          Component = MeiHoleriteContent;
        } else if (payrollType === 'SOCIO') {
          Component = ProLaboreReceiptContent;
        } else {
          Component = HoleriteContent;
        }

        const blob = await renderComponentToPDFBlob(Component, componentProps);
        const safeName = emp.name.replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').trim().replace(/\s+/g, '_');
        blobsRef.current.push({ blob, name: `${safeName}.pdf` });

        addLog(`✓ ${emp.name}`, 'success');
        setProgress(Math.round(((i + 1) / empWithEntries.length) * 100));
        // Yield extra após renderização pesada para manter a UI responsiva
        await new Promise(r => setTimeout(r, 10));
      }

      if (cancelledRef.current) return;

      addLog('Compactando em ZIP...', 'info');
      await new Promise(r => setTimeout(r, 30)); // yield para UI mostrar mensagem

      // ZIP com fflate (sem dependência de bundle)
      const { zipSync } = await import('https://esm.sh/fflate@0.8.2');
      const files = {};
      for (const { blob, name } of blobsRef.current) {
        const buf = await blob.arrayBuffer();
        files[name] = new Uint8Array(buf);
      }
      const zipped = zipSync(files, { level: 0 });
      const zipBlob = new Blob([zipped], { type: 'application/zip' });
      setDownloadUrl(URL.createObjectURL(zipBlob));
      setStatus('done');
      setCurrentName('');
      addLog(`✅ Concluído! ${blobsRef.current.length} PDF(s) gerados.`, 'success');
    } catch (err) {
      setStatus('error');
      setCurrentName('');
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
              {empWithEntries.length} colaborador(es) com lançamento.
              {employees.length - empWithEntries.length > 0 && (
                <span className="ml-1 text-yellow-600">({employees.length - empWithEntries.length} sem lançamento serão ignorados)</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">Os PDFs gerados são idênticos ao botão "Imprimir Recibo" de cada colaborador.</p>
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
                <Button className="w-full gap-2" onClick={handleGenerate} variant="outline">
                  Reiniciar Geração
                </Button>
              )}

              {status === 'done' && (
                <Button className="w-full gap-2" onClick={handleDownload}>
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