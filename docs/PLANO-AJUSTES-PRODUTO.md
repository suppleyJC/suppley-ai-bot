# Plano de Ação — Ajustes de Produto (Fase 0.5)

**Objetivo:** Incorporar as observações operacionais do Jean ao desenvolvimento, alinhadas ao escopo utópico (IA orquestradora, agentes segmentados, base unificada, rastreabilidade, aprovação humana).

**Data:** 23 de junho de 2026  
**Branch:** `claude/manus-migration-independent-1kfrll`

> Esta fase entra ANTES da Fase 1 (Performance) por serem ajustes de fluxo e
> cadastro que destravam o uso diário e a alimentação da base de conhecimento.

---

## Resumo das Observações

| # | Observação | Tipo | Status |
|---|-----------|------|--------|
| 1 | Unificar as 2 abas de "Fornecedores & Compradores" (a aba rica absorve a simples) | Refactor UI + dados | 🔄 Planejado |
| 2 | Login → direcionar direto para Excambia | Ajuste de fluxo | ✅ Implementado |
| 3 | Vai ter agentes em "Painel de operações" e "Base"? | Arquitetura | 📋 Respondido (abaixo) |
| 4 | Começar a cadastrar Proformas | Nova feature | 🔄 Planejado |

---

## Observação 1: Unificar "Fornecedores & Compradores"

### Situação atual
A página `Marketplace.tsx` (rota `/suppliers`) tem **duas abas** que usam tabelas e componentes diferentes:

| Aba | Componente | Tabela | Riqueza |
|-----|-----------|--------|---------|
| Fornecedores / Fabricantes | `Suppliers.tsx` | `suppliers` | Simples (nome, país, contato, notas) |
| Compradores nacionais / Setores | `Industries.tsx` | `industries` | **Completa** (stats, busca, filtros por setor/status, rating composto, incoterm, lead time, capacidade, certificações, segmento, perfil de demanda) |

### O que o Jean quer
A interface **rica** (`Industries`) deve **absorver** a aba simples (`Suppliers`). Ou seja: **uma única interface poderosa** que gerencia tanto fornecedores/fabricantes quanto compradores nacionais/setores.

### Por que faz sentido (alinhamento técnico)
A tabela `industries` **já foi desenhada para isso**:
- Campos de fornecedor: `sector`, `region`, `preferredIncoterm`, `leadTimeDays`, `productionCapacity`, `certifications`, ratings (`priceRating`, `qualityRating`, `deliveryRating`).
- Campos FASE 5 de comprador: `segmento`, `regiao`, `perfilDemanda`, `sensibilidadePreco`, `volumeEstimadoMensal`, `potencialComercial`.
- Campo de migração: `legacySupplierId` (vincula registros antigos de `suppliers`).

Falta apenas **um discriminador explícito** de tipo de entidade.

### Plano de implementação

#### Passo 1.1 — Schema (aditivo, sem quebra)
Adicionar a `drizzle/schema.ts` na tabela `industries`:
```typescript
// Discriminador: a mesma base atende fornecedores e compradores
tipoEntidade: mysqlEnum("tipoEntidade", [
  "fornecedor",   // Fornecedor / Fabricante (internacional ou nacional)
  "comprador",    // Comprador nacional / Setor (benchmark de demanda)
]).default("fornecedor").notNull(),
```
- Migração: `pnpm db:push` (campo com default, não quebra dados existentes).
- ⚠️ Requer aprovação para rodar migração (regra do CLAUDE.md).

#### Passo 1.2 — Migrar dados legados de `suppliers` → `industries`
Script único de migração (idempotente):
```typescript
// server/scripts/migrateSuppliersToIndustries.ts
// Para cada supplier sem industries.legacySupplierId correspondente:
//   inserir industries { tipoEntidade: "fornecedor", legacySupplierId: supplier.id, ... }
// Mantém a tabela suppliers intacta (rollback seguro).
```

#### Passo 1.3 — Unificar a UI
- `Marketplace.tsx`: substituir as 2 abas por **uma interface `Industries` única** com um **filtro de tipo** no topo (segmented control):
  - `[ Todos | Fornecedores/Fabricantes | Compradores/Setores ]`
- O filtro injeta `tipoEntidade` na query `industries.list`.
- O formulário "Nova Indústria" ganha um seletor de tipo (fornecedor/comprador) que mostra/esconde os campos específicos de cada um.
- `Suppliers.tsx` deixa de ser usado (mantido em disco até validação; depois removido).

#### Passo 1.4 — Router
- `industriesRouter.list` aceita `input: { tipoEntidade?: "fornecedor" | "comprador" }`.
- `industriesRouter.stats` segmenta os contadores por tipo.

#### Critérios de aceitação
- [ ] Uma única aba/interface rica gerencia fornecedores e compradores
- [ ] Filtro por tipo funciona (Todos/Fornecedores/Compradores)
- [ ] Dados antigos de `suppliers` aparecem como fornecedores
- [ ] Formulário adapta campos conforme o tipo
- [ ] Nenhum dado perdido

---

## Observação 2: Login → Excambia ✅ IMPLEMENTADO

### O que foi feito
- `client/src/pages/Login.tsx`: após login, `setLocation("/excambia")`.
- `client/src/pages/Register.tsx`: após criar conta, `setLocation("/excambia")`.
- `client/src/App.tsx`: rota raiz `/` agora renderiza `ExcambiaChat` (era `Operacoes`).

### Resultado
A Excambia é a porta de entrada do sistema — coerente com "cérebro e coração". Qualquer fluxo que caia em `/` também chega à Excambia.

---

## Observação 3: Agentes em "Painel de Operações" e "Base"?

### Resposta curta
**Sim** — mas com papéis diferentes em cada área. Hoje existe **um orquestrador único** (`runExcambia`) com ~40 ferramentas. O escopo utópico pede **agentes segmentados**. Eis o mapeamento proposto:

### Arquitetura de Agentes por Área

```
INTELIGÊNCIA
 └─ Excambia (Orquestradora)  ← coordena todos os agentes abaixo
 └─ Inteligência de Mercado   ← Agente Analista (preços, COMEX, tendências)

OPERAÇÕES
 └─ Painel de Operações       ← Agentes de EXECUÇÃO por estágio:
       • Agente de Demanda    (extrai specs, valida NCM)
       • Agente de Sourcing   (busca fornecedores, compara proformas)
       • Agente Executor      (logística, documentos, prazos)
       • Agente Financeiro    (custo nacionalizado, conformidade, aprovação humana)

BASE
 └─ Fornecedores & Compradores ← Agente de Rating/Curadoria
       (mantém ratings A/B/C/D, enriquece cadastro, detecta duplicatas)
 └─ Ativos & Insumos          ← Agente de Catálogo
       (sugere/valida NCM, compara nacional × importado)
```

### Princípio
- **Base** = agentes de **curadoria** (mantêm os dados limpos, ricos, ranqueados).
- **Operações** = agentes de **execução** (tocam o fluxo demanda→sourcing→análise→execução→financeiro).
- **Inteligência** = a **orquestradora** que aciona os demais + análise de mercado.

Isso é a materialização da Fase 4 do ROADMAP (multi-agente). Até lá, o orquestrador único simula esses papéis via filtro de ferramentas por estágio (`getToolSchemas(estagio)`).

---

## Observação 4: Cadastrar Proformas

### Contexto
"Proforma" (proforma invoice) é a cotação formal do fornecedor — documento com preços, incoterm, condições de pagamento, prazo, validade. **A base de dados já modela isso** na tabela `supplier_quotes` (campos: `totalFobCents`, `incoterm`, `paymentTerms`, `leadTimeDays`, `moq`, `validUntil`, `quotationFileUrl`, etc.) + `supplier_quote_items` (preços por item).

**O que falta:** uma interface de **cadastro de proforma** (manual e via upload/extração) desacoplada do fluxo de RFQ, para o Jean começar a alimentar a base.

### Plano de implementação

#### Passo 4.1 — Reaproveitar o modelo existente
- Usar `supplier_quotes` + `supplier_quote_items` como base da proforma.
- Tornar `rfqId` **opcional** (proforma pode ser cadastrada sem RFQ prévio):
  ```typescript
  // drizzle/rfqSchema.ts — supplier_quotes
  rfqId: int("rfqId"),  // remover .notNull() → proforma avulsa permitida
  ```
  ⚠️ Requer aprovação (alteração de schema).
- Vincular proforma a um **fornecedor** (`industries.id` com `tipoEntidade="fornecedor"`).

#### Passo 4.2 — Serviço
`server/services/proformaService.ts`:
```typescript
createProforma(userId, {
  supplierId, currency, incoterm,
  items: [{ productName, ncmCode, quantity, unit, unitPriceCents }],
  paymentTerms, leadTimeDays, validUntil, fileUrl?
})
// → grava supplier_quotes + supplier_quote_items
// → opcional: dispara Agente Financeiro p/ custo nacionalizado (importCostEngine)
listProformas(userId, { supplierId?, status? })
getProforma(id)
```

#### Passo 4.3 — Extração automática (IA)
- Reusar `quotationExtractorService.ts` + `analyzeDocument` da Excambia: upload do PDF da proforma → Claude extrai itens/preços/condições → pré-preenche o formulário (aprovação humana antes de salvar).

#### Passo 4.4 — Router + UI
- `server/routers/proformaRouter.ts` (create, list, get, update, extractFromFile) → registrar em `routers.ts`.
- `client/src/pages/Proformas.tsx` — lista + formulário de cadastro + upload.
- Menu: adicionar "Proformas" na seção **OPERAÇÕES** (ou como aba dentro do Painel de Operações).

#### Critérios de aceitação
- [ ] Cadastrar proforma manualmente (fornecedor + itens + condições)
- [ ] Cadastrar proforma via upload de PDF (extração IA + revisão)
- [ ] Listar/filtrar proformas por fornecedor e status
- [ ] Proforma vinculável a uma operação/RFQ (opcional)
- [ ] Custo nacionalizado calculado sob demanda

---

## Ordem de Execução Recomendada

| Ordem | Tarefa | Esforço | Risco | Bloqueio |
|-------|--------|---------|-------|----------|
| ✅ 1 | Login/Register/raiz → Excambia | 15 min | Baixo | — |
| 2 | Proformas (schema + service + router + UI) | ~12h | Médio | Aprovar `rfqId` opcional |
| 3 | Unificar Fornecedores & Compradores | ~10h | Médio | Aprovar campo `tipoEntidade` + migração |
| 4 | Agentes segmentados por área (Fase 4) | ~40h | Alto | Depende de Fase 1 (multi-modelo) |

### Decisões que precisam do Jean antes de codar
1. **Schema**: posso adicionar `tipoEntidade` em `industries` e tornar `rfqId` opcional em `supplier_quotes` e rodar `pnpm db:push`? (alterações aditivas, sem perda de dados)
2. **Proformas no menu**: página própria em "Operações" ou aba dentro do "Painel de Operações"?
3. **Migração de `suppliers`**: migrar registros antigos para `industries` agora ou manter as duas tabelas em paralelo durante transição?

---

## Alinhamento com o Escopo Utópico

| Pilar utópico | Como estas tarefas contribuem |
|---------------|------------------------------|
| Base histórica | Proformas + base unificada = histórico real para a IA aprender |
| IA orquestradora | Login→Excambia coloca a orquestradora no centro do uso |
| Agentes segmentados | Mapa de agentes por área (Obs. 3) é o blueprint da Fase 4 |
| Cálculos determinísticos | Custo nacionalizado da proforma via motor certificado |
| Aprovação humana | Extração de proforma com revisão antes de salvar |
| Rastreabilidade | Proforma → operação → importação (cadeia auditável) |

---

*Documento mantido pelo Time de Desenvolvimento Suppley*  
*Próximo passo: aprovar as 3 decisões acima para iniciar Proformas e Unificação.*
