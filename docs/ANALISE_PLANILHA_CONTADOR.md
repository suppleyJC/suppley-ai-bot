# Análise da Planilha do Contador - COT0082-Jean-PregosParaguai.xlsx

## Estrutura da Planilha

A planilha possui 3 abas:

### 1. INVOICE (Fatura)
- Lista de 11 produtos (pregos de diferentes tamanhos)
- NCM: 7317.00.90 (Pregos, tachas, etc. de ferro ou aço)
- Valor FOB Total: USD 11.300,00
- Peso Total: 11.000 kg (11 TON)

### 2. CUSTO MERCADORIA - IMP. PRÓPRIA
Detalhamento completo por produto com 58 colunas incluindo:

**Dados de Entrada:**
- Valor FOB USD: 11.300
- Frete USD: 2.583,90
- Seguro: 0
- Valor Aduaneiro USD: 13.883,90
- Taxa Dólar: 5,48
- SISCOMEX: 154,23
- AFRMM: 0
- Demais Despesas: 4.000 (Despacho 3.000 + Taxa Expediente 1.000)

**Tributos Calculados (por produto e total):**
- II (25%): R$ 19.020,94
- IPI (6,5%): R$ 6.181,81
- PIS (2,1%): R$ 1.597,76
- COFINS (9,65%): R$ 7.342,08
- ICMS Antecipado (1%): R$ 1.149,80
- **Total Tributos: R$ 35.446,62**

**Colunas de Custo e Venda:**
- CUSTO TOTAL por produto
- CUSTO LÍQUIDO IMPORTAÇÃO
- MKP (Markup): 65,17%
- VALOR DOS PRODUTOS (preço de venda)
- ICMS sobre venda (4%)
- IPI sobre venda
- ICMS ST
- TOTAL NF VENDA

### 3. EST. DE CUSTO - IMP. PRÓPRIA
Resumo consolidado com:

**Valor Aduaneiro:**
- FOB: R$ 61.924,00
- Frete: R$ 14.159,77
- Seguro: R$ 0
- CIF: R$ 76.083,77

**Tributos de Nacionalização:**
- II: R$ 19.020,94
- IPI: R$ 6.181,81
- PIS: R$ 1.597,76
- COFINS: R$ 7.342,08
- ICMS Antecipado: R$ 1.149,80
- SISCOMEX: R$ 154,23
- **Total: R$ 35.446,62**

**Custos Aduaneiros:**
- Liberação: R$ 0
- Armazenagem: R$ 0
- Frete interno: R$ 0
- Taxa Expediente: R$ 1.000
- Despacho Aduaneiro: R$ 3.000
- AFRMM: R$ 0
- **Total: R$ 4.000**

**NF-e de Importação:**
- Produto: R$ 76.083,77
- II: R$ 19.020,94
- IPI: R$ 6.181,81
- Outras Despesas (PIS+COFINS+ICMS+SISCOMEX+AFRMM): R$ 10.243,87
- **NF-e Nacionalização: R$ 111.530,39**

## Diferenças Identificadas vs Sistema Atual

### 1. Alíquotas Utilizadas
- **II**: 25% (Mercosul com isenção não aplicada - Paraguai)
- **IPI**: 6,5%
- **PIS**: 2,1%
- **COFINS**: 9,65%
- **ICMS Antecipado**: 1% (não 17% como padrão SC)

### 2. Estrutura de Cálculo
O contador usa uma estrutura mais detalhada com:
- Rateio proporcional de custos por peso
- ICMS Antecipado separado do ICMS normal
- Cálculo de ICMS ST e DIFAL
- Markup aplicado sobre custo líquido
- NF-e de Nacionalização detalhada

### 3. Colunas Adicionais Necessárias
- Antidumping (por kg)
- Royalties
- ICMS ST Entrada SP
- Custo Líquido do Comprador
- Valor NF Venda com IPI e ICMS ST

## Fórmulas Importantes

### Base de Cálculo ICMS Antecipado
```
BASE ICMS = (CIF + II + IPI + PIS + COFINS) / (1 - 0.01)
```

### Custo Total
```
CUSTO TOTAL = CIF + II + IPI + PIS + COFINS + ICMS + SISCOMEX + AFRMM + DESPESAS
```

### Markup
```
MKP = (PREÇO VENDA - CUSTO LÍQUIDO) / CUSTO LÍQUIDO
```

### Preço de Venda
```
PREÇO VENDA = CUSTO LÍQUIDO * (1 + MKP)
```
