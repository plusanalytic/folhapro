/**
 * Exporta a documentação técnica do sistema para um arquivo Word (.doc)
 * com layout da plataforma, logo e formatação profissional.
 */

const LOGO_URL = "https://media.base44.com/images/public/69dfcba2fae1c77226b7a4da/324c9c675_LOGOCONTACTA-SEMFUNDO-DEITADO1.png";

const modules = [
  { name: 'Empresas (Companies)', entity: 'Company', purpose: 'Cadastro de empresas (CNPJ, contatos) e vínculo com o Tangerino/Solides.', logic: 'Cada empresa possui um tangerino_id que conecta o sistema local ao ponto eletrônico. O campo is_active controla se a empresa aparece nos fluxos de cálculo.' },
  { name: 'Colaboradores (Employees)', entity: 'Employee', purpose: 'Gestão de colaboradores, contratos e vínculos com cargos e locais.', logic: 'O contract_type (CLT, PJ, ESPORADICO) define qual motor de cálculo será usado. O is_active e termination_date impedem que colaboradores desligados entrem na folha.' },
  { name: 'Locais de Trabalho (Workplaces)', entity: 'Workplace', purpose: 'Locais físicos com escalas e valores padrão de benefícios.', logic: 'A work_schedule (seg_sex ou seg_sab) define os dias úteis. Valores padrão (salário, VR, VA, aluguel de moto) pré-preenchem folhas novas.' },
  { name: 'Cargos (JobRoles)', entity: 'JobRole', purpose: 'Templates de cargos associados a modelos de folha.', logic: 'O payroll_type (MOTOCICLISTA_CLT, MOTOCICLISTA_MEI, ESCRITORIO, SOCIO, ESPORADICO) determina qual formulário e cálculo será aplicado.' },
  { name: 'Folha de Pagamento (Payroll)', entity: 'PayrollEntry', purpose: 'Motor central de cálculo de salários, benefícios e descontos.', logic: 'Dividido em 1ª e 2ª quinzena (first_period_base / second_period_base). Calcula bruto, descontos (INSS, IRRF, sindical) e líquido. O status "closed" trava alterações.' },
  { name: 'Lançamentos (CashOut)', entity: 'CashOut', purpose: 'Adiantamentos, empréstimos e despesas reembolsáveis.', logic: 'Quando deduct_from_payroll = true, o valor é injetado como desconto na quinzena correspondente da PayrollEntry, abatendo do líquido.' },
  { name: 'Ajustes de Ponto (PointAdjustments)', entity: 'PointAdjustment', purpose: 'Sincronização de abonos e justificativas do Tangerino.', logic: 'Ajustes com count_as_missing = true geram desconto de falta. Ajustes com allowance = true abonam o dia. Alimentam o recálculo de ausências.' },
  { name: 'Reajustes (Readjustment)', entity: 'ReadjustmentRule', purpose: 'Automação de aumentos ou reduções salariais em lote.', logic: 'Aplica percentual sobre salário/benefícios de um escopo (folha ou colaborador). Salva snapshot antes de aplicar, permitindo reversão.' },
  { name: 'Auditoria (PayrollAuditLog)', entity: 'PayrollAuditLog', purpose: 'Rastreamento de todas as alterações em folhas.', logic: 'Registra ação (create, update, close, clone), usuário, valores anteriores e novos. Garante trilha de auditoria para conformidade.' }
];

const backendFunctions = [
  { group: 'Sincronização (Tangerino → Base44)', items: [
    { name: 'syncEmployees / syncEmployeesCore / syncEmployeesActive / syncEmployeesFired', logic: 'Buscam colaboradores no Tangerino e atualizam status de admissão/demissão na Base44.' },
    { name: 'syncWorkplaces / syncWorkplaceList / syncEmployeeWorkplace', logic: 'Mantêm hierarquia de locais de trabalho e vínculos de colaborador → local.' },
    { name: 'syncJobRoles / syncJobRolesScheduled', logic: 'Sincronizam cargos e garantem o payroll_type correto.' },
    { name: 'syncCompanies', logic: 'Sincroniza CNPJs e nomes de empresas.' },
    { name: 'syncPointAdjustments', logic: 'Busca abonos/justificativas do Tangerino e popula a entidade PointAdjustment.' }
  ]},
  { group: 'Cálculo e Manutenção de Folha', items: [
    { name: 'recalcAbsenceDiscounts', logic: 'Lê PointAdjustments com count_as_missing e subtrai valor proporcional do salário.' },
    { name: 'recalcJunePayroll / fixJunePayroll', logic: 'Recalculam competência de junho após alteração de regra ou correção de bug.' },
    { name: 'fillPeriodBases', logic: 'Divide o salário base entre 1ª e 2ª quinzena ao abrir nova folha.' },
    { name: 'fixLockedBasesAfterReadjustment', logic: 'Força recálculo de linhas que não refletiram o aumento aplicado.' },
    { name: 'fixJuneINSSDiscount', logic: 'Corrige dedução de INSS que não considerava bônus específico.' },
    { name: 'fixTerminationDates', logic: 'Ajusta datas de rescisão para evitar processar folha de desligados.' },
    { name: 'fixUnionContribNetTotal', logic: 'Corrige arredondamento do desconto sindical para bater bruto - descontos = líquido.' },
    { name: 'zeroAttendanceBonusOnAbsence', logic: 'Zera bônus de assiduidade se houver qualquer falta no mês.' }
  ]},
  { group: 'Ciclo de Vida (Automações)', items: [
    { name: 'clonePayrollFromPreviousMonth', logic: 'Clona folha do mês anterior, preservando salário/benefícios e limpando valores dinâmicos.' },
    { name: 'copyNotesFromPreviousMonth', logic: 'Copia observações manuais do mês anterior para manter histórico.' },
    { name: 'cleanupPointAdjustments', logic: 'Remove ajustes antigos/inválidos para manter performance das queries.' }
  ]},
  { group: 'Reajuste Salarial', items: [
    { name: 'applyReadjustment / revertReadjustment', logic: 'Aplica percentual sobre salário/benefícios e salva snapshot para reversão.' },
    { name: 'applyReverseReadjustment / revertReverseReadjustment', logic: 'Variação para corrigir aumentos aplicados incorretamente.' }
  ]},
  { group: 'Contribuição Sindical', items: [
    { name: 'applyUnionContribAdjustment / revertUnionContribAdjustment', logic: 'Aplica e reverte desconto sindical (valor fixo ou percentual sobre o bruto).' }
  ]},
  { group: 'Debug', items: [
    { name: 'debugEmployee / debugTangerinoPage', logic: 'Funções de leitura que imprimem dados brutos da API do Tangerino para diagnóstico.' }
  ]}
];

const changeHistory = [
  { date: '2026-07-19', type: 'Funcionalidade', title: 'Página de Documentação Técnica', desc: 'Criação de página interna com documentação de estrutura, módulos, lógica e histórico de alterações.' },
  { date: '2026-07-13', type: 'Correção', title: 'Correção de Giovane da Silva Brito', desc: 'Identificado que registros de junho/2026 estavam ocultos porque o colaborador estava marcado como is_active: false com data de demissão legada.' },
  { date: '2026-07-01', type: 'Correção', title: 'Recálculo de Folha de Junho', desc: 'Execução de recalcJunePayroll e fixJuneINSSDiscount para corrigir competência após mudança de regra.' },
  { date: '2026-06-15', type: 'Funcionalidade', title: 'Reajuste Salarial com Snapshot', desc: 'Implementação de applyReadjustment com snapshot para permitir reversão segura de aumentos.' },
  { date: '2026-06-10', type: 'Correção', title: 'Bases Travadas após Reajuste', desc: 'Correção via fixLockedBasesAfterReadjustment para folhas que não refletiram o aumento.' },
  { date: '2026-05-20', type: 'Funcionalidade', title: 'Sincronização de Colaboradores Desligados', desc: 'Criação de syncEmployeesFired para atualizar termination_date automaticamente.' },
  { date: '2026-05-15', type: 'Funcionalidade', title: 'Contribuição Sindical Automatizada', desc: 'Implementação de applyUnionContribAdjustment e fixUnionContribNetTotal.' },
  { date: '2026-04-10', type: 'Funcionalidade', title: 'Clonagem de Folha Mensal', desc: 'Implementação de clonePayrollFromPreviousMonth e copyNotesFromPreviousMonth.' },
  { date: '2026-03-01', type: 'Funcionalidade', title: 'Integração Tangerino', desc: 'Sincronização de empresas, colaboradores, locais, cargos e ajustes de ponto.' }
];

function buildHTML() {
  const today = new Date().toLocaleDateString('pt-BR');

  const modulesHTML = modules.map(m => `
    <div style="margin-bottom:16px;border-left:4px solid #6a3eaf;padding-left:12px;">
      <h3 style="color:#239BB6;margin:0 0 4px 0;font-size:14px;">${m.name} <span style="color:#888;font-weight:normal;font-size:11px;">(Entidade: ${m.entity})</span></h3>
      <p style="margin:2px 0;font-size:12px;"><strong>Objetivo:</strong> ${m.purpose}</p>
      <p style="margin:2px 0;font-size:12px;"><strong>Lógica:</strong> ${m.logic}</p>
    </div>`).join('');

  const functionsHTML = backendFunctions.map(g => `
    <div style="margin-bottom:16px;">
      <h3 style="color:#6a3eaf;margin:0 0 8px 0;font-size:14px;border-bottom:1px solid #ddd;padding-bottom:4px;">${g.group}</h3>
      ${g.items.map(i => `
        <div style="margin-bottom:8px;padding-left:12px;border-left:2px solid #239BB6;">
          <p style="margin:0;font-family:Consolas,monospace;font-size:11px;font-weight:bold;color:#333;">${i.name}</p>
          <p style="margin:2px 0 0 0;font-size:11px;color:#555;">${i.logic}</p>
        </div>`).join('')}
    </div>`).join('');

  const historyHTML = changeHistory.map(c => `
    <tr>
      <td style="padding:6px 10px;border:1px solid #ddd;font-size:11px;white-space:nowrap;">${c.date}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;font-size:11px;">
        <span style="background:${c.type === 'Correção' ? '#fee2e2' : '#dbeafe'};color:${c.type === 'Correção' ? '#dc2626' : '#2563eb'};padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;">${c.type}</span>
      </td>
      <td style="padding:6px 10px;border:1px solid #ddd;font-size:11px;font-weight:bold;">${c.title}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;font-size:11px;">${c.desc}</td>
    </tr>`).join('');

  return `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>Documentação Técnica do Sistema</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; color: #222; line-height: 1.5; }
    h1 { color: #6a3eaf; font-size: 24px; border-bottom: 3px solid #239BB6; padding-bottom: 8px; }
    h2 { color: #6a3eaf; font-size: 18px; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    h3 { font-size: 14px; }
    p { font-size: 12px; }
    .header { text-align: center; margin-bottom: 24px; }
    .header img { height: 60px; }
    .meta { text-align: right; color: #888; font-size: 10px; margin-bottom: 20px; }
    .info-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    .info-table td { padding: 6px 10px; border: 1px solid #ddd; font-size: 11px; }
    .info-table td:first-child { background: #f5f5f5; font-weight: bold; width: 30%; }
    .flow-step { background: #f9f9f9; border-left: 4px solid #239BB6; padding: 8px 12px; margin: 6px 0; font-size: 12px; }
    .calc-type { background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 4px; padding: 8px 12px; margin: 6px 0; font-size: 12px; }
    .calc-type strong { color: #6a3eaf; }
    ul { font-size: 12px; }
    li { margin-bottom: 4px; }
    .footer { margin-top: 40px; text-align: center; color: #888; font-size: 10px; border-top: 1px solid #ddd; padding-top: 8px; }
  </style>
</head>
<body>

  <div class="header">
    <img src="${LOGO_URL}" alt="Contacta RH" />
  </div>

  <div class="meta">Documento gerado em ${today} | Sistema de Gestão de Folha de Pagamento</div>

  <h1>Documentação Técnica do Sistema</h1>

  <p>Sistema de Gestão de Folha de Pagamento — aplicação web (React + Vite + Tailwind CSS) integrada à plataforma Base44, projetada para gerenciar folha de pagamento de empresas com diferentes tipos de contrato (CLT, MEI, Escritório, Esporádico, Sócio).</p>

  <h2>1. Stack Tecnológica</h2>
  <table class="info-table">
    <tr><td>Frontend</td><td>React 18 + Vite + Tailwind CSS + shadcn/ui</td></tr>
    <tr><td>Backend</td><td>Base44 BaaS (Deno Deploy)</td></tr>
    <tr><td>Banco de Dados</td><td>Base44 Entities (MongoDB)</td></tr>
    <tr><td>Integração Externa</td><td>Tangerino / Solides (Ponto Eletrônico)</td></tr>
    <tr><td>Autenticação</td><td>Base44 Auth + UserAccess customizado</td></tr>
  </table>

  <h2>2. Arquitetura</h2>
  <p>O sistema opera em três camadas:</p>
  <div class="flow-step"><strong>1. Frontend (React):</strong> Páginas e componentes que consomem o SDK da Base44 para ler/escrever entidades.</div>
  <div class="flow-step"><strong>2. Backend Functions (Deno):</strong> Funções server-side para sincronização com Tangerino, cálculos pesados e correções de dados.</div>
  <div class="flow-step"><strong>3. Entidades (Base44):</strong> Modelos de dados que persistem tudo (PayrollEntry, Employee, CashOut, etc.).</div>

  <h2>3. Módulos do Sistema</h2>
  ${modulesHTML}

  <h2>4. Lógica de Funcionamento</h2>

  <h3>4.1 Fluxo Principal (Cross-Module)</h3>
  <div class="flow-step"><strong>1. Sincronização:</strong> Tangerino alimenta cadastros e ajustes de ponto.</div>
  <div class="flow-step"><strong>2. Cálculo:</strong> Ajustes de ponto + cadastros (cargos/salários) geram as PayrollEntries.</div>
  <div class="flow-step"><strong>3. Deduções:</strong> CashOut intercepta o cálculo para aplicar descontos (adiantamentos).</div>
  <div class="flow-step"><strong>4. Auditoria:</strong> PayrollAuditLog registra cada etapa da corrente.</div>
  <div class="flow-step"><strong>5. Fechamento:</strong> MonthClose trava a competência, impedindo alterações retroativas.</div>

  <h3>4.2 Motores de Cálculo por Tipo de Folha</h3>
  <div class="calc-type"><strong>CLT Motociclista:</strong> Salário base + ajuda de custo (KM) + bônus por entrega + aluguel de moto. Descontos de INSS, IRRF e sindical.</div>
  <div class="calc-type"><strong>MEI:</strong> Valores fixos, descontos de ausência proporcionais, splits de quinzena. Sem desconto de INSS patronal.</div>
  <div class="calc-type"><strong>Escritório:</strong> Bonificações extras por produtividade e presença. VT fixo proporcional aos dias úteis.</div>
  <div class="calc-type"><strong>Sócio (Pró-Labore):</strong> Pró-labore base + distribuição de lucros. Sem descontos trabalhistas.</div>
  <div class="calc-type"><strong>Esporádico:</strong> Pagamento por dia trabalhado, sem vínculo. Cálculo proporcional simples.</div>

  <h3>4.3 Divisão de Períodos (Quinzenas)</h3>
  <p>Cada PayrollEntry é dividida em dois períodos de pagamento:</p>
  <ul>
    <li><strong>1ª Quinzena (dias 1–15):</strong> first_period_base, first_period_net, first_discounts</li>
    <li><strong>2ª Quinzena (dias 16–30):</strong> second_period_base, second_period_net, second_discounts</li>
    <li>O first_period_split (padrão 0.5) define a proporção da base entre as quinzenas.</li>
    <li>Adiantamentos da 1ª quinzena viram first_period_discount na 2ª.</li>
  </ul>

  <h3>4.4 Reconciliação com CashOut</h3>
  <p>Quando um lançamento no CashOut tem <code>deduct_from_payroll = true</code>:</p>
  <ol>
    <li>O sistema busca o lançamento pela reference_month e period (first/second).</li>
    <li>O valor é injetado no array first_discounts ou second_discounts da PayrollEntry.</li>
    <li>O líquido da quinzena é recalculado: bruto - descontos - adiantamento.</li>
    <li>Se a folha estiver fechada (status: closed), a dedução é bloqueada.</li>
  </ol>

  <h2>5. Funções Backend</h2>
  ${functionsHTML}

  <h2>6. Histórico de Alterações</h2>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#6a3eaf;color:#fff;">
        <th style="padding:6px 10px;border:1px solid #6a3eaf;font-size:11px;text-align:left;">Data</th>
        <th style="padding:6px 10px;border:1px solid #6a3eaf;font-size:11px;text-align:left;">Tipo</th>
        <th style="padding:6px 10px;border:1px solid #6a3eaf;font-size:11px;text-align:left;">Título</th>
        <th style="padding:6px 10px;border:1px solid #6a3eaf;font-size:11px;text-align:left;">Descrição</th>
      </tr>
    </thead>
    <tbody>
      ${historyHTML}
    </tbody>
  </table>

  <div class="footer">
    Contacta RH — Sistema de Gestão de Folha de Pagamento | Documentação gerada automaticamente
  </div>

</body>
</html>`;
}

export function exportDocumentationToWord() {
  const html = buildHTML();
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Documentacao_Tecnica_Sistema_${new Date().toISOString().split('T')[0]}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}