# STATUS — SUPPLEY AI Bot

**Branch:** `claude/manus-migration-independent-1kfrll`
**Última atualização:** 2026-06-25
**Ambiente:** Produção (`calculasupley.com.br`) — ✅ no ar

---

## ✅ Implementado e em produção

### 0. Classificação de Produtos & Melhorias Excambia (Sprint 3)

- [x] **Sistema de classificação escalonável de produtos**
  - Adicionadas 4 colunas à tabela `products`:
    - `classe`: família operacional (Fixadores, Escoramento, EPI, etc.)
    - `criticidade`: impacto de suprimento (alta/media/baixa)
    - `subcategoria`: segundo nível hierárquico sob `categoria`
    - `tags`: sistema flexível de etiquetas (JSON)
  - Migração `0030` idempotente aplicada com `information_schema` guards
  - Arquivo: `drizzle/0030_add_classification_to_products.sql`
- [x] **Página de Produtos redesenhada**
  - Barra de busca por nome/NCM/classe/categoria/fornecedor/tags
  - Filtros por classe e criticidade (dinâmicos)
  - Cards redesenhados com:
    - Preço mais recente derivado de proformas (supplier + unitPrice + currency + quotationDate)
    - Nome do fornecedor com ícone Building2
    - Badges de classificação (classe, categoria › subcategoria)
    - Tags display (primeiras 4 com "+N mais")
    - Badge de criticidade com cores (alta=red, media=amber, baixa=emerald)
    - Formato/unidade do produto
  - Formulário de criação/edição com todos os campos de classificação
  - Responsivo: `md:grid-cols-2 lg:grid-cols-3`
  - Arquivo: `client/src/pages/Products.tsx` (~900 linhas)
- [x] **Excambia — Anexos de arquivo (PDF/imagem)**
  - Usuário pode anexar PDF ou imagem ao enviar mensagem
  - Arquivo é lido em base64 e enviado ao agente como conteúdo multimodal
  - Bloco `MessageContent`: type="document" para PDF, type="image" para imagens
  - Fallback gracioso: erro no upload não derruba a conversa
  - Marca no histórico: `📎 {nome_arquivo}`
  - Arquivos: `server/routers/conversasRouter.ts`, `client/src/pages/ExcambiaChat.tsx`
- [x] **Excambia — Otimização da UI (mensagens otimistas + sidebar fluida)**
  - Mensagem do usuário aparece imediatamente (otimistic UI)
  - Resposta do agente carrega enquanto a mensagem está sendo processada
  - Rollback automático com toast se falhar
  - Sidebar: headers sticky (`sticky top-0 z-10`) para scroll fluido
  - Chat routes em full-bleed layout (sem padding)
  - Arquivo: `client/src/pages/ExcambiaChat.tsx`, `client/src/components/excambia/ConversationPanel.tsx`
- [x] **Backend: enriquecimento de produtos com preço mais recente**
  - `products.list` agora retorna `latestPrice` derivado de `proformas`
  - Agrupa por `normalizeProductName()` para lidar com variantes
  - Retorna: `{ unitPriceCents, currency, quotationDate, supplierName }`
  - Arquivo: `server/routers/productsRouter.ts`
- [x] **Migração `0030` e `redeploy.sh` atualizados**
  - Adicionada à lista `IDEMPOTENT_MIGRATIONS` para rodar automaticamente em deploys

### 1. Histórico & Evolução de Preços (Sprint 2)

- [x] **Extração da data da cotação (`quotationDate`)** do PDF via IA
  - Campo `quotationDate` adicionado à tabela `proformas` (migração `0027`)
  - LLM extrai a data em formato ISO 8601 (best-effort; `null` se não encontrar)
  - Fallback para `createdAt` quando a data não é extraída
  - Arquivos: `server/services/proformaService.ts`, `drizzle/schema.ts`
- [x] **Métricas cronológicas derivadas das proformas** (fonte de verdade)
  - `getProductPriceHistory()` — evolução de um produto entre **todos** os fornecedores
  - `getSupplierCatalog()` — catálogo do fornecedor com timelines por produto (ramificação)
  - Arquivo: `server/services/proformaPriceHistoryService.ts`
- [x] **Custo nacionalizado estimado ("posto no Brasil à época")**
  - Usa câmbio histórico (`getExchangeRateAtDate`) + motor de cálculo certificado (`calculateEstimativa`)
  - Calcula markup % do custo nacionalizado sobre o FOB em BRL
  - Arquivos: `server/db/exchangeDb.ts`, `proformaPriceHistoryService.ts`
- [x] **Endpoints tRPC**
  - `proforma.productPriceHistory` (por produto)
  - `proforma.supplierCatalog` (por fornecedor)
  - Arquivo: `server/routers/proformaRouter.ts`
- [x] **Visualizações no frontend**
  - Componente reutilizável `PriceHistoryView.tsx` (gráfico de linhas + tabela detalhada)
  - Gráfico com 2 séries: FOB em BRL (roxo) e custo nacionalizado estimado (âmbar tracejado)
  - Aba "Histórico de Preços" em `IndustryDetail.tsx` (catálogo do fornecedor)
  - Botão "Histórico" em `Products.tsx` (evolução por produto)
- [x] **Migração `0027` aplicada em produção** (coluna `quotationDate` confirmada no banco)

### 2. Tradução de Produtos + Sugestão de NCM (commit `5f41daf`)

> **Nota:** o "erro" relatado anteriormente era o problema de deploy/502 (container órfão), **não** um bug desta feature. O código está rodando em produção.

- [x] **Tradução automática do nome do produto** para PT-BR na extração
  - Preserva medidas/especificações técnicas; usa terminologia comercial brasileira
  - Nome original mantido em `productNameOriginal`
  - Feito na mesma chamada de LLM (sem custo adicional)
  - Frontend mostra o nome original como dica sob o campo Produto
- [x] **Sugestão automática de NCM** para itens sem código
  - Classifica via motor certificado (`suggestNCMBatch`) no banco real de NCMs
  - Best-effort: se falhar, o item segue sem NCM (não derruba a extração)
  - Frontend mostra "Sugerida · X% — confirme" (guardrail de confirmação humana)
  - Alterar a NCM manualmente limpa a flag de sugestão

### 3. Infraestrutura / Deploy

- [x] Site recuperado do **502 Bad Gateway** (container órfão do bug docker-compose 1.29.2 removido)
- [x] Procedimento de aplicação de migração documentado (`DEPLOYMENT_GUIDE.md`)
- [x] Migração `0027` tornada idempotente e compatível com MySQL 8.0 (commit `536fd59`)

---

## 🔴 Pendências

### P1 — Segurança do banco de dados (PRIORIDADE)

- [ ] **Trocar a senha do MySQL** (atualmente é o default fraco `changeme`)
  - O `.env` não define `DB_PASSWORD`, então o compose usa `${DB_PASSWORD:-changeme}`
  - Definir `DB_PASSWORD=<senha_forte>` no `.env`, atualizar o usuário no MySQL e recriar containers
  - **Procedimento seguro de troca ainda precisa ser executado** (sem perda de dados)
- [ ] **Remover variável obsoleta `MYSQL_PASSWORD` do `.env`**
  - O valor (`SuppleyDb2024`) vazou no terminal durante o troubleshooting e não é usado pelo app
  - Recomenda-se limpar/rotacionar
- [ ] **Padronizar credenciais no `.env`**
  - Hoje há ambiguidade: `MYSQL_PASSWORD` e `DATABASE_URL` (host `127.0.0.1`) no `.env` **não** são os que o app usa
  - O app usa `DB_USER`/`DB_PASSWORD`/`DB_NAME` via `docker-compose.yml` (host `db`)
  - Consolidar para evitar confusão em deploys futuros

### P2 — Robustez do Deploy

- [ ] **Resolver o bug do docker-compose 1.29.2** (`ContainerConfig` KeyError)
  - Hoje o workaround é manual: `docker rm -f suppley-ai-bot` antes do `up`
  - Opções: atualizar para Docker Compose v2 (`docker compose`), ou script de deploy que já faz o `rm -f`
- [ ] **Criar script de deploy idempotente** (`deploy.sh`)
  - Encadear: `git pull` → `rm -f` container → `up --build` → aplicar migrações pendentes → restart
  - Aplicar migrações usando as credenciais reais do app (evitar a confusão de senha que tivemos)
- [ ] **Configurar `OAUTH_SERVER_URL`** (ou silenciar o aviso)
  - Hoje o boot loga `[OAuth] ERROR: OAUTH_SERVER_URL is not configured`
  - Não impede o funcionamento (usa JWT local), mas polui o log — decidir se OAuth será usado

### P3 — Limitações conhecidas do Custo Nacionalizado (a refinar)

- [ ] **Alíquotas históricas**: hoje o cálculo usa as alíquotas **atuais** (não há tabela histórica de alíquotas)
- [ ] **Destino fixo**: usa SC como estado de destino padrão
- [ ] **Sem frete/seguro**: estimativa é FOB-pura (não inclui frete internacional nem seguro)
- [ ] Avaliar se essas simplificações são aceitáveis ou se precisam de parametrização

### P4 — Melhorias futuras (backlog)

- [ ] Filtros de período (data inicial/final) nas visualizações de histórico
- [ ] Exportação do histórico de preços (CSV/Excel)
- [ ] Alerta de variação de preço acima de um limite (ex.: reajuste > X%)
- [ ] Comparação lado a lado de fornecedores para o mesmo produto
- [ ] Otimização do chunk do `recharts` no build (hoje gera warning de tamanho)

---

## 📋 Commits relevantes (mais recente → mais antigo)

| Commit | Descrição |
|--------|-----------|
| `cfb157b` | feat(ativos+excambia): catálogo classificável e chat com anexos |
| `b077895` | feat(proforma): split product into short variant name + full specs |
| `8c95dc0` | fix(proforma): widen productName column + implement draft editing |
| `b52168b` | feat(nav): use brand orbital icon for Excambia in main sidebar |
| `500ca18` | chore(deploy): add idempotent redeploy script with orphan-container workaround |
| `536fd59` | fix(migration): índice idempotente compatível com MySQL 8.0 |
| `be5afad` | docs: guia de deploy do histórico de preços |
| `a47e4ba` | db(migration): coluna `quotationDate` na tabela proformas |
| `f555cc0` | feat(price-history): visualizações de evolução de preço |
| `cdebcc0` | feat(price-history): métricas cronológicas derivadas das proformas |

---

## 🧪 Validação (último estado pós-Sprint 3)

- ✅ `pnpm check` — 0 erros de TypeScript
- ✅ `pnpm build` — build de produção OK (warning de chunk do recharts)
- ✅ `pnpm test` — 149/150 passando (1 falha environmental: `quotations.test.ts`, conexão DB em testes)
- ✅ Migração `0030` adicionada ao script de deploy idempotente
- ✅ Deployment em produção bem-sucedido (HTTP 200)
- ✅ Migrações `0025`, `0027`, `0028`, `0029`, `0030` confirmadas no banco
- ✅ Site no ar com novas features funcionando
- ✅ Últimas alterações commitadas: `cfb157b` (feat: catálogo classificável + chat com anexos)
