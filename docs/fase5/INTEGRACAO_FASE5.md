# FASE 5 — Guia de integração por etapas
### Para aplicar no seu ritmo. Cada fatia é independente e aditiva. Branch isolada.

> **Princípio:** a Fase 5 reorganiza e amplia o que existe — não recria. Tudo é aditivo
> (renomear rótulos, ADD COLUMN, CREATE TABLE, registrar tools). Nenhum DROP, nenhuma
> reescrita de core. Coeso com a camada agêntica (agentes = tools que a Excambia aciona).

> **Pré-requisito:** camada agêntica (`server/agent/`) já aplicada. Os agentes da Fase 5
> entram como tools nela.

---

## ARQUIVOS DO PACOTE (por fatia)

```
Fatia 1 — client/src/lib/fase5Labels.ts                  # menu, selos, tipos
Fatia 2 — drizzle/schema.fase5.ts                        # colunas + tabelas novas
Fatia 3 — server/agent/pipeline/ingestao.ts              # pipeline de ingestão
Fatia 4 — server/agent/tools/agentesFase5.ts             # os agentes (tools)
Fatia 5 — server/agent/tools/inteligenciaMercado.ts      # providers externos
Router  — server/routers/fase5Router.ts                  # liga tudo à UI
```

---

## ETAPA 1 — Renomeações + menu (Fatia 1) · risco BAIXO
- [ ] Copiar `fase5Labels.ts` para `client/src/lib/`.
- [ ] No `DashboardLayout.tsx`, montar a sidebar a partir de `MENU_STRUCTURE`.
- [ ] Aplicar os rótulos: "Ativos & Insumos", "Fornecedores / Fabricantes".
- [ ] Mover "Indústrias / Clientes" da Base → sub-item de Inteligência de Mercado
      como "Compradores nacionais / Setores" (rota interna pode permanecer).
- [ ] **Não renomear rotas/tabelas internas** — só rótulos. Evita quebra.
- [ ] Validar: menu novo aparece, navegação funciona.

## ETAPA 2 — Modelo de dados (Fatia 2) · risco MÉDIO (migração)
- [ ] Colar `productsFase5Columns` na tabela `products` do `schema.ts`.
- [ ] Colar `suppliersFase5Columns` na tabela `suppliers`.
- [ ] Colar `industriesFase5Columns` na tabela `industries`.
- [ ] Adicionar as tabelas novas: `ativoPrecos`, `ativoFornecedor`,
      `fornecedorOcorrencias`, `fase5Documentos`.
- [ ] `pnpm drizzle-kit generate && pnpm drizzle-kit push` (backup antes).
- [ ] Tudo ADD/CREATE — nenhum DROP. Conferir a migração gerada antes de aplicar.

## ETAPA 3 — Pipeline de ingestão (Fatia 3) · o coração
- [ ] Copiar `ingestao.ts` para `server/agent/pipeline/`.
- [ ] Copiar `agentesFase5.ts` para `server/agent/tools/`.
- [ ] Implementar os TODOs dos agentes, ancorando nos serviços existentes:
      - `agenteDocumental` → `quotationExtractorService` (ampliar p/ proforma/invoice).
      - `agenteFiscalNcm` → `ncmService`.
      - `agentePreditivo` → `predictiveAnalysisService`.
- [ ] Começar por UM tipo de documento (proforma) e UM caminho feliz. Expandir depois.
- [ ] **Revisão humana é obrigatória:** o pipeline só PROPÕE; `gravarAprovado` é que escreve.

## ETAPA 4 — Router + UI de revisão (Router) · liga à interface
- [ ] Copiar `fase5Router.ts` para `server/routers/`; registrar em `routers.ts`.
- [ ] Construir a tela de revisão: mostra a proposta (itens/fornecedores/preços/NCM),
      destaca alertas de qualidade e baixa confiança, permite editar, e aprova.
- [ ] Dois pontos de entrada de upload (Excambia e ambientes) chamam `fase5.ingerir`.

## ETAPA 5 — Inteligência de Mercado (Fatia 5) · dados externos
- [ ] Copiar `inteligenciaMercado.ts` para `server/agent/tools/`.
- [ ] Implementar `bcbProvider` (câmbio, já temos) e `comexProvider` (já temos).
- [ ] Bloomberg: deixar plugável; só ativa com `BLOOMBERG_API_KEY`. **Não bloquear por ele.**
- [ ] Construir os sub-painéis de Inteligência de Mercado (câmbio, commodities,
      tendências, compradores/setores, benchmark, preditiva).

---

## ORDEM RECOMENDADA
1 → 2 → 3 → 4 → 5. As etapas 1 e 2 destravam tudo (vocabulário + bases).
A 3 é o coração (ingestão). A 4 dá a cara (revisão). A 5 é o diferencial de inteligência.

---

## COESÃO COM A EXCAMBIA (não esquecer)
- Cada agente da Fase 5 é registrado como **tool** no `server/agent/tools/index.ts`,
  para a Excambia poder acioná-los na conversa (ex.: "analise esta proforma").
- As buscas (`buscarAtivo`, `compararOrigem`) viram tools de leitura → respondem as
  consultas em linguagem natural.
- Todo dado extraído entra como **sugestão + confiança**; humano aprova. NCM nunca
  vira "validado" sozinho. Alíquota só do motor determinístico.

---

## RISCOS (honestidade)
- **Maior fase até aqui** — fatiar é obrigatório; não tentar tudo junto.
- **Extração de PDF/planilha é imperfeita** — revisão humana e Agente de Qualidade
  desde o início, senão lixo vira lixo estruturado.
- **Bloomberg é caro/licenciado** — plugável, não pré-requisito.
- **Valor cresce com volume** — base pequena = benchmark fraco. Expectativa: começa
  modesto, melhora com uso.
- **schema.ts em alto conflito** com a outra IA — coordenar, branch isolada.
- **Os agentes têm muitos TODOs** — este pacote é o ESQUELETO estrutural correto;
  a implementação de cada extração/classificação é trabalho incremental real.
```
