# Análise das Planilhas de Regimes Tributários

## Resumo das Diferenças entre Regimes

### Lucro Real
- **PIS**: 1,65% (crédito na entrada)
- **COFINS**: 7,6% (crédito na entrada)
- **IRPJ**: 15% sobre lucro real + adicional 10% sobre excedente R$ 20.000/mês
- **CSLL**: 9% sobre lucro real
- **Créditos**: PIS e COFINS são não-cumulativos (geram crédito)

### Lucro Presumido
- **PIS**: 0,65% (cumulativo, sem crédito)
- **COFINS**: 3% (cumulativo, sem crédito)
- **IRPJ**: 15% sobre base presumida (8% da receita bruta para comércio)
- **CSLL**: 9% sobre base presumida (12% da receita bruta)
- **Créditos**: Não há crédito de PIS/COFINS

### Simples Nacional
- Alíquota única sobre faturamento (varia por faixa de receita bruta)
- Não há crédito de impostos
- Inclui: IRPJ, CSLL, PIS, COFINS, ICMS, ISS, CPP

## Impostos na Importação (Comum a todos os regimes)

1. **II (Imposto de Importação)**: Varia por NCM (ex: 9,6% a 12,6%)
2. **IPI**: Varia por NCM (ex: 3,25% a 6,5%)
3. **PIS-Importação**: 2,1%
4. **COFINS-Importação**: 9,65%
5. **ICMS**: Varia por estado (ex: 4% a 17%)

## Despesas Acessórias Identificadas

| Despesa | Descrição |
|---------|-----------|
| Frete Internacional | Custo do transporte marítimo/aéreo |
| Seguro | Seguro da carga |
| AFRMM | Adicional ao Frete para Renovação da Marinha Mercante (25% do frete) |
| Capatazia | Movimentação no porto |
| Armazenagem | Custos de armazenagem no porto |
| Despacho Aduaneiro | Honorários do despachante |
| Taxa SISCOMEX | Taxa do sistema de comércio exterior |
| SDA | Serviço de Desembaraço Aduaneiro |
| Levante | Movimentação de container |
| Pesagem | Conferência de peso |
| Drop Off | Devolução de container |
| Taxa Liberação BL | Liberação do conhecimento de embarque |
| ISPS Code | Taxa de segurança portuária |

## Fórmulas de Cálculo

### Custo de Importação
```
CIF = FOB + Frete + Seguro
Base II = CIF
II = Base II × Alíquota II
Base IPI = CIF + II
IPI = Base IPI × Alíquota IPI
Base ICMS = (CIF + II + IPI + PIS-Imp + COFINS-Imp + Despesas) / (1 - Alíquota ICMS)
ICMS = Base ICMS × Alíquota ICMS
PIS-Imp = CIF × 2,1%
COFINS-Imp = CIF × 9,65%
Custo Total = CIF + II + IPI + PIS-Imp + COFINS-Imp + ICMS + Despesas Acessórias
```

### Lucro Real - Cálculo de Impostos na Venda
```
PIS-Saída = Receita × 1,65%
COFINS-Saída = Receita × 7,6%
PIS-Crédito = Custo × 1,65%
COFINS-Crédito = Custo × 7,6%
PIS-Efetivo = PIS-Saída - PIS-Crédito
COFINS-Efetivo = COFINS-Saída - COFINS-Crédito
IRPJ = Lucro Real × 15% + (Lucro > R$240.000/ano ? (Lucro - 240.000) × 10% : 0)
CSLL = Lucro Real × 9%
```

### Lucro Presumido - Cálculo de Impostos na Venda
```
PIS = Receita × 0,65%
COFINS = Receita × 3%
Base Presumida IRPJ = Receita × 8% (comércio)
IRPJ = Base Presumida × 15% + adicional 10% se base > R$20.000/mês
Base Presumida CSLL = Receita × 12%
CSLL = Base Presumida × 9%
```

### Simples Nacional - Cálculo de Impostos na Venda
```
Alíquota = Tabela Simples Nacional por faixa de faturamento
Imposto Total = Receita × Alíquota Efetiva
```

## Análise de Preço Target

Para calcular o preço máximo de compra dado um preço target de venda:

```
Margem Desejada = (Preço Venda - Custo Total) / Preço Venda
CMV = Custo Total / Preço Venda
Preço Máximo Compra = Preço Target × (1 - Margem Desejada) - Impostos - Despesas
Redução Necessária = Preço Atual - Preço Máximo Compra
```

## Implementação Necessária

1. **Adicionar campo `taxRegime`** no schema (simples_nacional, lucro_presumido, lucro_real)
2. **Criar tabela de alíquotas** do Simples Nacional por faixa
3. **Implementar cálculos diferenciados** por regime
4. **Refinar análise de Target** com:
   - Margem bruta e líquida
   - CMV (Custo da Mercadoria Vendida)
   - Preço máximo de compra
   - Redução necessária no preço FOB
