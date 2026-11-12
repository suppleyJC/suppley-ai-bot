# Status de Implementação do Fluxo de Trabalho SUPPLEY Calc

## Resumo Geral

| Fase | Status | Cobertura |
|------|--------|-----------|
| Fase 1 - Identificação e Sourcing | Parcial | ~70% |
| Fase 2 - Negociação e Validação | Avançado | ~85% |
| Fase 3 - Execução | Estrutura pronta | ~40% |
| Fase 4 - Nacionalização e Entrega | Estrutura pronta | ~30% |

---

## Fase 1 - Identificação e Sourcing

### 1. Identificação e conformação automática da NCM via IA
**Status: IMPLEMENTADO**

- `ncmService.ts` → `suggestNCMWithAI()` usa LLM para classificar produtos
- Busca em base de NCMs local + sugestão inteligente com análise de risco
- Sugere classificações alternativas com menor carga tributária
- Cache em memória para evitar chamadas repetidas
- Integrado ao formulário de Novo Cálculo e ao RFQ Create

### 2. Mapeamento das indústrias mais adequadas globalmente e dentro da base de dados
**Status: PARCIALMENTE IMPLEMENTADO**

**O que existe:**
- `autoSupplierService.ts` → extrai dados de fornecedores de cotações PDF
- Cadastro de fornecedores com país, cidade, contato, produtos
- `importIntelligenceService.ts` → gera relatórios de inteligência com oportunidades
- Excambia tem acesso ao contexto de fornecedores cadastrados

**O que falta:**
- Base de dados pré-populada de indústrias/fornecedores globais por segmento
- Busca automática em marketplaces (Alibaba, Made-in-China) — requer integração externa
- Scoring/ranking de fornecedores baseado em histórico de cotações

### 3. Disparo de cotações multicanal (e-mail, WhatsApp, WeChat)
**Status: PARCIALMENTE IMPLEMENTADO**

**O que existe:**
- `rfqService.ts` → `generateSupplierMessage()` gera mensagens em 3 idiomas (EN, ZH, PT)
- Templates para email, WeChat e WhatsApp com dados da RFQ
- Tabela `supplier_outreach` no banco para registrar disparos
- Schema suporta canais: email, wechat, whatsapp, alibaba, phone, other

**O que falta:**
- Integração real com APIs de envio (SendGrid/SMTP para email, WhatsApp Business API, WeChat API)
- Disparo automático a partir da interface (botão "Enviar Cotação")
- Tracking de abertura/resposta das mensagens
- *Nota: O envio real requer configuração de APIs externas e contas comerciais*

---

## Fase 2 - Negociação e Validação

### 4. Recebimento e consolidação de propostas das fábricas
**Status: IMPLEMENTADO**

**O que existe:**
- Upload de PDFs de cotação com extração automática via LLM (`quotationExtractorService.ts`)
- Extrai: fornecedor, país, produtos, preços, quantidades, NCMs
- `addSupplierQuote` no RFQ Router → registra cotações de fornecedores por item
- Tabelas `supplier_quotes` e `supplier_quote_items` no banco
- Página RfqDetail permite adicionar cotações manualmente
- `consolidated_quotes` table para consolidação

### 5. Cálculo e planilha de validação automática de custos
**Status: IMPLEMENTADO (com algumas lacunas)**

**Estrutura de custos implementada:**

| Etapa | Status | Detalhes |
|-------|--------|----------|
| Preço de Fábrica / EXW | ✅ | Campo `fobValue` (aceita EXW/FOB/CIF) |
| Frete interno na origem | ⚠️ | Incluído em "otherCosts" - não é campo separado |
| Taxas de origem (THC, BL, stuffing, VGM) | ✅ | Campo THC no formulário |
| Seguro/armazenagem na origem | ⚠️ | Incluído em "otherCosts" |
| **Valor FOB/FCA ajustado** | ✅ | Calculado |
| Ajustes de Valor Aduaneiro (royalties, assists) | ❌ | Não implementado |
| Frete Internacional | ✅ | Campo `freight` |
| Seguro Internacional | ✅ | Campo `insurance` |
| **Valor Aduaneiro / CIF** | ✅ | `cifBrl = fobBrl + freightBrl + insuranceBrl` |
| II (Imposto de Importação) | ✅ | Cálculo iterativo com base no NCM |
| IPI-Importação | ✅ | Base: CIF + II |
| PIS-Importação | ✅ | Cálculo iterativo "por dentro" |
| COFINS-Importação | ✅ | Cálculo iterativo "por dentro" |
| Taxa Siscomex | ✅ | Campo no formulário (default R$ 214,50) |
| AFRMM / TUM / Mercante | ✅ | Calculado como 25% do frete marítimo |
| ICMS-Importação teórico | ✅ | Cálculo iterativo por estado |
| ICMS diferido/suspenso TTD SC | ❌ | Não implementado como campo separado |
| ICMS antecipado TTD (1% ou 2,6%) | ❌ | Não implementado |
| Despesas portuárias (capatazia, armazenagem, BL, despachante) | ✅ | Campos: THC, liberation, customsBroker, storage |
| Comissão Trading SC | ⚠️ | Incluído em "otherCosts" |
| Frete interno Porto → Galpão | ⚠️ | Incluído em "otherCosts" |
| Seguro nacional, descarga, paletização | ⚠️ | Incluído em "otherCosts" |
| Custos financeiros (spread, IOF, juros) | ❌ | Não implementado como campos separados |
| **Custo Total Desembolsado** | ✅ | `totalCostBrl` |
| Créditos recuperáveis (IPI, PIS, COFINS, ICMS) | ✅ | Calculado por regime tributário |
| **Custo Líquido Econômico** | ✅ | Calculado no Lucro Real |
| Margem / markup | ✅ | Campo `markupPercent` |
| IRPJ / CSLL sobre margem | ✅ | Calculado no regime Lucro Real |
| Impostos da saída (ICMS, PIS, COFINS, IPI, ST) | ✅ | `calculateSaleTaxes()` |
| **Preço de Venda / Saída** | ✅ | `suggestedPriceBrl` |
| Créditos aproveitáveis pelo adquirente | ⚠️ | Mencionado na análise, não campo separado |
| **Custo Líquido do Adquirente** | ⚠️ | Não é um campo explícito |

### 6. Precificação para revenda
**Status: IMPLEMENTADO**

- Markup configurável por produto
- Preço Target com análise de viabilidade
- Cálculo de margem líquida após impostos de saída
- Comparação por regime tributário (Simples, Presumido, Real)
- Análise multi-estado (`statePricingService.ts`)

---

## Fase 3 - Execução

### 7. Realização do pedido
**Status: ESTRUTURA PRONTA, NÃO FUNCIONAL**

**O que existe:**
- Status "ordered" no pipeline de quotations
- Campo `orderDate` na tabela quotations
- Possibilidade de mudar status via `quotations.updateStatus`

**O que falta:**
- Tela/fluxo dedicado para confirmar pedido
- Geração de Purchase Order (PO) em PDF
- Integração com fornecedor para confirmação

### 8. Processamento de pagamentos e câmbio
**Status: NÃO IMPLEMENTADO**

**O que existe:**
- Monitoramento de câmbio em tempo real (BCB/AwesomeAPI)
- Alertas de câmbio favorável via Excambia
- Análise preditiva de timing de compra

**O que falta:**
- Módulo de controle de pagamentos (parcelas, datas, status)
- Cálculo de spread cambial e IOF
- Integração com bancos/corretoras de câmbio
- Registro de operações de câmbio realizadas

### 9. Acompanhamento de carregamento e frete internacional
**Status: ESTRUTURA PRONTA, NÃO FUNCIONAL**

**O que existe:**
- Status "shipped" no pipeline
- Campos `shipmentDate` e `estimatedArrival` na tabela quotations
- PipelineWidget no Dashboard mostra "Em Trânsito"

**O que falta:**
- Integração com APIs de tracking de containers (ex: MarineTraffic, Searates)
- Tela de acompanhamento com mapa e ETA
- Notificações de mudança de status do navio
- Registro de BL (Bill of Lading) e documentos de embarque

---

## Fase 4 - Nacionalização e Entrega

### 10. Desembaraço aduaneiro
**Status: ESTRUTURA PRONTA, NÃO FUNCIONAL**

**O que existe:**
- Status "customs" no pipeline
- Campo `customsClearanceDate` na tabela quotations
- Cálculo de todos os impostos de importação
- `drawbackService.ts` → verifica elegibilidade para Drawback
- Reforma Tributária com simulação de impacto 2026-2033

**O que falta:**
- Tela dedicada para gestão do desembaraço
- Checklist de documentos necessários (DI, LI, CI, etc.)
- Integração com Siscomex (não viável via API pública)
- Registro de despacho e despachante aduaneiro
- Controle de canal (verde, amarelo, vermelho, cinza)

### 11. Disponibilização da mercadoria ao cliente
**Status: ESTRUTURA PRONTA, NÃO FUNCIONAL**

**O que existe:**
- Status "nationalized" e "completed" no pipeline
- Campo `completionDate` na tabela quotations
- Cálculo de preço de revenda com impostos de saída

**O que falta:**
- Tela de entrega/expedição
- Geração de NF-e (requer integração com ERP/emissor fiscal)
- Controle de estoque pós-nacionalização
- Relatório de fechamento da operação (custo real vs. estimado)

---

## Funcionalidades Transversais Implementadas

| Funcionalidade | Status |
|----------------|--------|
| Excambia (IA orquestradora) | ✅ Funcional |
| Reforma Tributária 2026-2033 | ✅ Simulação implementada |
| Análise Preditiva (câmbio, commodities) | ✅ Funcional |
| Upload e extração de PDFs | ✅ Funcional |
| Relatórios PDF/Excel | ✅ Funcional |
| Pipeline visual (Dashboard) | ✅ Funcional |
| RFQ completo (criar, listar, detalhar) | ✅ Funcional |
| Cadastro de fornecedores/produtos | ✅ Funcional |
| Multi-regime tributário | ✅ Funcional |
| Drawback (verificação de elegibilidade) | ✅ Funcional |
| Comparação multi-estado | ✅ Funcional |
| Cache de NCM | ✅ Funcional |
| Autenticação com email/senha | ✅ Funcional |

---

## Prioridades para Próximas Implementações

1. **Alta prioridade:** Campos separados para TTD SC (ICMS diferido/antecipado) e custos financeiros (IOF, spread)
2. **Alta prioridade:** Ajustes de Valor Aduaneiro (royalties, assists, comissões)
3. **Média prioridade:** Tela de acompanhamento de pedidos com timeline visual
4. **Média prioridade:** Geração de Purchase Order (PO) em PDF
5. **Baixa prioridade:** Integrações externas (email, tracking de containers, Siscomex)
6. **Baixa prioridade:** Controle de pagamentos e câmbio
