# Arquitetura de Agentes Especialistas (Multi-Agente "A Elevado")

**Data:** 25 de junho de 2026
**Padrão:** Orchestrator-Worker (agents-as-tools)
**Status:** Implementado

---

## Visão geral

A SUPPLEY usa um modelo **hierárquico**, não peer-to-peer:

```
                    ┌─────────────────────┐
   cliente  ←──────►│   EXCAMBIA (orq.)   │   única identidade que conversa
                    └──────────┬──────────┘
                               │ delega como "tool"
        ┌──────────┬───────────┼───────────┬──────────┐
        ▼          ▼           ▼           ▼          ▼
     Demand    Sourcing     Análise        Op        Fin     ← 5 sub-agentes
        │          │           │           │          │
        └──────────┴───────────┴───────────┴──────────┘
                       usam as TOOLS-BASE
        (montar_calculo, classificar_ncm, enviar_rfq, ...)
```

- **Excambia** é o orquestrador e a **única identidade** que fala com o cliente.
- Cada **especialista** é um sub-agente agêntico (prompt próprio + subconjunto de
  tools) que roda seu próprio loop quando acionado.
- A Excambia chama o especialista **como se fosse uma ferramenta** (`agents-as-tools`).
- Especialistas **não chamam outros especialistas** (sem recursão) — hierarquia
  clara e custo previsível.

## Por que este padrão (e não peer-to-peer / LangGraph autônomo)

Agentes-pares totalmente autônomos (hype de 2023) são, na prática, menos
confiáveis, mais caros e difíceis de auditar. O padrão orchestrator-worker é o
que os frontier labs usam em produção: modular, escalável e **auditável** — cada
delegação registra qual especialista decidiu o quê (prepara a Fase 2.1).

## Os 5 especialistas

| Especialista | Tool | Modelo | Tools-base que aciona |
|---|---|---|---|
| Demanda | `especialista_demand` | balanced | coletar_dados_faltantes, classificar_ncm, buscar_ativo |
| Sourcing | `especialista_sourcing` | balanced | enviar_rfq, registrar_cotacao, comparar_cotacoes, comparar_origem, buscar_ativo |
| Análise | `especialista_analise` | smart | montar_calculo, classificar_ncm, benchmark_mercado, comparar_cotacoes, gerar_relatorio_calculo |
| Operações | `especialista_op` | balanced | registrar_marco_producao, registrar_nacionalizacao |
| Financeiro | `especialista_fin` | smart | lancar_financeiro, benchmark_mercado |

## Mapa de arquivos

```
server/agent/
  orchestrator.ts            # Excambia — system prompt agora orienta a delegação
  tools/
    registry.ts              # BASE_TOOLS + helpers (schemasFor/schemasByName/runFrom)
    index.ts                 # combina BASE_TOOLS + SPECIALIST_TOOLS (API pública)
    types.ts                 # AgentTool, ToolContext, ToolResult, defineSchema
    <tool>.ts                # capacidades diretas (montar_calculo, etc.)
  specialists/
    types.ts                 # SpecialistDef
    runtime.ts               # runSpecialist (loop) + specialistAsTool (wrapper)
    definitions.ts           # os 5 especialistas (prompt + tools + modelo)
    index.ts                 # SPECIALIST_TOOLS = SPECIALISTS.map(specialistAsTool)
```

**Sem import circular:** `tools/index → specialists → runtime → tools/registry`.
O `registry` não importa especialistas, então a cadeia não fecha ciclo.

## Como adicionar um 6º especialista

1. Declare um novo `SpecialistDef` em `specialists/definitions.ts`
   (key, toolName, displayName, descricao, systemPrompt, toolNames, model).
2. Pronto. Ele vira tool automaticamente (`SPECIALISTS.map(specialistAsTool)`)
   e a Excambia passa a poder delegar. Nenhum outro arquivo muda.

## Guardrails (herdados, valem para todos)

- Imposto só pelo motor certificado (`montar_calculo`) — ninguém inventa alíquota.
- NCM é sugestão com confiança — confirmação humana antes de fechar.
- Câmbio/preços de fontes oficiais (BCB) via `benchmark_mercado`.
- GO/NO-GO é recomendação; a pessoa decide (`requireHumanForGoNoGo`).
- Teto de chamadas de IA por sessão (`checkBudget`) — vale no loop de cada especialista.

## Trilha de auditoria

Toda delegação retorna `data.toolsUsed` e `data.toolResults`, registrando a
sequência de ferramentas que o especialista acionou. Isso alimenta diretamente a
**Fase 2.1 (Auditoria + Aprovação)**: cada decisão tem dono e rastro.
