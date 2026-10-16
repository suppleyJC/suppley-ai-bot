# SUPPLEY AI Bot — Roteiro Estratégico

**Visão do Projeto:** IA Orquestradora — Comércio Autônomo, Inteligente e Escalável  
**Data Atual:** 23 de junho de 2026  
**Status:** Funcional e Estável (Excambia principal operacional pós-migração Manus)

---

## Parte 1: Status de Implementação Atual

### 1.1 Arquitetura Backend

#### Sistemas Principais
| Componente | Status | Propósito |
|-----------|--------|----------|
| **Express Server** | ✅ Ativo | Fundação HTTP/REST na porta 3000 |
| **Roteador tRPC** | ✅ Integrado | Camada RPC type-safe com 28 roteadores |
| **MySQL 8.0** | ✅ Rodando | Armazenamento de dados primário (docker-compose) |
| **Integração Claude API** | ✅ Live | Integração Anthropic via llm.ts (Opus 4.8) |
| **Autenticação** | ✅ Completa | JWT + OAuth (Apple, Google, Manus legado) |
| **Carregamento Dotenv** | ✅ Corrigido | Getters lazy evitam condições de corrida |

#### Roteadores de API (28 Disponíveis)
```
Principais:
  - auth (login, registrar, renovar token, resetar senha)
  - system (saúde, informações)

Roteadores Específicos do Domínio:
  - excambia (IA orquestradora: agentChat, chat, analyzeDocument, analyzeViability)
  - ncm (classificação NCM: classify, search, cache)
  - calculations (motor de cálculo de custo de importação)
  - quotations (gerenciamento de cotações de fornecedores)
  - rfq (fluxo de trabalho Request for Quote)
  - products (gerenciamento de catálogo de produtos)
  
Dados de Referência:
  - industries (mapeamento CNAE)
  - suppliers (gerenciamento de fornecedores)
  - ports (dados de referência de portos)
  - commodities (precificação de commodities)
  - exchangeRates (USD/BRL e outros)
  - taxTables (ICMS, IPI, etc.)
  - taxNotifications (mudanças na legislação tributária)
  - statePricing (referência de preços por estado)
  
Recursos Avançados:
  - agent (integração LangGraph, experimental)
  - agentRouter (definições de ferramentas para Claude)
  - drawback (esquemas de incentivo à exportação)
  - reform (cálculos de reforma fiscal)
  - priceComparison (comparação nacional vs importado)
  - marketData (integração COMEX.STAT)
  - messaging (notificações multicanal)
  - conversas (conversas persistentes de chat)
  - operacoes (rastreamento de operações)
  - estimativa (cálculos estimativos)
  - market (inteligência de mercado)
  - fase5 (pipeline de ingestão de documentos)
```

#### Integração LLM (server/_core/llm.ts)
- **Modelo:** Claude Opus 4.8 (codificado)
- **Recursos:**
  - ✅ Chamada de ferramentas (conversão de schema de função)
  - ✅ Suporte a json_schema (forçar ferramenta sintética)
  - ✅ Conversa multi-mensagem
  - ✅ Prompts de sistema
  - ✅ Análise de imagem/documento via URLs
  - ✅ Suporte a conteúdo de arquivo (PDF, MP3, MP4)
- **Correções Recentes:**
  - Corrigido remoção de cercas de markdown em respostas JSON
  - Implementado json_schema → conversão de ferramenta forçada
  - Carregamento lazy de variáveis de ambiente

#### Padrão Orquestradora (server/agent/orchestrator.ts)
- **Função Principal:** `runExcambia()`
- **Loop:** Máximo 6 turnos com Claude
- **Filtro por Estágio:** Disponibilidade de ferramentas por estágio de operação (demand/source/analyze/execute/finance)
- **Padrão:** Claude → Execução de ferramenta → Feedback de resultado → Próximo turno
- **Ferramentas Disponíveis Atualmente:** ~40 operações internas

### 1.2 Esquema de Banco de Dados (MySQL)

#### Tabelas Principais (schema.ts)
```sql
users                   — Contas de usuário, métodos de autenticação, roles
suppliers              — Fornecedores estrangeiros, rating, tempos de entrega
products               — Catálogo de produtos, códigos NCM, variantes
ncm_tax_rates          — Alíquotas de imposto por NCM (ICMS, IPI, PIS/COFINS)
icms_tax_rules         — Regras ICMS por estado
quotations             — Histórico de cotações de fornecedores
quotation_items        — Itens de linha em cotações
```

#### Tabelas Estendidas (rfqSchema.ts, schema.conversas.ts)
```sql
rfq_requests           — Fluxo de trabalho Request for Quote
rfq_responses          — Respostas de fornecedores a RFQs
conversas              — Conversas persistentes de chat
conversas_messages     — Mensagens individuais em conversas
operacoes              — Rastreamento de operações (estágios demand/source/finance)
```

#### Tabelas de Suporte
```sql
tax_notifications      — Rastreador de atualização de lei tributária
exchange_rates         — Taxas de câmbio (atualizadas via dados de mercado)
state_pricing          — Referências de preço por estado
commodity_prices       — Preços de commodities no mercado
tax_tables             — Tabelas de alíquotas ICMS, IPI, CONFIS
ports_reference        — Dados de portos (CNPJ, localização, facilidades)
drawback_schemes       — Esquemas de incentivo à exportação (SUDENE, SUDAM, etc.)
industries             — Mapeamento de códigos CNAE
```

### 1.3 Arquitetura Frontend

#### Estrutura de Páginas (33 páginas)
**Autenticação:**
- Login.tsx, Register.tsx, ForgotPassword.tsx

**Operações Principais:**
- Dashboard.tsx — Hub principal do usuário
- Excambia.tsx — Interface da orquestradora IA (principal)
- ExcambiaChat.tsx — Componente de chat (novo, substituindo mensagens antigas)
- ExcambiaMarket.tsx — Visualização de inteligência de mercado

**Gerenciamento de Transações:**
- Calculations.tsx, Calculate.tsx, CalculateMultiple.tsx — Estimativa de custos
- Quotations.tsx, QuotationDetail.tsx — Cotações de fornecedores
- RfqDashboard.tsx, RfqCreate.tsx, RfqDetail.tsx — Fluxo RFQ
- Operacoes.tsx, OperacaoDetail.tsx — Rastreamento de operações

**Dados de Referência:**
- Industries.tsx, IndustryDetail.tsx — Referência CNAE
- Suppliers.tsx — Gerenciamento de fornecedores
- Products.tsx — Catálogo de produtos
- Marketplace.tsx — Marketplace de produtos

**Análise e Inteligência:**
- Sofia.tsx, SofiaMarket.tsx — Análise de mercado (legado)
- ReformDashboard.tsx — Análise de reforma fiscal
- Diagnostics.tsx — Diagnósticos do sistema
- Settings.tsx — Configurações de usuário
- Messaging.tsx — Notificações multicanal

**Utilidade:**
- Home.tsx — Página de destino
- ComponentShowcase.tsx — Galeria de componentes UI
- NotFound.tsx — Tratamento 404
- Assistant.tsx — Página do assistente genérico

#### Biblioteca de Componentes
- Localizada em: `client/src/components/ui/`
- Construída com: React 19 + TypeScript
- Estilo: Tailwind CSS
- Integração cliente tRPC type-safe

### 1.4 Serviços Principais (45+ implementados)

#### Serviços de IA e Análise
- `excambiaAgentService.ts` — Orquestradora principal de análise IA
- `agentService.ts` — Tooling e agendamento de agentes
- `sofiaAgentService.ts` — Agente de mercado legado (pré-Excambia)
- `langGraphAgentService.ts` — Orquestração LangGraph (experimental)
- `aiAnalysisService.ts` — Análise IA genérica

#### Serviços de Domínio
- `ncmService.ts` — Classificação NCM (claude + schema estruturado)
- `taxCalculationService.ts` — Cálculo ICMS, IPI, PIS/COFINS
- `importCalculationService.ts` — Motor completo de custo de importação
- `importCostEngine.ts` — Implementação Motor v1 (arquivado)
- `priceComparisonService.ts` — Comparação de custo nacional vs importado
- `quotationExtractorService.ts` — Parse de cotações de fornecedores

#### Dados e Integrações
- `marketDataService.ts` — Integração COMEX.STAT
- `exchangeService.ts` — Gerenciamento de taxa de câmbio
- `commodityService.ts` — Precificação de commodities
- `statePricingService.ts` — Referências de preço por estado
- `tradeData/` — Integrações multi-fornecedor
  - `comexStatProvider.ts` — Dados oficiais COMEX
  - `importGeniusProvider.ts` — Inteligência comercial (API paga)
  - `panjivaProvider.ts` — Dados de cadeia de suprimentos (API paga)

#### Gerenciamento de Transações
- `rfqService.ts` — Orquestração de fluxo RFQ
- `quotationNotificationService.ts` — Alertas de cotação
- `operacaoService.ts` — Rastreamento de operações

#### Financeiro e Conformidade
- `drawbackService.ts` — Cálculos de incentivos à exportação
- `taxReformService.ts` — Impactos de reforma fiscal
- `taxTableUpdateService.ts` — Gerenciamento de tabelas tributárias
- `taxNotificationService.ts` — Alterações regulatórias

#### Integração e Relatórios
- `emailService.ts` — Notificações por email
- `whatsappService.ts` — Integração WhatsApp (tentativa)
- `excelReportService.ts` — Exportação para Excel
- `pdfReportService.ts` — Geração de PDF
- `integrationStatusService.ts` — Monitoramento de saúde de integrações

#### Utilitários
- `authService.ts` — Autenticação e gerenciamento de usuários
- `predictiveAnalysisService.ts` — Previsão de demanda/oferta
- `predictionTrackingService.ts` — Rastreamento de precisão de previsões
- `autoSupplierService.ts` — Sugestões automáticas de fornecedores

---

## Parte 2: Análise de Lacunas — Atual vs. Visão

### Declaração de Visão (Escopo Utópico do Usuário)
```
IA Orquestradora = Inteligência Comercial Autônoma, Inteligente e Escalável
```

**Pilares Principais:**
1. ✅ Agentes Segmentados
2. ✅ Código Modular
3. ✅ Containers (implantação Docker)
4. ⚠️ APIs (Parcial: tRPC presente, lacunas REST)
5. ⚠️ Workflows Auditáveis (logging básico, não abrangente)
6. ⚠️ Base Histórica (schema presente, trilha de auditoria ausente)
7. ✅ Cálculos Determinísticos (impostos, custos de importação determinísticos)
8. ⚠️ Análise Preditiva (serviços existem mas subutilizados)
9. ⚠️ Rastreabilidade (rastreamento de operação limitado)
10. ⚠️ Aprovação Humana (não implementado no fluxo)
11. ⚠️ Aprendizado Contínuo (sem loop de feedback ou fine-tuning)
12. ❌ Performance e Velocidade (Problema conhecido: respostas lentas, sem streaming)

### Implementado ✅
- **Padrão Orquestradora:** Função `runExcambia()` principal com loop multi-turno
- **Especialização Baseada em Ferramentas:** 40+ operações internas expostas ao Claude
- **Filtro por Estágio:** Ferramentas disponíveis por estágio do fluxo
- **Cálculos Determinísticos:** Cálculos de imposto, tarifa, logística
- **Integração Multicanal:** Email, WhatsApp tentativa, notificações
- **Dados de Mercado:** COMEX.STAT, taxas de câmbio, precificação de commodities
- **Esquema de Banco de Dados:** Abrangente, suporta todas as entidades principais
- **Autenticação:** Múltiplos métodos (email, OAuth, JWT)
- **Containerização:** Docker Compose para prod/dev

### Parcialmente Implementado ⚠️
- **Trilhas de Auditoria:** Tabela `conversas` registra mas falta auditoria abrangente
- **Aprovação de Fluxo:** Sem checkpoints de aprovação humana
- **Análise Preditiva:** Serviços existem mas não integrados ao orquestradora
- **API REST:** Limitada; principalmente tRPC (apenas interno)
- **Ingestão de Documentos:** Estrutura Fase 5 existe mas não totalmente operacional
- **Especialização Multi-Agente:** Tudo via Claude; sem agentes especializados separados
- **Respostas com Streaming:** Nenhuma; apenas respostas completas

### Não Implementado ❌
- **Aprendizado Contínuo:** Sem mecanismo de feedback, pipeline de fine-tuning ou retreinamento
- **Otimização de Performance:** Sem cache de resposta, streaming, lógica de seleção de modelo
- **Painel de Rastreabilidade:** Sem UI de auditoria, visualização de histórico de operações
- **Fluxos de Aprovação Humana:** Sem checkpoints de aprovação baseados em role
- **Notificações em Tempo Real:** Apenas email; WebSocket/Server-Sent Events ausentes
- **Painel de Análise:** Insights operacionais limitados
- **Estratégia de API Externa:** Sem API pública REST/GraphQL (tRPC é apenas interno)

---

## Parte 3: Roteiro de Evolução

### Fase 0: Fundação (AGORA — Próximas 2 semanas)
**Prioridade:** Estabilizar sistema atual, corrigir problemas conhecidos

**Tarefas:**
- [x] Corrigir carregamento de ANTHROPIC_API_KEY (getters lazy em env.ts)
- [x] Corrigir passagem de variável de ambiente Docker
- [x] Corrigir parse JSON do NCM (remoção de cercas markdown)
- [x] Implementar suporte json_schema em llm.ts
- [ ] Perfilagem de performance (identificar caminhos lentos)
- [ ] Adicionar cache básico de resposta para operações determinísticas
- [ ] Criar documentação abrangente docs/API.md

**Entregável:** Excambia estável e documentada na velocidade atual

---

### Fase 1: Performance e Experiência do Usuário (Semanas 3–6)
**Prioridade:** Abordar problema conhecido: "Responsividade péssima"

**Objetivo:** Melhoria de velocidade percebida de 3x

#### 1.1 Respostas com Streaming
```typescript
// Atual (bloqueante):
const reply = await runExcambia(...)  // Aguardar resposta completa

// Alvo (streaming):
const stream = runExcambia(...) // Retorna resultados parciais
for await (const chunk of stream) {
  UI.appendChunk(chunk)  // Exibir incrementalmente
}
```

**Tarefas:**
- [ ] Implementar streaming em `runExcambia()` → yield em cada conclusão de ferramenta
- [ ] Adicionar streaming a ExcambiaChat.tsx (SSE ou WebSocket)
- [ ] Fallback para resposta completa para clientes sem streaming
- [ ] Testar com condições de rede fraca

**Impacto:** Latência percebida cai 60%

#### 1.2 Estratégia de Seleção de Modelo
```typescript
// Atual: Todas tarefas via Opus 4.8
// Alvo: Rotear por complexidade
const selectModel = (task: TaskType): ModelId => {
  switch(task) {
    case "ncm_classification":    return "haiku"      // $0.80/M input
    case "simple_calculation":    return "haiku"      // latência 5ms
    case "complex_analysis":      return "sonnet"     // $3/M input
    case "strategic_planning":    return "opus"       // $15/M input
  }
}

// Economias: redução de 95% de custo para operações simples
```

**Tarefas:**
- [ ] Classificar operações por complexidade (determinística, IA simples, raciocínio complexo)
- [ ] Implementar lógica de roteamento de modelo em llm.ts
- [ ] Testar Haiku para NCM, Sonnet para análise, Opus para estratégia
- [ ] Monitorar precisão e latência por modelo

**Impacto:** Redução de 85% de custo, 70% mais rápido para tarefas simples

#### 1.3 Cache de Resposta
```typescript
// Cache operações determinísticas
const cache = new Map<string, CacheEntry>()

async function ncmClassify(productName: string) {
  const key = `ncm:${productName.toLowerCase()}`
  if (cache.has(key)) return cache.get(key)
  
  const result = await claudeNCM(productName)
  cache.set(key, result, { ttl: 30 * 24 * 60 * 60 }) // 30 dias
  return result
}
```

**Tarefas:**
- [ ] Identificar operações cacheáveis (NCM, alíquotas de imposto, taxas de câmbio)
- [ ] Implementar camada de cache (Redis para prod, Map para dev)
- [ ] Definir TTLs por tipo de operação
- [ ] Monitorar taxa de acerto do cache

**Impacto:** 90% taxa de acerto para produtos comuns, recuperação <10ms

#### 1.4 Responsividade UI
- [ ] Corrigir layouts móvel (overflow do ExcambiaChat)
- [ ] Virtualizar históricos de chat longos
- [ ] Otimizar renderização de mensagens de chat
- [ ] Adicionar placeholders de carregamento

---

### Fase 2: Inteligência de Fluxo de Trabalho e Auditoria (Semanas 7–10)
**Prioridade:** Implementar "workflows auditáveis" e "rastreabilidade"

#### 2.1 Trilha de Auditoria Abrangente
```typescript
// Auditar cada operação
interface AuditLog {
  id: string
  userId: number
  operacaoId?: number
  action: string  // "ncm_classification", "cost_calculation", etc
  stage: string   // "demand", "source", "analyze", "execute", "finance"
  input: Record<string, unknown>
  output: Record<string, unknown>
  toolsCalled: string[]
  duration: number
  status: "success" | "error"
  error?: string
  approvalStatus?: "pending" | "approved" | "rejected"
  approvedBy?: number
  approvedAt?: Date
  createdAt: Date
}

// Novas tabelas de schema:
// audit_logs, audit_approvals
```

**Tarefas:**
- [ ] Criar tabelas audit_logs, audit_approvals
- [ ] Instrumentar runExcambia() para registrar cada operação
- [ ] Criar UI de auditoria (timeline, detalhes de operação, histórico de aprovação)
- [ ] Implementar checkpoints de aprovação (human-in-the-loop)
- [ ] Adicionar exportação de auditoria (CSV, PDF)

**Impacto:** Transparência operacional completa, pronto para conformidade regulatória

#### 2.2 Fluxo de Trabalho com Aprovação Humana
```typescript
// Antes de executar, exigir aprovação para:
// - Pedidos grandes (> $100k)
// - Fornecedores de alto risco (rating < C)
// - Mudanças em precificação principal
// - Mudanças em estratégia tributária

async function executeWithApproval(operation: Operation) {
  if (needsApproval(operation)) {
    const approval = await requestApproval(operation)
    if (!approval) throw new Error("Approval denied")
  }
  return execute(operation)
}
```

**Tarefas:**
- [ ] Definir gatilhos de aprovação (tamanho do pedido, risco do fornecedor, impactos tributários)
- [ ] Criar UI de solicitação de aprovação (visualização admin/gerente)
- [ ] Implementar fluxo de aprovação (aceitar/rejeitar com comentários)
- [ ] Rotear notificações para aprovadores
- [ ] Rastrear SLAs de aprovação

---

### Fase 3: Gerenciamento de Conhecimento e Aprendizado (Semanas 11–14)
**Prioridade:** Implementar "base histórica", "aprendizado contínuo", "análise preditiva integrada"

#### 3.1 Grafo de Conhecimento
```typescript
// Armazenar e conectar:
// - Fornecedores (rating, confiabilidade, tendências de preço)
// - Produtos (histórico NCM, opções de fornecedor, histórico de preço)
// - Cenários (operações passadas, resultados, padrões)
// - Regulações (mudanças em lei tributária, acordos comerciais)

interface KnowledgeEntity {
  type: "supplier" | "product" | "scenario" | "regulation"
  id: string
  data: Record<string, unknown>
  relationships: Array<{ entity: string, type: string }>
  createdAt: Date
  updatedAt: Date
  confidence: number  // 0-100
}
```

**Tarefas:**
- [ ] Projetar schema do grafo de conhecimento
- [ ] Implementar extração de entidade (Claude → entidades de operações)
- [ ] Criar linker de relações
- [ ] Construir UI de conhecimento (visualização de grafo, explorador de entidade)
- [ ] Integrar ao contexto do orquestradora (alimentar ao Claude)

#### 3.2 Loop de Aprendizado Contínuo
```typescript
// Após cada operação, coletar feedback
async function learnFromOperation(operation: Operation, feedback: {
  outcome: "success" | "partial" | "failed"
  actualCost?: number
  actualDuration?: number
  supplierPerformance?: "excellent" | "good" | "poor"
  suggestions?: string
}) {
  // Armazenar como exemplo de treino
  await storeTrainingExample({
    input: operation.input,
    output: operation.output,
    outcome: feedback.outcome,
    context: operation.context,
  })
  
  // Atualizar ratings de fornecedor/produto
  if (feedback.supplierPerformance) {
    await updateSupplierRating(operation.supplierId, feedback.supplierPerformance)
  }
  
  // Retreinar contexto Claude (via atualizações de prompt de sistema)
  // Exemplo: "Fornecedor #42 (ABC Trading) tem confiabilidade fraca"
}
```

**Tarefas:**
- [ ] Criar tabela training_examples
- [ ] Adicionar UI de rastreamento de resultado de operação
- [ ] Implementar atualizações de rating de fornecedor/produto
- [ ] Construir painel de aprendizado (tendências de precisão, melhoria)
- [ ] Preparar dados para pipeline de fine-tuning (batch→Claude API)

#### 3.3 Integração de Análise Preditiva
```typescript
// Integrar serviços preditivos ao orquestradora

// Previsão de demanda
const forecast = await predictiveDemand({
  productId: 123,
  months: 12
})  // Retorna: [unidades, confiança] por mês

// Previsão de confiabilidade de fornecedor
const supplierRisk = await predictSupplierReliability({
  supplierId: 42,
  orderSize: 10000
})  // Retorna: on-time-probability, quality-score

// Previsão de tendência de preço
const priceForecast = await predictPriceTrend({
  ncmCode: "7317.00.90",
  months: 6
})  // Retorna: [priceUSD, confiança] por mês

// → Usar em runExcambia() para melhores recomendações
```

**Tarefas:**
- [ ] Integrar predictiveAnalysisService ao orquestradora
- [ ] Treinar modelos de série temporal (demanda de produto, preços)
- [ ] Criar painel de precisão de previsão
- [ ] Alimentar previsões no contexto Claude

---

### Fase 4: Verdadeira Arquitetura Multi-Agente (Semanas 15–18)
**Prioridade:** Evoluir de baseado em ferramenta para especialização de agente segmentado

**Atual:** Claude Opus único com 40+ ferramentas

**Alvo:** Agentes especializados coordenados por orquestradora

```typescript
// Papéis de Agente Especializado:

interface Agent {
  id: string
  role: "demand" | "sourcing" | "analyzer" | "executor" | "finance"
  model: ModelID
  tools: ToolSchema[]
  systemPrompt: string
  maxTokens: number
}

const agents: Agent[] = [
  {
    id: "demand-agent",
    role: "demand",
    model: "haiku",  // Rápido, determinístico
    systemPrompt: "Você é analista de demanda. Extraia specs de produto, quantidades, prazos.",
    tools: [extractProductSpecs, validateNCM, queryInventory],
  },
  {
    id: "sourcing-agent",
    role: "sourcing",
    model: "sonnet",  // Balanceado
    systemPrompt: "Você é especialista em sourcing. Encontre fornecedores, compare cotações, avalie risco.",
    tools: [searchSuppliers, getQuotes, assessSupplierRisk, checkAvailability],
  },
  {
    id: "analyzer-agent",
    role: "analyzer",
    model: "opus",  // Estratégico
    systemPrompt: "Você é analista financeiro. Calcule custos, impostos, margens, ROI.",
    tools: [calculateImportCost, calculateTaxes, analyzeMargin, predictPriceChange],
  },
  {
    id: "executor-agent",
    role: "executor",
    model: "sonnet",  // Operações confiáveis
    systemPrompt: "Você é especialista em operações. Execute pedidos, arranje logística, gere docs.",
    tools: [createRFQ, negotiateTerms, arrangeLogistics, generateDocuments],
  },
  {
    id: "finance-agent",
    role: "finance",
    model: "sonnet",  // Conformidade focada
    systemPrompt: "Você é oficial de conformidade. Garanta conformidade tributária, trilha de auditoria, aprovações.",
    tools: [validateTaxCompliance, createAuditLog, triggerApproval],
  },
]

// Orquestradora coordena entre agentes
async function runExcambiaV2(input: UserRequest) {
  let state = { demand: null, suppliers: [], analysis: null, execution: null }
  
  // Estágio 1: Demanda → Extrair specs de produto
  state.demand = await agents.demand.execute({
    input: input.message,
    context: state,
  })
  
  // Estágio 2: Sourcing → Encontrar fornecedores
  state.suppliers = await agents.sourcing.execute({
    input: state.demand,
    context: state,
  })
  
  // Estágio 3: Análise → Calcular custos
  state.analysis = await agents.analyzer.execute({
    input: { demand: state.demand, suppliers: state.suppliers },
    context: state,
  })
  
  // Estágio 4: Execução → Planejar operações
  state.execution = await agents.executor.execute({
    input: { analysis: state.analysis, selected: userSelection },
    context: state,
  })
  
  // Estágio 5: Financeiro → Garantir conformidade
  const final = await agents.finance.execute({
    input: state.execution,
    context: state,
  })
  
  return final
}
```

**Benefícios:**
- 🎯 Prompts especializados → melhor qualidade por estágio
- 💰 Seleção de modelo → redução de 85% de custo
- ⚡ Estágios paralelizáveis → execução mais rápida
- 📊 Trilha de auditoria mais clara (quem decidiu o quê)
- 🔄 Fácil trocar agentes ou atualizar modelos

**Tarefas:**
- [ ] Projetar interface e modelo de execução de agente
- [ ] Migrar cada estágio para agente dedicado
- [ ] Implementar lógica de coordenação do orquestradora
- [ ] Testar execução multi-agente com cenários reais
- [ ] Fallback para single-agent se algum agente falhar

---

### Fase 5: Recursos Avançados e Escala (Semanas 19+)
**Prioridade:** Diferenciação de mercado, operação autônoma

#### 5.1 Notificações em Tempo Real
- [ ] Conexões WebSocket para atualizações em tempo real
- [ ] Eventos enviados pelo servidor (SSE) para status de operação
- [ ] Notificações push (app móvel)
- [ ] Atualizações de preço de mercado em tempo real

#### 5.2 Recursos de Marketplace
- [ ] Algoritmo de correspondência comprador/vendedor
- [ ] Sistema de leilão para pedidos em massa
- [ ] Sistema de análise/rating
- [ ] Correspondência automática de pedidos

#### 5.3 Painel de Conformidade Regulatória
- [ ] Rastreamento de mudanças em lei tributária
- [ ] Alertas de conformidade
- [ ] Geração automática de relatório (SPED, DI, etc)
- [ ] Análise de impacto regulatório

#### 5.4 Análise Avançada
- [ ] Visualização de cadeia de suprimentos
- [ ] Benchmarking de custo vs mercado
- [ ] Análise de desempenho de fornecedor
- [ ] Painel de previsão de demanda
- [ ] Modelagem de otimização de margem

#### 5.5 Móvel e Offline
- [ ] App móvel nativo (React Native)
- [ ] Suporte a operação offline
- [ ] Sincronização quando conexão restaurada
- [ ] App leve (<5MB)

---

## Parte 4: Prioridades de Implementação

### Caminho Crítico (Deve Fazer)
1. **Semana 1-2:** Streaming + seleção de modelo (Fase 1.1-1.2)
   - Desbloquear lentidão percebida
   - Reduzir custos imediatamente

2. **Semana 3-6:** Trilha de auditoria + aprovação básica (Fase 2.1)
   - Preparação regulatória
   - Transparência operacional

3. **Semana 7-10:** Fundação de grafo de conhecimento (Fase 3.1)
   - Infraestrutura de dados para aprendizado
   - Contexto aprimorado para Claude

### Alto Valor (Deve Fazer)
4. **Semana 11-14:** Loop de aprendizado contínuo (Fase 3.2)
   - Começar a acumular feedback
   - Preparar dados para fine-tuning

5. **Semana 15-18:** Especialização multi-agente (Fase 4)
   - Escalabilidade verdadeira e modularidade
   - Diferenciação no mercado

### Agradável (Pode Fazer)
6. **Semana 19+:** Recursos avançados (Fase 5)
   - Tempo real, marketplace, análise

---

## Próximos Passos

### Esta Semana
1. ✅ Criar roteiro abrangente (ROADMAP.md)
2. ✅ Criar guia de implementação para Fase 1 (PHASE1-IMPLEMENTATION.md)
3. ⏳ **Agendar reunião de kickoff** com time
4. ⏳ **Alocar recursos** para Fase 1 (backend, frontend, devops)

### Semana 1
- [ ] Começar implementação de streaming (backend)
- [ ] Iniciar correcções de UI móvel (frontend)
- [ ] Configurar monitoramento de performance (devops)

### Semana 2
- [ ] Completar integração de streaming
- [ ] Implementar lógica de seleção de modelo
- [ ] Configurar camada de cache

### Semana 3-6
- [ ] Testes de integração
- [ ] Otimização de performance
- [ ] Testes de aceitação do usuário
- [ ] Rollout em produção (canary depois full)

---

*Documento mantido pelo Time de Desenvolvimento Suppley*  
*Última atualização: 23 de junho de 2026*  
*Visão inspirada na declaração de escopo utópico do usuário*
