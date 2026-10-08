# Lógica Matemática Financeira Completa para Importação

## Ordem dos Cálculos (Sequência Correta)

### ETAPA 1: Valor FOB e Conversão
```
FOB (USD) = Preço Unitário × Quantidade
FOB (BRL) = FOB (USD) × Taxa de Câmbio
```

### ETAPA 2: Valor CIF (Cost, Insurance and Freight)
```
Frete Internacional (BRL) = Frete (USD) × Taxa de Câmbio
Seguro (BRL) = Seguro (USD) × Taxa de Câmbio
CIF = FOB (BRL) + Frete (BRL) + Seguro (BRL)
```

### ETAPA 3: Impostos de Importação
```
# Base de cálculo do II
Base II = CIF

# Imposto de Importação
II = Base II × Alíquota II (varia por NCM)

# Base de cálculo do IPI
Base IPI = CIF + II

# IPI
IPI = Base IPI × Alíquota IPI (varia por NCM)

# PIS-Importação (alíquota fixa)
PIS-Imp = CIF × 2,1%

# COFINS-Importação (alíquota fixa)
COFINS-Imp = CIF × 9,65%

# AFRMM (Adicional ao Frete para Renovação da Marinha Mercante)
AFRMM = Frete (BRL) × 25%
```

### ETAPA 4: ICMS (Cálculo por Dentro)
```
# Soma antes do ICMS
Soma Parcial = CIF + II + IPI + PIS-Imp + COFINS-Imp + Despesas Aduaneiras

# Base de cálculo do ICMS (por dentro)
Base ICMS = Soma Parcial / (1 - Alíquota ICMS)

# ICMS
ICMS = Base ICMS × Alíquota ICMS
```

### ETAPA 5: Custos Aduaneiros e Operacionais
```
Custos Portuários = THC + Liberação + Siscomex + AFRMM
Custos Operacionais = Despachante + Armazenagem + Outros
Total Custos Aduaneiros = Custos Portuários + Custos Operacionais
```

### ETAPA 6: Custo Total de Importação
```
Custo Total = CIF + II + IPI + PIS-Imp + COFINS-Imp + ICMS + Total Custos Aduaneiros
Custo Unitário = Custo Total / Quantidade
```

### ETAPA 7: Precificação e Markup
```
# Markup sobre custo
Preço Venda = Custo Unitário × (1 + Markup%)

# Ou cálculo reverso a partir do preço alvo
Margem = (Preço Alvo - Custo Unitário) / Preço Alvo × 100
```

### ETAPA 8: Impostos sobre Venda (por Regime Tributário)

#### Lucro Real
```
PIS-Saída = Preço Venda × 1,65%
COFINS-Saída = Preço Venda × 7,6%
PIS-Crédito = Custo × 1,65%
COFINS-Crédito = Custo × 7,6%
PIS-Líquido = PIS-Saída - PIS-Crédito
COFINS-Líquido = COFINS-Saída - COFINS-Crédito
ICMS-Saída = Preço Venda × Alíquota ICMS Estado
ICMS-Crédito = ICMS pago na importação
ICMS-Líquido = ICMS-Saída - ICMS-Crédito
```

#### Lucro Presumido
```
PIS = Preço Venda × 0,65%
COFINS = Preço Venda × 3%
ICMS = Preço Venda × Alíquota ICMS Estado
```

### ETAPA 9: Análise de Viabilidade com Preço Alvo

```
# Dado o Preço Alvo de venda no Brasil
Preço Alvo = Valor informado pelo usuário

# Calcular custo máximo permitido para atingir margem desejada
Margem Desejada = Markup% / (1 + Markup%)
Custo Máximo = Preço Alvo × (1 - Margem Desejada)

# Calcular FOB máximo permitido
FOB Máximo = Custo Máximo - Impostos - Custos Aduaneiros

# Comparar com FOB atual
Diferença = FOB Atual - FOB Máximo

# Indicadores de Viabilidade
Se Diferença <= 0:
    Status = "VIÁVEL" (FOB atual está dentro do limite)
    Margem Real = (Preço Alvo - Custo Total) / Preço Alvo
Senão:
    Status = "NEGOCIAR" (precisa reduzir FOB)
    Redução Necessária = Diferença
    % Desconto Necessário = Diferença / FOB Atual × 100
```

## Estrutura do Relatório Excel

### Aba 1: Resumo da Cotação
- Dados do fornecedor
- Data da cotação
- Moeda e taxa de câmbio
- Total FOB, CIF, Custo Total
- Status geral de viabilidade

### Aba 2: Detalhamento por Produto
- NCM, descrição, quantidade, unidade
- Preço FOB unitário e total
- Alíquotas de impostos (II, IPI, PIS, COFINS, ICMS)
- Custo unitário final
- Preço alvo vs preço sugerido
- Indicador de viabilidade (GO/NEGOCIAR)

### Aba 3: Composição de Custos
- Valor FOB
- (+) Frete Internacional
- (+) Seguro
- (=) Valor CIF
- (+) Imposto de Importação
- (+) IPI
- (+) PIS-Importação
- (+) COFINS-Importação
- (+) ICMS
- (+) AFRMM
- (+) Custos Portuários
- (+) Custos Operacionais
- (=) CUSTO TOTAL

### Aba 4: Análise de Viabilidade
- Por produto:
  - Preço Alvo informado
  - Custo Total calculado
  - Margem bruta
  - FOB máximo permitido
  - FOB atual
  - Diferença
  - % desconto necessário
  - Status (VIÁVEL / NEGOCIAR)

### Aba 5: DRE Projetada
- Receita Bruta (Preço Venda × Quantidade)
- (-) Impostos sobre Venda
- (=) Receita Líquida
- (-) CMV (Custo da Mercadoria Vendida)
- (=) Lucro Bruto
- Margem Bruta %
