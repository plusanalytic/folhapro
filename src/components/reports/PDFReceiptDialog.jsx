import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Printer } from 'lucide-react';
import { formatCurrency, numberToWords, getMonthName, calculatePayroll, calculateEscritorioPayroll } from '@/lib/payrollCalculations';
import { base44 } from '@/api/base44Client';

// ─── Holerite completo ────────────────────────────────────────────────────────
function HoleriteContent({ employee, entry, month, company }) {
  const isCLT = employee.contract_type === 'CLT';

  // Recalcula proventos/descontos globais (sem quinzenal)
  const calc = calculatePayroll({
    base_salary:               entry?.base_salary ?? 0,
    absences_days:             entry?.absences_days ?? 0,
    meal_voucher_day_value:    entry?.meal_voucher_day_value ?? 0,
    meal_voucher_days:         entry?.meal_voucher_days ?? 0,
    transport_voucher:         entry?.transport_voucher ?? 0,
    km_bonus:                  entry?.km_bonus ?? 0,
    motorcycle_rental:         entry?.motorcycle_rental ?? 0,
    hazard_pay:                entry?.hazard_pay ?? 0,
    bonus:                     entry?.bonus ?? 0,
    other_benefits:            entry?.other_benefits ?? 0,
    union_contribution_pct:    entry?.union_contribution_pct ?? 0,
    meal_voucher_discount_pct: entry?.meal_voucher_discount_pct ?? 0,
    life_insurance:            entry?.life_insurance ?? 0,
    inss_pct:                  entry?.inss_pct ?? 0,
    inss_discount:             entry?.inss_discount ?? 0,
    pj_retention:              entry?.pj_retention ?? 0,
    first_period_advance:      0,
    first_period_discount:     0,
    second_period_discount:    0,
  }, employee.contract_type);

  const baseSalary  = entry?.base_salary ?? 0;
  const mealVDays   = entry?.meal_voucher_days ?? 0;
  const mealVDay    = entry?.meal_voucher_day_value ?? 0;
  const transport   = entry?.transport_voucher ?? 0;
  const kmBonus     = entry?.km_bonus ?? 0;
  const motoRental  = entry?.motorcycle_rental ?? 0;
  const hazardPay   = entry?.hazard_pay ?? 0;
  const bonus       = entry?.bonus ?? 0;
  const otherBen    = entry?.other_benefits ?? 0;
  const pjRet       = entry?.pj_retention ?? 0;
  const lifeIns     = entry?.life_insurance ?? 0;
  const firstAdv    = entry?.first_period_advance ?? 0;
  const grossTotal  = calc.gross_total;
  const netTotal    = calc.net_total;

  // Valores de quinzena: usar os salvos no entry (calculados no momento do save com descontos reais)
  const firstNet  = entry?.first_period_net  ?? 0;
  const secondNet = entry?.second_period_net ?? 0;

  // Descontos detalhados por quinzena
  const firstDiscounts  = entry?.first_discounts  ?? [];
  const secondDiscounts = entry?.second_discounts ?? [];

  const monthName = getMonthName(month);

  const proventos = [
    { label: 'Salário Base', value: baseSalary, show: true },
    { label: `Vale Refeição (${mealVDays}d × ${formatCurrency(mealVDay)})`, value: calc.meal_voucher, show: calc.meal_voucher > 0 },
    { label: 'Vale Transporte', value: transport, show: transport > 0 },
    { label: 'Adicional KM', value: kmBonus, show: kmBonus > 0 },
    { label: 'Aluguel da Motocicleta', value: motoRental, show: motoRental > 0 },
    { label: 'Periculosidade', value: hazardPay, show: hazardPay > 0 },
    { label: 'Bonificação / Prêmio', value: bonus, show: bonus > 0 },
    { label: 'Outros Benefícios', value: otherBen, show: otherBen > 0 },
  ].filter(x => x.show);

  const descontos = [
    { label: `Desc. Faltas (${entry?.absences_days ?? 0}d)`, value: calc.absence_discount, show: calc.absence_discount > 0 },
    { label: 'INSS', value: calc.inss_net, show: calc.inss_net > 0 },
    { label: 'IRRF', value: calc.irrf, show: calc.irrf > 0 },
    { label: 'Retenção PJ', value: pjRet, show: pjRet > 0 },
    { label: 'Contribuição Assistencial', value: calc.union_contribution, show: calc.union_contribution > 0 },
    { label: 'Desconto Vale Refeição', value: calc.meal_voucher_discount, show: calc.meal_voucher_discount > 0 },
    { label: 'Seguro de Vida', value: lifeIns, show: lifeIns > 0 },
  ].filter(x => x.show);

  const totalDescontos = descontos.reduce((s, d) => s + d.value, 0);
  const maxRows = Math.max(proventos.length, descontos.length);

  return (
    <div style={{ width: '210mm', minHeight: '297mm', padding: '12mm', fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#1a1a2e', backgroundColor: '#fff', boxSizing: 'border-box' }}>

      {/* ── Cabeçalho ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #6a3eaf', paddingBottom: '10px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', background: 'linear-gradient(135deg,#6a3eaf,#239BB6)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '16px' }}>
            {(company?.name || 'FP').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#6a3eaf' }}>{company?.name || 'FolhaPro'}</div>
            {company?.cnpj && <div style={{ color: '#666', fontSize: '10px' }}>CNPJ: {company.cnpj}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#6a3eaf', textTransform: 'uppercase', letterSpacing: '1px' }}>Recibo de Pagamento</div>
          <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>{monthName}</div>
        </div>
      </div>

      {/* ── Dados do colaborador ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', background: '#f5f3ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
        <div>
          <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Colaborador</div>
          <div style={{ fontWeight: 'bold' }}>{employee.name}</div>
        </div>
        <div>
          <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>CPF</div>
          <div style={{ fontWeight: 'bold' }}>{employee.cpf_cnpj || '—'}</div>
        </div>
        <div>
          <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Cargo</div>
          <div style={{ fontWeight: 'bold' }}>{employee.position || '—'}</div>
        </div>
        <div>
          <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Contrato</div>
          <div style={{ fontWeight: 'bold' }}>{employee.contract_type}</div>
        </div>
        {employee.admission_date && (
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Admissão</div>
            <div style={{ fontWeight: 'bold' }}>{employee.admission_date}</div>
          </div>
        )}
        {employee.pis && (
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>PIS</div>
            <div style={{ fontWeight: 'bold' }}>{employee.pis}</div>
          </div>
        )}
      </div>

      {/* ── Tabela de Proventos e Descontos ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '11px' }}>
        <thead>
          <tr>
            <th style={{ background: '#6a3eaf', color: '#fff', padding: '7px 10px', textAlign: 'left', borderRadius: '6px 0 0 0', width: '48%' }}>Proventos</th>
            <th style={{ background: '#6a3eaf', color: '#fff', padding: '7px 10px', textAlign: 'right', width: '14%' }}>Valor (R$)</th>
            <th style={{ background: '#444', color: '#fff', padding: '7px 10px', textAlign: 'left', width: '24%' }}>Descontos</th>
            <th style={{ background: '#444', color: '#fff', padding: '7px 10px', textAlign: 'right', borderRadius: '0 6px 0 0', width: '14%' }}>Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }).map((_, i) => {
            const p = proventos[i];
            const d = descontos[i];
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? '#faf9ff' : '#fff' }}>
                <td style={{ padding: '5px 10px', borderBottom: '1px solid #e8e4f5' }}>{p ? p.label : ''}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', borderBottom: '1px solid #e8e4f5', color: '#2563eb', fontFamily: 'monospace' }}>{p ? formatCurrency(p.value) : ''}</td>
                <td style={{ padding: '5px 10px', borderBottom: '1px solid #e8e4f5', borderLeft: '1px solid #e8e4f5' }}>{d ? d.label : ''}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', borderBottom: '1px solid #e8e4f5', color: '#dc2626', fontFamily: 'monospace' }}>{d ? formatCurrency(d.value) : ''}</td>
              </tr>
            );
          })}
          {/* Linha totais */}
          <tr>
            <td style={{ padding: '7px 10px', fontWeight: 'bold', background: '#ede9fe', borderTop: '2px solid #6a3eaf' }}>TOTAL BRUTO</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', background: '#ede9fe', borderTop: '2px solid #6a3eaf', color: '#2563eb', fontFamily: 'monospace' }}>{formatCurrency(grossTotal)}</td>
            <td style={{ padding: '7px 10px', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', borderLeft: '1px solid #e8e4f5' }}>TOTAL DESCONTOS</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', color: '#dc2626', fontFamily: 'monospace' }}>{formatCurrency(totalDescontos)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Resumo Quinzenal ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        {/* 1ª Quinzena */}
        <div style={{ border: '2px solid #6a3eaf', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#6a3eaf', color: '#fff', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>
            1ª Quinzena (1–15)
          </div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginBottom: '4px' }}>
              <span>Base (50% líquido)</span>
              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(netTotal / 2)}</span>
            </div>
            {firstAdv > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}>
                <span>Adiantamento</span>
                <span style={{ fontFamily: 'monospace' }}>- {formatCurrency(firstAdv)}</span>
              </div>
            )}
            {firstDiscounts.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}>
                <span>{d.description}{d.date ? ` (${d.date})` : ''}</span>
                <span style={{ fontFamily: 'monospace' }}>- {formatCurrency(d.amount)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #e8e4f5', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}>
              <span style={{ color: '#6a3eaf' }}>A Receber</span>
              <span style={{ fontFamily: 'monospace', color: '#6a3eaf' }}>{formatCurrency(firstNet)}</span>
            </div>
          </div>
        </div>

        {/* 2ª Quinzena */}
        <div style={{ border: '2px solid #6a3eaf', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#6a3eaf', color: '#fff', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>
            2ª Quinzena (16–30)
          </div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginBottom: '4px' }}>
              <span>Base (50% líquido)</span>
              <span style={{ fontFamily: 'monospace' }}>{formatCurrency(netTotal / 2)}</span>
            </div>
            {secondDiscounts.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}>
                <span>{d.description}{d.date ? ` (${d.date})` : ''}</span>
                <span style={{ fontFamily: 'monospace' }}>- {formatCurrency(d.amount)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #e8e4f5', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}>
              <span style={{ color: '#6a3eaf' }}>A Receber</span>
              <span style={{ fontFamily: 'monospace', color: '#6a3eaf' }}>{formatCurrency(secondNet)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* FGTS info (CLT) */}
      {isCLT && (
        <div style={{ border: '1px solid #e8e4f5', borderRadius: '8px', padding: '8px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#888', fontSize: '10px', textTransform: 'uppercase' }}>FGTS (8%) — informativo</span>
          <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#239BB6', fontFamily: 'monospace' }}>{formatCurrency(calc.fgts)}</span>
        </div>
      )}

      {/* ── Líquido Total ── */}
      <div style={{ background: 'linear-gradient(135deg,#6a3eaf,#239BB6)', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: '#fff' }}>
        <div>
          <div style={{ fontSize: '10px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '1px' }}>VALOR LÍQUIDO TOTAL</div>
          <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>{numberToWords(netTotal)}</div>
        </div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatCurrency(netTotal)}</div>
      </div>

      {/* ── Dados bancários ── */}
      {(employee.bank_name || employee.pix_key) && (
        <div style={{ border: '1px solid #e8e4f5', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', background: '#fafafa' }}>
          <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '6px' }}>Dados para Pagamento</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '10px' }}>
            {employee.bank_name && <div><span style={{ color: '#888' }}>Banco: </span><strong>{employee.bank_name}</strong></div>}
            {employee.bank_agency && <div><span style={{ color: '#888' }}>Agência: </span><strong>{employee.bank_agency}</strong></div>}
            {employee.bank_account && <div><span style={{ color: '#888' }}>Conta: </span><strong>{employee.bank_account}</strong></div>}
            {employee.bank_beneficiary && <div><span style={{ color: '#888' }}>Favorecido: </span><strong>{employee.bank_beneficiary}</strong></div>}
            {employee.pix_key && <div><span style={{ color: '#888' }}>PIX: </span><strong>{employee.pix_key}</strong></div>}
          </div>
        </div>
      )}

      {/* ── Assinatura ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '16px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #999', paddingTop: '6px', marginTop: '32px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{company?.name || '______________________________'}</div>
            <div style={{ color: '#888', fontSize: '10px' }}>Empregador / Responsável</div>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #999', paddingTop: '6px', marginTop: '32px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{employee.name}</div>
            <div style={{ color: '#888', fontSize: '10px' }}>Colaborador — {employee.cpf_cnpj}</div>
          </div>
          <div style={{ marginTop: '8px', color: '#888', fontSize: '10px' }}>Data: _____ / _____ / _________</div>
        </div>
      </div>

      {/* ── Separador + Recibo Aluguel Moto ── */}
      {(entry?.motorcycle_rental ?? 0) > 0 && (
        <>
          <div style={{ borderTop: '2px dashed #ccc', margin: '28px 0 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '-9px', left: '50%', transform: 'translateX(-50%)', background: '#fff', padding: '0 12px', color: '#999', fontSize: '10px' }}>✂ Destacar</div>
          </div>
          <MotoReceiptContent employee={employee} entry={entry} month={month} />
        </>
      )}
    </div>
  );
}

// ─── Holerite Escritório ──────────────────────────────────────────────────────
function EscritorioHoleriteContent({ employee, entry, month, company }) {
  const calc = calculateEscritorioPayroll({
    base_salary: entry?.base_salary ?? 0,
    meal_voucher_day_value: entry?.meal_voucher_day_value ?? 0,
    meal_voucher_days: entry?.meal_voucher_days ?? 0,
    inss_pct: entry?.inss_pct ?? 0,
    transport_voucher_discount_pct: entry?.transport_voucher_discount_pct ?? 0,
    meal_voucher_discount_pct: entry?.meal_voucher_discount_pct ?? 0,
    dental_plan: entry?.dental_plan ?? 0,
    transport_voucher: entry?.transport_voucher ?? 0,
    food_voucher: entry?.food_voucher ?? 0,
    birthday_bonus: entry?.birthday_bonus ?? 0,
    first_period_advance: 0,
    first_period_discount: 0,
    second_period_discount: 0,
  });

  const netTotal = calc.net_total;
  const firstNet = entry?.first_period_net ?? 0;
  const secondNet = entry?.second_period_net ?? 0;
  const firstDiscounts = entry?.first_discounts ?? [];
  const secondDiscounts = entry?.second_discounts ?? [];
  const firstAdv = entry?.first_period_advance ?? 0;
  const monthName = getMonthName(month);

  const proventos = [
    { label: 'Piso Salarial', value: entry?.base_salary ?? 0, show: true },
    { label: `Vale Refeição (${entry?.meal_voucher_days ?? 0}d × ${formatCurrency(entry?.meal_voucher_day_value ?? 0)})`, value: calc.meal_voucher, show: calc.meal_voucher > 0 },
    { label: 'Seguro Odontológico', value: entry?.dental_plan ?? 0, show: (entry?.dental_plan ?? 0) > 0 },
    { label: 'Vale Transporte', value: entry?.transport_voucher ?? 0, show: (entry?.transport_voucher ?? 0) > 0 },
    { label: 'Vale Alimentação', value: entry?.food_voucher ?? 0, show: (entry?.food_voucher ?? 0) > 0 },
    { label: 'Bonificação Aniversário', value: entry?.birthday_bonus ?? 0, show: (entry?.birthday_bonus ?? 0) > 0 },
  ].filter(x => x.show);

  const descontos = [
    { label: 'INSS', value: calc.inss, show: calc.inss > 0 },
    { label: `Desconto VT (${entry?.transport_voucher_discount_pct ?? 0}%)`, value: calc.transport_voucher_discount, show: calc.transport_voucher_discount > 0 },
    { label: `Desconto VR (${entry?.meal_voucher_discount_pct ?? 0}%)`, value: calc.meal_voucher_discount, show: calc.meal_voucher_discount > 0 },
  ].filter(x => x.show);

  const totalDescontos = descontos.reduce((s, d) => s + d.value, 0);
  const maxRows = Math.max(proventos.length, descontos.length);

  return (
    <div style={{ width: '210mm', minHeight: '297mm', padding: '12mm', fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#1a1a2e', backgroundColor: '#fff', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #6a3eaf', paddingBottom: '10px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', background: 'linear-gradient(135deg,#6a3eaf,#239BB6)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '16px' }}>
            {(company?.name || 'FP').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#6a3eaf' }}>{company?.name || 'FolhaPro'}</div>
            {company?.cnpj && <div style={{ color: '#666', fontSize: '10px' }}>CNPJ: {company.cnpj}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#6a3eaf', textTransform: 'uppercase', letterSpacing: '1px' }}>Recibo de Pagamento</div>
          <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>{monthName}</div>
          <div style={{ color: '#888', fontSize: '10px', marginTop: '1px' }}>Modelo: Escritório CLT</div>
        </div>
      </div>

      {/* Dados do colaborador */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', background: '#f5f3ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Colaborador</div><div style={{ fontWeight: 'bold' }}>{employee.name}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>CPF</div><div style={{ fontWeight: 'bold' }}>{employee.cpf_cnpj || '—'}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Cargo</div><div style={{ fontWeight: 'bold' }}>{employee.position || '—'}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Contrato</div><div style={{ fontWeight: 'bold' }}>CLT — Escritório</div></div>
        {employee.admission_date && <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Admissão</div><div style={{ fontWeight: 'bold' }}>{employee.admission_date}</div></div>}
        {employee.pis && <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>PIS</div><div style={{ fontWeight: 'bold' }}>{employee.pis}</div></div>}
      </div>

      {/* Bloco convenção coletiva */}
      <div style={{ border: '1px solid #e8e4f5', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', background: '#fafaff' }}>
        <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#6a3eaf', textTransform: 'uppercase', marginBottom: '8px' }}>Convenção Coletiva</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#555' }}>Total Custos Conv.</span><span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{formatCurrency(calc.total_convencao)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#dc2626' }}>Total Descontos</span><span style={{ fontFamily: 'monospace', color: '#dc2626' }}>- {formatCurrency(calc.total_desc_convencao)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6a3eaf', fontWeight: 'bold' }}>A Receber Líquido Conv.</span><span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#6a3eaf' }}>{formatCurrency(calc.liquido_convencao)}</span></div>
        </div>
      </div>

      {/* Tabela Proventos e Descontos */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '11px' }}>
        <thead>
          <tr>
            <th style={{ background: '#6a3eaf', color: '#fff', padding: '7px 10px', textAlign: 'left', borderRadius: '6px 0 0 0', width: '48%' }}>Proventos</th>
            <th style={{ background: '#6a3eaf', color: '#fff', padding: '7px 10px', textAlign: 'right', width: '14%' }}>Valor (R$)</th>
            <th style={{ background: '#444', color: '#fff', padding: '7px 10px', textAlign: 'left', width: '24%' }}>Descontos Conv.</th>
            <th style={{ background: '#444', color: '#fff', padding: '7px 10px', textAlign: 'right', borderRadius: '0 6px 0 0', width: '14%' }}>Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }).map((_, i) => {
            const p = proventos[i];
            const d = descontos[i];
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? '#faf9ff' : '#fff' }}>
                <td style={{ padding: '5px 10px', borderBottom: '1px solid #e8e4f5' }}>{p ? p.label : ''}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', borderBottom: '1px solid #e8e4f5', color: '#2563eb', fontFamily: 'monospace' }}>{p ? formatCurrency(p.value) : ''}</td>
                <td style={{ padding: '5px 10px', borderBottom: '1px solid #e8e4f5', borderLeft: '1px solid #e8e4f5' }}>{d ? d.label : ''}</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', borderBottom: '1px solid #e8e4f5', color: '#dc2626', fontFamily: 'monospace' }}>{d ? formatCurrency(d.value) : ''}</td>
              </tr>
            );
          })}
          <tr>
            <td style={{ padding: '7px 10px', fontWeight: 'bold', background: '#ede9fe', borderTop: '2px solid #6a3eaf' }}>TOTAL BRUTO</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', background: '#ede9fe', borderTop: '2px solid #6a3eaf', color: '#2563eb', fontFamily: 'monospace' }}>{formatCurrency(calc.gross_total)}</td>
            <td style={{ padding: '7px 10px', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', borderLeft: '1px solid #e8e4f5' }}>TOTAL DESCONTOS</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', color: '#dc2626', fontFamily: 'monospace' }}>{formatCurrency(totalDescontos)}</td>
          </tr>
        </tbody>
      </table>

      {/* Quinzenal */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div style={{ border: '2px solid #6a3eaf', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#6a3eaf', color: '#fff', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>1ª Quinzena (1–15)</div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginBottom: '4px' }}><span>Base (50% líquido)</span><span style={{ fontFamily: 'monospace' }}>{formatCurrency(netTotal / 2)}</span></div>
            {firstAdv > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}><span>Adiantamento</span><span style={{ fontFamily: 'monospace' }}>- {formatCurrency(firstAdv)}</span></div>}
            {firstDiscounts.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}>
                <span>{d.description}{d.date ? ` (${d.date})` : ''}</span>
                <span style={{ fontFamily: 'monospace' }}>- {formatCurrency(d.amount)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #e8e4f5', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}>
              <span style={{ color: '#6a3eaf' }}>A Receber</span>
              <span style={{ fontFamily: 'monospace', color: '#6a3eaf' }}>{formatCurrency(firstNet)}</span>
            </div>
          </div>
        </div>
        <div style={{ border: '2px solid #6a3eaf', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#6a3eaf', color: '#fff', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>2ª Quinzena (16–30)</div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginBottom: '4px' }}><span>Base (50% líquido)</span><span style={{ fontFamily: 'monospace' }}>{formatCurrency(netTotal / 2)}</span></div>
            {secondDiscounts.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}>
                <span>{d.description}{d.date ? ` (${d.date})` : ''}</span>
                <span style={{ fontFamily: 'monospace' }}>- {formatCurrency(d.amount)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #e8e4f5', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}>
              <span style={{ color: '#6a3eaf' }}>A Receber</span>
              <span style={{ fontFamily: 'monospace', color: '#6a3eaf' }}>{formatCurrency(secondNet)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* FGTS */}
      <div style={{ border: '1px solid #e8e4f5', borderRadius: '8px', padding: '8px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#888', fontSize: '10px', textTransform: 'uppercase' }}>FGTS (8%) — informativo</span>
        <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#239BB6', fontFamily: 'monospace' }}>{formatCurrency(calc.fgts)}</span>
      </div>

      {/* Líquido Total */}
      <div style={{ background: 'linear-gradient(135deg,#6a3eaf,#239BB6)', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: '#fff' }}>
        <div>
          <div style={{ fontSize: '10px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '1px' }}>VALOR LÍQUIDO TOTAL</div>
          <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>{numberToWords(netTotal)}</div>
        </div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatCurrency(netTotal)}</div>
      </div>

      {/* Dados bancários */}
      {(employee.bank_name || employee.pix_key) && (
        <div style={{ border: '1px solid #e8e4f5', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', background: '#fafafa' }}>
          <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '6px' }}>Dados para Pagamento</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '10px' }}>
            {employee.bank_name && <div><span style={{ color: '#888' }}>Banco: </span><strong>{employee.bank_name}</strong></div>}
            {employee.bank_agency && <div><span style={{ color: '#888' }}>Agência: </span><strong>{employee.bank_agency}</strong></div>}
            {employee.bank_account && <div><span style={{ color: '#888' }}>Conta: </span><strong>{employee.bank_account}</strong></div>}
            {employee.bank_beneficiary && <div><span style={{ color: '#888' }}>Favorecido: </span><strong>{employee.bank_beneficiary}</strong></div>}
            {employee.pix_key && <div><span style={{ color: '#888' }}>PIX: </span><strong>{employee.pix_key}</strong></div>}
          </div>
        </div>
      )}

      {/* Assinatura */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '16px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #999', paddingTop: '6px', marginTop: '32px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{company?.name || '______________________________'}</div>
            <div style={{ color: '#888', fontSize: '10px' }}>Empregador / Responsável</div>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #999', paddingTop: '6px', marginTop: '32px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{employee.name}</div>
            <div style={{ color: '#888', fontSize: '10px' }}>Colaborador — {employee.cpf_cnpj}</div>
          </div>
          <div style={{ marginTop: '8px', color: '#888', fontSize: '10px' }}>Data: _____ / _____ / _________</div>
        </div>
      </div>
    </div>
  );
}

// ─── Recibo Aluguel Moto ──────────────────────────────────────────────────────
function MotoReceiptContent({ employee, entry, month }) {
  const value = entry?.motorcycle_rental ?? 0;
  const monthName = getMonthName(month).toUpperCase();

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#1a1a2e' }}>
      <div style={{ border: '2px solid #239BB6', borderRadius: '10px', padding: '18px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: '#239BB6', margin: 0, letterSpacing: '0.5px' }}>
            Recibo — Aluguel da Moto
          </h2>
          <div style={{ textAlign: 'right', color: '#888', fontSize: '10px' }}>
            <div>Referência: {monthName}</div>
          </div>
        </div>

        <p style={{ lineHeight: '1.7', textAlign: 'justify', margin: '0 0 20px', fontSize: '12px' }}>
          Eu, <strong>{employee.name}</strong>, portador(a) do CPF <strong>{employee.cpf_cnpj || '_______________'}</strong>, recebi a importância de{' '}
          <strong>{formatCurrency(value)}</strong> ({numberToWords(value)}) em espécie, correspondente ao{' '}
          <strong>Aluguel da Moto</strong> do mês de <strong>{monthName}</strong>.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '10px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #999', paddingTop: '6px', marginTop: '32px' }}>
              <div style={{ fontWeight: 'bold' }}>{employee.name}</div>
              <div style={{ color: '#888', fontSize: '10px' }}>CPF: {employee.cpf_cnpj || '—'}</div>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #999', paddingTop: '6px', marginTop: '32px' }}>
              <div style={{ color: '#888', fontSize: '10px' }}>Data: _____ / _____ / _________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dialog principal ─────────────────────────────────────────────────────────
export default function PDFReceiptDialog({ employee, entry, receiptType, referenceMonth, onClose, company, payrollType }) {
  const printRef = useRef();
  const [mergedEntry, setMergedEntry] = useState(entry);

  // Busca CashOuts atualizados e mescla com os descontos salvos no entry
  useEffect(() => {
    base44.entities.CashOut.filter({ employee_id: employee.id, reference_month: referenceMonth }).then(cashOuts => {
      const firstFromCash = cashOuts.filter(c => c.period === 'first').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));
      const secondFromCash = cashOuts.filter(c => c.period === 'second').map(c => ({
        id: c.id, date: c.date, description: c.description, amount: c.amount, fromCashOut: true,
      }));

      const savedFirst  = (entry?.first_discounts  ?? []).filter(x => !x.fromCashOut);
      const savedSecond = (entry?.second_discounts ?? []).filter(x => !x.fromCashOut);

      const firstDiscounts  = [...savedFirst,  ...firstFromCash];
      const secondDiscounts = [...savedSecond, ...secondFromCash];

      const firstTotal  = firstDiscounts.reduce((s, x) => s + (x.amount || 0), 0);
      const secondTotal = secondDiscounts.reduce((s, x) => s + (x.amount || 0), 0);

      // Recalcula net quinzenal com os descontos atualizados
      const netTotal = entry?.net_total ?? 0;
      const firstAdv = entry?.first_period_advance ?? 0;
      const firstNet  = Math.round(((netTotal / 2) - firstAdv  - firstTotal)  * 100) / 100;
      const secondNet = Math.round(((netTotal / 2)             - secondTotal) * 100) / 100;

      setMergedEntry({
        ...entry,
        first_discounts:    firstDiscounts,
        second_discounts:   secondDiscounts,
        first_period_discount:  firstTotal,
        second_period_discount: secondTotal,
        first_period_net:   firstNet,
        second_period_net:  secondNet,
      });
    });
  }, [employee.id, referenceMonth]);

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    const w = window.open('', '_blank');
    w.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recibo — ${employee.name} — ${getMonthName(referenceMonth)}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; background: #fff; }
            @media print {
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
              @page { margin: 0; }
            }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>
              Recibo — {employee.name} — {getMonthName(referenceMonth)}
            </DialogTitle>
            <Button onClick={handlePrint} className="gap-2 shrink-0">
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </Button>
          </div>
        </DialogHeader>
        <div ref={printRef} className="overflow-auto bg-white">
          {payrollType === 'ESCRITORIO'
            ? <EscritorioHoleriteContent employee={employee} entry={mergedEntry} month={referenceMonth} company={company} />
            : <HoleriteContent employee={employee} entry={mergedEntry} month={referenceMonth} company={company} />
          }
        </div>
      </DialogContent>
    </Dialog>
  );
}