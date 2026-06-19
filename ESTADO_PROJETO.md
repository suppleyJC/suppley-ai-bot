# Estado do Projeto — SUPPLEY AI Bot

> Documento-síntese do estado atual da plataforma. Serve como ponto de retomada
> entre sessões: o que está pronto, o que está em andamento e o que falta.
>
> **Última atualização:** 2026-06-19 (Fase 1 concluída, Fase 2 iniciada)
> **Branch de trabalho:** `claude/manus-migration-independent-1kfrll`
> **Versão:** 2.1.0

---

## 1. Visão geral

**SUPPLEY AI Bot** é um sistema independente de otimização de cadeia de
suprimentos / comércio exterior, com a **Excambia** (IA orquestradora agêntica)
no centro. Migrado da plataforma Manus para infraestrutura própria (GitHub +
Docker), está em produção em `calculasuppley.com.br`.

**Stack:** React 19 + Node.js/Express + tRPC + MySQL 8 + Drizzle ORM + LangChain.

| Camada | Tecnologia | Local |
|---|---|---|
| Frontend | React 19, Wouter, TanStack Query, Tailwind | `client/src/` (30 páginas) |
| API | tRPC | `server/routers/` (26 routers) |
| Serviços | TypeScript | `server/services/` |
| Banco | MySQL 8 + Drizzle | `drizzle/schema.ts`, `server/db/` |
| Agente | Orquestrador + tools | `server/agent/` |

---

## 2. O que está PRONTO

### Núcleo de comércio exterior
- ✅ **Motor de cálculo certificado** de custo de importação (`importCostEngine` +
  `estimativaService`) — II, IPI, PIS/COFINS importação, ICMS (TTD 409/SC),
  AFRMM, Siscomex, despesas locais, margem e preço nacionalizado.
- ✅ **Regimes tributários:** Lucro Real, Lucro Presumido, Simples Nacional.
- ✅ **Legislação 2026:** LC 224/2025 (COFINS), Res. Senado 13/2012 (ICMS 4%).

### Base de NCM
- ✅ **10.515 NCMs** de 8 dígitos carregados (Siscomex).
- ✅ **Alíquotas reais** de II (TEC) e IPI (TIPI) por NCM.
- ✅ **Seed oficial MDIC** com elevações temporárias (DCC) — `scripts/build_ncm_seed.py`.
- ✅ **Endpoint de diagnóstico** (`ncm.diagnose`) + página `/diagnostics`.

### Camada agêntica (Excambia)
- ✅ **Orquestrador** (`server/agent/orchestrator.ts`) com filtro de tools por estágio.
- ✅ **Guardrails** (`server/agent/guardrails/`) e **evals** (`server/agent/evals/`).
- ✅ **3 tools implementadas:**
  - `montar_calculo` (analyze) → `estimativaService`
  - `classificar_ncm` (demand, analyze) → `ncmService`
  - `comparar_cotacoes` (analyze) → `priceComparisonService`

### Painel de Operações (esteira)
- ✅ **Modelo de domínio:** `operacoes`, `operacao_eventos`, `operacao_estagios`, `demandas`.
- ✅ **5 estágios internos:** `demand → source → analyze → execute → finance` (+ `closed`/`lost`).
- ✅ **Serviço** (`operacaoService.ts`): criar, avançar estágio (com gate),
  GO/NO-GO, vincular cotação/cálculo, linha do tempo de eventos.
- ✅ **Frontend:** Kanban (`Operacoes.tsx`), detalhe (`OperacaoDetail.tsx`),
  timeline (`OperacaoTimeline.tsx`).

### Outros módulos
- ✅ RFQ, fornecedores, cotações, extração de PDF de cotação.
- ✅ Inteligência de Mercado (Motor V2 / Comex Stat).
- ✅ Câmbio (`exchangeService`), mensageria, indústrias/clientes.
- ✅ Autenticação JWT local (OAuth opcional).

---

## 3. Em ANDAMENTO / Pendências conhecidas

### 3.1 NCM 7308.40.00 — alíquota II 25% (DCC) — **VALIDAÇÃO PENDENTE**
- **Contexto:** o Simulador da Receita mostra **II 25%** (elevação DCC via
  Res. GECEX 740, vigente até **2026-06-23**), mas a app mostrava **14% "estimada"**.
- **Causa-raiz:** o seed inicial foi gerado de um Excel incompleto (sem o Anexo IX/DCC),
  então o NCM caiu no default do capítulo 73 (14%).
- **Correção aplicada:** `data/ncm_fix_73084000.sql.gz` (II = 2500 bp / 25%).
  Banco de produção **já confirmado com 2500** (`SELECT` retornou `73084000 | 2500`).
- ⏳ **Falta validar:** rodar um **cálculo real** (não o chat) para confirmar que a
  app lê o novo valor. O chat da Excambia respondeu de memória ("NCM não cadastrado"),
  o que **não reflete** o cálculo certificado — é preciso testar pela aba de cálculo.
- ⚠️ **Atenção:** se a elevação DCC não for renovada, em **2026-06-23** o aço volta a ~12,6%.
  Re-rodar `build_ncm_seed.py` com o xlsx atualizado quando houver mudança da CAMEX.

### 3.2 Redesenho do Painel de Operações — **FASE 1 COMPLETA / FASE 2 EM ANDAMENTO**
Pacote recebido (`SPEC_PAINEL.md` + `INSTRUCOES_PAINEL.md`), 9 comandos.
Princípio: **Painel e Excambia chamam o MESMO serviço e gravam o MESMO evento**
em `operacao_eventos` (timeline = fonte de verdade).

| # | Comando | Tipo | Status |
|---|---|---|---|
| 1 | `STAGE_LABELS` (Câmbio sai de coluna → "Nacionalização/Entrega") | Frontend (risco zero) | ✅ Completo — stageLabels.ts criado, Operacoes.tsx e OperacaoTimeline.tsx atualizados |
| 2 | Campos novos da Demanda (`prioridade`, `prazoDesejado`, `responsavelId`, `origemDesejada`) | Migração aditiva | ✅ Completo — schema + migration 0020 + service/router/frontend (commits `3fc8721`, `a2b3353`). ⏳ Falta aplicar a migration em produção |
| 3 | Tabela `operacao_anexos` | Migração nova | ⬜ |
| 4 | Tabela `operacao_financeiro` (camada transversal) | Migração nova | ⬜ |
| 5 | Serviços compartilhados: `registrarMarco`, `anexarDocumento`, `lancarFinanceiro` | Backend | ⬜ |
| 6 | 5 tools novas da Excambia (`enviar_rfq`, `registrar_cotacao`, `registrar_marco_producao`, `registrar_nacionalizacao`, `lancar_financeiro`) | Backend | ⬜ |
| 7 | Vocabulário único de eventos (ampliar enum `operacao_eventos.tipo`) | Migração aditiva | ⬜ |
| 8 | Câmbio como transversal (card "Câmbio do dia" em Inteligência de Mercado) | Frontend | ⬜ |
| 9 | Validar coesão (mesma ação no Painel e na Excambia gera o mesmo evento) | Teste | ⬜ |

**Nova nomenclatura das etapas (rótulos UI; códigos internos inalterados):**

| Rótulo UI novo | Código interno | Era antes |
|---|---|---|
| Demanda | `demand` | Demanda |
| Sourcing / RFQ | `source` | Fornecedores |
| Viabilidade | `analyze` | Viabilidade |
| Produção / Embarque | `execute` | Operação |
| Nacionalização / Entrega | `finance` | Câmbio |

> **Decisão pendente do usuário:** escopo (tudo de uma vez × incremental × só o seguro)
> e quem aplica as migrações de banco. Eu não tenho acesso ao Docker/DB de produção
> desta sessão — defino schema e gero SQL, mas o `drizzle-kit push` roda no servidor.

---

## 4. Como atualizar alíquotas de NCM (procedimento)

Quando a CAMEX/MDIC mudar alíquotas:

```bash
# 1. Baixar o xlsx novo das Tarifas Vigentes (Anexos I–X) em gov.br/mdic
# 2. Gerar o seed (consolida TEC + aplicada + DCC, prioridade DCC > aplicada > TEC)
python3 scripts/build_ncm_seed.py /caminho/tec_vigente.xlsx
# 3. Carregar no banco (idempotente: ON DUPLICATE KEY UPDATE de iiRate + notes)
bash scripts/load-ncm.sh
# 4. Limpar cache da app ou reiniciar
docker restart suppley-app
```

> **Importante:** o `build_ncm_seed.py` SÓ aplica a elevação DCC se o xlsx contiver
> o **Anexo IX**. Sem ele, o NCM cai no default do capítulo (foi o bug do 7308.40.00).

---

## 5. Convenções e restrições (resumo do CLAUDE.md)

- **Schema (Drizzle):** mudanças exigem confirmação; migrações aditivas preferidas;
  `schema.ts` é arquivo de alto conflito (coordenar com outra IA).
- **Banco:** MySQL 8 apenas. Não trocar para PostgreSQL.
- **Sem vendor lock-in:** não readicionar dependências do Manus.
- **Antes de commitar:** `pnpm check` (TS), `pnpm test`, `pnpm build` verdes.
- **Branches:** `main` (produção, nunca commit direto), `development`, `claude/*`.
- **Segurança:** nunca logar JWT, nunca expor `JWT_SECRET`, `.env` sempre gitignore'd.

---

## 6. Próximos passos sugeridos

1. ✅ **FASE 1 finalizado** — COMANDO 1 (stageLabels) completo e commitado.
2. ✅ **COMANDO 2 finalizado** — schema + migration 0020 + service (`createOperacao`/`updateOperacao`) + router (`update`) + frontend (`priorityLabels.ts`, badge no kanban, barra editável no detalhe).
   - ⏳ **Única pendência:** aplicar a migration `0020_operacoes_fase2_fields.sql` no banco de produção.
3. **COMANDO 3+ Próximos** — tabelas novas (`operacao_anexos`, `operacao_financeiro`) e integração com Excambia.
4. **Validar o cálculo real** do NCM 7308.40.00 (II 25%) pela aba de cálculo (pendente desde antes).

---

**Mantido por:** Suppley Development Team · gerado com Claude Code
