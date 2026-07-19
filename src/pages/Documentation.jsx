import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Building2, Users, MapPin, Briefcase, Calculator, Wallet, Clock,
  Shield, RefreshCw, FileText, Database, Zap, Bug, GitBranch, CheckCircle2
} from 'lucide-react';

const modules = [
  {
    icon: Building2,
    name: 'Empresas (Companies)',
    entity: 'Company',
    purpose: 'Cadastro de empresas (CNPJ, contatos) e vínculo com o Tangerino/Solides.',
    logic: 'Cada empresa possui um tangerino_id que conecta o sistema local ao ponto eletrônico. O campo is_active controla se a empresa aparece nos fluxos de cálculo.'
  },
  {
    icon: Users,
    name: 'Colaboradores (Employees)',
    entity: 'Employee',
    purpose: 'Gestão de colaboradores, contratos e vínculos com cargos e locais.',
    logic: 'O contract_type (CLT, PJ, ESPORADICO) define qual motor de cálculo será usado. O is_active e termination_date impedem que colaboradores desligados entrem na folha.'
  },
  {
    icon: MapPin,
    name: 'Locais de Trabalho (Workplaces)',
    entity: 'Workplace',
    purpose: 'Locais físicos com escalas e valores padrão de benefícios.',
    logic: 'A work_schedule (seg_sex ou seg_sab) define os dias úteis. Valores padrão (salário, VR, VA, aluguel de moto) pré-preenchem folhas novas.'
  },
  {
    icon: Briefcase,
    name: 'Cargos (JobRoles)',
    entity: 'JobRole',
    purpose: 'Templates de cargos associados a modelos de folha.',
    logic: 'O payroll_type (MOTOCICLISTA_CLT, MOTOCICLISTA_MEI, ESCRITORIO, SOCIO, ESPORADICO) determina qual formulário e cálculo será aplicado.'
  },
  {
    icon: Calculator,
    name: 'Folha de Pagamento (Payroll)',
    entity: 'PayrollEntry',
    purpose: 'Motor central de cálculo de salários, benefícios e descontos.',
    logic: 'Dividido em 1ª e 2ª quinzena (first_period_base / second_period_base). Calcula bruto, descontos (INSS, IRRF, sindical) e líquido. O status "closed" trava alterações.'
  },
  {
    icon: Wallet,
    name: 'Lançamentos (CashOut)',
    entity: 'CashOut',
    purpose: 'Adiantamentos, empréstimos e despesas reembolsáveis.',
    logic: 'Quando deduct_from_payroll = true, o valor é injetado como desconto na quinzena correspondente da PayrollEntry, abatendo do líquido.'
  },
  {
    icon: Clock,
    name: 'Ajustes de Ponto (PointAdjustments)',
    entity: 'PointAdjustment',
    purpose: 'Sincronização de abonos e justificativas do Tangerino.',
    logic: 'Ajustes com count_as_missing = true geram desconto de falta. Ajustes com allowance = true abonam o dia. Alimentam o recálculo de ausências.'
  },
  {
    icon: RefreshCw,
    name: 'Reajustes (Readjustment)',
    entity: 'ReadjustmentRule',
    purpose: 'Automação de aumentos ou reduções salariais em lote.',
    logic: 'Aplica percentual sobre salário/benefícios de um escopo (folha ou colaborador). Salva snapshot antes de aplicar, permitindo reversão.'
  },
  {
    icon: Shield,
    name: 'Auditoria (PayrollAuditLog)',
    entity: 'PayrollAuditLog',
    purpose: 'Rastreamento de todas as alterações em folhas.',
    logic: 'Registra ação (create, update, close, clone), usuário, valores anteriores e novos. Garante trilha de auditoria para conformidade.'
  }
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
  { date: '2026-07-19', type: 'feature', title: 'Página de Documentação Técnica', desc: 'Criação de página interna com documentação de estrutura, módulos, lógica e histórico de alterações.' },
  { date: '2026-07-13', type: 'fix', title: 'Correção de Giovane da Silva Brito', desc: 'Identificado que registros de junho/2026 estavam ocultos porque o colaborador estava marcado como is_active: false com data de demissão legada.' },
  { date: '2026-07-01', type: 'fix', title: 'Recálculo de Folha de Junho', desc: 'Execução de recalcJunePayroll e fixJuneINSSDiscount para corrigir competência após mudança de regra.' },
  { date: '2026-06-15', type: 'feature', title: 'Reajuste Salarial com Snapshot', desc: 'Implementação de applyReadjustment com snapshot para permitir reversão segura de aumentos.' },
  { date: '2026-06-10', type: 'fix', title: 'Bases Travadas após Reajuste', desc: 'Correção via fixLockedBasesAfterReadjustment para folhas que não refletiram o aumento.' },
  { date: '2026-05-20', type: 'feature', title: 'Sincronização de Colaboradores Desligados', desc: 'Criação de syncEmployeesFired para atualizar termination_date automaticamente.' },
  { date: '2026-05-15', type: 'feature', title: 'Contribuição Sindical Automatizada', desc: 'Implementação de applyUnionContribAdjustment e fixUnionContribNetTotal.' },
  { date: '2026-04-10', type: 'feature', title: 'Clonagem de Folha Mensal', desc: 'Implementação de clonePayrollFromPreviousMonth e copyNotesFromPreviousMonth.' },
  { date: '2026-03-01', type: 'feature', title: 'Integração Tangerino', desc: 'Sincronização de empresas, colaboradores, locais, cargos e ajustes de ponto.' }
];

const typeConfig = {
  feature: { icon: Zap, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Funcionalidade' },
  fix: { icon: Bug, color: 'text-red-600', bg: 'bg-red-100', label: 'Correção' },
  improvement: { icon: GitBranch, color: 'text-purple-600', bg: 'bg-purple-100', label: 'Melhoria' }
};

export default function Documentation() {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'modules', label: 'Módulos' },
    { id: 'logic', label: 'Lógica de Funcionamento' },
    { id: 'functions', label: 'Funções Backend' },
    { id: 'history', label: 'Histórico de Alterações' }
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar de navegação */}
      <nav className="w-56 border-r bg-card flex-shrink-0 p-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Documentação</h2>
        <ul className="space-y-1">
          {sections.map(s => (
            <li key={s.id}>
              <button
                onClick={() => setActiveSection(s.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  activeSection === s.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-foreground'
                }`}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Conteúdo */}
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-5xl">
          {activeSection === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">Documentação Técnica do Sistema</h1>
                <p className="text-muted-foreground">
                  Sistema de Gestão de Folha de Pagamento — aplicação web (React + Vite + Tailwind CSS)
                  integrada à plataforma Base44, projetada para gerenciar folha de pagamento de empresas
                  com diferentes tipos de contrato (CLT, MEI, Escritório, Esporádico, Sócio).
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> Stack Tecnológica</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Frontend</span><span className="font-medium">React 18 + Vite + Tailwind CSS + shadcn/ui</span></div>
                  <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Backend</span><span className="font-medium">Base44 BaaS (Deno Deploy)</span></div>
                  <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Banco de Dados</span><span className="font-medium">Base44 Entities (MongoDB)</span></div>
                  <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Integração Externa</span><span className="font-medium">Tangerino / Solides (Ponto Eletrônico)</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Autenticação</span><span className="font-medium">Base44 Auth + UserAccess customizado</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Arquitetura</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  <p>O sistema opera em três camadas:</p>
                  <div className="space-y-2">
                    <div className="flex gap-3"><Badge variant="secondary" className="flex-shrink-0">1</Badge><span><strong>Frontend (React):</strong> Páginas e componentes que consomem o SDK da Base44 para ler/escrever entidades.</span></div>
                    <div className="flex gap-3"><Badge variant="secondary" className="flex-shrink-0">2</Badge><span><strong>Backend Functions (Deno):</strong> Funções server-side para sincronização com Tangerino, cálculos pesados e correções de dados.</span></div>
                    <div className="flex gap-3"><Badge variant="secondary" className="flex-shrink-0">3</Badge><span><strong>Entidades (Base44):</strong> Modelos de dados que persistem tudo (PayrollEntry, Employee, CashOut, etc.).</span></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeSection === 'modules' && (
            <div className="space-y-4">
              <h1 className="text-3xl font-bold mb-4">Módulos do Sistema</h1>
              {modules.map(m => {
                const Icon = m.icon;
                return (
                  <Card key={m.name}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div>
                        {m.name}
                        <Badge variant="outline" className="ml-auto font-mono text-xs">{m.entity}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div><span className="font-semibold text-muted-foreground">Objetivo: </span>{m.purpose}</div>
                      <div><span className="font-semibold text-muted-foreground">Lógica: </span>{m.logic}</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {activeSection === 'logic' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold mb-4">Lógica de Funcionamento</h1>

              <Card>
                <CardHeader><CardTitle>Fluxo Principal (Cross-Module)</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2"><Badge>1</Badge> <span><strong>Sincronização:</strong> Tangerino alimenta cadastros e ajustes de ponto.</span></div>
                    <div className="flex items-center gap-2"><Badge>2</Badge> <span><strong>Cálculo:</strong> Ajustes de ponto + cadastros (cargos/salários) geram as PayrollEntries.</span></div>
                    <div className="flex items-center gap-2"><Badge>3</Badge> <span><strong>Deduções:</strong> CashOut intercepta o cálculo para aplicar descontos (adiantamentos).</span></div>
                    <div className="flex items-center gap-2"><Badge>4</Badge> <span><strong>Auditoria:</strong> PayrollAuditLog registra cada etapa da corrente.</span></div>
                    <div className="flex items-center gap-2"><Badge>5</Badge> <span><strong>Fechamento:</strong> MonthClose trava a competência, impedindo alterações retroativas.</span></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Motores de Cálculo por Tipo de Folha</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-3">
                  <div><strong className="text-primary">CLT Motociclista:</strong> Salário base + ajuda de custo (KM) + bônus por entrega + aluguel de moto. Descontos de INSS, IRRF e sindical.</div>
                  <div><strong className="text-primary">MEI:</strong> Valores fixos, descontos de ausência proporcionais, splits de quinzena. Sem desconto de INSS patronal.</div>
                  <div><strong className="text-primary">Escritório:</strong> Bonificações extras por produtividade e presença. VT fixo proporcional aos dias úteis.</div>
                  <div><strong className="text-primary">Sócio (Pró-Labore):</strong> Pró-labore base + distribuição de lucros. Sem descontos trabalhistas.</div>
                  <div><strong className="text-primary">Esporádico:</strong> Pagamento por dia trabalhado, sem vínculo. Cálculo proporcional simples.</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Divisão de Períodos (Quinzenas)</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>Cada PayrollEntry é dividida em dois períodos de pagamento:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>1ª Quinzena (dias 1–15):</strong> first_period_base, first_period_net, first_discounts</li>
                    <li><strong>2ª Quinzena (dias 16–30):</strong> second_period_base, second_period_net, second_discounts</li>
                    <li>O first_period_split (padrão 0.5) define a proporção da base entre as quinzenas.</li>
                    <li>Adiantamentos da 1ª quinzena viram first_period_discount na 2ª.</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Reconciliação com CashOut</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>Quando um lançamento no CashOut tem <code className="bg-muted px-1 rounded">deduct_from_payroll = true</code>:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>O sistema busca o lançamento pela reference_month e period (first/second).</li>
                    <li>O valor é injetado no array first_discounts ou second_discounts da PayrollEntry.</li>
                    <li>O líquido da quinzena é recalculado: bruto - descontos - adiantamento.</li>
                    <li>Se a folha estiver fechada (status: closed), a dedução é bloqueada.</li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          )}

          {activeSection === 'functions' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold mb-4">Funções Backend</h1>
              {backendFunctions.map(group => (
                <Card key={group.group}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" /> {group.group}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {group.items.map(item => (
                      <div key={item.name} className="border-l-2 border-primary/30 pl-3">
                        <div className="font-mono text-sm font-medium">{item.name}</div>
                        <div className="text-sm text-muted-foreground mt-1">{item.logic}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {activeSection === 'history' && (
            <div className="space-y-6">
              <h1 className="text-3xl font-bold mb-4">Histórico de Alterações</h1>
              <div className="relative">
                {changeHistory.map((change, idx) => {
                  const cfg = typeConfig[change.type] || typeConfig.feature;
                  const Icon = cfg.icon;
                  return (
                    <div key={idx} className="flex gap-4 pb-6 relative">
                      {/* Linha vertical */}
                      {idx < changeHistory.length - 1 && (
                        <div className="absolute left-5 top-12 bottom-0 w-px bg-border" />
                      )}
                      {/* Ícone */}
                      <div className={`p-2.5 rounded-full ${cfg.bg} flex-shrink-0 z-10`}>
                        <Icon className={`h-5 w-5 ${cfg.color}`} />
                      </div>
                      {/* Conteúdo */}
                      <Card className="flex-1">
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                            <span className="text-xs text-muted-foreground">{change.date}</span>
                          </div>
                          <h3 className="font-semibold mb-1">{change.title}</h3>
                          <p className="text-sm text-muted-foreground">{change.desc}</p>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}