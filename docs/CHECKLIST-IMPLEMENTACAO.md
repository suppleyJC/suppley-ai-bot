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
- ⏳ **"Parâmetros de Cálculo" — sofisticação + layout**: refinar a página de
  parâmetros do motor (alíquotas, taxas fixas, regimes, despesas) com camadas
  mais claras, edição assistida e visual à altura do resto do sistema. Hoje
  vários parâmetros vivem como constantes no código (ver gaps fiscais abaixo);
  o objetivo é torná-los visíveis, versionáveis e editáveis com segurança.
- ⏳ **APIs de tracking de embarque** (inclusive pagas) — SeaRates/ShipsGo
  (contêiner/BL) ou AISStream (posição do navio). Falta: provedor escolhido +
  chave no `.env`. Estrutura (colunas/serviço) já pronta.
- ⏳ **Camadas extras no catálogo de Ativos**: categoria / setor / aplicação
  **dentro** da classe macro (sub-navegação hierárquica).
- ⏳ **Tradução de nomes de proforma em inglês** para exibição em PT (hoje a busca
  já entende os dois idiomas; faltaria o backfill de exibição).
- ⏳ Afinar pesos/tamanhos de título página a página (estética fina).
- ⏳ Integrar mais fontes externas de preço (World Bank Pink Sheet, TradeMap).

### ✅ Parâmetros de Cálculo — Fases 1–2 entregues (2026-06-29)
- ✅ **Fundação versionada** (`tax_parameters`, `port_costs`, `ncm_exceptions`) +
  migração `0032` (tabelas + seed idempotente). Benefícios nacionais semeados,
  incluindo **Mercosul** (livre comércio intrazona) e **ALADI/ACE**.
- ✅ **Motor lê do banco**: PIS/COFINS/AFRMM/Siscomex de `tax_parameters` (fallback
  p/ constantes); **ex-tarifário** aplicado por NCM; **Mercosul** por país de
  origem (II preferencial com Certificado de Origem) no motor certificado.
- ✅ **Custos portuários DB-first** (`port_costs`) no `portsRouter`; planilha
  corrigida (Siscomex R$214,50 → R$185).

### ⏳ Parâmetros de Cálculo — Fases seguintes
- ⏳ **Fase 3 — Comparador de rotas de importação (PENDÊNCIA)**: DIFAL, ICMS-ST e
  precificação multi-estado **já existem** (`statePricingService`). Falta o
  **comparador de rotas** (genérico por estado): importar via estado-hub com
  benefício → transferência interestadual (4%) → DIFAL no destino, vs. importação
  direta. ⚠️ Premissas fiscais a validar com contador antes de codar.
- ✅ **Fase 4 — Página "Parâmetros de Cálculo"** (`/parametros`): UI em 4 abas
  (tributos & taxas · custos portuários · ex-tarifário · benefícios), edição
  versionada de tributos e CRUD de portos/ex-tarifário/benefícios.
- ✅ **Fase 5 — Memória/preferências da Excambia**: a tabela existia mas estava
  morta — agora o orquestrador **lê** a memória (injeta no system prompt) e a
  Excambia **escreve** via a ferramenta `registrar_memoria` (preferências, regras,
  padrões). Camada barata de aprendizado (contexto persistido + reinjetado, sem
  fine-tuning).
- ✅ **UI de memória**: aba **"Memória da Excambia"** dentro de *Inteligência de
  mercado* (ao lado de Comex Stat); o usuário vê, adiciona, edita e remove os
  aprendizados (agrupados por tipo, com importância); itens gravados pela IA são
  sinalizados. Backend ganhou editar/excluir escopados por usuário. (Rota direta
  `/memoria` mantida como atalho.)

### ⏳ Domínio tributário/fiscal — gaps mapeados (auditoria de 2026-06-29)
> O núcleo do motor está **sólido e correto** (II, IPI, PIS/COFINS, ICMS, AFRMM,
> Siscomex, TTD 409/SC em 2 fases, 3 regimes, NCM com 10.521 códigos do TIPI,
> ICMS dos 27 estados). Os itens abaixo são lacunas de **dados/governança**, não
> de motor. Boa parte se resolve junto com a página "Parâmetros de Cálculo".
- ⏳ **`fiscal_benefits` vazia (0 linhas)**: tabela existe (TTD, drawback, RECOF,
  SUDENE/SUDAM, suspensões setoriais) mas não há seed. Hoje só o TTD 409/SC é
  tratado, via flag em `icms_rates`. Falta popular o registro de benefícios.
- ⏳ **Ex-Tarifário (`ncm_exceptions`) inexistente**: não há tabela nem
  rastreio de reduções/suspensões temporárias de alíquota por NCM.
- ⏳ **Alíquotas fixas no código** (PIS 2,1% / COFINS 10,25% / AFRMM 25% /
  Siscomex) **sem versionamento por data de vigência**. Migrar para tabela com
  `effective_date` para auditoria e backtest — base da página de Parâmetros.
- ⏳ **Custos portuários e taxas aduaneiras hardcoded** (`shared/ports.ts`, 24
  terminais) — sem tabela/atualização versionada.
- ⏳ **Inconsistência de Siscomex**: `ports.ts` usa R$ 214,50 + R$ 107/adição e o
  motor usa R$ 185,00 + R$ 29,50/adição. O motor é a fonte vigente; alinhar.
- ⏳ **Frete internacional 100% manual** — sem estimativa/benchmark por rota.
- ⏳ **DIFAL / ICMS-ST**: campos existem no schema, mas não estão integrados ao
  motor (todos os estados tratados de forma uniforme na importação).
- ⏳ **Reforma 2027+**: timeline CBS/IBS/Imposto Seletivo implementada, porém as
  alíquotas de 2027 em diante são estimativas (aguardando detalhes da LC 214/2025).
- 📁 **Repositório de legislação (arquivos)**: hoje a Excambia **não** consome
  PDFs de leis — não há RAG/embeddings. Ela consulta dados estruturados (base +
  Comex Stat + Comtrade + BCB/FRED) e faz **web search nativo** para textos
  legais. Anexar a legislação como base documental seria um projeto novo (ver
  análise no overview); decisão pendente.

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
