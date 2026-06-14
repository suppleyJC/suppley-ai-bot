# Inventário do Sistema SUPPLEY Calc

**Versão:** 1.0  
**Data:** 15 de Dezembro de 2024  
**Autor:** Manus AI  
**Projeto:** Ferramenta Inteligente de Cálculo de Importação e Precificação

---

## 1. Visão Geral do Sistema

O **SUPPLEY Calc** é uma aplicação web completa para gestão de cálculos de importação e precificação de produtos. O sistema integra cálculos tributários complexos, análise de viabilidade com inteligência artificial, monitoramento de câmbio em tempo real e geração de relatórios profissionais.

A arquitetura segue o padrão **full-stack TypeScript** com React no frontend, Express/tRPC no backend, e MySQL como banco de dados relacional. A aplicação utiliza a infraestrutura Manus para hospedagem, armazenamento S3 e serviços de IA.

---

## 2. Estatísticas do Código Fonte

O projeto contém aproximadamente **36.998 linhas de código** distribuídas em **150 arquivos** TypeScript/React.

| Categoria | Linhas de Código | Arquivos |
|-----------|------------------|----------|
| TypeScript Backend (.ts) | 17.867 | 58 |
| React Frontend (.tsx) | 18.478 | 92 |
| CSS/Estilos | 653 | 2 |
| **Total** | **36.998** | **150** |

---

## 3. Estrutura de Diretórios

```
import_pricing_tool/
├── client/                    # Frontend React
│   ├── public/               # Assets estáticos (favicon, logos)
│   └── src/
│       ├── components/       # Componentes reutilizáveis (9 custom + 53 shadcn/ui)
│       ├── contexts/         # Contextos React (ThemeContext)
│       ├── hooks/            # Hooks customizados
│       ├── lib/              # Utilitários (trpc, authToken, utils)
│       └── pages/            # Páginas da aplicação (18 páginas)
├── server/                    # Backend Express/tRPC
│   ├── _core/                # Infraestrutura core (auth, llm, storage)
│   └── services/             # Serviços de negócio (26 serviços)
├── drizzle/                   # Schema e migrações do banco de dados
├── shared/                    # Tipos e constantes compartilhados
├── storage/                   # Helpers para S3
└── docs/                      # Documentação técnica
```

---

## 4. Componentes de Software

### 4.1 Dependências de Produção

O sistema utiliza um conjunto robusto de bibliotecas para garantir funcionalidade completa e experiência de usuário moderna.

| Categoria | Biblioteca | Versão | Função |
|-----------|------------|--------|--------|
| **Framework Frontend** | React | 19.1.1 | Biblioteca UI principal |
| | React DOM | 19.1.1 | Renderização DOM |
| | Wouter | 3.3.5 | Roteamento SPA |
| **Estado e Data Fetching** | TanStack Query | 5.90.2 | Cache e sincronização de dados |
| | tRPC Client | 11.6.0 | Cliente RPC tipado |
| **UI Components** | Radix UI | Múltiplas | Componentes acessíveis headless |
| | Lucide React | 0.453.0 | Ícones SVG |
| | Framer Motion | 12.23.22 | Animações |
| | Recharts | 2.15.2 | Gráficos e visualizações |
| **Framework Backend** | Express | 4.21.2 | Servidor HTTP |
| | tRPC Server | 11.6.0 | API RPC tipada |
| **Banco de Dados** | Drizzle ORM | 0.44.5 | ORM TypeScript |
| | MySQL2 | 3.15.0 | Driver MySQL |
| **Autenticação** | Jose | 6.1.0 | JWT tokens |
| | Bcryptjs | 3.0.3 | Hash de senhas |
| **IA e Agentes** | LangChain Core | 1.1.4 | Framework LLM |
| | LangGraph | 1.0.4 | Agentes conversacionais |
| **Armazenamento** | AWS S3 SDK | 3.693.0 | Upload de arquivos |
| **Relatórios** | ExcelJS | 4.4.0 | Geração de planilhas |
| | PDFKit | 0.17.2 | Geração de PDFs |
| **Utilitários** | Axios | 1.12.0 | Requisições HTTP |
| | Date-fns | 4.1.0 | Manipulação de datas |
| | Zod | 4.1.12 | Validação de schemas |

### 4.2 Dependências de Desenvolvimento

| Biblioteca | Versão | Função |
|------------|--------|--------|
| TypeScript | 5.9.3 | Tipagem estática |
| Vite | 7.1.7 | Build tool e dev server |
| Vitest | 2.1.4 | Framework de testes |
| Tailwind CSS | 4.1.14 | Framework CSS utility-first |
| Drizzle Kit | 0.31.4 | CLI para migrações |
| ESBuild | 0.25.0 | Bundler para produção |

---

## 5. Banco de Dados

### 5.1 Visão Geral

O sistema utiliza **MySQL/TiDB** como banco de dados relacional, com **Drizzle ORM** para mapeamento objeto-relacional. O schema contém **28 tabelas** organizadas por domínio funcional.

### 5.2 Tabelas do Sistema

| Tabela | Descrição | Registros Típicos |
|--------|-----------|-------------------|
| **Autenticação** | | |
| `users` | Usuários do sistema | Ilimitado |
| **Cadastros** | | |
| `suppliers` | Fornecedores estrangeiros | Por usuário |
| `products` | Produtos importados | Por usuário |
| **Tributação** | | |
| `ncm_tax_rates` | Alíquotas por NCM (II, IPI, PIS, COFINS) | ~13.000 |
| `icms_rates` | Alíquotas ICMS por estado | 27 |
| `tax_rate_history` | Histórico de alterações tributárias | Ilimitado |
| `tax_update_logs` | Logs de atualizações de tabelas | Ilimitado |
| `fiscal_benefits` | Benefícios fiscais (TTD, etc.) | Por estado |
| **Cálculos** | | |
| `import_calculations` | Cálculos de importação | Por usuário |
| `calculation_items` | Itens de cada cálculo | Por cálculo |
| `quotations` | Cotações agrupadas | Por usuário |
| **Câmbio** | | |
| `exchange_rates` | Cache de taxas de câmbio | Temporário |
| `exchange_rate_history` | Histórico de cotações | Ilimitado |
| **IA e Agentes** | | |
| `agent_alerts` | Alertas gerados pela IA | Por usuário |
| `agent_actions` | Ações executadas pelo agente | Por usuário |
| `agent_preferences` | Preferências do agente por usuário | Por usuário |
| `ai_chat_messages` | Histórico de chat com IA | Por usuário |
| `sofia_chat_messages` | Mensagens do chat SOFIA | Por usuário |
| `sofia_learning_context` | Contexto de aprendizado SOFIA | Por usuário |
| **Análises** | | |
| `market_indicators` | Indicadores de mercado | Periódico |
| `predictive_analysis_results` | Resultados de análises preditivas | Por análise |
| `commodity_prices` | Preços de commodities | Periódico |
| **Configurações** | | |
| `company_settings` | Configurações da empresa | Por usuário |
| **Funcionalidades Avançadas** | | |
| `drawback_records` | Registros de drawback | Por usuário |
| `state_pricing_rules` | Regras de precificação por estado | 27 |
| `tax_change_notifications` | Notificações de mudanças tributárias | Ilimitado |
| `supplier_prices` | Preços por fornecedor | Por produto |
| `product_best_prices` | Melhores preços por produto | Por produto |

### 5.3 Relacionamentos Principais

```
users (1) ──────────────────┬──── (N) suppliers
                            ├──── (N) products
                            ├──── (N) quotations
                            ├──── (N) import_calculations
                            ├──── (1) company_settings
                            └──── (N) agent_alerts

quotations (1) ──────────────────── (N) import_calculations

products (1) ────────────────────── (N) import_calculations

ncm_tax_rates (1) ───────────────── (N) import_calculations (via ncmCode)

icms_rates (1) ──────────────────── (N) import_calculations (via destinationState)
```

---

## 6. Infraestrutura e Serviços Externos

### 6.1 Plataforma de Hospedagem

O sistema é hospedado na **plataforma Manus**, que fornece:

| Serviço | Descrição | Endpoint |
|---------|-----------|----------|
| **Dev Server** | Servidor de desenvolvimento | `https://3000-*.manusvm.computer` |
| **Produção** | Hospedagem em produção | `*.manus.space` |
| **Banco de Dados** | MySQL/TiDB gerenciado | Via `DATABASE_URL` |
| **Armazenamento S3** | Upload de arquivos | Via `BUILT_IN_FORGE_API_URL` |
| **LLM API** | Integração com modelos de IA | Via `BUILT_IN_FORGE_API_URL` |
| **OAuth** | Autenticação Manus | Via `OAUTH_SERVER_URL` |

### 6.2 APIs Externas Integradas

| API | Provedor | Função | URL Base |
|-----|----------|--------|----------|
| **PTAX** | Banco Central do Brasil | Cotação oficial do dólar | `olinda.bcb.gov.br/olinda/servico/PTAX` |
| **AwesomeAPI** | Economia | Cotações de moedas (fallback) | `economia.awesomeapi.com.br` |
| **Siscomex** | Portal Único | Download de NCMs | `portalunico.siscomex.gov.br` |
| **OpenAI** | OpenAI | IA dedicada (opcional) | `api.openai.com/v1` |

### 6.3 Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `DATABASE_URL` | String de conexão MySQL | Sim |
| `JWT_SECRET` | Chave para assinatura de tokens | Sim |
| `VITE_APP_ID` | ID da aplicação Manus | Sim |
| `OAUTH_SERVER_URL` | URL do servidor OAuth | Sim |
| `OWNER_OPEN_ID` | ID do proprietário | Sim |
| `BUILT_IN_FORGE_API_URL` | URL da API Manus Forge | Sim |
| `BUILT_IN_FORGE_API_KEY` | Chave da API Manus Forge | Sim |
| `VITE_FRONTEND_FORGE_API_KEY` | Chave frontend Forge | Sim |
| `VITE_FRONTEND_FORGE_API_URL` | URL frontend Forge | Sim |

---

## 7. Serviços de Backend

O backend é organizado em **26 serviços especializados** que encapsulam a lógica de negócio.

### 7.1 Serviços Core

| Serviço | Arquivo | Responsabilidade |
|---------|---------|------------------|
| **authService** | `authService.ts` | Autenticação email/senha, JWT, recuperação de senha |
| **importCalculationService** | `importCalculationService.ts` | Cálculo completo de importação |
| **taxCalculationService** | `taxCalculationService.ts` | Cálculo de impostos (II, IPI, PIS, COFINS, ICMS) |
| **exchangeService** | `exchangeService.ts` | Obtenção de taxas de câmbio (BCB/AwesomeAPI) |

### 7.2 Serviços de IA

| Serviço | Arquivo | Responsabilidade |
|---------|---------|------------------|
| **sofiaAgentService** | `sofiaAgentService.ts` | Assistente virtual SOFIA |
| **langGraphAgentService** | `langGraphAgentService.ts` | Agentes LangGraph multi-propósito |
| **aiAnalysisService** | `aiAnalysisService.ts` | Análise de viabilidade com IA |
| **predictiveAnalysisService** | `predictiveAnalysisService.ts` | Análises preditivas de mercado |
| **openaiService** | `openaiService.ts` | Integração direta com OpenAI |

### 7.3 Serviços de Dados

| Serviço | Arquivo | Responsabilidade |
|---------|---------|------------------|
| **ncmService** | `ncmService.ts` | Busca e sugestão de NCMs |
| **marketDataService** | `marketDataService.ts` | Indicadores de mercado |
| **commodityService** | `commodityService.ts` | Preços de commodities |
| **taxTableUpdateService** | `taxTableUpdateService.ts` | Atualização de tabelas tributárias |

### 7.4 Serviços de Relatórios

| Serviço | Arquivo | Responsabilidade |
|---------|---------|------------------|
| **excelReportService** | `excelReportService.ts` | Geração de planilhas Excel |
| **pdfReportService** | `pdfReportService.ts` | Geração de relatórios PDF |
| **quotationExtractorService** | `quotationExtractorService.ts` | Extração de dados de PDFs |

### 7.5 Serviços Auxiliares

| Serviço | Arquivo | Responsabilidade |
|---------|---------|------------------|
| **agentService** | `agentService.ts` | Gestão de alertas e ações do agente |
| **autoSupplierService** | `autoSupplierService.ts` | Criação automática de fornecedores |
| **drawbackService** | `drawbackService.ts` | Cálculo de drawback |
| **priceComparisonService** | `priceComparisonService.ts` | Comparação de preços |
| **quotationNotificationService** | `quotationNotificationService.ts` | Notificações de cotações |
| **statePricingService** | `statePricingService.ts` | Precificação por estado |
| **taxNotificationService** | `taxNotificationService.ts` | Notificações tributárias |

---

## 8. API tRPC - Endpoints

A API utiliza **tRPC** para comunicação tipada entre frontend e backend. Os endpoints são organizados em **routers** por domínio.

### 8.1 Routers Públicos

| Router | Endpoint | Método | Descrição |
|--------|----------|--------|-----------|
| `auth` | `me` | Query | Retorna usuário autenticado |
| | `register` | Mutation | Registro de novo usuário |
| | `login` | Mutation | Login com email/senha |
| | `logout` | Mutation | Encerra sessão |
| | `requestPasswordReset` | Mutation | Solicita reset de senha |
| | `resetPassword` | Mutation | Redefine senha com token |
| `exchange` | `getRate` | Query | Obtém taxa de câmbio |
| | `getSupportedCurrencies` | Query | Lista moedas suportadas |
| `ncm` | `get` | Query | Busca NCM por código |
| | `list` | Query | Lista todos NCMs |
| | `search` | Query | Pesquisa NCMs |
| | `suggestWithAI` | Query | Sugestão de NCM com IA |
| `icms` | `get` | Query | Obtém ICMS por estado |
| | `list` | Query | Lista todos estados |
| `ports` | `getStates` | Query | Lista estados com portos |
| | `getPortsByState` | Query | Portos por estado |
| | `getPortCosts` | Query | Custos portuários |

### 8.2 Routers Protegidos (Requerem Autenticação)

| Router | Endpoints Principais | Descrição |
|--------|---------------------|-----------|
| `suppliers` | `list`, `get`, `create`, `update`, `delete`, `autoCreate` | CRUD de fornecedores |
| `products` | `list`, `get`, `create`, `update`, `delete` | CRUD de produtos |
| `calculations` | `list`, `get`, `calculate`, `analyze`, `delete`, `generateReport` | Cálculos de importação |
| `quotations` | `list`, `get`, `create`, `update`, `delete`, `generateExcelReport` | Gestão de cotações |
| `settings` | `get`, `update` | Configurações da empresa |
| `agent` | `getAlerts`, `chat`, `generateRecommendations` | Agente IA |
| `sofia` | `chat`, `analyzeViability`, `getChatHistory` | Assistente SOFIA |
| `drawback` | `checkEligibility`, `calculateSavings`, `create` | Drawback |
| `marketData` | `getIndicators`, `refresh`, `generateInsights` | Dados de mercado |
| `priceComparison` | `getBestPrice`, `compareProduct` | Comparação de preços |

---

## 9. Páginas do Frontend

O frontend contém **18 páginas** organizadas por funcionalidade.

| Página | Arquivo | Rota | Descrição |
|--------|---------|------|-----------|
| **Autenticação** | | | |
| Login | `Login.tsx` | `/login` | Tela de login |
| Register | `Register.tsx` | `/register` | Cadastro de usuário |
| ForgotPassword | `ForgotPassword.tsx` | `/forgot-password` | Recuperação de senha |
| **Principal** | | | |
| Home | `Home.tsx` | `/` | Página inicial (redirect) |
| Dashboard | `Dashboard.tsx` | `/dashboard` | Painel principal |
| **Cálculos** | | | |
| Calculate | `Calculate.tsx` | `/calculate` | Novo cálculo simples |
| CalculateMultiple | `CalculateMultiple.tsx` | `/calculate-multiple` | Novo cálculo múltiplo |
| Calculations | `Calculations.tsx` | `/calculations` | Lista de cálculos |
| **Cotações** | | | |
| Quotations | `Quotations.tsx` | `/quotations` | Lista de cotações |
| QuotationDetail | `QuotationDetail.tsx` | `/quotations/:id` | Detalhes da cotação |
| **Cadastros** | | | |
| Suppliers | `Suppliers.tsx` | `/suppliers` | Gestão de fornecedores |
| Products | `Products.tsx` | `/products` | Gestão de produtos |
| **IA** | | | |
| Sofia | `Sofia.tsx` | `/sofia` | Chat com SOFIA |
| SofiaMarket | `SofiaMarket.tsx` | `/sofia/market` | Análise de mercado |
| Assistant | `Assistant.tsx` | `/assistant` | Assistente IA legado |
| **Sistema** | | | |
| Settings | `Settings.tsx` | `/settings` | Configurações |
| NotFound | `NotFound.tsx` | `*` | Página 404 |
| ComponentShowcase | `ComponentShowcase.tsx` | `/components` | Showcase de componentes |

---

## 10. Fluxos de Dados Principais

### 10.1 Fluxo de Cálculo de Importação

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Upload PDF    │────▶│ quotationExtractor│────▶│  Produtos       │
│   Cotação       │     │   Service        │     │  Extraídos      │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Relatório     │◀────│ importCalculation│◀────│  NCM + ICMS     │
│   Excel/PDF     │     │   Service        │     │  Lookup         │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │ taxCalculation   │◀────│  Exchange       │
                        │   Service        │     │  Service (BCB)  │
                        └──────────────────┘     └─────────────────┘
```

### 10.2 Fluxo de Autenticação

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Login Form    │────▶│   authService    │────▶│   MySQL         │
│   (email/senha) │     │   (bcrypt)       │     │   users table   │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │◀────│   JWT Token      │◀────│   Jose          │
│   (localStorage)│     │   (30 dias)      │     │   (HS256)       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### 10.3 Fluxo de Chat com SOFIA

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Mensagem      │────▶│ sofiaAgentService│────▶│  LLM API        │
│   Usuário       │     │                  │     │  (Manus Forge)  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Resposta      │◀────│  Contexto        │◀────│  Learning       │
│   Renderizada   │     │  Enriquecido     │     │  Context DB     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## 11. Segurança e Controle de Acesso

### 11.1 Autenticação

O sistema suporta dois métodos de autenticação:

| Método | Descrição | Implementação |
|--------|-----------|---------------|
| **Email/Senha** | Autenticação local | bcrypt (12 rounds) + JWT |
| **OAuth Manus** | Single Sign-On | OAuth 2.0 via Manus Platform |

### 11.2 Autorização

| Nível | Descrição | Verificação |
|-------|-----------|-------------|
| **Público** | Endpoints sem autenticação | `publicProcedure` |
| **Autenticado** | Requer login válido | `protectedProcedure` |
| **Admin** | Requer role "admin" | `ctx.user.role === 'admin'` |

### 11.3 Tokens e Sessões

| Item | Configuração |
|------|--------------|
| **Algoritmo JWT** | HS256 |
| **Expiração** | 30 dias |
| **Cookie Name** | `suppley_session` |
| **Fallback** | localStorage + Authorization header |
| **Hash de Senha** | bcrypt com 12 salt rounds |

### 11.4 Proteções Implementadas

O sistema implementa as seguintes proteções de segurança:

- **CSRF Protection**: Cookies com SameSite=Lax
- **XSS Prevention**: Sanitização de inputs via Zod
- **SQL Injection**: Queries parametrizadas via Drizzle ORM
- **Rate Limiting**: Timeout em requisições externas
- **Secrets Management**: Variáveis de ambiente (não commitadas)

---

## 12. Testes Automatizados

O projeto inclui **71 testes unitários** distribuídos em 7 arquivos de teste.

| Arquivo de Teste | Testes | Cobertura |
|------------------|--------|-----------|
| `auth.logout.test.ts` | 1 | Logout de sessão |
| `importCalculation.test.ts` | 16 | Cálculos de importação |
| `quotationExtractor.test.ts` | 4 | Extração de PDFs |
| `quotationNotification.test.ts` | 8 | Notificações |
| `quotations.test.ts` | 25 | CRUD de cotações |
| `taxRegime.test.ts` | 11 | Regimes tributários |
| `taxCalculation.test.ts` | 6 | Cálculos de impostos |
| **Total** | **71** | |

Para executar os testes:

```bash
pnpm test
```

---

## 13. Documentação Técnica Existente

O projeto mantém documentação técnica no diretório `/docs`:

| Documento | Descrição |
|-----------|-----------|
| `ANALISE_PLANILHA_CONTADOR.md` | Análise da planilha de referência do contador |
| `analise_regimes_tributarios.md` | Detalhamento dos regimes tributários |
| `formulas_implementadas.md` | Fórmulas de cálculo implementadas |
| `logica_calculo_completa.md` | Lógica completa de cálculo de importação |
| `estrutura_planilha_excel.md` | Estrutura do relatório Excel |
| `identidade_visual_suppley.md` | Guia de identidade visual |
| `TRADING_4.0_VISION.md` | Visão do produto Trading 4.0 |
| `agente_ia_persona.md` | Persona do agente IA SOFIA |

---

## 14. Comandos de Desenvolvimento

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Inicia servidor de desenvolvimento |
| `pnpm build` | Build para produção |
| `pnpm start` | Inicia servidor de produção |
| `pnpm test` | Executa testes unitários |
| `pnpm check` | Verifica tipos TypeScript |
| `pnpm db:push` | Aplica migrações no banco |
| `pnpm format` | Formata código com Prettier |

---

## 15. Considerações de Manutenção

### 15.1 Pontos de Atenção

O sistema possui alguns pontos que requerem atenção especial durante a manutenção:

1. **Tabelas Tributárias**: As alíquotas de II, IPI, PIS, COFINS e ICMS devem ser atualizadas periodicamente conforme legislação vigente.

2. **API do BCB**: A API PTAX pode apresentar indisponibilidade em feriados e finais de semana. O sistema possui fallback para AwesomeAPI.

3. **Tokens de Sessão**: O JWT expira em 30 dias. Usuários inativos por mais de 30 dias precisarão fazer login novamente.

4. **Armazenamento S3**: Arquivos de cotação são armazenados no S3 da plataforma Manus. Verificar políticas de retenção.

### 15.2 Monitoramento Recomendado

| Métrica | Frequência | Ação |
|---------|------------|------|
| Taxa de câmbio | Diária | Verificar se BCB está respondendo |
| Erros de autenticação | Contínua | Alertar em picos |
| Uso de LLM | Semanal | Monitorar consumo de créditos |
| Tamanho do banco | Mensal | Avaliar necessidade de limpeza |

---

## 16. Referências

[1] Drizzle ORM Documentation - https://orm.drizzle.team/docs/overview  
[2] tRPC Documentation - https://trpc.io/docs  
[3] Banco Central do Brasil - API PTAX - https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/documentacao  
[4] Portal Único Siscomex - https://portalunico.siscomex.gov.br  
[5] Resolução do Senado nº 13/2012 (ICMS 4%) - https://portal.fazenda.rj.gov.br/icms/resolucao-senado-13-2012-perguntas-frequentes/  
[6] LangGraph Documentation - https://langchain-ai.github.io/langgraph/  

---

*Documento gerado automaticamente em 15 de Dezembro de 2024.*
