# APIs de Legislação Tributária para Importação

## 1. API Siscomex - Tratamento Tributário (TTCE)

**URL Base:** `https://portalunico.siscomex.gov.br/ttce`

**Endpoint Principal:**
- `POST /api/ext/tratamentos-tributarios/importacao/`

**Descrição:** Sistema responsável pelo cálculo de tributos incidentes na Importação, Exportação e Transporte de mercadorias. Com base nas informações de NCM, país de origem e valor aduaneiro, o sistema retorna o cálculo dos tributos incidentes.

**Ambientes:**
- Homologação: `hom.pucomex.serpro.gov.br`
- Validação: `val.portalunico.siscomex.gov.br`
- Produção: `portalunico.siscomex.gov.br`

**Autenticação:** Requer certificado digital e perfil de acesso.

**Limitação:** API requer autenticação com certificado digital (e-CPF/e-CNPJ), não é pública.

---

## 2. API IBPT - Tributação

**URL:** `https://api-ibpt.seunegocionanuvem.com.br/`

**Descrição:** Permite consultar a tributação de produtos e serviços no Brasil com base nos dados do IBPT, individualmente ou em massa por estado.

**Dados disponíveis:**
- Alíquotas federais (II, IPI, PIS, COFINS)
- Alíquotas estaduais (ICMS)
- Carga tributária total

---

## 3. Download NCM - Receita Federal

**URL:** `https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/classificacao-fiscal-de-mercadorias/download-ncm-nomenclatura-comum-do-mercosul`

**Formatos disponíveis:**
- JSON: tabela NCM completa
- CSV: tabela NCM para importação

**Sistema Classif:** Consulta online de NCM com alíquotas

---

## 4. API ComexStat - MDIC

**URL:** `https://api-comexstat.mdic.gov.br/docs`

**Descrição:** Estatísticas de comércio exterior do Brasil. Permite consultar dados históricos de importação/exportação por NCM.

---

## 5. Cosmos Bluesoft API

**URL:** `http://cosmos.bluesoft.com.br/api`

**Endpoints:**
- `GET /ncms/{codigo}` - Detalhes do NCM e produtos vinculados
- `GET /products?query={descrição ou gtin}` - Lista de produtos

---

## Estratégia Recomendada

### Abordagem Híbrida:

1. **Tabela NCM Local (já implementada)**
   - Manter tabela `ncm_tax_rates` com alíquotas padrão
   - Atualizar periodicamente via download da Receita Federal

2. **Consulta IBPT para validação**
   - Usar API IBPT para validar alíquotas quando disponível
   - Fallback para tabela local

3. **Link para consulta oficial**
   - Exibir link para Sistema Classif da Receita Federal
   - Permitir usuário validar NCM manualmente

4. **Atualização automática**
   - Job periódico para baixar tabela NCM atualizada
   - Notificar usuário quando houver mudanças

---

## Legislação de Referência

### Portal da Legislação (Planalto)
- **URL:** https://www4.planalto.gov.br/legislacao
- **Uso:** Consulta de leis, decretos e regulamentos

### Principais Normas:
- **Decreto 6.759/2009** - Regulamento Aduaneiro
- **Lei 10.865/2004** - PIS/COFINS Importação
- **Lei 4.502/1964** - IPI
- **Resolução Camex** - TEC (Tarifa Externa Comum)
