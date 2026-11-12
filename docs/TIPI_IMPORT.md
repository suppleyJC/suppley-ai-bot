# Importação de Tabela TIPI e NCM

**Data:** 24 de junho de 2026  
**Status:** Pronto para importação em produção  

## 📊 O Que Foi Preparado

### Tabela NCM Histórica
- **Fonte:** Resolução Gecex nº 812/2025
- **Cobertura:** 01/04/2022 até 24/06/2026
- **NCMs:** 266 códigos com descrição completa

### Tabela TIPI
- **Fonte:** Decreto nº 11.158/2022 + atualizações até 30/01/2026
- **Cobertura:** Tabela de Incidência do Imposto sobre Produtos Industrializados
- **NCMs:** 10.521 códigos com alíquotas IPI

### Total
- **NCMs Únicos:** 10.611 (merge de NCM + TIPI)
- **Alíquotas IPI:** Completas (0% a 42%)
- **Descrições:** Detalhadas, com histórico de vigência

---

## 🚀 Como Importar em Produção

### Opção 1: Via Script Bash (Recomendado)

```bash
cd /opt/suppley/suppley-ai-bot
./scripts/import-tipi.sh
```

O script irá:
1. ✓ Validar arquivo SQL
2. ✓ Conectar ao MySQL via DATABASE_URL
3. ✓ Inserir/atualizar 10.521 NCMs
4. ✓ Exibir estatísticas

**Tempo:** ~5-10 segundos

### Opção 2: Via Docker Compose

```bash
cd /opt/suppley/suppley-ai-bot

# Copiar SQL para container
docker cp drizzle/seed_tipi.sql suppley-mysql:/tmp/

# Executar no MySQL
docker exec suppley-mysql mysql -u root -p$MYSQL_ROOT_PASSWORD suppley < /tmp/seed_tipi.sql
```

### Opção 3: Manual via MySQL Client

```bash
mysql -h localhost -u root -p suppley < drizzle/seed_tipi.sql
```

---

## ✅ Validação Após Importação

```sql
-- Verificar total de NCMs
SELECT COUNT(*) as total FROM ncm_tax_rates;
-- Esperado: ~10.611 registros

-- Verificar alíquotas IPI
SELECT 
  ipiRate, 
  COUNT(*) as quantidade
FROM ncm_tax_rates 
WHERE ipiRate > 0
GROUP BY ipiRate 
ORDER BY quantidade DESC 
LIMIT 10;

-- Procurar um NCM específico (ex: eletrônicos)
SELECT ncmCode, description, ipiRate 
FROM ncm_tax_rates 
WHERE ncmCode LIKE '84%' 
LIMIT 5;

-- Verificar última atualização
SELECT COUNT(*) as updated_today 
FROM ncm_tax_rates 
WHERE DATE(updatedAt) = CURDATE();
```

---

## 🔧 Arquivos Gerados

| Arquivo | Descrição | Tamanho |
|---------|-----------|---------|
| `drizzle/seed_tipi.sql` | SQL de importação completo | 859 KB |
| `scripts/import-tipi.sh` | Script bash para facilitar import | 1.5 KB |
| `/tmp/tipi_import.json` | Dados TIPI em JSON (temp) | 413 KB |
| `/tmp/ncms_import.json` | Dados NCM em JSON (temp) | 52 KB |

---

## 📋 Dados na Tabela `ncm_tax_rates` Após Import

### Campos Preenchidos ✅
- `ncmCode` — Código NCM (8 dígitos, ex: 84711000)
- `description` — Descrição do produto
- `ipiRate` — Alíquota IPI (de TIPI)
- `updatedAt` — Data de importação

### Campos Vazios (Para Preenchimento Posterior) ⏳
- `iiRate` — Imposto de Importação (SISCOMEX)
- `pisRate` — Contribuição PIS
- `cofinsRate` — Contribuição COFINS
- `icmsRate` — ICMS (varia por estado)

---

## 🎯 Próximas Etapas

### Curto Prazo (Esta Semana)
1. [ ] Executar importação em produção
2. [ ] Validar dados via SQL (ver acima)
3. [ ] Testar classificação NCM no chat: "classifica um notebook"
4. [ ] Confirmar que as alíquotas IPI aparecem nas análises

### Médio Prazo (2-3 Semanas)
1. [ ] Popular `iiRate` (II) via dados SISCOMEX/Camex
2. [ ] Popular `pisRate` e `cofinsRate` via tabelas de referência
3. [ ] Validar cálculos de impostos contra Receita Federal

### Longo Prazo (4-8 Semanas)
1. [ ] Integração com ICMS por UF (varia conforme estado)
2. [ ] Pipeline de atualização automática (quando houver nova Resolução)
3. [ ] Histórico de vigência (mostrar NCMs descontinuados)

---

## 🔍 Resolução de Problemas

### Erro: "Access denied for user 'root'@'localhost'"
```bash
# Verificar que DATABASE_URL está definido no .env
echo $DATABASE_URL

# Ou passar credenciais diretamente
mysql -h 127.0.0.1 -u root -p"senha" suppley < drizzle/seed_tipi.sql
```

### Erro: "Table 'suppley.ncm_tax_rates' doesn't exist"
```bash
# Executar migrações Drizzle primeiro
cd /opt/suppley/suppley-ai-bot
pnpm db:push
```

### Validar se importação funcionou
```bash
docker exec suppley-mysql mysql -u root -p$MYSQL_ROOT_PASSWORD -e "SELECT COUNT(*) as total FROM suppley.ncm_tax_rates WHERE ipiRate > 0;"
```

---

## 📚 Referências

- **TIPI:** https://receita.economia.gov.br/acesso-rapido/tabelas/tipi (Decreto nº 11.158/2022)
- **NCM:** https://www.camex.gov.br/ (Resolução Gecex nº 812/2025)
- **Estrutura NCM:** Sistema Harmonizado (SH), 7ª Emenda

---

## 💾 Backup Anterior

Antes de rodar a importação, é recomendado fazer backup:

```bash
docker exec suppley-mysql \
  mysqldump -u root -p$MYSQL_ROOT_PASSWORD suppley ncm_tax_rates > ncm_tax_rates_backup_$(date +%Y%m%d_%H%M%S).sql
```

Restaurar se necessário:

```bash
docker exec suppley-mysql \
  mysql -u root -p$MYSQL_ROOT_PASSWORD suppley < ncm_tax_rates_backup_20260624_232500.sql
```

---

**Mantido por:** Time de Desenvolvimento Suppley  
**Última atualização:** 24 de junho de 2026
