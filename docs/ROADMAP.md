# SUPPLEY AI Bot — Strategic Roadmap

**Project Vision:** IA Orquestradora — Autonomous, Intelligent, Scalable Commerce Intelligence  
**Current Date:** June 23, 2026  
**Status:** Functional & Stable (Core Excambia operational post-Manus migration)

---

## Part 1: Current Implementation Status

### 1.1 Backend Architecture

#### Core Systems
| Component | Status | Purpose |
|-----------|--------|---------|
| **Express Server** | ✅ Active | HTTP/REST foundation on port 3000 |
| **tRPC Router** | ✅ Integrated | Type-safe RPC layer with 28 routers |
| **MySQL 8.0** | ✅ Running | Primary data store (docker-compose) |
| **Claude API Integration** | ✅ Live | Anthropic integration via llm.ts (Opus 4.8) |
| **Authentication** | ✅ Complete | JWT + OAuth (Apple, Google, Manus legacy) |
| **Dotenv Loading** | ✅ Fixed | Lazy getters prevent race conditions |

#### API Routers (28 Available)
```
Core:
  - auth (login, register, token refresh, password reset)
  - system (health, info)

Domain-Specific Routers:
  - excambia (AI orchestrator: agentChat, chat, analyzeDocument, analyzeViability)
  - ncm (NCM classification: classify, search, cache)
  - calculations (import cost calculation engine)
  - quotations (supplier quotations management)
  - rfq (Request for Quote workflow)
  - products (product catalog management)
  
Reference Data:
  - industries (CNAE mapping)
  - suppliers (supplier management)
  - ports (port reference data)
  - commodities (commodity pricing)
  - exchangeRates (USD/BRL and others)
  - taxTables (ICMS, IPI, etc.)
  - taxNotifications (tax law changes)
  - statePricing (state-level price reference)
  
Advanced Features:
  - agent (LangGraph integration, experimental)
  - agentRouter (tool definitions for Claude)
  - drawback (export incentive schemes)
  - reform (fiscal reform calculations)
  - priceComparison (national vs. imported)
  - marketData (COMEX.STAT integration)
  - messaging (multi-channel notifications)
  - conversas (persistent chat conversations)
  - operacoes (operations tracking)
  - estimativa (estimative calculations)
  - market (market intelligence)
  - fase5 (document ingestion pipeline)
```

#### LLM Integration (server/_core/llm.ts)
- **Model:** Claude Opus 4.8 (hardcoded)
- **Features:**
  - ✅ Tool calling (function schema conversion)
  - ✅ JSON schema support (synthetic tool forcing)
  - ✅ Multi-message conversation
  - ✅ System prompts
  - ✅ Image/document analysis via URLs
  - ✅ File content support (PDF, MP3, MP4)
- **Recent Fixes:**
  - Fixed markdown fence stripping in JSON responses
  - Implemented json_schema → forced tool conversion
  - Lazy environment variable loading

#### Orchestrator Pattern (server/agent/orchestrator.ts)
- **Core Function:** `runExcambia()`
- **Loop:** Max 6 turns with Claude
- **Stage Filtering:** Tools availability per operation stage (demand/source/analyze/execute/finance)
- **Pattern:** Claude → Tool execution → Result feedback → Next turn
- **Current Tools Available:** ~40 internal operations

### 1.2 Database Schema (MySQL)

#### Core Tables (schema.ts)
```sql
users                   — User accounts, auth methods, roles
suppliers              — Foreign suppliers, rating, lead times
products               — Product catalog, NCM codes, variants
ncm_tax_rates          — Tax rates by NCM (ICMS, IPI, PIS/COFINS)
icms_tax_rules         — State-level ICMS rules
quotations             — Supplier quotation history
quotation_items        — Line items in quotations
```

#### Extended Tables (rfqSchema.ts, schema.conversas.ts)
```sql
rfq_requests           — Request for Quote workflow
rfq_responses          — Supplier responses to RFQs
conversas              — Persistent chat conversations
conversas_messages     — Individual messages in conversations
operacoes              — Operations tracking (demand/source/finance stages)
```

#### Supporting Tables
```sql
tax_notifications      — Tax law update tracker
exchange_rates         — Currency rates (updated via market data)
state_pricing          — State-level price references
commodity_prices       — Commodity market prices
tax_tables             — ICMS, IPI, CONFIS rate tables
ports_reference        — Port data (CNPJ, location, facilities)
drawback_schemes       — Export incentive schemes (SUDENE, SUDAM, etc.)
industries             — CNAE industry codes mapping
```

### 1.3 Frontend Architecture

#### Pages Structure (33 pages)
**Authentication:**
- Login.tsx, Register.tsx, ForgotPassword.tsx

**Core Operations:**
- Dashboard.tsx — Main user hub
- Excambia.tsx — AI orchestrator interface (main feature)
- ExcambiaChat.tsx — Chat component (new, replacing old messaging)
- ExcambiaMarket.tsx — Market intelligence view

**Transaction Management:**
- Calculations.tsx, Calculate.tsx, CalculateMultiple.tsx — Cost estimation
- Quotations.tsx, QuotationDetail.tsx — Supplier quotes
- RfqDashboard.tsx, RfqCreate.tsx, RfqDetail.tsx — RFQ workflow
- Operacoes.tsx, OperacaoDetail.tsx — Operations tracking

**Reference Data:**
- Industries.tsx, IndustryDetail.tsx — CNAE reference
- Suppliers.tsx — Supplier management
- Products.tsx — Product catalog
- Marketplace.tsx — Product marketplace

**Analysis & Intelligence:**
- Sofia.tsx, SofiaMarket.tsx — Market analytics (legacy)
- ReformDashboard.tsx — Fiscal reform analysis
- Diagnostics.tsx — System diagnostics
- Settings.tsx — User settings
- Messaging.tsx — Multi-channel notifications

**Utility:**
- Home.tsx — Landing page
- ComponentShowcase.tsx — UI component gallery
- NotFound.tsx — 404 handling
- Assistant.tsx — Generic assistant page

#### Component Library
- Located in: `client/src/components/ui/`
- Built with: React 19 + TypeScript
- Styling: Tailwind CSS
- Type-safe tRPC client integration

### 1.4 Key Services (45+ implemented)

#### AI & Analysis Services
- `excambiaAgentService.ts` — Main AI analysis orchestrator
- `agentService.ts` — Agent tooling & scheduling
- `sofiaAgentService.ts` — Legacy market agent (pre-Excambia)
- `langGraphAgentService.ts` — LangGraph orchestration (experimental)
- `aiAnalysisService.ts` — Generic AI analysis

#### Domain Services
- `ncmService.ts` — NCM classification (claude + structured schema)
- `taxCalculationService.ts` — ICMS, IPI, PIS/COFINS calculation
- `importCalculationService.ts` — Full import cost engine
- `importCostEngine.ts` — Motor v1 implementation (archived)
- `priceComparisonService.ts` — National vs imported cost
- `quotationExtractorService.ts` — Parse supplier quotes

#### Data & Integrations
- `marketDataService.ts` — COMEX.STAT integration
- `exchangeService.ts` — Exchange rate management
- `commodityService.ts` — Commodity pricing
- `statePricingService.ts` — State price references
- `tradeData/` — Multi-provider integrations
  - `comexStatProvider.ts` — Official COMEX data
  - `importGeniusProvider.ts` — Trade intelligence (paid API)
  - `panjivaProvider.ts` — Supply chain data (paid API)

#### Transaction Management
- `rfqService.ts` — RFQ workflow orchestration
- `quotationNotificationService.ts` — Quote alerts
- `operacaoService.ts` — Operations tracking

#### Financial & Compliance
- `drawbackService.ts` — Export incentive calculations
- `taxReformService.ts` — Fiscal reform impacts
- `taxTableUpdateService.ts` — Tax table management
- `taxNotificationService.ts` — Regulatory changes

#### Integration & Reporting
- `emailService.ts` — Email notifications
- `whatsappService.ts` — WhatsApp integration (tentative)
- `excelReportService.ts` — Excel export
- `pdfReportService.ts` — PDF generation
- `integrationStatusService.ts` — Integration health monitoring

#### Utilities
- `authService.ts` — Authentication & user management
- `predictiveAnalysisService.ts` — Demand/supply forecasting
- `predictionTrackingService.ts` — Prediction accuracy tracking
- `autoSupplierService.ts` — Automatic supplier suggestions

---

## Part 2: Gap Analysis — Current vs. Vision

### Vision Statement (User's Utopian Scope)
```
IA Orquestradora = Autonomous, Intelligent, Scalable Commerce Intelligence
```

**Core Pillars:**
1. ✅ Agentes Segmentados (Segmented Agents)
2. ✅ Código Modular (Modular Code)
3. ✅ Containers (Docker deployment)
4. ⚠️ APIs (Partial: tRPC present, REST gaps)
5. ⚠️ Workflows Auditáveis (Basic logging, not comprehensive)
6. ⚠️ Base Histórica (Schema present, audit trail missing)
7. ✅ Cálculos Determinísticos (Tax, import costs deterministic)
8. ⚠️ Análise Preditiva (Services exist but underutilized)
9. ⚠️ Rastreabilidade (Limited operation tracking)
10. ⚠️ Aprovação Humana (Not implemented in workflow)
11. ⚠️ Aprendizado Contínuo (No feedback loop or fine-tuning)
12. ❌ Performance & Speed (Known issue: Slow responses, no streaming)

### Implemented ✅
- **Orchestrator Pattern:** Core `runExcambia()` function with multi-turn loop
- **Tool-Based Specialization:** 40+ internal operations exposed to Claude
- **Stage-Based Filtering:** Tools available per workflow stage
- **Deterministic Calculations:** Tax, tariff, logistics calculations
- **Multi-Channel Integration:** Email, WhatsApp tentative, notifications
- **Market Data:** COMEX.STAT, exchange rates, commodity pricing
- **Database Schema:** Comprehensive, supports all major entities
- **Authentication:** Multiple methods (email, OAuth, JWT)
- **Containerization:** Docker Compose for prod/dev

### Partially Implemented ⚠️
- **Audit Trails:** `conversas` table logs but lacks comprehensive audit
- **Workflow Approval:** No human-in-the-loop checkpoints
- **Predictive Analysis:** Services exist but not integrated into orchestrator
- **REST API:** Limited; primarily tRPC (internal only)
- **Document Ingestion:** Fase 5 structure exists but not fully operational
- **Multi-Agent Specialization:** All via Claude; no separate specialized agents
- **Streaming Responses:** None; full responses only

### Not Implemented ❌
- **Continuous Learning:** No feedback mechanism, fine-tuning pipeline, or retraining
- **Performance Optimization:** No response caching, streaming, model selection logic
- **Rastreability Dashboard:** No audit UI, operation history visualization
- **Human Approval Workflows:** No role-based approval checkpoints
- **Real-time Notifications:** Only email; WebSocket/Server-Sent Events missing
- **Analytics Dashboard:** Limited operational insights
- **External API Strategy:** No REST/GraphQL public API (tRPC is internal-only)

---

## Part 3: Evolution Roadmap

### Phase 0: Foundation (NOW — Next 2 weeks)
**Priority:** Stabilize current system, fix known issues

**Tasks:**
- [x] Fix ANTHROPIC_API_KEY loading (env.ts lazy getters)
- [x] Fix Docker environment variable passing
- [x] Fix NCM JSON parsing (markdown fence stripping)
- [x] Implement json_schema support in llm.ts
- [ ] Performance profiling (identify slow paths)
- [ ] Add basic response caching for deterministic operations
- [ ] Create comprehensive docs/API.md

**Deliverable:** Stable, documented Excambia at current speed

---

### Phase 1: Performance & User Experience (Weeks 3–6)
**Priority:** Address known issue: "Responsividade péssima"

**Goal:** 3x perceived speed improvement

#### 1.1 Streaming Responses
```typescript
// Current (blocking):
const reply = await runExcambia(...)  // Wait for full response

// Target (streaming):
const stream = runExcambia(...) // Yields partial results
for await (const chunk of stream) {
  UI.appendChunk(chunk)  // Display incrementally
}
```

**Tasks:**
- [ ] Implement streaming in `runExcambia()` → yield at each tool completion
- [ ] Add streaming to ExcambiaChat.tsx (SSE or WebSocket)
- [ ] Fallback to full response for non-streaming clients
- [ ] Test with poor network conditions

**Impact:** Perceived latency drops 60%

#### 1.2 Model Selection Strategy
```typescript
// Current: All tasks via Opus 4.8
// Target: Route by complexity
const selectModel = (task: TaskType): ModelId => {
  switch(task) {
    case "ncm_classification":    return "haiku"      // $0.80/M input
    case "simple_calculation":    return "haiku"      // 5ms latency
    case "complex_analysis":      return "sonnet"     // $3/M input
    case "strategic_planning":    return "opus"       // $15/M input
  }
}

// Savings: 95% cost reduction for simple operations
```

**Tasks:**
- [ ] Classify operations by complexity (deterministic, simple AI, complex reasoning)
- [ ] Implement model routing logic in llm.ts
- [ ] Test Haiku for NCM, Sonnet for analysis, Opus for strategy
- [ ] Monitor accuracy & latency per model

**Impact:** 85% cost reduction, 70% faster simple tasks

#### 1.3 Response Caching
```typescript
// Cache deterministic operations
const cache = new Map<string, CacheEntry>()

async function ncmClassify(productName: string) {
  const key = `ncm:${productName.toLowerCase()}`
  if (cache.has(key)) return cache.get(key)
  
  const result = await claudeNCM(productName)
  cache.set(key, result, { ttl: 30 * 24 * 60 * 60 }) // 30 days
  return result
}
```

**Tasks:**
- [ ] Identify cacheable operations (NCM, tax rates, exchange rates)
- [ ] Implement cache layer (Redis for prod, Map for dev)
- [ ] Set TTLs per operation type
- [ ] Cache hit monitoring

**Impact:** 90% cache hit rate for common products, <10ms retrieval

#### 1.4 UI Responsiveness
- [ ] Mobile layout fixes (ExcambiaChat overflow)
- [ ] Virtualize long chat histories
- [ ] Optimize chat message rendering
- [ ] Add loading placeholders

---

### Phase 2: Workflow Intelligence & Auditability (Weeks 7–10)
**Priority:** Implement "workflows auditáveis" and "rastreabilidade"

#### 2.1 Comprehensive Audit Trail
```typescript
// Audit every operation
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

// New schema tables:
// audit_logs, audit_approvals
```

**Tasks:**
- [ ] Create audit_logs, audit_approvals tables
- [ ] Instrument runExcambia() to log every operation
- [ ] Create audit UI (timeline, operation details, approval history)
- [ ] Implement approval checkpoints (human-in-the-loop)
- [ ] Add audit export (CSV, PDF)

**Impact:** Full operational transparency, regulatory compliance ready

#### 2.2 Human-in-the-Loop Workflow
```typescript
// Before execution, require approval for:
// - Large orders (> $100k)
// - High-risk suppliers (rating < C)
// - Changes to core pricing
// - Tax strategy changes

async function executeWithApproval(operation: Operation) {
  if (needsApproval(operation)) {
    const approval = await requestApproval(operation)
    if (!approval) throw new Error("Approval denied")
  }
  return execute(operation)
}
```

**Tasks:**
- [ ] Define approval triggers (order size, supplier risk, tax impacts)
- [ ] Create approval request UI (admin/manager view)
- [ ] Implement approval workflow (accept/reject with comments)
- [ ] Route notifications to approvers
- [ ] Track approval SLAs

---

### Phase 3: Knowledge Management & Learning (Weeks 11–14)
**Priority:** Implement "base histórica", "aprendizado contínuo", "análise preditiva integrada"

#### 3.1 Knowledge Graph
```typescript
// Store and connect:
// - Suppliers (rating, reliability, price trends)
// - Products (NCM history, supplier options, price history)
// - Scenarios (past operations, outcomes, patterns)
// - Regulations (tax law changes, trade agreements)

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

**Tasks:**
- [ ] Design knowledge graph schema
- [ ] Implement entity extraction (Claude → entities from operations)
- [ ] Create relationship linker
- [ ] Build knowledge UI (graph visualization, entity explorer)
- [ ] Integrate into orchestrator context (feed to Claude)

#### 3.2 Continuous Learning Loop
```typescript
// After each operation, collect feedback
async function learnFromOperation(operation: Operation, feedback: {
  outcome: "success" | "partial" | "failed"
  actualCost?: number
  actualDuration?: number
  supplierPerformance?: "excellent" | "good" | "poor"
  suggestions?: string
}) {
  // Store as training example
  await storeTrainingExample({
    input: operation.input,
    output: operation.output,
    outcome: feedback.outcome,
    context: operation.context,
  })
  
  // Update supplier/product ratings
  if (feedback.supplierPerformance) {
    await updateSupplierRating(operation.supplierId, feedback.supplierPerformance)
  }
  
  // Retrain Claude context (via system prompt updates)
  // Example: "Supplier #42 (ABC Trading) has poor reliability"
}
```

**Tasks:**
- [ ] Create training_examples table
- [ ] Add operation outcome tracking UI
- [ ] Implement supplier/product rating updates
- [ ] Build learning dashboard (accuracy, improvement trends)
- [ ] Prepare data for fine-tuning pipeline (batch→Claude API)

#### 3.3 Predictive Analysis Integration
```typescript
// Integrate predictive services into orchestrator

// Demand forecasting
const forecast = await predictiveDemand({
  productId: 123,
  months: 12
})  // Returns: [units, confidence] per month

// Supplier reliability prediction
const supplierRisk = await predictSupplierReliability({
  supplierId: 42,
  orderSize: 10000
})  // Returns: on-time-probability, quality-score

// Price trend prediction
const priceForecast = await predictPriceTrend({
  ncmCode: "7317.00.90",
  months: 6
})  // Returns: [priceUSD, confidence] per month

// → Use in runExcambia() for better recommendations
```

**Tasks:**
- [ ] Integrate predictiveAnalysisService into orchestrator
- [ ] Train time-series models (product demand, prices)
- [ ] Create prediction accuracy dashboard
- [ ] Feed predictions into Claude context

---

### Phase 4: True Multi-Agent Architecture (Weeks 15–18)
**Priority:** Evolve from tool-based to segmented agent specialization

**Current:** Single Claude Opus with 40+ tools

**Target:** Specialized agents coordinated by orchestrator

```typescript
// Specialized Agent Roles:

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
    model: "haiku",  // Fast, deterministic
    systemPrompt: "You are demand analyst. Extract product specs, quantities, timelines.",
    tools: [extractProductSpecs, validateNCM, queryInventory],
  },
  {
    id: "sourcing-agent",
    role: "sourcing",
    model: "sonnet",  // Balanced
    systemPrompt: "You are sourcing specialist. Find suppliers, compare quotes, assess risk.",
    tools: [searchSuppliers, getQuotes, assessSupplierRisk, checkAvailability],
  },
  {
    id: "analyzer-agent",
    role: "analyzer",
    model: "opus",  // Strategic
    systemPrompt: "You are financial analyst. Calculate costs, taxes, margins, ROI.",
    tools: [calculateImportCost, calculateTaxes, analyzeMargin, predictPriceChange],
  },
  {
    id: "executor-agent",
    role: "executor",
    model: "sonnet",  // Reliable operations
    systemPrompt: "You are operations specialist. Execute orders, arrange logistics, manage docs.",
    tools: [createRFQ, negotiateTerms, arrangeLogistics, generateDocuments],
  },
  {
    id: "finance-agent",
    role: "finance",
    model: "sonnet",  // Compliance-focused
    systemPrompt: "You are compliance officer. Ensure tax compliance, audit trail, approvals.",
    tools: [validateTaxCompliance, createAuditLog, triggerApproval],
  },
]

// Orchestrator coordinates between agents
async function runExcambiaV2(input: UserRequest) {
  let state = { demand: null, suppliers: [], analysis: null, execution: null }
  
  // Stage 1: Demand → Extract product specs
  state.demand = await agents.demand.execute({
    input: input.message,
    context: state,
  })
  
  // Stage 2: Sourcing → Find suppliers
  state.suppliers = await agents.sourcing.execute({
    input: state.demand,
    context: state,
  })
  
  // Stage 3: Analysis → Calculate costs
  state.analysis = await agents.analyzer.execute({
    input: { demand: state.demand, suppliers: state.suppliers },
    context: state,
  })
  
  // Stage 4: Execution → Plan operations
  state.execution = await agents.executor.execute({
    input: { analysis: state.analysis, selected: userSelection },
    context: state,
  })
  
  // Stage 5: Finance → Ensure compliance
  const final = await agents.finance.execute({
    input: state.execution,
    context: state,
  })
  
  return final
}
```

**Benefits:**
- 🎯 Specialized prompts → better quality per stage
- 💰 Model selection → 85% cost reduction
- ⚡ Parallelizable stages → faster overall execution
- 📊 Clearer audit trail (who decided what)
- 🔄 Easy to swap agents or upgrade models

**Tasks:**
- [ ] Design agent interface & execution model
- [ ] Migrate each stage to dedicated agent
- [ ] Implement orchestrator coordination logic
- [ ] Test multi-agent execution with real scenarios
- [ ] Fallback to single-agent if any agent fails

---

### Phase 5: Advanced Features & Scale (Weeks 19+)
**Priority:** Market differentiation, autonomous operation

#### 5.1 Real-Time Notifications
- [ ] WebSocket connections for live updates
- [ ] Server-sent events (SSE) for operation status
- [ ] Push notifications (mobile app)
- [ ] Real-time market price updates

#### 5.2 Marketplace Features
- [ ] Buyer/seller matching algorithm
- [ ] Auction system for bulk orders
- [ ] Review/rating system
- [ ] Automated order matching

#### 5.3 Regulatory Compliance Dashboard
- [ ] Tax law change tracking
- [ ] Compliance alerts
- [ ] Automated report generation (SPED, DI, etc)
- [ ] Regulatory impact analysis

#### 5.4 Advanced Analytics
- [ ] Supply chain visualization
- [ ] Cost benchmarking vs market
- [ ] Supplier performance analytics
- [ ] Demand forecasting dashboard
- [ ] Margin optimization modeling

#### 5.5 Mobile & Offline
- [ ] Native mobile app (React Native)
- [ ] Offline operation support
- [ ] Sync when connection restored
- [ ] Lightweight app (<5MB)

---

## Part 4: Implementation Priorities

### Critical Path (Must Do)
1. **Week 1-2:** Streaming + model selection (Phase 1.1-1.2)
   - Unblock perceived slowness
   - Reduce costs immediately

2. **Week 3-6:** Audit trail + basic approval (Phase 2.1)
   - Regulatory readiness
   - Operational transparency

3. **Week 7-10:** Knowledge graph foundation (Phase 3.1)
   - Data infrastructure for learning
   - Enhanced context for Claude

### High Value (Should Do)
4. **Week 11-14:** Continuous learning loop (Phase 3.2)
   - Start accumulating feedback
   - Prepare fine-tuning data

5. **Week 15-18:** Multi-agent specialization (Phase 4)
   - True scalability & modularity
   - Market differentiation

### Nice-to-Have (Could Do)
6. **Week 19+:** Advanced features (Phase 5)
   - Real-time, marketplace, analytics

---

## Part 5: Technical Architecture (Post-Roadmap)

### Ideal Final Stack

```
┌─────────────────────────────────────────────┐
│  Frontend (React 19 + Tailwind)             │
│  - Excambia Chat (Streaming UI)             │
│  - Operation Dashboard (Audit Trail)        │
│  - Analytics & Insights                     │
└────────────┬────────────────────────────────┘
             │ tRPC + Streaming
┌────────────▼────────────────────────────────┐
│  API Layer (tRPC Routers + REST Public)     │
│  - 28 Domain Routers                        │
│  - Approval API                             │
│  - Webhook API (3rd party integrations)     │
└────────────┬────────────────────────────────┘
             │ Service Layer
┌────────────▼────────────────────────────────┐
│  Service Orchestration                      │
│  ┌──────────────────────────────────────┐   │
│  │ Multi-Agent Orchestrator             │   │
│  │  - Demand Agent (Haiku)              │   │
│  │  - Sourcing Agent (Sonnet)           │   │
│  │  - Analyzer Agent (Opus)             │   │
│  │  - Executor Agent (Sonnet)           │   │
│  │  - Finance Agent (Sonnet)            │   │
│  └──────────────────────────────────────┘   │
│  45+ Domain Services                        │
│  - Tax Calculation, NCM, RFQ, etc          │
│  - Market Data, Predictions, Learning      │
└────────────┬────────────────────────────────┘
             │
┌────────────▼────────────────────────────────┐
│  Data & Knowledge Layer                     │
│  - MySQL (core data)                        │
│  - Redis (cache, sessions)                  │
│  - Knowledge Graph (entities & relations)   │
│  - Training Examples Store (fine-tuning)    │
│  - Audit Logs (compliance)                  │
└──────────────────────────────────────────────┘

External Integrations:
├─ Claude API (Anthropic)
├─ COMEX.STAT (trade data)
├─ Market Data Providers
├─ Email/WhatsApp (notifications)
└─ OAuth Providers (auth)
```

---

## Part 6: Key Metrics & Success Criteria

### Performance Metrics
- **Response Time:** <2s (Phase 1) → <500ms (Phase 4)
- **Cache Hit Rate:** 75%+ for deterministic operations
- **Model Cost:** $0.02 per simple task (Haiku), $0.10 for complex (Sonnet)
- **Availability:** 99.9% (prod Docker deployment)

### Quality Metrics
- **NCM Classification Accuracy:** 95%+
- **Cost Calculation Accuracy:** <1% error vs. manual
- **Prediction Accuracy:** 80%+ for supplier reliability, 70%+ for price trends
- **Audit Trail Completeness:** 100% of operations logged

### Business Metrics
- **User Satisfaction:** 4.5+/5.0
- **Time Saved per Operation:** 60 minutes → 5 minutes
- **Cost Reduction:** 30-50% (via better sourcing)
- **Adoption Rate:** Target 500+ active users (year 1)

---

## Part 7: Deployment & DevOps

### Current (Docker Compose)
```yaml
services:
  mysql:8.0          # Core database
  app:latest        # Node.js Express + tRPC
  phpmyadmin:debug  # Database admin (dev only)
```

### Post-Roadmap (Kubernetes or Fargate)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: suppley-ai-bot
spec:
  replicas: 3  # HA
  template:
    spec:
      containers:
      - name: app
        image: suppley-app:latest
        env:
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: anthropic-secret
      - name: demand-agent
        image: suppley-demand-agent:latest
      - name: sourcing-agent
        image: suppley-sourcing-agent:latest
      - name: analyzer-agent
        image: suppley-analyzer-agent:latest
      - name: executor-agent
        image: suppley-executor-agent:latest
      - name: finance-agent
        image: suppley-finance-agent:latest
---
apiVersion: v1
kind: Service
metadata:
  name: suppley-api
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 3000
```

---

## Part 8: Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Model API cost escalation | High | Rate limiting, caching, cheaper models for simple tasks |
| Multi-agent coordination complexity | High | Start with sequential, add parallelization gradually |
| Data privacy/compliance | High | Audit trail, data encryption, GDPR/LGPD compliance |
| Supplier data quality | Medium | Validation rules, confidence scores, feedback loop |
| Market data provider reliability | Medium | Multi-provider fallback, local cache, graceful degradation |
| Knowledge graph performance at scale | Medium | Indexed queries, caching, pagination |

---

## Part 9: Team Roadmap

### Month 1 (Weeks 1-4)
- **Dev Lead:** Performance optimization (streaming, model selection)
- **Data Eng:** Set up caching layer, performance monitoring
- **QA:** Load testing, latency profiling

### Month 2 (Weeks 5-8)
- **Dev Lead:** Audit trail, approval workflow
- **Infra:** Prepare for scaling (multi-region, failover)
- **QA:** Compliance testing, audit accuracy

### Month 3 (Weeks 9-12)
- **ML Eng:** Knowledge graph, training data pipeline
- **Dev:** Integrate predictive services
- **QA:** Prediction accuracy testing

### Month 4 (Weeks 13-16)
- **ML Eng:** Agent fine-tuning
- **Dev Lead:** Multi-agent orchestrator
- **QA:** End-to-end integration testing

### Ongoing
- **DevOps:** Infrastructure automation, monitoring
- **Product:** User feedback collection, iteration
- **Compliance:** Regulatory monitoring, documentation

---

## Part 10: Success Criteria for Each Phase

### Phase 1 Complete When:
- [ ] Chat response renders incrementally (streaming visible)
- [ ] Response times: <2s (down from ~5s)
- [ ] Cost per request: $0.05 average (down from $0.15)
- [ ] Mobile UI responsive on all screen sizes

### Phase 2 Complete When:
- [ ] Audit log has 100% coverage (all operations logged)
- [ ] Approval workflow tested with 5+ scenarios
- [ ] Admin can view operation history & approve/reject
- [ ] Compliance report generation working

### Phase 3 Complete When:
- [ ] Knowledge graph has 10k+ entities
- [ ] Supplier ratings improve by 20% (accuracy)
- [ ] Continuous learning loop collecting feedback
- [ ] First fine-tuned Claude model deployed

### Phase 4 Complete When:
- [ ] All 5 agents deployed and coordinating
- [ ] Cost reduction: 85% vs. all-Opus baseline
- [ ] Multi-agent latency: <1.5s end-to-end
- [ ] Agent specialization improving quality scores

---

## Conclusion

**Where We Are:** Functional, stable Excambia AI bot post-Manus migration. Core orchestrator working. Known issue: slow response times.

**Where We're Going:** Autonomous, intelligent, scalable commerce intelligence platform. Multi-agent architecture. Real-time, auditable, learning-enabled operations.

**Timeline:** 16 weeks critical path. 24+ weeks for full vision.

**Next Step:** Start Phase 1 (streaming + model selection) next sprint.

---

*Document maintained by Suppley Development Team*  
*Last updated: June 23, 2026*  
*Vision inspired by user's utopian scope statement*
