# Excambia ↔ Painel de Operações — Mapa do que temos × o que falta

> Levantamento para a "dinâmica de conversa" (cards de operação, timeline,
> painel lateral) inspirada no chat do Claude. Data: 2026-06-22.

## ✅ O que JÁ TEMOS (construído e funcional)

### Dados / Backend
- **Modelo completo da operação** (`drizzle/schema.ts`):
  - `operacoes` (cabeçalho: código, título, estágio, status, cliente, fornecedor, margem…)
  - `operacao_eventos` (timeline imutável; cada ação vira evento, com `autor` = usuario/excambia/sistema)
  - `operacao_estagios` (passagem por estágio + gate/checklist)
  - `operacao_anexos` (documentos: PDF, desenho, cotação…)
  - `operacao_financeiro` (câmbio, pagamentos, impostos, frete, receita…)
  - `operacao_marcos` (pedido confirmado, produção, embarque, DI, nacionalizado, entregue)
- **`operationsRouter`**: `list`, `get`, `create`, `advanceStage`, `linkQuotation`,
  `linkCalculation`, `decideGoNoGo`, `addEvento`
- **`operacaoService`**: camada de serviço por trás do router
- **Tools do agente que ESCREVEM na operação** (gravam na mesma timeline, `autor="excambia"`):
  `registrarCotacao`, `registrarMarcoProducao`, `registrarNacionalizacao`,
  `lancarFinanceiroTool`, `montarCalculo`, `enviarRfq`, `gerarRelatorio`

### Frontend
- **Painel de Operações (Kanban)** — `pages/Operacoes.tsx` (lista por estágio, cria operação, abre `/operacao/:id`)
- **Página de detalhe da operação** — `pages/OperacaoDetail.tsx`, composta por 4 componentes prontos:
  `OperacaoTimeline`, `OperacaoMarcos`, `OperacaoAnexos`, `OperacaoFinanceiro`
- **Barra de vínculo chat↔operação** — `components/excambia/ConversaOperacaoBar.tsx` (componente existe)

### Excambia (chat)
- **`conversasRouter`**: `list/get/create/rename/setPinned/archive/delete/linkOperacao/send`
- `send` → **orquestrador** → tools → escrevem na timeline da operação vinculada
- A conversa guarda `operacaoId` (o vínculo persiste no banco)

---

## ❌ O que FALTA / está QUEBRADO (gaps até o mockup)

### GAP 1 — Chat novo não mostra a operação vinculada
`ExcambiaChat.tsx` (a tela atual) **não usa** o `ConversaOperacaoBar`. Não há, no chat
novo, como criar/vincular operação nem ver o estágio. O componente existe, mas está
preso na `Excambia.tsx` ANTIGA.

### GAP 2 — `ConversaOperacaoBar` aponta para router quebrado
Ele usa `trpc.excambia.linkConversaOperacao / getConversa / listConversas` — o
`excambiaRouter` antigo, com funções inexistentes (warnings no build). Precisa migrar
para `conversasRouter.linkOperacao` (que já existe e funciona).

### GAP 3 — Respostas em "cards" na conversa
O orquestrador retorna **só texto** (`reply: string`). O mockup mostra:
boas-vindas com ações, **"Minhas operações" → cards clicáveis**, resumo da jornada
com checklist. Falta o orquestrador (ou o frontend) produzir/renderizar **blocos
estruturados** (cards de operação, timeline resumida).

### GAP 4 — Painel lateral de acompanhamento DENTRO do chat
O mockup mostra, ao lado do chat, **"Acompanhamento da operação"** (esteira
Demanda→Câmbio, tracking ETA, documentos). Hoje isso só existe como **página separada**
`/operacao/:id`. Falta trazer como **painel lateral** no `ExcambiaChat`, reusando os
componentes `OperacaoTimeline` / `OperacaoAnexos` que já existem.

### GAP 5 — `operations.update` ausente
`OperacaoDetail.tsx` chama `trpc.operations.update`, que **não existe** no
`operationsRouter` (erro de tipo, já aparece no `pnpm check`). Falta criar a mutation
`update` no router/serviço.

### GAP 6 — Tracking de embarque estruturado
O mockup mostra navio / rota / BL / ETA. O modelo tem `marcos` (`produto_embarcado`…)
mas **não há campos estruturados** de tracking (navio, rota, BL, ETA). Pode entrar via
`payload` do evento/marco ou como novos campos.

---

## Ordem de construção sugerida (incremental)

1. **GAP 5** (rápido, destrava `pnpm check`): criar `operations.update`.
2. **GAP 1 + 2** (liga o chat à operação): plugar `ConversaOperacaoBar` no `ExcambiaChat`
   e migrar para `conversasRouter.linkOperacao`. → já dá pra criar/abrir operação pelo chat.
3. **GAP 4** (alto impacto visual): painel lateral de acompanhamento no chat, reusando
   `OperacaoTimeline`/`OperacaoAnexos`. → recria o lado direito do mockup com dados reais.
4. **GAP 3** (cards ricos): orquestrador devolve blocos estruturados + renderização de
   cards de operação na conversa. → recria o miolo do mockup.
5. **GAP 6** (tracking): campos de navio/rota/BL/ETA no embarque.
