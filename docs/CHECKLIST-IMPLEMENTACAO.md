# Checklist de Implementação — SUPPLEY AI Bot

> Estado do que foi entregue, o que está pendente (aguardando decisão/insumo) e o
> que falta implementar. Complementa `ROADMAP-PT.md` e `ESTADO_PROJETO.md`.
>
> **Branch:** `claude/manus-migration-independent-1kfrll`
> **Atualizado:** 2026-06-29

---

## ✅ Implementado (leva recente de sessões)

### Excambia (chat / IA orquestradora)
- ✅ Busca de produto por **similaridade** (normalização ×→x, acentos, tokens) com
  expansão de sinônimos **PT↔EN** (ex.: "Common Nail" ↔ "prego cabeça simples").
- ✅ Consulta à **base** (ativos + proformas/itens) antes de responder preço.
- ✅ Fluxo "quanto custaria importar X": similaridade → **valor presente** (PTAX
  na data vs hoje) → cascata externa **Comex Stat (Brasil) → UN Comtrade (global)
  → web** → comparação base vs externo → pergunta de fechamento padrão.
- ✅ **Comparação multi-fornecedor** da base (mais competitivo em destaque).
- ✅ Regra de **rótulo de origem** (preço global sinalizado sutilmente; base/Brasil
  sem rótulo) e proibição de expor limitações técnicas das fontes.
- ✅ **Formatação das respostas estilo ChatGPT/Claude** (títulos proporcionais,
  tabelas, listas, código) centralizada no `MessageContent` — consistente em todo
  o sistema.

### Inteligência de Mercado
- ✅ Página reconstruída sobre fontes reais (**BCB PTAX, FRED, IBGE SIDRA/IPCA,
  Comex Stat**) — removida a dependência morta do Yahoo/Manus.
- ✅ Camada preditiva **janela de compra** (score 0–100 por câmbio/commodities/IPCA).
- ✅ `FRED_API_KEY` e `COMTRADE_API_KEY` plumados no docker-compose/.env.

### Operações — jornada unificada
- ✅ Colunas renomeadas (sem símbolos): **Estudo do item · Cotação e RFQ ·
  Viabilidade · Produção e Embarque · Nacionalização e Entrega**.
- ✅ Campo **`modo`** (`cotacao` | `desenvolvimento`): proforma pronta nasce em
  Viabilidade; item do zero nasce em Estudo do item. Badge do modo na operação.
- ✅ **Marcos da jornada inteira** agrupados por estágio (item pesquisado,
  fornecedores, RFQ, cotação, fornecedor selecionado, cálculo, GO, pedido,
  produção, embarque, DI, nacionalizado, entregue).
- ✅ **Drag-and-drop** de card entre colunas (mouse/trackpad) sem abrir o card.
- ✅ **Rastreio de embarque** manual (contêiner/BL/armador/navio/ETA/status) —
  colunas e serviço prontos para receber API de tracking.
- ✅ Campo **Origem** editável na operação.
- ✅ Migration aditiva e idempotente `0031`.

### Ativos (catálogo)
- ✅ Retrofit em **camadas**: Classe (macro) → Modelo → Fornecedores/preços
  (master-detail).
- ✅ Agrupamento de variações do mesmo item; **ficha técnica** ao selecionar.
- ✅ Tabela **Fornecedores e preços** (último por fornecedor, "Mais competitivo").
- ✅ Remoção do filtro de fornecedores (há ambiente dedicado) e **deduplicação de
  classes** por nome normalizado.

### Identidade visual / UX
- ✅ Header com logo + divisor + "Comércio Exterior"; ícone orbital nítido.
- ✅ Tipografia unificada (Inter) em todo o sistema.
- ✅ Skeletons corrigidos (sem blocos verdes).
- ✅ Menu Base: **Fornecedores · Ativos**; "Cadeia Global de Suprimentos".

---

## ✅ Núcleo já consolidado (anterior)
- ✅ Motor de cálculo certificado (II, IPI, PIS/COFINS, ICMS TTD 409/SC, AFRMM,
  Siscomex, despesas, margem, preço nacionalizado) — Lucro Real/Presumido/Simples.
- ✅ Geração de planilha Excel (espelho do modelo, fórmulas vivas).
- ✅ Base NCM + classificação assistida; histórico de preços por proforma.
- ✅ Operações: eventos/timeline, anexos, financeiro, GO/NO-GO, estágios/gate.
- ✅ Auth JWT + OAuth; tRPC (26+ routers); MySQL 8 + Drizzle; Docker.

---

## ⏳ Pendências registradas (aguardando decisão/insumo do usuário)
- ⏳ **APIs de tracking de embarque** (inclusive pagas) — SeaRates/ShipsGo
  (contêiner/BL) ou AISStream (posição do navio). Falta: provedor escolhido +
  chave no `.env`. Estrutura (colunas/serviço) já pronta.
- ⏳ **Camadas extras no catálogo de Ativos**: categoria / setor / aplicação
  **dentro** da classe macro (sub-navegação hierárquica).
- ⏳ **Tradução de nomes de proforma em inglês** para exibição em PT (hoje a busca
  já entende os dois idiomas; faltaria o backfill de exibição).
- ⏳ Afinar pesos/tamanhos de título página a página (estética fina).
- ⏳ Integrar mais fontes externas de preço (World Bank Pink Sheet, TradeMap).

---

## 🔜 Falta implementar (backlog priorizado)
1. **Automação do ramo Cotação e RFQ** (fluxo do "desenvolvimento do zero"):
   selecionar fornecedores → disparar RFQ a partir do histórico do chat →
   consolidar retornos → cálculo → decisão. O subsistema de RFQ já existe
   (`rfqRouter` + páginas); falta a orquestração ponta a ponta e o vínculo
   automático com os marcos da jornada.
2. **Tracking automático** (depende da pendência da API): preencher
   navio/ETA/status por contêiner/BL e refletir nos marcos de embarque.
3. **Catálogo hierárquico** (pendência): classe → categoria → subcategoria →
   aplicação, com contadores e navegação em árvore.
4. **Anexar cotação no chat → cálculo → operação** de forma 100% guiada
   (parcialmente pronto via `createFromCalculation`).
5. **Relatórios/painel executivo** de operações (custos, prazos, margem agregada).
