import { formatCurrency, numberToWords, getMonthName } from '@/lib/payrollCalculations';

export default function ProLaboreReceiptContent({ employee, entry, month, company, paymentStatus }) {
  const monthName = getMonthName(month).toUpperCase();

  const proLaboreBase   = entry?.base_salary         ?? 0;
  const quotaAdjust     = entry?.quota_adjustment     ?? 0;
  const birthdayBonus   = entry?.birthday_bonus       ?? 0;
  const grossTotal      = entry?.gross_total          ?? (proLaboreBase + quotaAdjust);
  const inss            = entry?.inss                 ?? 0;
  const inssPct         = entry?.inss_pct             ?? 11;
  const irrf            = entry?.irrf                 ?? 0;
  const netLabore       = Math.round((grossTotal - inss - irrf) * 100) / 100;
  const medicalPlan     = entry?.medical_plan          ?? 0;
  const profitDist      = entry?.profit_distribution  ?? 0;
  const firstAdvance    = entry?.first_period_advance ?? 0;
  const otherDiscounts  = entry?.other_discounts      ?? 0;
  const firstDiscounts  = entry?.first_discounts      ?? [];
  const secondDiscounts = entry?.second_discounts     ?? [];
  const extraDiscounts  = [...firstDiscounts, ...secondDiscounts];
  const extraTotal      = extraDiscounts.reduce((s, x) => x.type === 'credit' ? s - (x.amount || 0) : s + (x.amount || 0), 0);
  // Recalcula netTotal a partir dos componentes para garantir consistência com o formulário
  const netTotal        = Math.round((netLabore + profitDist + birthdayBonus + medicalPlan - firstAdvance - otherDiscounts - extraTotal) * 100) / 100;
  // Quinzenal
  const firstBase       = entry?.first_period_base  ?? 0;
  const secondBase      = entry?.second_period_base ?? 0;
  const firstNet        = entry?.first_period_net   ?? 0;
  const secondNet       = entry?.second_period_net  ?? 0;
  const firstDebits     = firstDiscounts.reduce((s, x) => x.type === 'credit' ? s - (x.amount || 0) : s + (x.amount || 0), 0);
  const secondDebits    = secondDiscounts.reduce((s, x) => x.type === 'credit' ? s - (x.amount || 0) : s + (x.amount || 0), 0);

  // Participação societária — usa employee.notes ou campo genérico
  const participacao = employee?.participation ?? employee?.notes ?? '';

  const s = (label, value) => ({
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '7px 14px', borderBottom: '1px solid #e5e7eb', fontSize: '12px',
  });

  return (
    <div style={{ width: '210mm', minHeight: '297mm', padding: '14mm 16mm', fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#1a1a2e', backgroundColor: '#fff', boxSizing: 'border-box' }}>

      {/* Cabeçalho */}
      <div style={{ textAlign: 'center', marginBottom: '18px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '20px', letterSpacing: '1px', color: '#111', marginBottom: '4px' }}>
          {company?.name?.toUpperCase() || 'EMPRESA'}
        </div>
        <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#2563eb', textTransform: 'uppercase', marginBottom: '2px' }}>
          Recibo de Pró-Labore — Sócio Administrador
        </div>
        <div style={{ fontSize: '11px', color: '#555' }}>Competência: {monthName}</div>
      </div>

      {/* Dados do sócio */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '12px', border: '1px solid #d1d5db' }}>
        <tbody>
          {[
            ['Sócio', employee.name],
            ['CPF', employee.cpf_cnpj || '—'],
            employee.birth_date ? ['Data de Nascimento', employee.birth_date.split('-').reverse().join('/')] : null,
            ['Qualificação', employee.position || 'Sócio Administrador'],
            participacao ? ['Participação societária', participacao] : null,
            ['Empresa', company?.name || '—'],
            ['CNPJ', company?.cnpj || '—'],
          ].filter(Boolean).map(([label, value], i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
              <td style={{ padding: '7px 14px', fontWeight: 'bold', width: '38%', borderRight: '1px solid #d1d5db', borderBottom: '1px solid #e5e7eb' }}>{label}</td>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Resumo do Pró-Labore */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border: '1px solid #d1d5db' }}>
        <thead>
          <tr>
            <th colSpan={2} style={{ background: '#1e3a5f', color: '#fff', padding: '8px 14px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Resumo do Pró-Labore
            </th>
          </tr>
        </thead>
        <tbody>
          {[
            ['PRÓ-LABORE BASE', proLaboreBase, false],
            ...(quotaAdjust > 0 ? [['REAJUSTE DE COTA', quotaAdjust, false]] : []),
          ].map(([label, value, bold], i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb', fontWeight: bold ? 'bold' : 'normal' }}>{label}</td>
              <td style={{ padding: '7px 14px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontFamily: 'monospace', fontWeight: bold ? 'bold' : 'normal' }}>{formatCurrency(value)}</td>
            </tr>
          ))}
          {/* Total Bruto */}
          <tr style={{ background: '#f3f4f6' }}>
            <td style={{ padding: '8px 14px', fontWeight: 'bold', borderBottom: '1px solid #d1d5db', borderTop: '1px solid #d1d5db' }}>TOTAL BRUTO</td>
            <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', borderBottom: '1px solid #d1d5db', borderTop: '1px solid #d1d5db' }}>{formatCurrency(grossTotal)}</td>
          </tr>
          {/* Descontos */}
          <tr style={{ background: '#fff' }}>
            <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>INSS PRÓ-LABORE ({inssPct}%)</td>
            <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb', color: '#dc2626' }}>-{formatCurrency(inss)}</td>
          </tr>
          <tr style={{ background: '#f9fafb' }}>
            <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>IRRF</td>
            <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb', color: '#dc2626' }}>-{formatCurrency(irrf)}</td>
          </tr>
          {/* Líquido */}
          <tr style={{ background: '#eff6ff' }}>
            <td style={{ padding: '9px 14px', fontWeight: 'bold', color: '#1e3a5f', borderTop: '2px solid #2563eb' }}>LÍQUIDO DO PRÓ-LABORE</td>
            <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', color: '#1e3a5f', borderTop: '2px solid #2563eb' }}>{formatCurrency(netLabore)}</td>
          </tr>
        </tbody>
      </table>

      {/* Beneficiário (se tiver dados bancários ou plano) */}
      {(employee.bank_name || employee.pix_key) && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border: '1px solid #d1d5db' }}>
          <thead>
            <tr>
              <th colSpan={2} style={{ background: '#1e3a5f', color: '#fff', padding: '8px 14px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Beneficiário
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '8px 14px', borderBottom: '1px solid #e5e7eb', fontSize: '11px' }}>
                {[employee.bank_name, employee.bank_agency && `Ag. ${employee.bank_agency}`, employee.bank_account && `CC ${employee.bank_account}`, employee.pix_key && `PIX: ${employee.pix_key}`].filter(Boolean).join(' — ') || 'Seguro de vida, convênio médico e plano odontológico'}
              </td>
              <td style={{ padding: '8px 14px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: 'bold' }}>
                {employee.bank_beneficiary || employee.name}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* Quinzenal */}
      {(firstBase > 0 || secondBase > 0) && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', border: '1px solid #d1d5db' }}>
          <thead>
            <tr>
              <th colSpan={4} style={{ background: '#1e3a5f', color: '#fff', padding: '8px 14px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Pagamento Quinzenal
              </th>
            </tr>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '6px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid #d1d5db', width: '25%' }}>Período</th>
              <th style={{ padding: '6px 14px', textAlign: 'right', fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid #d1d5db', width: '25%' }}>Base</th>
              <th style={{ padding: '6px 14px', textAlign: 'right', fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid #d1d5db', width: '25%' }}>Descontos/Bônus</th>
              <th style={{ padding: '6px 14px', textAlign: 'right', fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid #d1d5db', width: '25%' }}>A Receber</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#fff' }}>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold', fontSize: '11px' }}>1ª Quinzena (1–15)</td>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', fontFamily: 'monospace', fontSize: '11px' }}>{formatCurrency(firstBase)}</td>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', fontFamily: 'monospace', fontSize: '11px', color: firstDebits > 0 ? '#dc2626' : '#555' }}>
                {firstDebits !== 0 ? (firstDebits > 0 ? '-' : '+') + formatCurrency(Math.abs(firstDebits)) : '—'}
              </td>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold', color: '#1e3a5f' }}>
                {formatCurrency(firstNet)}
                {paymentStatus?.payment_date_q1 && <div style={{ fontSize: '9px', color: '#16a34a', fontWeight: 'bold', marginTop: '2px' }}>Pago em {paymentStatus.payment_date_q1.split('-').reverse().join('/')}</div>}
              </td>
            </tr>
            <tr style={{ background: '#f9fafb' }}>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold', fontSize: '11px' }}>2ª Quinzena (16–30)</td>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', fontFamily: 'monospace', fontSize: '11px' }}>{formatCurrency(secondBase)}</td>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', fontFamily: 'monospace', fontSize: '11px' }}>
                {[birthdayBonus > 0 && `+B. Aniv.`, medicalPlan > 0 && `+Conv.`, profitDist > 0 && `+Lucros`, secondDebits > 0 && `-Desc.`].filter(Boolean).join(' ') || '—'}
              </td>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold', color: '#1e3a5f' }}>
                {formatCurrency(secondNet)}
                {paymentStatus?.payment_date_q2 && <div style={{ fontSize: '9px', color: '#16a34a', fontWeight: 'bold', marginTop: '2px' }}>Pago em {paymentStatus.payment_date_q2.split('-').reverse().join('/')}</div>}
              </td>
            </tr>

          </tbody>
        </table>
      )}

      {/* Distribuição de Lucros e Adiantamentos */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', border: '1px solid #d1d5db' }}>
        <thead>
          <tr>
            <th colSpan={2} style={{ background: '#1e3a5f', color: '#fff', padding: '8px 14px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Distribuição de Lucros e Adiantamentos — {monthName}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ background: '#fff' }}>
            <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>LÍQUIDO DO PRÓ-LABORE</td>
            <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb' }}>{formatCurrency(netLabore)}</td>
          </tr>
          {profitDist > 0 && (
            <tr style={{ background: '#f9fafb' }}>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>DISTRIBUIÇÃO DE LUCROS</td>
              <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb' }}>{formatCurrency(profitDist)}</td>
            </tr>
          )}
          {birthdayBonus > 0 && (
            <tr style={{ background: '#f9fafb' }}>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>BONIFICAÇÃO DE ANIVERSÁRIO (2ª quinzena)</td>
              <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb', color: '#16a34a' }}>{formatCurrency(birthdayBonus)}</td>
            </tr>
          )}
          {medicalPlan > 0 && (
            <tr style={{ background: '#fff' }}>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>CONVÊNIO MÉDICO (2ª quinzena)</td>
              <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb', color: '#16a34a' }}>{formatCurrency(medicalPlan)}</td>
            </tr>
          )}
          {firstAdvance > 0 && (
            <tr style={{ background: '#fff' }}>
              <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>ADIANTAMENTO 1ª QUINZENA — {monthName}</td>
              <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb', color: '#dc2626' }}>-{formatCurrency(firstAdvance)}</td>
            </tr>
          )}
          {extraDiscounts.map((d, i) => {
            const isCredit = d.type === 'credit';
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? '#f9fafb' : '#fff' }}>
                <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>{d.description?.toUpperCase()}{d.date ? ` (${d.date.split('-').reverse().join('/')})` : ''}</td>
                <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb', color: isCredit ? '#16a34a' : '#dc2626' }}>
                  {isCredit ? '' : '-'}{formatCurrency(d.amount)}
                </td>
              </tr>
            );
          })}
          <tr style={{ background: '#f9fafb' }}>
            <td style={{ padding: '7px 14px', borderBottom: '1px solid #e5e7eb' }}>OUTROS DESCONTOS</td>
            <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid #e5e7eb' }}>{otherDiscounts > 0 ? `-${formatCurrency(otherDiscounts)}` : formatCurrency(0)}</td>
          </tr>
          <tr style={{ background: '#eff6ff' }}>
            <td style={{ padding: '9px 14px', fontWeight: 'bold', color: '#1e3a5f', borderTop: '2px solid #2563eb' }}>TOTAL LÍQUIDO A RECEBER</td>
            <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', color: '#1e3a5f', borderTop: '2px solid #2563eb' }}>{formatCurrency(netTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* Declaração */}
      <p style={{ lineHeight: '1.7', textAlign: 'justify', marginBottom: '24px', fontSize: '12px' }}>
        Declaro, para os devidos fins, que recebi da empresa <strong>{company?.name || '___________'}</strong>,
        {company?.cnpj ? ` CNPJ ${company.cnpj},` : ''} a importância líquida de{' '}
        <strong>{formatCurrency(netTotal)}</strong> ({numberToWords(netTotal)}), referente ao pró-labore e
        demais verbas discriminadas acima relativas à competência de <strong>{monthName}</strong>, dando plena,
        geral e irrevogável quitação ao referido pagamento.
      </p>

      <p style={{ marginBottom: '36px', fontSize: '12px' }}>Local e Data: ___________________________________________</p>

      {/* Assinatura */}
      <div style={{ textAlign: 'center', marginTop: '8px' }}>
        <div style={{ display: 'inline-block', textAlign: 'center', borderTop: '1px solid #555', paddingTop: '6px', minWidth: '280px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{employee.name}</div>
          <div style={{ fontSize: '11px', color: '#555' }}>CPF: {employee.cpf_cnpj || '—'}</div>
          <div style={{ fontSize: '11px', color: '#555' }}>{employee.position || 'Sócio Administrador'}</div>
        </div>
      </div>
    </div>
  );
}