# SUPPLEY / Excambia — Roadmap de Status

**Data:** 12 de julho de 2026
**Produção:** calculasuppley.com.br (Docker em servidor próprio, deploy via `./redeploy.sh`)
**Documento anterior (visão estratégica):** [ROADMAP-PT.md](./ROADMAP-PT.md) — 23/06/2026

Este documento resume o que foi **concluído e validado em produção**, o que está
**pendente** e as **melhorias futuras** sugeridas, na ordem de prioridade recomendada.

---

## ✅ Concluído (validado em produção)

### Migração e Independência (base)
- Migração completa da plataforma Manus → GitHub + Docker independentes
- Autenticação própria: JWT local como padrão, OAuth opcional
- MySQL 8 em container próprio (`suppley-mysql`), migrações idempotentes via `redeploy.sh`

### Proformas / Cotações (ciclo completo)
- **Intake em escala:** upload em lote, multi-formato (PDF, imagem, Excel, docx…)
- **Extração assíncrona com polling** — imune a timeout de proxy (uploads grandes)
- **Quantidades decimais** (cotações por peso, ex.: 24,5 t) — migração 0042
- **Trava de duplicidade absoluta:** bloqueia registro 100% idêntico
  (fornecedor + moeda + data + quantidades × preços); libera quando muda
  data, quantidade ou preço; erro claro (HTTP 409) e rastro de diagnóstico nos logs
- Distribuição para operações em paralelo + UI reativa na revisão
- Arquivo recuperável (fileKey S3), itens sem preço preservados
- Leitura de volta de proformas e releitura de documentos pelo chat (Excambia)

### Motor de Cálculo
- Motor determinístico de custo de importação (II, IPI, PIS/COFINS, ICMS, AFRMM…)
- TTD Santa Catarina máximo automático
- Parametrização de benefícios fiscais de ICMS por estado
- Preço-alvo (solve reverso), balizador de compra e RFQ com target
- Cenários nacionais no chat (precificação/CMV + depreciação)
- Réplica 1:1 do modelo Excel de referência (3 abas) + PDF com extração de texto puro

### Excambia (agente IA)
- Chat com streaming (SSE), anexos em todos os formatos
- Prompt caching + medição de tokens/custo (dashboard Uso da IA)
- Feedback loop previsto × realizado + agente de qualidade de dados
- Catalogação de documentos via chat (mesma trava de duplicidade do upload)
- Repositório de anexos consultável pelo chat (`buscar_documento_operacao`)

### RFQ Semi-automatizado (cenário B)
- Fluxo humano-no-loop: envio a fornecedores + webhook de respostas por e-mail

### Operações / Fornecedores / Ativos
- Painel de Operações escalável (lista + pipeline, milhares de operações)
- Anexos abríveis, auditoria no card, níveis de acesso
- Classificação de Ativos por capítulo NCM, filtros e busca
- Setor de fornecedor com sugestão de IA

### Infraestrutura e Deploy (julho/2026)
- Deploy determinístico: `.dockerignore` (contexto 690 MB → 12 MB),
  multi-stage correto (dev deps no builder + `prune --prod` no runtime)
- Produção não importa mais `vite` (fix do crash loop no boot)
- nginx: `client_max_body_size 25m` + `proxy_read_timeout 300s`
- Workarounds documentados para docker-compose 1.29.2 (ContainerConfig / órfãos)
- Kernel atualizado (reboot), containers com auto-recovery validado

---

## 🔧 Pendências (curto prazo)

| # | Item | Esforço | Observação |
|---|------|---------|------------|
| 1 | **Limpar proformas duplicadas de teste** (PF-2026-0030 em diante) | Baixo | Ação do usuário — excluir pelos cards |
| 2 | **Alíquotas efetivas de ICMS por UF** | Médio | A parametrização de benefícios já existe; falta preencher as alíquotas efetivas de cada estado para ativar o comparativo entre UFs |
| 3 | **Ativar integração TTCE/Siscomex** | Médio | Código pronto, integração desligada — precisa validar acesso/estabilidade da API oficial |
| 4 | **Coluna "Cache (escrita)" no dashboard Uso da IA** | Baixo | Hoje só mostra leitura de cache; escrita ajuda a explicar o custo real |
| 5 | **Teste `quotations.test.ts` depende de MySQL local** | Baixo | Único teste que falha fora do Docker (215/216 verdes) — isolar com container de teste ou skip condicional |

---

## 💡 Melhorias futuras (ordem sugerida)

### Prioridade alta
1. **UX de feedback imediato nas demais telas** — o padrão de resposta
   otimista/reativa aplicado na revisão de proformas, estendido ao Painel de
   Operações e Fornecedores (percepção de velocidade)
2. **Trilha de auditoria abrangente** — registrar cada operação do agente
   (ação, entrada, saída, ferramentas, duração) com UI de timeline;
   pré-requisito para conformidade e para o aprendizado contínuo
3. **Seleção de modelo por complexidade** — rotear tarefas simples
   (classificação NCM, extrações curtas) para modelos mais baratos/rápidos;
   redução estimada de custo de 80%+ nessas operações

### Prioridade média
4. **Fluxo de aprovação humana** — checkpoints para pedidos grandes,
   fornecedores de risco e mudanças tributárias
5. **Cache de operações determinísticas** — NCM, alíquotas, câmbio
   (TTLs por tipo; hoje só há prompt caching do LLM)
6. **Notificações em tempo real** — status de operação via SSE/WebSocket
   (o chat já usa SSE; falta estender a operações)

### Prioridade baixa / visão
7. **Grafo de conhecimento + aprendizado contínuo** — histórico de
   fornecedores/produtos/cenários alimentando o contexto do agente
8. **Arquitetura multi-agente** — agentes especializados por estágio
   (demanda, sourcing, análise, execução, financeiro)
9. **Painéis avançados** — benchmarking de custo vs mercado, desempenho de
   fornecedor, previsão de demanda
10. **Marketplace / app móvel** — diferenciação de longo prazo

---

## Referências

- Visão estratégica completa e detalhamento técnico das fases: [ROADMAP-PT.md](./ROADMAP-PT.md)
- Arquitetura do agente: [ARQUITETURA-EXCAMBIA.md](./ARQUITETURA-EXCAMBIA.md)
- Operação/deploy: `redeploy.sh` (raiz do repo) e [DEPLOY_FASE2.md](./DEPLOY_FASE2.md)

---

*Mantido pelo Time de Desenvolvimento Suppley*
*Última atualização: 12 de julho de 2026*
