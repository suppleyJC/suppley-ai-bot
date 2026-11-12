# Arquitetura Mestre — EXCAMBIA, IA Orquestradora Central

**Documento canônico.** Define o modelo de funcionamento da Excambia como cérebro central do sistema. Toda decisão de código deve respeitar este blueprint.

**Data:** 23 de junho de 2026  
**Fonte:** Visão do Jean (orquestradora central com Entrada → Processamento → Bases → Saídas)

---

## Diagrama Mestre

```
                          ┌─────────────────────────────────┐
                          │           E X C A M B I A         │
                          │     IA ORQUESTRADORA CENTRAL      │
                          └─────────────────────────────────┘

   ENTRADA                  PROCESSAMENTO                    SAÍDA
   ───────                  ─────────────                    ─────
   Chat            ──┐      Interpreta demanda        ┌──►  Card de operação
   PDF/planilha    ──┤      Extrai dados              ├──►  RFQ padrão
   Proforma        ──┤      Aciona agentes            ├──►  Cotação organizada
   Invoice         ──┼──►   Estrutura informações  ──►├──►  Cálculo de viabilidade
   Cotação         ──┤      Pergunta o que falta      ├──►  Comparativo nac. × imp.
   Card manual     ──┤      Gera RFQ                  ├──►  Ranking de fornecedores
   Demanda cliente ──┘      Consulta fornecedores     ├──►  Alertas operacionais
                            Calcula viabilidade       ├──►  Relatórios
                            Consulta mercado          └──►  Recomendações
                            Acompanha operação
                                   ▲   │
                                   │   ▼
                          ┌─────────────────────────────────┐
                          │   BASES (Banco de Conhecimento)  │
                          │  • Painel de Operações           │
                          │  • Indústrias & Fornecedores     │
                          │  • Ativos & Insumos              │
                          │  • Inteligência de Mercado       │
                          │  • Histórico de Cotações         │
                          │  • Proformas e Invoices          │
                          └─────────────────────────────────┘
                          ↑ Retroalimentação contínua (ciclo) ↑
```

**Princípio de COESÃO:** Toda entrada vira conhecimento estruturado nas Bases. As Bases retroalimentam a Excambia e a Inteligência de Mercado. Quanto mais se usa, mais inteligente fica.

---

## 1. ENTRADA — Canais de Ingestão

| Canal | Status | Implementação | Lacuna |
|-------|--------|---------------|--------|
| **Chat** | ✅ Funcional | `excambiaRouter.agentChat` → `runExcambia()` | Streaming (Fase 1) |
| **Upload PDF/planilha** | ⚠️ Parcial | `excambiaRouter.analyzeDocument` + `quotationExtractorService` | Planilha (XLSX) não estruturada |
| **Proforma** | 🔄 Em construção | `PLANO-TECNICO-PROFORMA-UNIFICADA.md` | Serviço + UI a implementar |
| **Invoice** | ❌ A fazer | Reusar pipeline de proforma | Distinguir invoice × proforma |
| **Cotação** | ⚠️ Parcial | `supplierQuotes` + `quotationExtractorService` | Entrada manual fluida |
| **Card manual** | ⚠️ Parcial | `operacoes` (criar operação manual) | Card unificado de entrada |
| **Demanda do cliente** | ⚠️ Parcial | `rfqs` (requesterType: "client") | Captura conversacional na Excambia |

### Modelo unificado de entrada
Toda entrada passa por um **roteador de ingestão** que classifica o documento/intenção e aciona o agente correto:
```
server/agent/pipeline/ingestao.ts  (já existe — expandir)
  → detecta tipo (proforma | invoice | cotação | planilha | demanda livre)
  → aciona agente especializado de extração
  → normaliza para estrutura canônica
```

---

## 2. PROCESSAMENTO — O Cérebro

| Capacidade | Status | Onde vive | Próximo passo |
|-----------|--------|-----------|---------------|
| Interpreta demanda | ✅ | `runExcambia` (orquestrador) | — |
| Extrai dados | ⚠️ | `quotationExtractorService`, `analyzeDocument` | Schema estruturado (json_schema ✅ já corrigido) |
| Aciona agentes | ⚠️ | `getToolSchemas(estagio)` (filtro por estágio) | Evoluir p/ agentes reais (Fase 4) |
| Estrutura informações | ⚠️ | Tools do orquestrador | Padronizar saída canônica |
| Pergunta o que falta | ❌ | — | **Agente de Completude** (detecta campos vazios e pergunta) |
| Gera RFQ | ✅ | `rfqRouter`, `rfqService` | Gerar a partir de demanda livre no chat |
| Consulta fornecedores | ⚠️ | `industriesRouter`, `suppliersRouter` | Busca semântica na base |
| Calcula viabilidade | ✅ | `importCostEngine`, `analyzeViability` | Acionar automático pós-proforma |
| Consulta mercado | ⚠️ | `marketDataService`, COMEX.STAT | Integrar ao fluxo de decisão |
| Acompanha operação | ⚠️ | `operacaoService` | Alertas proativos por estágio |

### Agentes Segmentados (mapa definitivo)

```
EXCAMBIA (Orquestradora) — coordena todos abaixo
│
├─ Agente de Ingestão      → classifica entrada, extrai dados (proforma/invoice/planilha)
├─ Agente de Completude    → detecta lacunas e PERGUNTA o que falta  ← NOVO no escopo
├─ Agente de Demanda       → interpreta o que o cliente quer, gera RFQ
├─ Agente de Sourcing      → busca/ranqueia fornecedores na base
├─ Agente Financeiro       → custo nacionalizado, viabilidade, nac. × importado
├─ Agente de Mercado       → consulta COMEX/preços, tendências
├─ Agente de Curadoria     → mantém Indústrias & Fornecedores limpos/ranqueados
├─ Agente de Catálogo      → mantém Ativos & Insumos (NCM, comparativos)
└─ Agente de Operação      → acompanha estágio, gera alertas e relatórios
```

---

## 3. BASES — Banco de Conhecimento (retroalimenta a IA)

| Base | Status | Tabela(s) | Menu atual | Ação |
|------|--------|-----------|------------|------|
| **Painel de Operações** | ⚠️ | `operacoes`, `conversas` | OPERAÇÕES | Card de operação + estágios |
| **Indústrias & Fornecedores** | 🔄 Unificar | `industries` (+ `suppliers` legado) | BASE | Unificar + renomear |
| **Ativos & Insumos** | ✅ | `products` | BASE | Receber produtos da proforma |
| **Inteligência de Mercado** | ⚠️ | `commodity_prices`, `exchange_rates`, COMEX | INTELIGÊNCIA | Alimentar com histórico real |
| **Histórico de Cotações** | ⚠️ | `quotations`, `consolidated_quotes` | (sem menu) | Expor como base consultável |
| **Proformas e Invoices** | 🔄 | `supplier_quotes` (+ avulsa) | OPERAÇÕES (novo) | Implementar |

### Regra de ouro da retroalimentação
Toda **Saída** gerada e todo **resultado de operação** voltam para as Bases como exemplo histórico → a Excambia consulta esse histórico nas próximas decisões (base para aprendizado contínuo da Fase 3).

---

## 4. SAÍDA — Entregáveis da Excambia

| Saída | Status | Onde vive | Próximo passo |
|-------|--------|-----------|---------------|
| **Card de operação** | ⚠️ | `operacoes` / `OperacaoDetail.tsx` | Card visual padronizado |
| **RFQ padrão** | ✅ | `rfqService`, `RfqDetail.tsx` | — |
| **Cotação organizada** | ✅ | `consolidatedQuotes` | — |
| **Cálculo de viabilidade** | ✅ | `importCostEngine`, `analyzeViability` | Exibir no card |
| **Comparativo nac. × imp.** | ✅ | `priceComparisonService` | Acionar automático |
| **Ranking de fornecedores** | ⚠️ | ratings em `industries` | Ranking dinâmico por RFQ |
| **Alertas operacionais** | ❌ | — | **Agente de Operação** + notificações |
| **Relatórios** | ⚠️ | `pdfReportService`, `excelReportService` | Conectar ao fluxo |
| **Recomendações** | ⚠️ | `runExcambia` (texto livre) | Recomendações estruturadas (GO/NEGOTIATE/NO_GO já existe em `excambiaVerdict`) |

---

## Mapa de Lacunas Prioritárias (o que falta construir)

| Prioridade | Item | Tipo | Esforço |
|-----------|------|------|---------|
| 🔴 P0 | **Proformas/Invoices** (ingestão → distribuição p/ base) | Feature nova | ~12h |
| 🔴 P0 | **Unificar Indústrias & Fornecedores** | Refactor | ~10h |
| 🟠 P1 | **Agente de Completude** (perguntar o que falta) | Agente novo | ~8h |
| 🟠 P1 | **Card de operação** padronizado (saída visual) | UI | ~8h |
| 🟠 P1 | **Streaming** (Fase 1 — percepção de velocidade) | Performance | ~16h |
| 🟡 P2 | **Alertas operacionais** (Agente de Operação) | Feature | ~10h |
| 🟡 P2 | **Histórico de Cotações** como base consultável | UI + router | ~6h |
| 🟢 P3 | **Agentes segmentados reais** (Fase 4) | Arquitetura | ~40h |
| 🟢 P3 | **Aprendizado contínuo** (retroalimentação → fine-tune) | ML | ~35h |

---

## Sequência de Construção (alinhada ao blueprint)

```
SPRINT 1 (agora)
  1. Schema aditivo (tipoEntidade, rfqId opcional) + db:push
  2. Proformas/Invoices: serviço + router + UI + extração IA
  3. Distribuição p/ Base (fabricante→Indústrias, produto→Ativos)

SPRINT 2
  4. Unificar Indústrias & Fornecedores (renomear, filtro por tipo, migrar suppliers)
  5. Agente de Completude (perguntar o que falta)
  6. Card de operação padronizado

SPRINT 3
  7. Streaming + seleção de modelo (Fase 1 Performance)
  8. Alertas operacionais + Histórico de cotações como base

SPRINT 4+
  9. Agentes segmentados reais (Fase 4)
 10. Aprendizado contínuo (Fase 3)
```

---

## Como Cada Documento se Conecta

| Documento | Papel |
|-----------|-------|
| **ARQUITETURA-EXCAMBIA.md** (este) | Blueprint mestre — north star |
| `ROADMAP.md` / `ROADMAP-PT.md` | Roteiro de 24 semanas (5 fases) |
| `PLANO-AJUSTES-PRODUTO.md` | As 4 observações operacionais |
| `PLANO-TECNICO-PROFORMA-UNIFICADA.md` | Detalhe de código de Proformas + Base |
| `PHASE1-IMPLEMENTATION-PT.md` | Detalhe de código de Performance |
| `EXECUTIVE-SUMMARY-PT.md` | Visão executiva |

---

*Este é o documento canônico. Toda implementação valida-se contra este blueprint.*  
*Próximo passo: SPRINT 1 — Proformas (a primeira porta de entrada estruturada da Excambia).*
