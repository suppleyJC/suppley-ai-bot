# Excambia — Roadmap de Inteligência

> A Excambia é a IA coordenadora da plataforma: especialista em comércio exterior,
> capaz de orientar do primeiro-importador ao despachante aduaneiro, com motor
> analítico próprio e conhecimento regulatório profundo e dinâmico.

Este documento é o mapa vivo da evolução. Status: ✅ entregue · 🔨 parcial · ⬜ planejado.

---

## Pilar 1 — Exploração máxima da API Anthropic

| Capacidade | Status | Onde |
|---|---|---|
| Function calling autônomo (~30 tools, loop multi-turno) | ✅ | `orchestrator.ts` |
| Prompt caching (tools + system, ~0,1x na releitura) | ✅ | `_core/llm.ts` |
| Pesquisa web nativa (legislação, câmbio, commodities, com citações) | ✅ | `_core/llm.ts` (`webSearch`) |
| Roteamento por complexidade (Haiku/Sonnet/Opus) | ✅ | `MODELS` em `_core/llm.ts` |
| Saída estruturada (schema → tool forçada) | ✅ | `_core/llm.ts` |
| **Extended thinking (cadeia de pensamento) adaptativo** | ✅ | `thinking` em `invokeLLM`; heurística `precisaRaciocinioProfundo` |
| **Interleaved thinking (raciocinar ENTRE tools)** | ✅ | header beta quando thinking+tools |
| **System prompt dinâmico por perfil do usuário** | ✅ | `PERFIL ATIVO` em `buildSystemContent` |
| **Gestão de contexto (compactação de histórico via Haiku)** | ✅ | `compactarHistorico` |
| Streaming token a token da resposta final | ⬜ | hoje: typewriter no client |
| Batch API p/ análises em massa (ex.: reprecificar catálogo inteiro) | ⬜ | candidato p/ jobs noturnos |
| Vision para conferência documental (foto de contêiner/lacre/avaria) | 🔨 | PDF/imagem já entram no chat; falta fluxo de conferência |

## Pilar 2 — Motor analítico, matemático e preditivo

| Capacidade | Status | Onde |
|---|---|---|
| Motor fiscal certificado (custo nacionalizado, CMV, margem) | ✅ | `montar_calculo` |
| Solve reverso / target pricing (FOB-alvo a partir do preço de venda) | ✅ | `precoVendaAlvoBrl` no motor |
| Referência de preço em cascata (base → Comex Stat → Comtrade → web) | ✅ | `precificar_referencia` |
| Benchmark oficial por NCM (preço médio, origens, tendência) | ✅ | `estatisticas_comex` |
| Timing de compra (câmbio BCB + commodities FRED → janela) | ✅ | `analise_mercado` |
| **Mapa do mercado global de suprimento (líderes + emergentes + US$/kg por país, correlacionado com origens BR)** | ✅ | `mapear_mercado_global` |
| **Análise preditiva de preços (regressão + sazonalidade + banda ~80%: câmbio PTAX e US$/kg mensal do NCM → custo BRL/kg projetado)** | ✅ | `previsaoService` + `prever_precos` |
| **Correlação macro/micro (câmbio, commodities, Selic, IPCA, IGP-M, INCC → custo do item, com lead-lag e beta; leitura mercado interno × importado)** | ✅ | `correlacaoService` + `correlacionar_economia` |
| Alertas proativos (janela de compra abre → notifica sem pergunta) | ⏸ | adiado por decisão de produto — análise apenas sob demanda |

## Pilar 3 — Core fiscal, aduaneiro e logístico

| Capacidade | Status | Onde |
|---|---|---|
| Tributação vigente (II, IPI, PIS/COFINS, ICMS por UF, TTD/benefícios) | ✅ | motor + `compararRotasImportacao` |
| Reforma tributária (IBS/CBS/IS — atual × transição × 2033) | ✅ | `simular_reforma_tributaria` |
| Barreiras (antidumping, salvaguardas, CIDE) por NCM+origem | ✅ | detecção no motor + web p/ valor vigente |
| NCM certificada (motor + cruzamento com documento) | ✅ | `classificar_ncm` |
| **Canais de conferência (verde/amarelo/vermelho/cinza) + fatores de risco de parametrização** | ✅ | core regulatório no system prompt |
| **Mercosul/TEC (LETEC, ex-tarifário, certificado de origem, intrazona)** | ✅ | core regulatório no system prompt |
| **Regimes especiais (drawback, admissão temporária, RECOF…) como alavancas** | ✅ | core regulatório no system prompt |
| **Fretamento (incoterms com fronteira de custo/risco, LCL×FCL com ponto de virada, demurrage/detention, THC, AFRMM)** | ✅ | core regulatório + `calcular_cubagem` |
| Valoração aduaneira (AVA/GATT, royalties na base) | ✅ | core regulatório no system prompt |
| **Calculadora de fretamento em números (demurrage escalonada, LCL×FCL com breakeven, THC por porto)** | ✅ | `custoLogisticoService` + `calcular_custo_logistico` |
| **Base viva de defesa comercial (sync GECEX sob demanda → trade_barriers com valor/vigência/resolução)** | ✅ | `barreiraSyncService` + `sincronizar_barreiras` |
| **Radar legislativo sob demanda (DOU/GECEX/RFB/SECEX → boletim norma→mudança→impacto)** | ✅ | `radar_legislativo` |
| Sync periódico automático da base de barreiras (cron) | ⏸ | adiado — sync sob demanda por decisão de produto |

## Pilar 4 — Persona adaptativa (do novato ao expert)

| Capacidade | Status | Onde |
|---|---|---|
| **Detecção do nível técnico nos primeiros turnos** | ✅ | seção PERSONA ADAPTATIVA |
| **Persistência do perfil (memória `perfil_tecnico`) e aplicação imediata** | ✅ | `registrar_memoria` + `PERFIL ATIVO` |
| **Novato: didático, jargão explicado, passo a passo palatável** | ✅ | system prompt |
| **Expert: base legal, canais, terminologia plena, análise de risco** | ✅ | system prompt |
| Onboarding guiado de primeira importação (jornada tutorial no chat) | ⬜ | fluxo dedicado |
| Glossário interativo no client (hover em jargões) | ⬜ | frontend |

---

## Princípios invariantes (não mudam com o roadmap)

1. **Números saem do motor** — a IA nunca calcula imposto "de cabeça"; a web dá contexto, o motor calcula.
2. **Validade temporal** — alíquota/ex-tarifário/antidumping mudam por resolução; números vigentes vêm da web com fonte e data.
3. **Human-in-the-loop** — envio a fornecedor e aceite de oferta têm portões de aprovação humana.
4. **Uma identidade** — especialização via ferramentas e conhecimento, não personas separadas.
5. **Compliance nativo** — barreiras/anuências são papel do sistema, nunca dever de casa do cliente.
