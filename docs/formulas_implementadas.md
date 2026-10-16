# Fórmulas de Cálculo Implementadas

## Cálculo de Impostos na Importação

O sistema implementa as fórmulas conforme a legislação brasileira vigente:

### 1. Imposto de Importação (II)
```
Base II = CIF (FOB + Frete + Seguro)
II = Base II × Alíquota II
```
- Alíquota varia por NCM (TEC - Tarifa Externa Comum)
- Mercosul: 0% com Certificado de Origem

### 2. IPI (Imposto sobre Produtos Industrializados)
```
Base IPI = CIF + II
IPI = Base IPI × Alíquota IPI
```
- Alíquota varia por NCM (TIPI)

### 3. PIS-Importação
```
Base PIS = CIF + II + IPI
PIS = Base PIS × 2,16%
```
- Alíquota fixa de 2,16% (Lei 10.865/2004)

### 4. COFINS-Importação
```
Base COFINS = CIF + II + IPI
COFINS = Base COFINS × 10%
```
- Alíquota de 10% (Lei 10.865/2004, art. 8º)

### 5. ICMS (Imposto sobre Circulação de Mercadorias)
```
Base ICMS = (CIF + II + IPI + PIS + COFINS) / (1 - Alíquota ICMS)
ICMS = Base ICMS × Alíquota ICMS
```
- Calculado "por dentro" (incluso na própria base)
- Alíquota varia por estado (4% a 18%)
- Produtos importados: 4% em operações interestaduais

## Cálculo de Impostos na Venda

### Lucro Presumido
```
PIS = Receita × 0,65% (cumulativo)
COFINS = Receita × 3% (cumulativo)
Base IRPJ = Receita × 8% (comércio)
IRPJ = Base IRPJ × 15%
Base CSLL = Receita × 12%
CSLL = Base CSLL × 9%
```

### Lucro Real
```
PIS = Receita × 1,65% - Crédito PIS
COFINS = Receita × 7,6% - Crédito COFINS
Crédito PIS = Custo × 1,65%
Crédito COFINS = Custo × 7,6%
IRPJ = Lucro × 15% + Adicional 10% (se lucro > R$20.000/mês)
CSLL = Lucro × 9%
```

### Simples Nacional
```
Imposto Total = Receita × Alíquota Efetiva
```
- Alíquota varia por faixa de faturamento (Anexo I - Comércio)

## Custos Aduaneiros

### AFRMM (Adicional ao Frete para Renovação da Marinha Mercante)
```
AFRMM = Frete Internacional × 25%
```
- Incide apenas sobre frete marítimo

### Taxa Siscomex
```
Taxa Siscomex = R$ 214,50 (valor fixo por DI)
```

### THC (Terminal Handling Charge)
- Varia por porto (R$ 800 a R$ 1.500)

## Formação do Preço de Venda

```
Custo Total = CIF + Impostos + Custos Aduaneiros + Despesas
Preço Sugerido = Custo Total × (1 + Markup%)
Lucro Bruto = Preço Sugerido - Custo Total
Margem Bruta = Lucro Bruto / Preço Sugerido × 100
```

## Referências Legais

1. **Decreto 6.759/2009** - Regulamento Aduaneiro
2. **Lei 10.865/2004** - PIS e COFINS na Importação
3. **Lei 9.430/1996** - Lucro Presumido
4. **Lei 9.718/1998** - PIS e COFINS
5. **Lei Complementar 123/2006** - Simples Nacional
6. **Decreto 7.212/2010** - RIPI (Regulamento do IPI)
