import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { FileArchive, Loader2, CheckCircle2, XCircle, Download } from 'lucide-react';
import { formatCurrency, getMonthName, calculateEscritorioPayroll, calculatePayroll, numberToWords, getWorkingDaysInMonth } from '@/lib/payrollCalculations';
import { absenceDiscountByPeriod } from '@/components/payroll/AbsenceDiscountsTable';

// Gera o HTML de um holerite para uso no iframe de impressão
function buildHtml(employee, entry, company, referenceMonth, payrollType, jobRoleName) {
  // Recalcula para garantir valores corretos
  const empWithPosition = { ...employee, position: employee.position || jobRoleName || '—' };
  const monthName = getMonthName(referenceMonth);

  const absenceFirst  = entry?.absence_discount_first  ?? 0;
  const absenceSecond = entry?.absence_discount_second ?? 0;
  const firstDiscounts  = entry?.first_discounts  ?? [];
  const secondDiscounts = entry?.second_discounts ?? [];
  const firstNet  = entry?.first_period_net  ?? 0;
  const secondNet = entry?.second_period_net ?? 0;

  const fmtCur = (v) => {
    return 'R$ ' + (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Linhas de proventos e descontos
  let proventos = [];
  let descontos = [];
  let grossTotal = entry?.gross_total ?? 0;

  if (payrollType === 'ESCRITORIO') {
    const calc = calculateEscritorioPayroll({
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
    });
    grossTotal = calc.gross_total;
    if (entry?.base_salary > 0) proventos.push(['Piso Salarial', fmtCur(entry.base_salary)]);
    if (calc.meal_voucher > 0) proventos.push([`Vale Refeição (${entry?.meal_voucher_days}d)`, fmtCur(calc.meal_voucher)]);
    if (calc.transport_voucher_discount > 0) descontos.push([`Desconto VT (${entry?.transport_voucher_discount_pct}%)`, fmtCur(calc.transport_voucher_discount)]);
    if (calc.meal_voucher_discount > 0) descontos.push([`Desconto VR (${entry?.meal_voucher_discount_pct}%)`, fmtCur(calc.meal_voucher_discount)]);
    if (calc.inss_net > 0) descontos.push([`INSS (${entry?.inss_pct}%)`, fmtCur(calc.inss_net)]);
  } else if (payrollType === 'MOTOCICLISTA_MEI') {
    const diasMes = entry?.working_days_month || 1;
    const diasTrab = entry?.working_days_worked ?? diasMes;
    const remuneracao = Math.round((entry?.base_salary ?? 0) / diasMes * diasTrab * 100) / 100;
    const kmBonus = entry?.km_bonus ?? Math.round(((entry?.km_bonus_qty||0)*(entry?.km_bonus_value||0))*100)/100;
    grossTotal = Math.round((remuneracao + kmBonus + (entry?.motorcycle_rental??0) + (entry?.bonus??0) + (entry?.other_benefits??0)) * 100) / 100;
    proventos.push([`Remuneração Prop. (${diasTrab}/${diasMes}d)`, fmtCur(remuneracao)]);
    if (kmBonus > 0) proventos.push([`KM Excedente`, fmtCur(kmBonus)]);
    if (entry?.motorcycle_rental > 0) proventos.push(['Aluguel da Moto', fmtCur(entry.motorcycle_rental)]);
    if (entry?.food_voucher > 0) proventos.push(['Vale Alimentação', fmtCur(entry.food_voucher)]);
    if (entry?.bonus > 0) proventos.push(['Bonificação', fmtCur(entry.bonus)]);
    if (entry?.life_insurance > 0) descontos.push(['Seguro de Vida', fmtCur(entry.life_insurance)]);
  } else {
    if (entry?.base_salary > 0) proventos.push(['Salário Base', fmtCur(entry.base_salary)]);
    if (entry?.km_bonus > 0) proventos.push(['KM Excedente', fmtCur(entry.km_bonus)]);
    if (entry?.hazard_pay > 0) proventos.push(['Periculosidade', fmtCur(entry.hazard_pay)]);
    if (entry?.bonus > 0) proventos.push(['Bonificação', fmtCur(entry.bonus)]);
    if ((entry?.inss ?? 0) > 0) descontos.push(['INSS', fmtCur(entry.inss)]);
    if ((entry?.pj_retention ?? 0) > 0) descontos.push(['Retenção PJ', fmtCur(entry.pj_retention)]);
  }

  const maxRows = Math.max(proventos.length, descontos.length, 1);
  const rows = Array.from({ length: maxRows }).map((_, i) => {
    const p = proventos[i];
    const d = descontos[i];
    return `<tr style="background:${i%2===0?'#faf9ff':'#fff'}">
      <td style="padding:5px 10px;border-bottom:1px solid #e8e4f5">${p ? p[0] : ''}</td>
      <td style="padding:5px 10px;text-align:right;border-bottom:1px solid #e8e4f5;color:#2563eb;font-family:monospace">${p ? p[1] : ''}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #e8e4f5;border-left:1px solid #e8e4f5">${d ? d[0] : ''}</td>
      <td style="padding:5px 10px;text-align:right;border-bottom:1px solid #e8e4f5;color:#dc2626;font-family:monospace">${d ? d[1] : ''}</td>
    </tr>`;
  }).join('');

  const discountLines1 = firstDiscounts.map(d => {
    const c = d.type === 'credit';
    return `<div style="display:flex;justify-content:space-between;font-size:10px;color:${c?'#16a34a':'#dc2626'};margin-bottom:3px">
      <span>${d.description}</span><span>${c?'+':'-'} ${fmtCur(d.amount)}</span></div>`;
  }).join('');
  const discountLines2 = secondDiscounts.map(d => {
    const c = d.type === 'credit';
    return `<div style="display:flex;justify-content:space-between;font-size:10px;color:${c?'#16a34a':'#dc2626'};margin-bottom:3px">
      <span>${d.description}</span><span>${c?'+':'-'} ${fmtCur(d.amount)}</span></div>`;
  }).join('');

  const splitFirst = entry?.first_period_split ?? 0.5;

  return `<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>Recibo - ${employee.name}</title>
    <style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:Arial,sans-serif; background:#fff; }
    @media print { body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } @page { margin:0; } }
    </style></head><body>
    <div style="width:210mm;min-height:297mm;padding:12mm;font-family:Arial,sans-serif;font-size:11px;color:#1a1a2e;background:#fff;box-sizing:border-box">
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #6a3eaf;padding-bottom:10px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:44px;height:44px;background:linear-gradient(135deg,#6a3eaf,#239BB6);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:16px">${(company?.name||'FP').slice(0,2).toUpperCase()}</div>
          <div>
            <div style="font-weight:bold;font-size:14px;color:#6a3eaf">${company?.name||'FolhaPro'}</div>
            ${company?.cnpj ? `<div style="color:#666;font-size:10px">CNPJ: ${company.cnpj}</div>` : ''}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:bold;font-size:15px;color:#6a3eaf;text-transform:uppercase;letter-spacing:1px">Recibo de Pagamento</div>
          <div style="color:#666;font-size:11px;margin-top:2px">${monthName}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;background:#f5f3ff;border-radius:8px;padding:10px 14px;margin-bottom:14px">
        <div><div style="color:#888;font-size:9px;text-transform:uppercase;margin-bottom:2px">Colaborador</div><div style="font-weight:bold">${employee.name}</div></div>
        <div><div style="color:#888;font-size:9px;text-transform:uppercase;margin-bottom:2px">CPF</div><div style="font-weight:bold">${employee.cpf_cnpj||'—'}</div></div>
        <div><div style="color:#888;font-size:9px;text-transform:uppercase;margin-bottom:2px">Cargo</div><div style="font-weight:bold">${empWithPosition.position}</div></div>
        <div><div style="color:#888;font-size:9px;text-transform:uppercase;margin-bottom:2px">Contrato</div><div style="font-weight:bold">${employee.contract_type}</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px">
        <thead><tr>
          <th style="background:#6a3eaf;color:#fff;padding:7px 10px;text-align:left;border-radius:6px 0 0 0;width:48%">Proventos</th>
          <th style="background:#6a3eaf;color:#fff;padding:7px 10px;text-align:right;width:14%">Valor (R$)</th>
          <th style="background:#444;color:#fff;padding:7px 10px;text-align:left;width:24%">Descontos</th>
          <th style="background:#444;color:#fff;padding:7px 10px;text-align:right;border-radius:0 6px 0 0;width:14%">Valor (R$)</th>
        </tr></thead>
        <tbody>${rows}
          <tr>
            <td style="padding:7px 10px;font-weight:bold;background:#ede9fe;border-top:2px solid #6a3eaf">TOTAL BRUTO</td>
            <td style="padding:7px 10px;text-align:right;font-weight:bold;background:#ede9fe;border-top:2px solid #6a3eaf;color:#2563eb;font-family:monospace">${fmtCur(grossTotal)}</td>
            <td style="padding:7px 10px;font-weight:bold;background:#fee2e2;border-top:2px solid #dc2626;border-left:1px solid #e8e4f5">TOTAL DESCONTOS</td>
            <td style="padding:7px 10px;text-align:right;font-weight:bold;background:#fee2e2;border-top:2px solid #dc2626;color:#dc2626;font-family:monospace">${fmtCur(descontos.reduce((s,d)=>s+(parseFloat(d[1].replace(/[^\d,]/g,'').replace(',','.'))||0),0))}</td>
          </tr>
        </tbody>
      </table>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div style="border:2px solid #6a3eaf;border-radius:8px;overflow:hidden">
          <div style="background:#6a3eaf;color:#fff;padding:6px 12px;font-size:10px;font-weight:bold;text-transform:uppercase">1ª Quinzena (1–15)</div>
          <div style="padding:8px 12px">
            ${absenceFirst > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;color:#dc2626;margin-bottom:3px"><span>Desc. Faltas (1–15)</span><span>- ${fmtCur(absenceFirst)}</span></div>` : ''}
            ${entry?.first_period_advance > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;color:#dc2626;margin-bottom:3px"><span>Adiantamento</span><span>- ${fmtCur(entry.first_period_advance)}</span></div>` : ''}
            ${discountLines1}
            <div style="border-top:1px solid #e8e4f5;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-weight:bold;font-size:12px">
              <span style="color:#6a3eaf">A Receber</span><span style="font-family:monospace;color:#6a3eaf">${fmtCur(firstNet)}</span>
            </div>
          </div>
        </div>
        <div style="border:2px solid #6a3eaf;border-radius:8px;overflow:hidden">
          <div style="background:#6a3eaf;color:#fff;padding:6px 12px;font-size:10px;font-weight:bold;text-transform:uppercase">2ª Quinzena (16–30)</div>
          <div style="padding:8px 12px">
            ${absenceSecond > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;color:#dc2626;margin-bottom:3px"><span>Desc. Faltas (16–30)</span><span>- ${fmtCur(absenceSecond)}</span></div>` : ''}
            ${discountLines2}
            <div style="border-top:1px solid #e8e4f5;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-weight:bold;font-size:12px">
              <span style="color:#6a3eaf">A Receber</span><span style="font-family:monospace;color:#6a3eaf">${fmtCur(secondNet)}</span>
            </div>
          </div>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,#6a3eaf,#239BB6);border-radius:10px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;color:#fff">
        <div>
          <div style="font-size:10px;opacity:0.85;text-transform:uppercase;letter-spacing:1px">TOTAL A RECEBER (1ª + 2ª Quinzena)</div>
        </div>
        <div style="font-size:24px;font-weight:bold;font-family:monospace">${fmtCur(firstNet + secondNet)}</div>
      </div>
      ${(employee.bank_name || employee.pix_key) ? `
      <div style="border:1px solid #e8e4f5;border-radius:8px;padding:10px 14px;margin-bottom:16px;background:#fafafa">
        <div style="color:#888;font-size:9px;text-transform:uppercase;margin-bottom:6px">Dados para Pagamento</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:10px">
          ${employee.bank_name ? `<div><span style="color:#888">Banco: </span><strong>${employee.bank_name}</strong></div>` : ''}
          ${employee.bank_agency ? `<div><span style="color:#888">Agência: </span><strong>${employee.bank_agency}</strong></div>` : ''}
          ${employee.bank_account ? `<div><span style="color:#888">Conta: </span><strong>${employee.bank_account}</strong></div>` : ''}
          ${employee.pix_key ? `<div><span style="color:#888">PIX: </span><strong>${employee.pix_key}</strong></div>` : ''}
        </div>
      </div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px">
        <div style="text-align:center">
          <div style="border-top:1px solid #999;padding-top:6px;margin-top:32px">
            <div style="font-weight:bold;font-size:11px">${company?.name||'__________________________'}</div>
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
    </div>
  </body></html>`;
}

export default function BatchPDFDialog({ company, employees, entries, jobRoles, referenceMonth, onClose }) {
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [progress, setProgress] = useState(0);
  const [processed, setProcessed] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const companyEmps = employees.filter(e => e.company_id === company.id);
  const empsWithEntry = companyEmps.filter(emp => entries.find(en => en.employee_id === emp.id));

  const handleGenerate = async () => {
    if (empsWithEntry.length === 0) return;
    setStatus('running');
    setProgress(0);
    setProcessed([]);

    // Importa JSZip dinamicamente
    let JSZip;
    try {
      const mod = await import('https://esm.sh/jszip@3.10.1');
      JSZip = mod.default;
    } catch (e) {
      setErrorMsg('Erro ao carregar biblioteca de compactação.');
      setStatus('error');
      return;
    }

    const zip = new JSZip();
    const results = [];

    for (let i = 0; i < empsWithEntry.length; i++) {
      const emp = empsWithEntry[i];
      const entry = entries.find(en => en.employee_id === emp.id);
      const jr = jobRoles.find(jr => jr.tangerino_id && String(jr.tangerino_id) === String(emp.job_role_tangerino_id));
      const payrollType = jr?.payroll_type;
      const jobRoleName = jr?.name;

      const html = buildHtml(emp, entry, company, referenceMonth, payrollType, jobRoleName);

      // Gera PDF via iframe de impressão (window.open + print)
      // Como não temos headless, salvamos como HTML individual dentro do ZIP
      const fileName = `${emp.name.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_')}.html`;
      zip.file(fileName, html);
      results.push({ name: emp.name, ok: true });
      setProgress(Math.round(((i + 1) / empsWithEntry.length) * 100));
    }

    setProcessed(results);

    // Gera e faz download do ZIP
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Recibos_${company.name.replace(/\s+/g,'_')}_${referenceMonth}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setStatus('done');
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
            <p><span className="text-muted-foreground">Empresa:</span> <strong>{company.name}</strong></p>
            <p><span className="text-muted-foreground">Mês:</span> <strong>{referenceMonth}</strong></p>
            <p><span className="text-muted-foreground">Colaboradores com lançamento:</span> <strong>{empsWithEntry.length}</strong></p>
            {companyEmps.length !== empsWithEntry.length && (
              <p className="text-xs text-amber-700">⚠️ {companyEmps.length - empsWithEntry.length} colaborador(es) sem lançamento serão ignorados.</p>
            )}
          </div>

          {empsWithEntry.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Nenhum colaborador com lançamento neste mês para esta empresa.
            </div>
          ) : (
            <>
              {status !== 'idle' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {status === 'running' ? 'Gerando arquivos...' : status === 'done' ? 'Concluído!' : 'Erro'}
                    </span>
                    <span className="font-mono text-xs">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              {processed.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {processed.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.ok
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                      <span>{r.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {status === 'done' && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                  <Download className="w-4 h-4 shrink-0" />
                  ZIP baixado com {empsWithEntry.length} recibo(s) em formato HTML — abra cada arquivo no navegador e imprima como PDF.
                </div>
              )}

              {status === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {errorMsg}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {status === 'done' ? 'Fechar' : 'Cancelar'}
          </Button>
          {status !== 'done' && empsWithEntry.length > 0 && (
            <Button
              className="flex-1 gap-2"
              onClick={handleGenerate}
              disabled={status === 'running'}
            >
              {status === 'running'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
                : <><FileArchive className="w-4 h-4" /> Gerar ZIP</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}