# Análise da Planilha de Referência COT0014-Uber-DispositivosBluetooth.xlsx

## Estrutura da Planilha

A planilha possui 3 abas:
1. **INVOICE** - Dados básicos do produto
2. **CUSTO MERCADORIA - IMP. ENC.** - Cálculo detalhado de custos de importação
3. **EST. DE CUSTO - IMP. ENC** - Estimativa de custo formatada para apresentação

## Dados da Aba INVOICE

| Campo | Valor |
|-------|-------|
| Produto | Controle Bluetooth |
| Quantidade total | 100.128 unidades |
| Peso total | 4.768 kg |
| Valor Unit. USD | 4,90 |
| Valor Total USD | 490.627,20 |
| NCM | 8517.62.99 |

## Dados da Aba CUSTO MERCADORIA - IMP. ENC.

### Valores Base
| Descrição | Moeda | Valor USD | Valor R$ |
|-----------|-------|-----------|----------|
| Valor FOB | USD | 490.627,20 | 2.722.980,96 |
| Valor Frete | USD | 3.000,00 | 16.650,00 |
| Seguro | USD | 0,00 | 0,00 |
| Valor Aduaneiro (CIF) | USD | 493.627,20 | 2.739.630,96 |

### Dados Complementares
| Campo | Valor |
|-------|-------|
| Peso Bruto | 0 |
| Peso Líquido | 4.768 |
| Taxa Dólar | 5,55 |
| SISCOMEX | 154,23 |
| AFRMM | 1.429,20 |

### Demais Despesas
| Descrição | Valor R$ |
|-----------|----------|
| Liberação | 4.500,00 |
| Armazenagem | 5.500,00 |
| Frete interno | 1.200,00 |
| Comissão Despacho Aduaneiro | 3.000,00 |
| Taxa de Expediente | 1.000,00 |
| **Total** | **15.200,00** |

### Pacote Logístico
| Descrição | Valor R$ |
|-----------|----------|
| Pacote Logístico | 12.000,00 |
| Royalties | 0,00 |

### Cálculo de Impostos (por produto)
| Imposto | Alíquota | Valor R$ |
|---------|----------|----------|
| II (Imposto de Importação) | 18% | 493.133,57 |
| IPI | 13% | 420.259,39 |
| PIS | 2,1% | 57.532,25 |
| COFINS | 9,65% | 264.374,39 |
| ICMS Antecipado | 1% | 41.407,13 |

### Custo Total por Produto
| Campo | Valor |
|-------|-------|
| Custo Total | 4.033.121,12 |
| Custo Unitário | 40,28 |

### Custo Líquido e Venda da Trading
| Campo | Valor |
|-------|-------|
| Custo Líquido Importação | 3.249.547,96 |
| Custo Líquido Total | 3.261.547,96 |
| Custo Unit. Líq. | 32,57 |
| MKP (Markup) | 0,6214 (62,14%) |
| Valor dos Produtos | 5.248.376,58 |
| ICMS (4%) | 209.935,06 |
| IPI | 682.288,96 |
| ICMS ST | 0 |
| Total NF Venda | 5.930.665,54 |
| Valor Unitário c/ IPI e ICMS ST | 59,23 |

## Dados da Aba EST. DE CUSTO - IMP. ENC

### Tributos de Nacionalização
| Tributo | Valor R$ |
|---------|----------|
| I.I. | 493.133,57 |
| IPI-Imp. | 420.259,39 |
| PIS-Imp. | 57.532,25 |
| COFINS-Imp. | 264.374,39 |
| ICMS Antecipado | 41.407,13 |
| TX Siscomex | 154,23 |
| **Total Tributos** | **1.276.860,96** |

### Custos Aduaneiros
| Descrição | Valor R$ |
|-----------|----------|
| Liberação | 4.500,00 |
| Armazenagem | 5.500,00 |
| Frete interno | 1.200,00 |
| Taxa de Expediente | 1.000,00 |
| Despacho Aduaneiro | 3.000,00 |
| AFRMM | 1.429,20 |
| **Total Despesas Aduaneiras** | **16.629,20** |

### NF-e de Importação
| Campo | Valor R$ |
|-------|----------|
| Produto | 2.739.630,96 |
| I.I. | 493.133,57 |
| IPI-Imp. | 420.259,39 |
| Outras Despesas (PIS+COFINS+ICMS+SISCOMEX+AFRMM) | 364.897,20 |
| **NF-e Nacionalização** | **4.017.921,12** |

## Fórmulas Identificadas

### Base de Cálculo
1. **Valor CIF** = Valor FOB + Frete + Seguro
2. **Valor Aduaneiro R$** = Valor CIF USD × Taxa Câmbio

### Impostos de Importação
1. **II** = Valor Aduaneiro R$ × Alíquota II (18% para NCM 8517.62.99)
2. **Base IPI** = Valor Aduaneiro R$ + II
3. **IPI** = Base IPI × Alíquota IPI (13%)
4. **PIS** = Valor Aduaneiro R$ × 2,1%
5. **COFINS** = Valor Aduaneiro R$ × 9,65%
6. **Base ICMS** = (Valor Aduaneiro + II + IPI + PIS + COFINS + Despesas) / (1 - Alíquota ICMS)
7. **ICMS** = Base ICMS × Alíquota ICMS

### Custo Total
1. **Custo Total** = Valor Aduaneiro + II + IPI + PIS + COFINS + ICMS + Despesas Aduaneiras + Pacote Logístico
2. **Custo Unitário** = Custo Total / Quantidade

### Venda
1. **Markup** = Preço Venda / Custo
2. **ICMS Venda** = Valor Produtos × 4%
3. **IPI Venda** = Valor Produtos × Alíquota IPI
4. **Total NF** = Valor Produtos + IPI + ICMS ST
