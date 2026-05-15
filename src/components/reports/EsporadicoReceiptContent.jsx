import { formatCurrency, numberToWords, getMonthName } from '@/lib/payrollCalculations';

function formatDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default function EsporadicoReceiptContent({ employee, entry, month, company }) {
  const monthName = getMonthName(month);

  const pontos        = entry?.km_bonus_qty    ?? 0;
  const valorPonto    = entry?.km_bonus_value  ?? 10;
  const totalPontos   = Math.round(pontos * valorPonto * 100) / 100;
  const bonus         = entry?.bonus           ?? 0;
  const lifeInsurance = entry?.life_insurance  ?? 0;
  const otherDisc     = entry?.other_discounts ?? 0;
  const absDisc       = entry?.absence_discount ?? 0;

  // Lançamentos do mês (descontos/acréscimos)
  const monthDiscounts = entry?.first_discounts ?? [];
  const monthDiscountTotal = monthDiscounts.reduce(
    (s, r) => r.type === 'credit' ? s - (r.amount || 0) : s + (r.amount || 0),
    0
  );

  const totalVencimentos = totalPontos + bonus;
  const totalDescontos   = lifeInsurance + otherDisc + absDisc + monthDiscountTotal;
  const netTotal         = entry?.net_total ?? (totalVencimentos - totalDescontos);

  return (
    <div style={{ width: '210mm', minHeight: '297mm', padding: '12mm', fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#1a1a2e', backgroundColor: '#fff', boxSizing: 'border-box' }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #ea580c', paddingBottom: '10px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', background: 'linear-gradient(135deg,#ea580c,#f97316)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '16px' }}>
            {(company?.name || 'FP').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#ea580c' }}>{company?.name || 'FolhaPro'}</div>
            {company?.cnpj && <div style={{ color: '#666', fontSize: '10px' }}>CNPJ: {company.cnpj}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#ea580c', textTransform: 'uppercase', letterSpacing: '1px' }}>Recibo de Pagamento</div>
          <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>{monthName}</div>
          <div style={{ color: '#888', fontSize: '10px', marginTop: '1px' }}>Modelo: Prestador Esporádico</div>
        </div>
      </div>

      {/* Dados do colaborador */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', background: '#fff7ed', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Colaborador</div><div style={{ fontWeight: 'bold' }}>{employee.name}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>CPF / CNPJ</div><div style={{ fontWeight: 'bold' }}>{employee.cpf_cnpj || '—'}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Cargo</div><div style={{ fontWeight: 'bold' }}>{employee.position || '—'}</div></div>
        <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Contrato</div><div style={{ fontWeight: 'bold' }}>Prestador Esporádico</div></div>
        {employee.admission_date && <div><div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Admissão</div><div style={{ fontWeight: 'bold' }}>{formatDate(employee.admission_date)}</div></div>}
        {employee.termination_date && <div><div style={{ color: '#dc2626', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Demissão</div><div style={{ fontWeight: 'bold', color: '#dc2626' }}>{formatDate(employee.termination_date)}</div></div>}
      </div>

      {/* Tabela Proventos / Descontos */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '11px' }}>
        <thead>
          <tr>
            <th style={{ background: '#ea580c', color: '#fff', padding: '7px 10px', textAlign: 'left', borderRadius: '6px 0 0 0', width: '50%' }}>Proventos</th>
            <th style={{ background: '#ea580c', color: '#fff', padding: '7px 10px', textAlign: 'right', width: '14%' }}>Valor (R$)</th>
            <th style={{ background: '#444', color: '#fff', padding: '7px 10px', textAlign: 'left', width: '22%' }}>Descontos</th>
            <th style={{ background: '#444', color: '#fff', padding: '7px 10px', textAlign: 'right', borderRadius: '0 6px 0 0', width: '14%' }}>Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          {/* Linha pontos */}
          <tr style={{ background: '#fff7ed' }}>
            <td style={{ padding: '5px 10px', borderBottom: '1px solid #fed7aa' }}>Pontos ({pontos} × {formatCurrency(valorPonto)})</td>
            <td style={{ padding: '5px 10px', textAlign: 'right', borderBottom: '1px solid #fed7aa', color: '#2563eb', fontFamily: 'monospace' }}>{formatCurrency(totalPontos)}</td>
            <td style={{ padding: '5px 10px', borderBottom: '1px solid #fed7aa', borderLeft: '1px solid #fed7aa', color: lifeInsurance > 0 ? '#333' : '#aaa' }}>
              {lifeInsurance > 0 ? 'Seguro de Vida' : ''}
            </td>
            <td style={{ padding: '5px 10px', textAlign: 'right', borderBottom: '1px solid #fed7aa', color: '#dc2626', fontFamily: 'monospace' }}>
              {lifeInsurance > 0 ? formatCurrency(lifeInsurance) : ''}
            </td>
          </tr>
          {bonus > 0 && (
            <tr style={{ background: '#fff' }}>
              <td style={{ padding: '5px 10px', borderBottom: '1px solid #fed7aa' }}>Bonificação / Prêmio</td>
              <td style={{ padding: '5px 10px', textAlign: 'right', borderBottom: '1px solid #fed7aa', color: '#2563eb', fontFamily: 'monospace' }}>{formatCurrency(bonus)}</td>
              <td style={{ padding: '5px 10px', borderBottom: '1px solid #fed7aa', borderLeft: '1px solid #fed7aa', color: otherDisc > 0 ? '#333' : '#aaa' }}>
                {otherDisc > 0 ? 'Diversos' : ''}
              </td>
              <td style={{ padding: '5px 10px', textAlign: 'right', borderBottom: '1px solid #fed7aa', color: '#dc2626', fontFamily: 'monospace' }}>
                {otherDisc > 0 ? formatCurrency(otherDisc) : ''}
              </td>
            </tr>
          )}
          {absDisc > 0 && (
            <tr style={{ background: '#fff7ed' }}>
              <td style={{ padding: '5px 10px', borderBottom: '1px solid #fed7aa' }}></td>
              <td style={{ padding: '5px 10px', borderBottom: '1px solid #fed7aa' }}></td>
              <td style={{ padding: '5px 10px', borderBottom: '1px solid #fed7aa', borderLeft: '1px solid #fed7aa' }}>Desconto de Faltas</td>
              <td style={{ padding: '5px 10px', textAlign: 'right', borderBottom: '1px solid #fed7aa', color: '#dc2626', fontFamily: 'monospace' }}>{formatCurrency(absDisc)}</td>
            </tr>
          )}
          <tr>
            <td style={{ padding: '7px 10px', fontWeight: 'bold', background: '#ffedd5', borderTop: '2px solid #ea580c' }}>TOTAL DOS VENCIMENTOS</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', background: '#ffedd5', borderTop: '2px solid #ea580c', color: '#2563eb', fontFamily: 'monospace' }}>{formatCurrency(totalVencimentos)}</td>
            <td style={{ padding: '7px 10px', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', borderLeft: '1px solid #fed7aa' }}>TOTAL DESCONTOS</td>
            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 'bold', background: '#fee2e2', borderTop: '2px solid #dc2626', color: '#dc2626', fontFamily: 'monospace' }}>{formatCurrency(totalDescontos)}</td>
          </tr>
        </tbody>
      </table>

      {/* Lançamentos do mês */}
      {monthDiscounts.length > 0 && (
        <>
          <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#ea580c', textTransform: 'uppercase', marginBottom: '4px' }}>Lançamentos do Mês</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ background: '#ea580c', color: '#fff', padding: '6px 10px', textAlign: 'left', borderRadius: '6px 0 0 0', width: '50%' }}>Descrição</th>
                <th style={{ background: '#ea580c', color: '#fff', padding: '6px 10px', textAlign: 'center', width: '20%' }}>Data</th>
                <th style={{ background: '#ea580c', color: '#fff', padding: '6px 10px', textAlign: 'right', borderRadius: '0 6px 0 0', width: '30%' }}>Valor (R$)</th>
              </tr>
            </thead>
            <tbody>
              {monthDiscounts.map((d, i) => {
                const isCredit = d.type === 'credit';
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff7ed' : '#fff' }}>
                    <td style={{ padding: '5px 10px', borderBottom: '1px solid #fed7aa' }}>{d.description}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'center', borderBottom: '1px solid #fed7aa', color: '#555' }}>
                      {d.date ? d.date.split('-').reverse().join('/') : '—'}
                    </td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', borderBottom: '1px solid #fed7aa', color: isCredit ? '#16a34a' : '#dc2626', fontFamily: 'monospace' }}>
                      {isCredit ? '+ ' : '- '}{formatCurrency(d.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Total líquido */}
      <div style={{ background: netTotal < 0 ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'linear-gradient(135deg,#ea580c,#f97316)', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', color: '#fff' }}>
        <div>
          <div style={{ fontSize: '10px', opacity: 0.85, textTransform: 'uppercase', letterSpacing: '1px' }}>
            {netTotal < 0 ? 'SALDO NEGATIVO' : 'TOTAL LÍQUIDO A RECEBER'}
          </div>
          <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>{numberToWords(Math.abs(netTotal))}</div>
        </div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatCurrency(netTotal)}</div>
      </div>

      {/* Dados bancários */}
      {(employee.bank_name || employee.pix_key) && (
        <div style={{ border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', background: '#fafafa' }}>
          <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '6px' }}>Dados para Pagamento</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '10px' }}>
            {employee.bank_name    && <div><span style={{ color: '#888' }}>Banco: </span><strong>{employee.bank_name}</strong></div>}
            {employee.bank_agency  && <div><span style={{ color: '#888' }}>Agência: </span><strong>{employee.bank_agency}</strong></div>}
            {employee.bank_account && <div><span style={{ color: '#888' }}>Conta: </span><strong>{employee.bank_account}</strong></div>}
            {employee.bank_beneficiary && <div><span style={{ color: '#888' }}>Favorecido: </span><strong>{employee.bank_beneficiary}</strong></div>}
            {employee.pix_key      && <div><span style={{ color: '#888' }}>PIX: </span><strong>{employee.pix_key}</strong></div>}
          </div>
        </div>
      )}

      {entry?.notes && (
        <div style={{ border: '1px solid #fed7aa', borderRadius: '8px', padding: '8px 14px', marginBottom: '14px', background: '#fff7ed' }}>
          <div style={{ color: '#ea580c', fontSize: '9px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 'bold' }}>Observação</div>
          <div style={{ fontSize: '10px', color: '#444' }}>{entry.notes}</div>
        </div>
      )}

      {/* Assinatura */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '16px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #999', paddingTop: '6px', marginTop: '32px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{company?.name || '______________________________'}</div>
            <div style={{ color: '#888', fontSize: '10px' }}>Contratante / Responsável</div>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #999', paddingTop: '6px', marginTop: '32px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{employee.name}</div>
            <div style={{ color: '#888', fontSize: '10px' }}>Prestador — {employee.cpf_cnpj}</div>
          </div>
          <div style={{ marginTop: '8px', color: '#888', fontSize: '10px' }}>Data: _____ / _____ / _________</div>
        </div>
      </div>
    </div>
  );
}