/**
 * Utilitário compartilhado de geração de PDF por recibo.
 * Usado tanto no BulkPDFDialog (lote) quanto no download individual da lista.
 */
import { createRoot } from 'react-dom/client';
import { HoleriteContent, MeiHoleriteContent, EscritorioHoleriteContent } from '@/components/reports/ReceiptContents';
import ProLaboreReceiptContent from '@/components/reports/ProLaboreReceiptContent';
import EsporadicoReceiptContent from '@/components/reports/EsporadicoReceiptContent';
import { buildMergedPayrollEntry } from '@/lib/buildMergedPayrollEntry';

// Pré-carrega as libs uma vez só
let _html2canvas = null;
let _jsPDF = null;
export async function getLibs() {
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
 * Renderiza um componente React em um PDF blob (A4).
 * Scale 2 = alta resolução. Um recibo = uma página (sem cortar conteúdo).
 */
export async function renderComponentToPDFBlob(ReactComponent, props) {
  return new Promise(async (resolve, reject) => {
    const { container, root } = getSharedContainer();
    root.render(<ReactComponent {...props} />);
    await new Promise(r => setTimeout(r, 200));
    try {
      const { html2canvas, jsPDF } = await getLibs();
      const canvas = await html2canvas(container, {
        scale: 1.5, useCORS: true, backgroundColor: '#ffffff',
        logging: false, width: 794, windowWidth: 794,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height / canvas.width) * pdfW;

      if (imgH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH);
      } else {
        const scale = pageH / imgH;
        const scaledW = pdfW * scale;
        pdf.addImage(imgData, 'JPEG', (pdfW - scaledW) / 2, 0, scaledW, pageH);
      }
      resolve(pdf.output('blob'));
    } catch (err) {
      reject(err);
    }
  });
}

/** Retorna o componente de recibo correto para cada payrollType */
export function getReceiptComponent(payrollType) {
  if (payrollType === 'ESCRITORIO') return EscritorioHoleriteContent;
  if (payrollType === 'MOTOCICLISTA_MEI') return MeiHoleriteContent;
  if (payrollType === 'SOCIO') return ProLaboreReceiptContent;
  if (payrollType === 'ESPORADICO') return EsporadicoReceiptContent;
  return HoleriteContent;
}

/**
 * Renderiza múltiplas páginas em um único PDF (uma página por componente).
 * pages = [{ Component, props }]
 */
export async function renderMultiPagePDF(pages) {
  const { html2canvas, jsPDF } = await getLibs();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const { container, root } = getSharedContainer();

  for (let i = 0; i < pages.length; i++) {
    const { Component, props } = pages[i];
    root.render(<Component {...props} />);
    await new Promise(r => setTimeout(r, 200));
    const canvas = await html2canvas(container, {
      scale: 1.5, useCORS: true, backgroundColor: '#ffffff',
      logging: false, width: 794, windowWidth: 794,
    });
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgH = (canvas.height / canvas.width) * pdfW;
    if (i > 0) pdf.addPage();
    if (imgH <= pageH) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH);
    } else {
      const scale = pageH / imgH;
      const scaledW = pdfW * scale;
      pdf.addImage(imgData, 'JPEG', (pdfW - scaledW) / 2, 0, scaledW, pageH);
    }
  }

  return pdf.output('blob');
}

/**
 * Gera e baixa o PDF de recibo de um colaborador diretamente no computador.
 */
export async function downloadReceiptPDF({ emp, entry, payrollType, referenceMonth, company }) {
  const { mergedEntry, paymentStatus } = await buildMergedPayrollEntry(emp, entry, payrollType);
  const Component = getReceiptComponent(payrollType);
  const blob = await renderComponentToPDFBlob(Component, {
    employee: emp, entry: mergedEntry, month: referenceMonth, company, paymentStatus,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Recibo_${emp.name.replace(/\s+/g, '_')}_${referenceMonth}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}