/**
 * Conteúdos de holerite reutilizáveis — exportados para uso tanto no
 * PDFReceiptDialog (visualização/impressão) quanto no BulkPDFDialog (geração em lote).
 * Garantia de layout e dados 100% idênticos entre os dois fluxos.
 */
import { formatCurrency, numberToWords, getMonthName, calculatePayroll, calculateEscritorioPayroll } from '@/lib/payrollCalculations';
import { rowTotal } from '@/components/payroll/AbsenceDiscountsTable';

function formatAdmissionDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// Retorna detalhes individuais das faltas de um período usando entry.absence_discounts e entry._pointAdjustments
function getAbsenceDetails(entry, period) {
  const absenceDiscounts = entry?.absence_discounts ?? {};
  const pointAdjustments = entry?._pointAdjustments ?? [];
  const details = [];
  for (const [key, disc] of Object.entries(absenceDiscounts)) {
    const total = rowTotal(disc);
    if (total <= 0) continue;
    const dateMatch = key.match(/([0-9]{4}-[0-9]{2}-([0-9]{2}))$/);
    if (!dateMatch) continue;
    const dateStr = dateMatch[1];
    const day = parseInt(dateMatch[2], 10);
    const inPeriod = period === 'first' ? (day >= 1 && day <= 15) : (day >= 16);
    if (!inPeriod) continue;
    const tangId = key.replace(/-[0-9]{4}-[0-9]{2}-[0-9]{2}$/, '');
    const adj = pointAdjustments.find(a => String(a.tangerino_id) === tangId);
    const [yr, mo, dy] = dateStr.split('-');
    details.push({ date: dy + '/' + mo + '/' + yr, motivo: adj?.adjustment_reason_description || 'Falta', total });
  }
  return details.sort((a, b) => a.date.localeCompare(b.date));
}

function AbsenceDetailLines({ entry, period, aggregateTotal, label }) {
  const details = getAbsenceDetails(entry, period);
  if (details.length > 0) return (
    <div style={{ marginBottom: '3px' }}>
      <div style={{ fontSize: '9px', color: '#b91c1c', fontWeight: 'bold', marginBottom: '1px' }}>{'Faltas descontadas (' + label + '):'}</div>
      {details.map((d, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#dc2626', marginBottom: '1px', paddingLeft: '6px' }}>
          <span>{d.date} &middot; {d.motivo}</span>
          <span style={{ fontFamily: 'monospace' }}>{' - ' + formatCurrency(d.total)}</span>
        </div>
      ))}
      {details.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#dc2626', fontWeight: 'bold', paddingLeft: '6px', borderTop: '1px dotted #fca5a5', paddingTop: '1px' }}>
          <span>Total faltas</span>
          <span style={{ fontFamily: 'monospace' }}>{' - ' + formatCurrency(aggregateTotal)}</span>
        </div>
      )}
    </div>
  );
  if (aggregateTotal > 0) return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}>
      <span>{'Desc. Faltas (' + label + ')'}</span>
      <span style={{ fontFamily: 'monospace' }}>{' - ' + formatCurrency(aggregateTotal)}</span>
    </div>
  );
  return null;
}

function FaltasDetailPage({ entry, employee, company, month }) {
  const absenceDiscounts = entry?.absence_discounts ?? {};
  const pointAdjustments = entry?._pointAdjustments ?? [];
  const rows = [];
  for (const [key, disc] of Object.entries(absenceDiscounts)) {
    const total = rowTotal(disc);
    if (total <= 0) continue;
    const dateMatch = key.match(/([0-9]{4}-[0-9]{2}-([0-9]{2}))$/);
    if (!dateMatch) continue;
    const dateStr = dateMatch[1];
    const day = parseInt(dateMatch[2], 10);
    const tangId = key.replace(/-[0-9]{4}-[0-9]{2}-[0-9]{2}$/, '');
    const adj = pointAdjustments.find(a => String(a.tangerino_id) === tangId);
    const [yr, mo, dy] = dateStr.split('-');
    rows.push({ date: dy + '/' + mo + '/' + yr, dateStr, period: day >= 1 && day <= 15 ? '1ª Quinzena (1–15)' : '2ª Quinzena (16–30)', motivo: adj?.adjustment_reason_description || 'Falta', total });
  }
  rows.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  if (rows.length === 0) return null;
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div style={{ width: '210mm', padding: '12mm', fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#1a1a2e', backgroundColor: '#fff', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #dc2626', paddingBottom: '10px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#dc2626', textTransform: 'uppercase', letterSpacing: '1px' }}>Detalhamento de Faltas</div>
          <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>{getMonthName(month)} — {employee.name}</div>
        </div>
        <div style={{ textAlign: 'right', color: '#666', fontSize: '10px' }}>
          <div style={{ fontWeight: 'bold' }}>{company?.name}</div>
          {company?.cnpj && <div>CNPJ: {company.cnpj}</div>}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr>
            <th style={{ background: '#dc2626', color: '#fff', padding: '7px 10px', textAlign: 'left', borderRadius: '6px 0 0 0', width: '18%' }}>Data</th>
            <th style={{ background: '#dc2626', color: '#fff', padding: '7px 10px', textAlign: 'left', width: '24%' }}>Quinzena</th>
            <th style={{ background: '#dc2626', color: '#fff', padding: '7px 10px', textAlign: 'left', width: '43%' }}>Motivo</th>
            <th style={{ background: '#dc2626', color: '#fff', padding: '7px 10px', textAlign: 'right', borderRadius: '0 6px 0 0', width: '15%' }}>Total (R$)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff5f5' : '#fff' }}>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #fee2e2', fontFamily: 'monospace' }}>{r.date}</td>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #fee2e2', color: '#555' }}>{r.period}</td>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #fee2e2' }}>{r.motivo}</td>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #fee2e2', textAlign: 'right', color: '#dc2626', fontFamily: 'monospace', fontWeight: 'bold' }}>{formatCurrency(r.total)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} style={{ padding: '8px 10px', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626' }}>TOTAL DESCONTADO</td>
            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', color: '#dc2626', fontFamily: 'monospace' }}>{formatCurrency(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
      <p style={{ marginTop: '16px', fontSize: '10px', color: '#666', textAlign: 'justify' }}>
        Os valores acima correspondem aos descontos realizados em razão das faltas registradas no sistema de ponto eletrônico. Em caso de dúvidas, entre em contato com o departamento responsável.
      </p>
    </div>
  );
}

// ─── Recibo Vale Refeição ─────────────────────────────────────────────────────
export function MealVoucherReceiptContent({ employee, mealVoucherValue, month }) {
  const monthName = getMonthName(month).toUpperCase();
  return (
    <div style={{ border: '2px solid #6a3eaf', borderRadius: '10px', padding: '18px 22px', fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#1a1a2e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: '#6a3eaf', margin: 0, letterSpacing: '0.5px' }}>
          Recibo — Vale Refeição
        </h2>
        <div style={{ textAlign: 'right', color: '#888', fontSize: '10px' }}>
          <div>Referência: {monthName}</div>
        </div>
      </div>
      <p style={{ lineHeight: '1.7', textAlign: 'justify', margin: '0 0 20px', fontSize: '12px' }}>
        Eu, <strong>{employee.name}</strong>, portador(a) do CPF <strong>{employee.cpf_cnpj || '_______________'}</strong>, recebi a importância de{' '}
        <strong>{formatCurrency(mealVoucherValue)}</strong> ({numberToWords(mealVoucherValue)}) em espécie, correspondente ao{' '}
        <strong>Vale Refeição</strong> do mês de <strong>{monthName}</strong>.
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
  );
}

// ─── Recibo Aluguel Moto ──────────────────────────────────────────────────────
export function MotoReceiptContent({ employee, entry, month }) {
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

// ─── Holerite CLT (Motociclista / padrão) ─────────────────────────────────────
export function HoleriteContent({ employee, entry, month, company }) {
  const isCLT = employee.contract_type === 'CLT';
  // Para CLT moto: usa salário efetivo salvo, ou recalcula a partir dos campos clt_moto_*
  const cltMotoBase = entry?.clt_moto_base_salary ?? 0;
  const cltMotoDays = entry?.clt_moto_worked_days != null ? Number(entry.clt_moto_worked_days) : 30;
  const cltMotoEffective = entry?.clt_moto_effective_salary
    ?? (cltMotoBase > 0 ? Math.round((cltMotoBase / 30) * cltMotoDays * 100) / 100 : (entry?.base_salary ?? 0));
  const effectiveBaseSalary = cltMotoBase > 0 ? cltMotoEffective : (entry?.base_salary ?? 0);

  const calc = calculatePayroll({
    base_salary:               effectiveBaseSalary,
    absence_discount:          0,
    absence_discount_first:    entry?.absence_discount_first ?? 0,
    absence_discount_second:   entry?.absence_discount_second ?? 0,
    meal_voucher_day_value:    entry?.meal_voucher_day_value ?? 0,
    meal_voucher_days:         entry?.meal_voucher_days ?? 0,
    food_voucher:              entry?.food_voucher ?? 0,
    transport_voucher:         entry?.transport_voucher ?? 0,
    km_bonus_qty:              entry?.km_bonus_qty ?? 0,
    km_bonus_value:            entry?.km_bonus_value ?? 0,
    cost_allowance:            entry?.cost_allowance ?? 0,
    motorcycle_rental:         entry?.motorcycle_rental ?? 0,
    hazard_pay:                entry?.hazard_pay ?? 0,
    bonus:                     entry?.bonus ?? 0,
    other_benefits:            entry?.other_benefits ?? 0,
    union_contribution_value:  entry?.union_contribution_value ?? 35,
    meal_voucher_discount_pct: entry?.meal_voucher_discount_pct ?? 0,
    life_insurance:            entry?.life_insurance ?? 0,
    inss_pct:                  entry?.inss_pct ?? 0,
    inss_discount:             entry?.inss_discount ?? 0,
    pj_retention:              entry?.pj_retention ?? 0,
    first_period_advance:      entry?.first_period_advance ?? 0,
    first_period_discount:     entry?.first_period_discount ?? 0,
    second_period_discount:    entry?.second_period_discount ?? 0,
  }, employee.contract_type, null);

  const baseSalary    = effectiveBaseSalary;
  const mealVDays     = entry?.meal_voucher_days ?? 0;
  const mealVDay      = entry?.meal_voucher_day_value ?? 0;
  const foodVoucher   = entry?.food_voucher ?? 0;
  const transport     = entry?.transport_voucher ?? 0;
  const kmBonusQty    = entry?.km_bonus_qty ?? 0;
  const kmBonusVal    = entry?.km_bonus_value ?? 0;
  const kmBonus       = calc.km_bonus ?? 0;
  const costAllowance = entry?.cost_allowance ?? 0;
  const motoRental    = entry?.motorcycle_rental ?? 0;
  const hazardPay     = entry?.hazard_pay ?? 0;
  const bonus         = entry?.bonus ?? 0;
  const otherBen      = entry?.other_benefits ?? 0;
  const pjRet         = entry?.pj_retention ?? 0;
  const lifeIns       = entry?.life_insurance ?? 0;
  const firstAdv      = entry?.first_period_advance ?? 0;
  const grossTotal    = entry?.gross_total ?? calc.gross_total;
  const absenceFirst  = entry?.absence_discount_first ?? 0;
  const absenceSecond = entry?.absence_discount_second ?? 0;
  const firstNet      = entry?.first_period_net ?? 0;
  const secondNet     = entry?.second_period_net ?? 0;
  const firstBase     = entry?.first_period_base ?? (entry?.net_total ?? 0) * (entry?.first_period_split ?? 0.5);
  const secondBase    = entry?.second_period_base ?? (entry?.net_total ?? 0) * (1 - (entry?.first_period_split ?? 0.5));
  const splitFirst    = entry?.first_period_split ?? 0.5;
  const firstDiscounts  = entry?.first_discounts  ?? [];
  const secondDiscounts = entry?.second_discounts ?? [];
  const monthName = getMonthName(month);

  const proventos = [
    { label: cltMotoBase > 0 ? `Salário Efetivo (${cltMotoDays}/30 dias)` : 'Salário Base', value: baseSalary, show: true },
    { label: `Vale Refeição (${mealVDays}d × ${formatCurrency(mealVDay)})`, value: calc.meal_voucher, show: calc.meal_voucher > 0 },
    { label: entry?.contract_working_days > 0 && cltMotoBase > 0 ? `Vale Alimentação (${entry.contract_working_days} dias úteis)` : 'Vale Alimentação', value: foodVoucher, show: foodVoucher > 0 },
    { label: 'Vale Transporte', value: transport, show: transport > 0 },
    { label: `Adicional KM (${kmBonusQty} km × ${formatCurrency(kmBonusVal)})`, value: kmBonus, show: kmBonus > 0 },
    { label: entry?.contract_working_days > 0 && cltMotoBase > 0 ? `Ajuda de custo pacote de dados (${entry.contract_working_days} dias úteis)` : 'Ajuda de custo pacote de dados', value: costAllowance, show: costAllowance > 0 },
    { label: entry?.contract_working_days > 0 && cltMotoBase > 0 ? `Aluguel da Motocicleta (${entry.contract_working_days} dias úteis)` : 'Aluguel da Motocicleta', value: motoRental, show: motoRental > 0 },
    { label: 'Periculosidade', value: hazardPay, show: hazardPay > 0 },
    { label: 'Bonificação / Prêmio', value: bonus, show: bonus > 0 },
    { label: 'Outros Benefícios', value: otherBen, show: otherBen > 0 },
  ].filter(x => x.show);

  const descontos = [
    { label: 'INSS', value: calc.inss_net, show: calc.inss_net > 0 },
    { label: 'IRRF', value: calc.irrf, show: calc.irrf > 0 },
    { label: 'Retenção PJ', value: pjRet, show: pjRet > 0 },
    { label: 'Contribuição Assistencial', value: calc.union_contribution, show: calc.union_contribution > 0 },
    { label: `Desconto VR (${entry?.meal_voucher_discount_pct ?? 0}%)`, value: calc.meal_voucher_discount, show: calc.meal_voucher_discount > 0 },
    { label: 'Seguro de Vida (Acordo entre as partes)', value: lifeIns, show: lifeIns > 0 },
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
        </div>
      </div>

      {/* Dados do colaborador */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', background: '#f5f3ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Colaborador</div><div style={{ fontWeight: 'bold' }}>{employee.name}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>CPF</div><div style={{ fontWeight: 'bold' }}>{employee.cpf_cnpj || '—'}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Cargo</div><div style={{ fontWeight: 'bold' }}>{employee.position || '—'}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Contrato</div><div style={{ fontWeight: 'bold' }}>{employee.contract_type}</div></div>
        {employee.birth_date && <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Nascimento</div><div style={{ fontWeight: 'bold' }}>{formatAdmissionDate(employee.birth_date)}</div></div>}
        {employee.admission_date && <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Admissão</div><div style={{ fontWeight: 'bold' }}>{formatAdmissionDate(employee.admission_date)}</div></div>}
        {employee.termination_date && <div><div style={{ color: '#dc2626', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Demissão</div><div style={{ fontWeight: 'bold', color: '#dc2626' }}>{formatAdmissionDate(employee.termination_date)}</div></div>}
        {employee.pis && <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>PIS</div><div style={{ fontWeight: 'bold' }}>{employee.pis}</div></div>}
      </div>

      {/* Tabela Proventos e Descontos */}
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
            const p = proventos[i]; const d = descontos[i];
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
            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', background: '#ede9fe', borderTop: '2px solid #6a3eaf', color: '#2563eb', fontFamily: 'monospace' }}>{formatCurrency(grossTotal)}</td>
            <td style={{ padding: '7px 10px', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', borderLeft: '1px solid #e8e4f5' }}>TOTAL DESCONTOS</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', color: '#dc2626', fontFamily: 'monospace' }}>{formatCurrency(totalDescontos)}</td>
          </tr>
        </tbody>
      </table>

      {/* Resumo Quinzenal */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div style={{ border: '2px solid #6a3eaf', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#6a3eaf', color: '#fff', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>1ª Quinzena (1–15) — {Math.round(splitFirst * 100)}%</div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginBottom: '4px' }}><span>Base quinzenal</span><span style={{ fontFamily: 'monospace' }}>{formatCurrency(firstBase)}</span></div>
            {absenceFirst > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}><span>Desc. Faltas (1–15)</span><span style={{ fontFamily: 'monospace' }}>- {formatCurrency(absenceFirst)}</span></div>}
            {firstAdv > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}><span>Adiantamento</span><span style={{ fontFamily: 'monospace' }}>- {formatCurrency(firstAdv)}</span></div>}
            {firstDiscounts.map((d, i) => {
              const isCredit = d.type === 'credit';
              return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: isCredit ? '#16a34a' : '#dc2626', marginBottom: '3px' }}><span>{d.description}{d.date ? ` (${d.date.split('-').reverse().join('/')})` : ''}</span><span style={{ fontFamily: 'monospace' }}>{isCredit ? '+ ' : '- '}{formatCurrency(d.amount)}</span></div>;
            })}
            <div style={{ borderTop: '1px solid #e8e4f5', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}><span style={{ color: firstNet < 0 ? '#dc2626' : '#6a3eaf' }}>{firstNet < 0 ? 'Saldo Negativo' : 'A Receber'}</span><span style={{ fontFamily: 'monospace', color: firstNet < 0 ? '#dc2626' : '#6a3eaf' }}>{formatCurrency(firstNet)}</span></div>
          </div>
        </div>
        <div style={{ border: '2px solid #6a3eaf', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#6a3eaf', color: '#fff', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>2ª Quinzena (16–30) — {Math.round((1 - splitFirst) * 100)}%</div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginBottom: '4px' }}><span>Base quinzenal</span><span style={{ fontFamily: 'monospace' }}>{formatCurrency(secondBase)}</span></div>
            {foodVoucher > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#0e7490', marginBottom: '3px' }}><span>+ Vale Alimentação</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(foodVoucher)}</span></div>}
            {(entry?.delivery_bonus ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#b45309', marginBottom: '3px' }}><span>+ Bonificação por Entrega</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(entry.delivery_bonus)}</span></div>}
            {(entry?.delivery_target_bonus ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#b45309', marginBottom: '3px' }}><span>+ Bonificação Meta de Entrega</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(entry.delivery_target_bonus)}</span></div>}
            {(entry?.attendance_bonus ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#b45309', marginBottom: '3px' }}><span>+ Bonificação por Presença</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(entry.attendance_bonus)}</span></div>}
            {(entry?.route_sp_bonus ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#b45309', marginBottom: '3px' }}><span>+ Bonificação Rota SP</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(entry.route_sp_bonus)}</span></div>}
            {(entry?.overtime ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#b45309', marginBottom: '3px' }}><span>+ Hora Extra{entry?.overtime_hour_value > 0 ? ` (${formatCurrency(entry.overtime_hour_value)}/h)` : ''}</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(entry.overtime)}</span></div>}
            {absenceSecond > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}><span>Desc. Faltas (16–30)</span><span style={{ fontFamily: 'monospace' }}>- {formatCurrency(absenceSecond)}</span></div>}
            {kmBonus > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#0e7490', marginBottom: '3px' }}><span>+ KM Adicional</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(kmBonus)}</span></div>}
            {costAllowance > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#0e7490', marginBottom: '3px' }}><span>+ Ajuda de custo pacote de dados</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(costAllowance)}</span></div>}
            {secondDiscounts.map((d, i) => {
              const isCredit = d.type === 'credit';
              return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: isCredit ? '#16a34a' : '#dc2626', marginBottom: '3px' }}><span>{d.description}{d.date ? ` (${d.date.split('-').reverse().join('/')})` : ''}</span><span style={{ fontFamily: 'monospace' }}>{isCredit ? '+ ' : '- '}{formatCurrency(d.amount)}</span></div>;
            })}
            <div style={{ borderTop: '1px solid #e8e4f5', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}><span style={{ color: secondNet < 0 ? '#dc2626' : '#6a3eaf' }}>{secondNet < 0 ? 'Saldo Negativo' : 'A Receber'}</span><span style={{ fontFamily: 'monospace', color: secondNet < 0 ? '#dc2626' : '#6a3eaf' }}>{formatCurrency(secondNet)}</span></div>
          </div>
        </div>
      </div>

      {isCLT && (
        <div style={{ border: '1px solid #e8e4f5', borderRadius: '8px', padding: '8px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#888', fontSize: '10px', textTransform: 'uppercase' }}>FGTS (8%) — informativo</span>
          <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#239BB6', fontFamily: 'monospace' }}>{formatCurrency(calc.fgts)}</span>
        </div>
      )}

      {/* Total */}
      <div style={{ background: (firstNet + secondNet) < 0 ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'linear-gradient(135deg,#6a3eaf,#239BB6)', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: '#fff' }}>
        <div>
          <div style={{ fontSize: '10px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '1px' }}>{(firstNet + secondNet) < 0 ? 'SALDO NEGATIVO (1ª + 2ª Quinzena)' : 'TOTAL A RECEBER (1ª + 2ª Quinzena)'}</div>
          <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>{numberToWords(Math.abs(firstNet + secondNet))}</div>
        </div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatCurrency(firstNet + secondNet)}</div>
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

      {entry?.notes && (
        <div style={{ border: '1px solid #e8e4f5', borderRadius: '8px', padding: '8px 14px', marginBottom: '14px', background: '#fdf9ff' }}>
          <div style={{ color: '#6a3eaf', fontSize: '9px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>Observação</div>
          <div style={{ fontSize: '10px', color: '#444' }}>{entry.notes}</div>
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

      {calc.meal_voucher > 0 && (
        <div style={{ pageBreakBefore: 'always', breakBefore: 'page', paddingTop: '12mm' }}>
          <MealVoucherReceiptContent employee={employee} mealVoucherValue={calc.meal_voucher} month={month} />
        </div>
      )}
      {(entry?.motorcycle_rental ?? 0) > 0 && (
        <div style={{ pageBreakBefore: 'always', breakBefore: 'page', paddingTop: '12mm' }}>
          <MotoReceiptContent employee={employee} entry={entry} month={month} />
        </div>
      )}
      {Object.values(entry?.absence_discounts ?? {}).some(d => rowTotal(d) > 0) && (
        <div style={{ pageBreakBefore: 'always', breakBefore: 'page', paddingTop: '12mm' }}>
          <FaltasDetailPage entry={entry} employee={employee} company={company} month={month} />
        </div>
      )}
    </div>
  );
}

// ─── Holerite MEI ─────────────────────────────────────────────────────────────
export function MeiHoleriteContent({ employee, entry, month, company }) {
  const monthName = getMonthName(month);
  const valorBase       = entry?.base_salary ?? 0;
  const diasMes         = entry?.working_days_month ?? 0;
  const diasTrabalhados = entry?.working_days_worked ?? diasMes;
  const diasQ1          = entry?.working_days_first ?? 0;
  const diasQ2          = entry?.working_days_second ?? 0;
  const remuneracao     = diasMes > 0 ? Math.round((valorBase / diasMes) * diasTrabalhados * 100) / 100 : valorBase;
  const kmBonus         = entry?.km_bonus ?? Math.round((entry?.km_bonus_qty||0)*(entry?.km_bonus_value||0)*100)/100;
  const costAllowance   = entry?.cost_allowance ?? 0;
  const motoRental      = entry?.motorcycle_rental ?? 0;
  const bonus           = entry?.bonus ?? 0;
  const otherBen        = entry?.other_benefits ?? 0;
  const foodVoucher     = entry?.food_voucher ?? 0;
  const lifeInsurance   = entry?.life_insurance ?? 0;
  const firstAdv        = entry?.first_period_advance ?? 0;
  const grossTotal      = Math.round((remuneracao + kmBonus + motoRental + bonus + otherBen) * 100) / 100;
  const firstNet        = entry?.first_period_net ?? 0;
  const secondNet       = entry?.second_period_net ?? 0;
  const firstBase       = entry?.first_period_base ?? 0;
  const secondBase      = entry?.second_period_base ?? 0;
  const firstDiscounts  = entry?.first_discounts ?? [];
  const secondDiscounts = entry?.second_discounts ?? [];

  const proventos = [
    { label: `Remuneração Proporcional (${diasTrabalhados}/${diasMes} dias úteis)`, value: remuneracao, show: true },
    { label: `Adicional KM (${entry?.km_bonus_qty||0} km × ${formatCurrency(entry?.km_bonus_value||0)})`, value: kmBonus, show: kmBonus > 0 },
    { label: 'Aluguel da Motocicleta', value: motoRental, show: motoRental > 0 },
    { label: 'Vale Alimentação', value: foodVoucher, show: foodVoucher > 0 },
    { label: 'Bonificação / Prêmio', value: bonus, show: bonus > 0 },
    { label: 'Outros Benefícios', value: otherBen, show: otherBen > 0 },
  ].filter(x => x.show);

  const descontos = [
    { label: 'Seguro de Vida (Acordo entre as partes)', value: lifeInsurance, show: lifeInsurance > 0 },
  ].filter(x => x.show);

  const totalDescontos = descontos.reduce((s,d) => s+d.value, 0);
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
          <div style={{ color: '#888', fontSize: '10px', marginTop: '1px' }}>Modelo: Motociclista MEI</div>
        </div>
      </div>

      {/* Dados */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', background: '#f5f3ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Colaborador</div><div style={{ fontWeight: 'bold' }}>{employee.name}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>CPF / CNPJ</div><div style={{ fontWeight: 'bold' }}>{employee.cpf_cnpj || '—'}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Cargo</div><div style={{ fontWeight: 'bold' }}>{employee.position || '—'}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Contrato</div><div style={{ fontWeight: 'bold' }}>MEI — Prestador</div></div>
        {employee.birth_date && <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Nascimento</div><div style={{ fontWeight: 'bold' }}>{formatAdmissionDate(employee.birth_date)}</div></div>}
        {employee.admission_date && <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Admissão</div><div style={{ fontWeight: 'bold' }}>{formatAdmissionDate(employee.admission_date)}</div></div>}
        {employee.termination_date && <div><div style={{ color: '#dc2626', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Demissão</div><div style={{ fontWeight: 'bold', color: '#dc2626' }}>{formatAdmissionDate(employee.termination_date)}</div></div>}
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Dias Úteis Mês / Trab.</div><div style={{ fontWeight: 'bold' }}>{diasMes} / {diasTrabalhados}</div></div>
      </div>

      {/* Tabela */}
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
            const p = proventos[i]; const d = descontos[i];
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
            <td style={{ padding: '7px 10px', fontWeight: 'bold', background: '#ede9fe', borderTop: '2px solid #6a3eaf' }}>TOTAL BRUTO / TOTAL A RECEBER</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', background: '#ede9fe', borderTop: '2px solid #6a3eaf', color: '#2563eb', fontFamily: 'monospace' }}>{formatCurrency(grossTotal)}</td>
            <td style={{ padding: '7px 10px', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', borderLeft: '1px solid #e8e4f5' }}>TOTAL DESCONTOS</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', color: '#dc2626', fontFamily: 'monospace' }}>{formatCurrency(totalDescontos)}</td>
          </tr>
        </tbody>
      </table>

      {/* Quinzenal */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div style={{ border: '2px solid #6a3eaf', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#6a3eaf', color: '#fff', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>
            1ª Quinzena (1–15) — {diasQ1} dias úteis
          </div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginBottom: '4px' }}><span>Base proporcional</span><span style={{ fontFamily: 'monospace' }}>{formatCurrency(firstBase)}</span></div>
            {lifeInsurance > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#b45309', marginBottom: '3px' }}><span>− Seguro de Vida</span><span style={{ fontFamily: 'monospace' }}>- {formatCurrency(lifeInsurance)}</span></div>}
            {firstAdv > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}><span>Adiantamento</span><span style={{ fontFamily: 'monospace' }}>- {formatCurrency(firstAdv)}</span></div>}
            {firstDiscounts.map((d, i) => {
              const isCredit = d.type === 'credit';
              return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: isCredit ? '#16a34a' : '#dc2626', marginBottom: '3px' }}><span>{d.description}{d.date ? ` (${d.date.split('-').reverse().join('/')})` : ''}</span><span style={{ fontFamily: 'monospace' }}>{isCredit ? '+ ' : '- '}{formatCurrency(d.amount)}</span></div>;
            })}
            <div style={{ borderTop: '1px solid #e8e4f5', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}><span style={{ color: firstNet < 0 ? '#dc2626' : '#6a3eaf' }}>{firstNet < 0 ? 'Saldo Negativo' : 'A Receber'}</span><span style={{ fontFamily: 'monospace', color: firstNet < 0 ? '#dc2626' : '#6a3eaf' }}>{formatCurrency(firstNet)}</span></div>
          </div>
        </div>
        <div style={{ border: '2px solid #6a3eaf', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#6a3eaf', color: '#fff', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>
            2ª Quinzena (16–30) — {diasQ2} dias úteis
          </div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginBottom: '4px' }}><span>Base proporcional</span><span style={{ fontFamily: 'monospace' }}>{formatCurrency(secondBase)}</span></div>
            {kmBonus > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#0e7490', marginBottom: '3px' }}><span>+ KM Adicional</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(kmBonus)}</span></div>}
            {costAllowance > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#0e7490', marginBottom: '3px' }}><span>+ Ajuda de custo pacote de dados</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(costAllowance)}</span></div>}
            {secondDiscounts.map((d, i) => {
              const isCredit = d.type === 'credit';
              return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: isCredit ? '#16a34a' : '#dc2626', marginBottom: '3px' }}><span>{d.description}{d.date ? ` (${d.date.split('-').reverse().join('/')})` : ''}</span><span style={{ fontFamily: 'monospace' }}>{isCredit ? '+ ' : '- '}{formatCurrency(d.amount)}</span></div>;
            })}
            <div style={{ borderTop: '1px solid #e8e4f5', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}><span style={{ color: secondNet < 0 ? '#dc2626' : '#6a3eaf' }}>{secondNet < 0 ? 'Saldo Negativo' : 'A Receber'}</span><span style={{ fontFamily: 'monospace', color: secondNet < 0 ? '#dc2626' : '#6a3eaf' }}>{formatCurrency(secondNet)}</span></div>
          </div>
        </div>
      </div>

      {/* Total */}
      <div style={{ background: (firstNet + secondNet) < 0 ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'linear-gradient(135deg,#6a3eaf,#239BB6)', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: '#fff' }}>
        <div>
          <div style={{ fontSize: '10px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '1px' }}>{(firstNet + secondNet) < 0 ? 'SALDO NEGATIVO (1ª + 2ª Quinzena)' : 'TOTAL A RECEBER (1ª + 2ª Quinzena)'}</div>
          <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>{numberToWords(Math.abs(firstNet + secondNet))}</div>
        </div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatCurrency(firstNet + secondNet)}</div>
      </div>

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

      {entry?.notes && (
        <div style={{ border: '1px solid #e8e4f5', borderRadius: '8px', padding: '8px 14px', marginBottom: '14px', background: '#fdf9ff' }}>
          <div style={{ color: '#6a3eaf', fontSize: '9px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>Observação</div>
          <div style={{ fontSize: '10px', color: '#444' }}>{entry.notes}</div>
        </div>
      )}

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

      {motoRental > 0 && (
        <div style={{ pageBreakBefore: 'always', breakBefore: 'page', paddingTop: '12mm' }}>
          <MotoReceiptContent employee={employee} entry={entry} month={month} />
        </div>
      )}
    </div>
  );
}

// ─── Holerite Escritório ──────────────────────────────────────────────────────
export function EscritorioHoleriteContent({ employee, entry, month, company }) {
  // Recalcula apenas os campos de convenção (sem tocar nas quinzenas que vêm do entry)
  const calc = calculateEscritorioPayroll({
    base_salary: entry?.base_salary ?? 0,
    extra_bonus: entry?.extra_bonus ?? 0,
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
    attendance_bonus: entry?.attendance_bonus ?? 0,
    birthday_bonus: entry?.birthday_bonus ?? 0,
    absence_discount_first: entry?.absence_discount_first ?? 0,
    absence_discount_second: entry?.absence_discount_second ?? 0,
    first_period_advance: entry?.first_period_advance ?? 0,
    first_period_discount: entry?.first_period_discount ?? 0,
    second_period_discount: entry?.second_period_discount ?? 0,
    first_period_split: entry?.first_period_split ?? 0.5,
  });

  const firstAdv = entry?.first_period_advance ?? 0;
  const firstDiscounts  = entry?.first_discounts ?? [];
  const secondDiscounts = entry?.second_discounts ?? [];
  const splitFirst = entry?.first_period_split ?? 0.5;
  // Usa os valores salvos de base quinzenal (respeitam o rateio configurado no formulário)
  const firstBase  = entry?.first_period_base  ?? (calc.net_total * splitFirst);
  const secondBase = entry?.second_period_base ?? (calc.net_total * (1 - splitFirst));
  const escAbsenceFirst  = entry?.absence_discount_first  ?? 0;
  const escAbsenceSecond = entry?.absence_discount_second ?? 0;
  const firstDiscountTotal  = (entry?.first_discounts  ?? []).reduce((s, d) => d.type === 'credit' ? s - (d.amount || 0) : s + (d.amount || 0), 0);
  const secondDiscountTotal = (entry?.second_discounts ?? []).reduce((s, d) => d.type === 'credit' ? s - (d.amount || 0) : s + (d.amount || 0), 0);
  // Recalcula os líquidos quinzenais para garantir que attendance_bonus e outros valores estejam somados
  // (compatível com folhas salvas antes da correção)
  const firstNet  = Math.round((firstBase - firstAdv - (entry?.first_period_discount ?? firstDiscountTotal) - escAbsenceFirst) * 100) / 100;
  const secondNet = Math.round((secondBase + (entry?.food_voucher ?? 0) + (entry?.bonus ?? 0) + (entry?.attendance_bonus ?? 0) + (entry?.birthday_bonus ?? 0) - (entry?.second_period_discount ?? secondDiscountTotal) - escAbsenceSecond) * 100) / 100;
  const monthName = getMonthName(month);

  const proventosConv = [
    { label: 'Piso Salarial', value: entry?.base_salary ?? 0, show: true },
    { label: 'Bonificação Extra', value: entry?.extra_bonus ?? 0, show: (entry?.extra_bonus ?? 0) > 0 },
    { label: `Vale Refeição (${entry?.meal_voucher_days ?? 0}d × ${formatCurrency(entry?.meal_voucher_day_value ?? 0)})`, value: calc.meal_voucher, show: calc.meal_voucher > 0 },
  ].filter(x => x.show);

  const descontosConv = [
    { label: `Desconto VT (${entry?.transport_voucher_discount_pct ?? 0}%)`, value: calc.transport_voucher_discount, show: calc.transport_voucher_discount > 0 },
    { label: `Desconto VR (${entry?.meal_voucher_discount_pct ?? 0}%)`, value: calc.meal_voucher_discount, show: calc.meal_voucher_discount > 0 },
    { label: `INSS (${entry?.inss_pct ?? 0}%)`, value: calc.inss_net, show: calc.inss_net > 0 },
  ].filter(x => x.show);

  const totalDescontosConv = descontosConv.reduce((s, d) => s + d.value, 0);
  const maxRowsConv = Math.max(proventosConv.length, descontosConv.length, 1);

  const outrosBeneficios = [
    { label: `Vale Transporte (${entry?.transport_voucher_days ?? 0}d × ${formatCurrency(entry?.transport_voucher_day_value ?? 0)})`, value: calc.transport_voucher, show: calc.transport_voucher > 0 },
    { label: 'Seguro Odontológico', value: entry?.dental_plan ?? 0, show: (entry?.dental_plan ?? 0) > 0 },
    { label: 'Vale Alimentação', value: entry?.food_voucher ?? 0, show: (entry?.food_voucher ?? 0) > 0 },
    // Bonificações aparecem apenas na 2ª quinzena — não entram no split do líquido convenção
    { label: 'Bonificação de Produtividade (2ª quinzena)', value: entry?.bonus ?? 0, show: (entry?.bonus ?? 0) > 0 },
    { label: 'Bonificação por Presença (2ª quinzena)', value: entry?.attendance_bonus ?? 0, show: (entry?.attendance_bonus ?? 0) > 0 },
    { label: 'Bonificação Aniversário (2ª quinzena)', value: entry?.birthday_bonus ?? 0, show: (entry?.birthday_bonus ?? 0) > 0 },
  ].filter(x => x.show);

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

      {/* Dados */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', background: '#f5f3ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Colaborador</div><div style={{ fontWeight: 'bold' }}>{employee.name}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>CPF</div><div style={{ fontWeight: 'bold' }}>{employee.cpf_cnpj || '—'}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Cargo</div><div style={{ fontWeight: 'bold' }}>{employee.position || '—'}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Contrato</div><div style={{ fontWeight: 'bold' }}>CLT — Escritório</div></div>
        {employee.birth_date && <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Nascimento</div><div style={{ fontWeight: 'bold' }}>{formatAdmissionDate(employee.birth_date)}</div></div>}
        {employee.admission_date && <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Admissão</div><div style={{ fontWeight: 'bold' }}>{formatAdmissionDate(employee.admission_date)}</div></div>}
        {employee.termination_date && <div><div style={{ color: '#dc2626', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Demissão</div><div style={{ fontWeight: 'bold', color: '#dc2626' }}>{formatAdmissionDate(employee.termination_date)}</div></div>}
        {employee.pis && <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>PIS</div><div style={{ fontWeight: 'bold' }}>{employee.pis}</div></div>}
      </div>

      {/* Convenção */}
      <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#6a3eaf', textTransform: 'uppercase', marginBottom: '4px' }}>Convenção Coletiva</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '11px' }}>
        <thead>
          <tr>
            <th style={{ background: '#6a3eaf', color: '#fff', padding: '6px 10px', textAlign: 'left', borderRadius: '6px 0 0 0', width: '48%' }}>Proventos Conv.</th>
            <th style={{ background: '#6a3eaf', color: '#fff', padding: '6px 10px', textAlign: 'right', width: '14%' }}>Valor (R$)</th>
            <th style={{ background: '#444', color: '#fff', padding: '6px 10px', textAlign: 'left', width: '24%' }}>Descontos Conv.</th>
            <th style={{ background: '#444', color: '#fff', padding: '6px 10px', textAlign: 'right', borderRadius: '0 6px 0 0', width: '14%' }}>Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRowsConv }).map((_, i) => {
            const p = proventosConv[i]; const d = descontosConv[i];
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
            <td style={{ padding: '6px 10px', fontWeight: 'bold', background: '#ede9fe', borderTop: '2px solid #6a3eaf' }}>TOTAL BRUTO CONV.</td>
            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', background: '#ede9fe', borderTop: '2px solid #6a3eaf', color: '#2563eb', fontFamily: 'monospace' }}>{formatCurrency(calc.gross_total)}</td>
            <td style={{ padding: '6px 10px', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', borderLeft: '1px solid #e8e4f5' }}>TOTAL DESCONTOS</td>
            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', color: '#dc2626', fontFamily: 'monospace' }}>{formatCurrency(totalDescontosConv)}</td>
          </tr>
          <tr>
            <td colSpan={2} style={{ padding: '6px 10px', background: '#f0ecff', borderTop: '1px solid #c4b5fd' }}></td>
            <td style={{ padding: '6px 10px', fontWeight: 'bold', background: '#f0ecff', borderTop: '1px solid #c4b5fd', borderLeft: '1px solid #e8e4f5', color: '#6a3eaf' }}>LÍQUIDO CONVENÇÃO</td>
            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', background: '#f0ecff', borderTop: '1px solid #c4b5fd', color: '#6a3eaf', fontFamily: 'monospace' }}>{formatCurrency(calc.liquido_convencao)}</td>
          </tr>
        </tbody>
      </table>

      {/* Outros Benefícios */}
      {outrosBeneficios.length > 0 && (
        <>
          <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#239BB6', textTransform: 'uppercase', marginBottom: '4px' }}>Outros Benefícios</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ background: '#239BB6', color: '#fff', padding: '6px 10px', textAlign: 'left', borderRadius: '6px 0 0 0', width: '62%' }}>Benefício</th>
                <th style={{ background: '#239BB6', color: '#fff', padding: '6px 10px', textAlign: 'right', borderRadius: '0 6px 0 0', width: '38%' }}>Valor (R$)</th>
              </tr>
            </thead>
            <tbody>
              {outrosBeneficios.map((b, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#f0fbff' : '#fff' }}>
                  <td style={{ padding: '5px 10px', borderBottom: '1px solid #e0f2f7' }}>{b.label}</td>
                  <td style={{ padding: '5px 10px', textAlign: 'right', borderBottom: '1px solid #e0f2f7', color: '#0e7490', fontFamily: 'monospace' }}>{formatCurrency(b.value)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: '6px 10px', fontWeight: 'bold', background: '#e0f2f7', borderTop: '2px solid #239BB6' }}>TOTAL OUTROS BENEFÍCIOS</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', background: '#e0f2f7', borderTop: '2px solid #239BB6', color: '#0e7490', fontFamily: 'monospace' }}>{formatCurrency(calc.total_outros_beneficios)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* Quinzenal */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div style={{ border: '2px solid #6a3eaf', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#6a3eaf', color: '#fff', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>1ª Quinzena (1–15) — {Math.round(splitFirst * 100)}%</div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginBottom: '4px' }}><span>Base quinzenal</span><span style={{ fontFamily: 'monospace' }}>{formatCurrency(firstBase)}</span></div>
            {(entry?.food_voucher ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#0e7490', marginBottom: '3px' }}><span>+ Vale Alimentação</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(entry.food_voucher)}</span></div>}
            {escAbsenceFirst > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}><span>Desc. Faltas (1–15)</span><span style={{ fontFamily: 'monospace' }}>- {formatCurrency(escAbsenceFirst)}</span></div>}
            {firstAdv > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}><span>Adiantamento</span><span style={{ fontFamily: 'monospace' }}>- {formatCurrency(firstAdv)}</span></div>}
            {firstDiscounts.map((d, i) => {
              const isCredit = d.type === 'credit';
              return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: isCredit ? '#16a34a' : '#dc2626', marginBottom: '3px' }}><span>{d.description}{d.date ? ` (${d.date.split('-').reverse().join('/')})` : ''}</span><span style={{ fontFamily: 'monospace' }}>{isCredit ? '+ ' : '- '}{formatCurrency(d.amount)}</span></div>;
            })}
            <div style={{ borderTop: '1px solid #e8e4f5', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}><span style={{ color: firstNet < 0 ? '#dc2626' : '#6a3eaf' }}>{firstNet < 0 ? 'Saldo Negativo' : 'A Receber'}</span><span style={{ fontFamily: 'monospace', color: firstNet < 0 ? '#dc2626' : '#6a3eaf' }}>{formatCurrency(firstNet)}</span></div>
          </div>
        </div>
        <div style={{ border: '2px solid #6a3eaf', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ background: '#6a3eaf', color: '#fff', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>2ª Quinzena (16–30) — {Math.round((1 - splitFirst) * 100)}%</div>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#555', marginBottom: '4px' }}><span>Base quinzenal</span><span style={{ fontFamily: 'monospace' }}>{formatCurrency(secondBase)}</span></div>
            {(entry?.food_voucher ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#0e7490', marginBottom: '3px' }}><span>+ Vale Alimentação</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(entry.food_voucher)}</span></div>}
            {(entry?.bonus ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#0e7490', marginBottom: '3px' }}><span>+ Bonificação de Produtividade</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(entry.bonus)}</span></div>}
            {(entry?.attendance_bonus ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#0e7490', marginBottom: '3px' }}><span>+ Bonificação por Presença</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(entry.attendance_bonus)}</span></div>}
            {(entry?.birthday_bonus ?? 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#0e7490', marginBottom: '3px' }}><span>+ Bonificação Aniversário</span><span style={{ fontFamily: 'monospace' }}>+ {formatCurrency(entry.birthday_bonus)}</span></div>}
            {escAbsenceSecond > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#dc2626', marginBottom: '3px' }}><span>Desc. Faltas (16–30)</span><span style={{ fontFamily: 'monospace' }}>- {formatCurrency(escAbsenceSecond)}</span></div>}
            {secondDiscounts.map((d, i) => {
              const isCredit = d.type === 'credit';
              return <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: isCredit ? '#16a34a' : '#dc2626', marginBottom: '3px' }}><span>{d.description}{d.date ? ` (${d.date.split('-').reverse().join('/')})` : ''}</span><span style={{ fontFamily: 'monospace' }}>{isCredit ? '+ ' : '- '}{formatCurrency(d.amount)}</span></div>;
            })}
            <div style={{ borderTop: '1px solid #e8e4f5', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}><span style={{ color: secondNet < 0 ? '#dc2626' : '#6a3eaf' }}>{secondNet < 0 ? 'Saldo Negativo' : 'A Receber'}</span><span style={{ fontFamily: 'monospace', color: secondNet < 0 ? '#dc2626' : '#6a3eaf' }}>{formatCurrency(secondNet)}</span></div>
          </div>
        </div>
      </div>

      {/* Total */}
      <div style={{ background: (firstNet + secondNet) < 0 ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'linear-gradient(135deg,#6a3eaf,#239BB6)', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: '#fff' }}>
        <div>
          <div style={{ fontSize: '10px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '1px' }}>{(firstNet + secondNet) < 0 ? 'SALDO NEGATIVO (1ª + 2ª Quinzena)' : 'TOTAL A PAGAR (1ª + 2ª Quinzena)'}</div>
          <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>{numberToWords(Math.abs(firstNet + secondNet))}</div>
        </div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatCurrency(firstNet + secondNet)}</div>
      </div>

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

      {entry?.notes && (
        <div style={{ border: '1px solid #e8e4f5', borderRadius: '8px', padding: '8px 14px', marginBottom: '14px', background: '#fdf9ff' }}>
          <div style={{ color: '#6a3eaf', fontSize: '9px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>Observação</div>
          <div style={{ fontSize: '10px', color: '#444' }}>{entry.notes}</div>
        </div>
      )}

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

      {calc.transport_voucher > 0 && (
        <>
          <div style={{ borderTop: '2px dashed #ccc', margin: '28px 0 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '-9px', left: '50%', transform: 'translateX(-50%)', background: '#fff', padding: '0 12px', color: '#999', fontSize: '10px' }}>✂ Destacar</div>
          </div>
          <div style={{ border: '2px solid #239BB6', borderRadius: '10px', padding: '18px 22px', fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#1a1a2e' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: '#239BB6', margin: 0, letterSpacing: '0.5px' }}>Recibo — Vale Transporte</h2>
              <div style={{ textAlign: 'right', color: '#888', fontSize: '10px' }}><div>Referência: {getMonthName(month).toUpperCase()}</div></div>
            </div>
            <p style={{ lineHeight: '1.7', textAlign: 'justify', margin: '0 0 20px', fontSize: '12px' }}>
              Eu, <strong>{employee.name}</strong>, portador(a) do CPF <strong>{employee.cpf_cnpj || '_______________'}</strong>, recebi a importância de{' '}
              <strong>{formatCurrency(calc.transport_voucher)}</strong> ({numberToWords(calc.transport_voucher)}) em espécie, correspondente ao{' '}
              <strong>Vale Transporte</strong> do mês de <strong>{getMonthName(month).toUpperCase()}</strong>. Está sendo desta forma por opção minha.
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
        </>
      )}
      {Object.values(entry?.absence_discounts ?? {}).some(d => rowTotal(d) > 0) && (
        <div style={{ pageBreakBefore: 'always', breakBefore: 'page', paddingTop: '12mm' }}>
          <FaltasDetailPage entry={entry} employee={employee} company={company} month={month} />
        </div>
      )}
    </div>
  );
}