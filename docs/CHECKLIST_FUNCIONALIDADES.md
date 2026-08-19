# Checklist de Funcionalidades - SUPPLEY Calc

## Status Geral

| Categoria | Implementado | Pendente |
|-----------|-------------|----------|
| Cálculos Básicos | 8/8 | 0 |
| Cálculos Avançados | 3/8 | 5 |
| Integrações Externas | 1/6 | 5 |
| Benefícios Fiscais | 2/5 | 3 |
| Atualização de Dados | 1/4 | 3 |

---

## 1. Funcionalidades Básicas de Cálculo

### ✅ Implementado

| Funcionalidade | Status | Arquivo |
|----------------|--------|---------|
| Cálculo de custo de importação (FOB → CIF → Nacionalizado) | ✅ | `importCalculationService.ts` |
| Cálculo de II (Imposto de Importação) | ✅ | `taxCalculationService.ts` |
| Cálculo de IPI | ✅ | `taxCalculationService.ts` |
| Cálculo de PIS na importação | ✅ | `taxCalculationService.ts` |
| Cálculo de COFINS na importação | ✅ | `taxCalculationService.ts` |
| Cálculo de ICMS na importação | ✅ | `taxCalculationService.ts` |
| Taxa Siscomex | ✅ | `routers.ts` (valor fixo R$ 214,50) |
| AFRMM (25% do frete marítimo) | ✅ | `routers.ts` |

---

## 2. Cálculos Avançados

### ✅ Implementado

| Funcionalidade | Status | Detalhes |
|----------------|--------|----------|
| Cálculo "por dentro" de ICMS, PIS e COFINS | ✅ | Algoritmo iterativo implementado em `taxCalculationService.ts` |
| Variação de alíquotas por NCM | ✅ | Tabela `ncm_tax_rates` com alíquotas por código NCM |
| Variação de ICMS por estado | ✅ | Tabela `icms_rates` com alíquotas por UF |

### ❌ Pendente

| Funcionalidade | Status | Prioridade |
|----------------|--------|------------|
| Cálculo de Substituição Tributária (ST) | ❌ | Alta |
| Cálculo de DIFAL para operações interestaduais | ❌ | Alta |
| Precificação dinâmica por estado destino | ❌ | Média |
| Atualização automática de tabelas tributárias | ❌ | Média |
| Consideração de regimes especiais e acordos comerciais | ❌ | Baixa |

---

## 3. Integrações Externas

### ✅ Implementado

| Integração | Status | Detalhes |
|------------|--------|----------|
| API de Câmbio (BCB/AwesomeAPI) | ✅ | `exchangeService.ts` - USD, EUR, CNY, PYG |

### ❌ Pendente

| Integração | Status | Prioridade |
|------------|--------|------------|
| Integração básica com Siscomex para registro de DI | ❌ | Baixa (complexa) |
| API da Receita Federal para TEC e TIPI | ❌ | Alta |
| Conexão com sistemas estaduais (SEFAZ) para ICMS | ❌ | Alta |
| Consulta a base de benefícios fiscais por estado/NCM | ❌ | Média |
| APIs de commodities internacionais | ❌ | Média |

---

## 4. Benefícios Fiscais

### ✅ Implementado

| Benefício | Status | Detalhes |
|-----------|--------|----------|
| TTD 409 (Santa Catarina) | ✅ | Crédito presumido de 75% do ICMS |
| Isenção de II para Mercosul | ✅ | Alíquota zero quando `isMercosul = true` |

### ❌ Pendente

| Benefício | Status | Prioridade |
|-----------|--------|------------|
| Drawback (suspensão/isenção/restituição) | ❌ | Alta |
| RECOF (Regime Aduaneiro Especial) | ❌ | Baixa |
| Identificação automática de elegibilidade | ❌ | Média |

---

## 5. Atualização de Dados Tributários

### ✅ Implementado

| Funcionalidade | Status | Detalhes |
|----------------|--------|----------|
| Histórico de taxas de câmbio | ✅ | Tabela `exchange_rate_history` |

### ❌ Pendente

| Funcionalidade | Status | Prioridade |
|----------------|--------|------------|
| Verificar atualizações na Receita Federal (TEC, TIPI) | ❌ | Alta |
| Verificar atualizações em cada SEFAZ estadual | ❌ | Alta |
| Verificar acordos internacionais | ❌ | Média |
| Manter histórico de versões das tabelas tributárias | ❌ | Média |
| Registrar log de alterações | ❌ | Média |
| Notificar usuários sobre mudanças críticas | ❌ | Alta |

---

## 6. Regimes Tributários

### ✅ Implementado

| Regime | Status | Detalhes |
|--------|--------|----------|
| Simples Nacional (6 faixas) | ✅ | Alíquotas de 4% a 19% |
| Lucro Presumido | ✅ | PIS 0,65%, COFINS 3%, IRPJ 1,2%, CSLL 1,08% |
| Lucro Real | ✅ | PIS 1,65%, COFINS 7,6%, IRPJ 15%, CSLL 9% |

---

## 7. Análise Preditiva e BI

### ✅ Implementado

| Funcionalidade | Status | Detalhes |
|----------------|--------|----------|
| Monitoramento de câmbio (USD, EUR, CNY, PYG) | ✅ | `predictiveAnalysisService.ts` |
| Correlações câmbio x commodities | ✅ | Análise sistêmica |
| Previsão de janelas de oportunidade | ✅ | `OpportunityWindow` |
| Alertas proativos | ✅ | Sistema de notificações |

---

## 8. Relatórios

### ✅ Implementado

| Relatório | Status | Detalhes |
|-----------|--------|----------|
| Excel com 3 abas (EST. CUSTO, CUSTO MERCADORIA, FORMAÇÃO PREÇO) | ✅ | `excelReportService.ts` |
| Análise de viabilidade por produto | ✅ | Status VIÁVEL/NEGOCIAR/INVIÁVEL |
| Detalhamento de impostos | ✅ | Todas as alíquotas discriminadas |

---

## Resumo de Prioridades

### Alta Prioridade (Impacto direto nos cálculos)
1. ❌ Cálculo de Substituição Tributária (ST)
2. ❌ Cálculo de DIFAL
3. ❌ Integração com API da Receita Federal (TEC/TIPI)
4. ❌ Drawback
5. ❌ Notificação de mudanças tributárias

### Média Prioridade (Melhorias de precisão)
1. ❌ Precificação dinâmica por estado destino
2. ❌ Conexão com SEFAZ estaduais
3. ❌ Histórico de versões de tabelas tributárias
4. ❌ APIs de commodities internacionais

### Baixa Prioridade (Funcionalidades avançadas)
1. ❌ Integração com Siscomex para DI
2. ❌ RECOF e outros regimes especiais
3. ❌ Acordos comerciais internacionais

---

## Observações Técnicas

### Tabelas de Banco de Dados Existentes
- `ncm_tax_rates` - Alíquotas por NCM (II, IPI, PIS, COFINS)
- `icms_rates` - Alíquotas de ICMS por estado
- `exchange_rate_history` - Histórico de câmbio
- `market_indicators` - Indicadores de mercado

### Tabelas Necessárias para Novas Funcionalidades
- `st_rates` - Alíquotas de ST por NCM e estado
- `difal_rates` - Configuração de DIFAL por estado
- `tax_rate_history` - Histórico de alterações de alíquotas
- `fiscal_benefits` - Benefícios fiscais por estado/NCM
- `trade_agreements` - Acordos comerciais internacionais

---

*Documento gerado em: 12/12/2024*
*Versão do sistema: 68c59082*
