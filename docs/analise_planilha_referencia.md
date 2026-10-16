# Análise da Planilha de Referência COT0014-Uber

## Estrutura Correta (3 abas)

### 1. INVOICE
- Dados básicos do produto
- Caixas, quantidade, especificações
- Peso bruto/líquido
- Valor unitário e total USD
- NCM

### 2. CUSTO MERCADORIA - IMP. ENC.
Colunas detalhadas:
- ADIÇÃO, ITEM, CÓDIGO, QUANTIDADE, UN., DESCRIÇÃO, NCM
- VALOR UNITÁRIO, VALOR TOTAL, PESO, % PESO
- Valor FOB R$, FRETE USD, FRETE R$, SEGURO
- VLR ADUANEIRO USD, VLR ADUANEIRO R$
- AFRMM, SISCOMEX, Antidumping
- DEMAIS DESPESAS
- % II, VALOR II
- MERCADORIA USD, MERCADORIA UNIT
- BASE IPI, % IPI, VALOR IPI-IMP
- % PIS, VALOR PIS-IMP
- % COFINS, VALOR COFINS-IMP, CRÉDITO COFINS-IMP
- BASE ICMS ANTECIPADO, % ICMS, VALOR ICMS-ANTECIPADO
- CUSTO TOTAL, CUSTO UNIT.
- CUSTO LÍQUIDO IMPORTAÇÃO, CUSTO LÍQUIDO TOTAL, CUSTO UNIT. LIQ.
- MKP, VALOR DOS PRODUTOS
- % ICMS, ICMS, IPI, ICMS ST
- TOTAL NF VENDA, VALOR UNITÁRIO C/ IPI E ICMS ST
- ICMS ST ENTRADA SP (se aplicável)
- CUSTO LÍQUIDO TOTAL, CUSTO UNIT. LIQ.

### 3. EST. DE CUSTO - IMP. ENC
Seções:
1. **Dados Cliente** - Nome, CNPJ, Endereço
2. **Mercadoria / Dados Complementares** - Produto, Data Câmbio, Incoterms
3. **Valor Aduaneiro**
   - Valor FOB (USD e R$)
   - Frete Internacional
   - Seguro
   - Total CIF
4. **Tributos de Nacionalização**
   - II (Imposto de Importação)
   - IPI-Imp.
   - PIS-Imp.
   - COFINS-Imp.
   - ICMS Antecipado
   - TX Siscomex
   - Total Tributos
5. **Lançamentos Custos Aduaneiros**
   - Liberação
   - Armazenagem
   - Frete interno
   - Taxa de Expediente
   - Despacho Aduaneiro
   - AFRMM
   - Total Despesas
6. **NF-e de Importação**
   - Produto
   - II
   - IPI-Imp.
   - Outras Despesas (PIS+COFINS+ICMS+TAXA SISCOMEX+AFRMM)
   - NF-e Nacionalização
7. **Outras Despesas Operacionais**
   - Pacote Logístico
   - Total
8. **Custo Líquido de Importação** (soma de tudo)
9. **Formação do Preço de Venda**
   - Custo Líquido
   - Markup
   - Preço Base
10. **Impostos sobre Venda** (conforme regime)
    - ICMS
    - PIS/COFINS
    - IPI (se aplicável)
11. **Impostos sobre Lucro** (conforme regime)
    - IRPJ
    - CSLL
12. **Preço Final de Venda**
13. **Análise de Viabilidade**
    - Margem Líquida
    - Lucro por unidade

## Problemas no Relatório Atual

1. **Fórmulas não estão calculando** - Células vazias na aba CUSTO MERCADORIA
2. **Falta seção de Formação de Preço de Venda**
3. **Falta seção de Impostos sobre Venda**
4. **Falta seção de Impostos sobre Lucro**
5. **Não considera TTD de Santa Catarina**
6. **Linhas de grade visíveis**

## TTD Santa Catarina
- Tratamento Tributário Diferenciado
- Redução de base de cálculo do ICMS
- Crédito presumido em operações interestaduais
- Deve ser aplicado automaticamente quando estado = SC
