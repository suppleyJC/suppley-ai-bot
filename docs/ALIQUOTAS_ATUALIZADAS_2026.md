# Alíquotas Atualizadas - 2026

## Impostos na Importação (Federal)

| Imposto | Alíquota | Base de Cálculo | Legislação |
|---------|----------|-----------------|------------|
| II (Imposto de Importação) | 0-35% (varia por NCM/TEC) | CIF (FOB + Frete + Seguro) | Decreto 6.759/2009 |
| IPI | 0-30% (varia por NCM/TIPI) | CIF + II | Decreto 7.212/2010 |
| PIS-Importação | 2,1% | CIF (Valor Aduaneiro) | Lei 10.865/2004 |
| COFINS-Importação | 9,65% + 0,6% = 10,25% (2026) | CIF (Valor Aduaneiro) | Lei 10.865/2004, LC 224/2025 |
| AFRMM | 25% | Frete marítimo internacional | Lei 10.893/2004 |
| Siscomex | R$ 185,00 + R$ 29,50/item adicional | Fixo por DI | IN SRF 680/2006 |

## ICMS na Importação

| Estado | Alíquota Interna | TTD/Benefício | Carga Efetiva |
|--------|-----------------|---------------|---------------|
| SC (TTD 409) | 17% | Diferimento + crédito presumido 75% | 2,6% (primeiros 36 meses) ou 1% (após) |
| SP | 18% | - | 18% |
| RJ | 20% | - | 20% |
| MG | 18% | - | 18% |
| PR | 19% | - | 19% |
| RS | 18% | - | 18% |

### Fórmula ICMS (por dentro):
```
Base ICMS = (CIF + II + IPI + PIS + COFINS + Despesas Aduaneiras) / (1 - Alíquota ICMS)
ICMS = Base ICMS × Alíquota ICMS
```

### TTD 409 - Santa Catarina:
- **Primeiros 36 meses:** ICMS antecipado de 2,6% sobre base de cálculo
- **Após 36 meses:** ICMS antecipado de 1% sobre base de cálculo
- **Crédito presumido na saída:** 75% do ICMS destacado na NF-e de venda
- **Requisito:** Empresa habilitada junto à SEF/SC

## Impostos na Venda

### Lucro Real (não-cumulativo)
| Imposto | Alíquota Saída | Crédito | Líquido |
|---------|---------------|---------|---------|
| PIS | 1,65% | 1,65% sobre custo | Débito - Crédito |
| COFINS | 7,6% | 7,6% sobre custo | Débito - Crédito |
| ICMS | Varia por estado | ICMS pago na importação | Débito - Crédito |
| IRPJ | 15% + 10% adicional | - | Sobre lucro real |
| CSLL | 9% | - | Sobre lucro real |

### Lucro Presumido (cumulativo)
| Imposto | Alíquota | Base |
|---------|----------|------|
| PIS | 0,65% | Receita bruta |
| COFINS | 3% | Receita bruta |
| ICMS | Varia por estado | Preço de venda |
| IRPJ | 15% | 8% da receita (comércio) |
| CSLL | 9% | 12% da receita |

### Simples Nacional
| Faixa | Receita Bruta (12 meses) | Alíquota |
|-------|--------------------------|----------|
| 1 | Até R$ 180.000 | 4% |
| 2 | R$ 180.001 a R$ 360.000 | 7,3% |
| 3 | R$ 360.001 a R$ 720.000 | 9,5% |
| 4 | R$ 720.001 a R$ 1.800.000 | 10,7% |
| 5 | R$ 1.800.001 a R$ 3.600.000 | 14,3% |
| 6 | R$ 3.600.001 a R$ 4.800.000 | 19% |

## Reforma Tributária 2026 (Fase de Teste)
- CBS (federal): 0,9% - substituirá PIS/COFINS/IPI
- IBS (estadual): 0,1% - substituirá ICMS/ISS
- Em 2026: apenas registro em NF-e, compensado contra PIS/COFINS
- Transição completa: 2027-2033

## Operações Interestaduais (Produtos Importados)
- Resolução Senado 13/2012: alíquota de 4% para vendas interestaduais de produtos importados
- DIFAL: diferença entre alíquota interna do estado destino e 4%
