# 🚨 Guia de Recuperação — Problema de Produção (2026-06-25)

## Status

**Critico** — Produtos não podem ser criados/importados. Migração 0030 pode não ter sido aplicada.

---

## Sintomas Observados

1. ✗ Produtos cadastrados anteriormente desapareceram
2. ✗ Erro ao distribuir proformas: `Failed query: insert into products (...)`
3. ✗ Layout parece revertido para versão anterior
4. ✗ Funcionalidades esperadas não aparecem

---

## Causa Provável

**A migração 0030 (`drizzle/0030_add_classification_to_products.sql`) não foi aplicada corretamente em produção.**

Isso causa:
- Colunas `classe`, `criticidade`, `subcategoria`, `tags` ausentes
- Código espera essas colunas mas não encontra
- INSERT falha com erro incompleto

---

## Diagnóstico

### Step 1: Conectar ao Banco de Dados

```bash
# Via Docker (na máquina de produção):
docker exec -it suppley-mysql mysql -u suppley -p<SUA_SENHA> suppley_calc

# Via MySQL Workbench (se tiver acesso remoto):
# Host: calculasupley.com.br
# User: suppley
# Password: (de .env)
```

### Step 2: Verificar se Colunas Existem

```sql
-- Dentro do MySQL:
DESC products;

-- Procure por:
-- classe
-- criticidade
-- subcategoria
-- tags

-- Se NÃO aparecerem, a migração não foi aplicada.
```

### Step 3: Verificar Versão do Código

```bash
# Na máquina de produção:
cd /caminho/para/suppley-ai-bot
git log --oneline -1

# Deve mostrar: cfb157b ou mais recente
```

---

## Planos de Recuperação

### Opção A: Aplicar Migração 0030 (Recomendado)

Se as colunas **NÃO existem**:

```bash
# Na máquina de produção:
cd /caminho/para/suppley-ai-bot

# Aplicar migração:
docker exec -i suppley-mysql mysql -u suppley -p<SUA_SENHA> suppley_calc < drizzle/0030_add_classification_to_products.sql

# Verificar sucesso:
docker exec -it suppley-mysql mysql -u suppley -p<SUA_SENHA> suppley_calc -e "DESC products LIKE 'classe';"
# Deve retornar a coluna
```

### Opção B: Redeployar Completo

Se aplicar a migração manualmente não funcionar:

```bash
# Na máquina de produção:
cd /caminho/para/suppley-ai-bot

# Backup do .env
cp .env .env.backup-$(date +%Y%m%d-%H%M%S)

# Redeploy (rodará migração automaticamente):
./redeploy.sh

# Monitorar output — deve dizer "Migração 0030 aplicada"
```

### Opção C: Restaurar de Backup

Se houver backup anterior a 25/06/2026:

```bash
# Contactar DevOps/Infra para restaurar DB
# Depois rodar redeploy.sh novamente
```

---

## Dados Perdidos

❌ **Se produtos desapareceram**, eles podem estar:

1. **Em backup** — Restaurar banco de dados
2. **Soft-deleted** — Verificar coluna `deletedAt`:
   ```sql
   SELECT COUNT(*) FROM products WHERE deletedAt IS NOT NULL;
   ```
3. **Realmente apagados** — Sem recuperação

---

## Próximas Ações

### Após Aplicar Migração

1. **Redeploy imediatamente**:
   ```bash
   ./redeploy.sh
   ```

2. **Testar importação de proformas**:
   - Ir para "Proformas"
   - Tentar enviar um novo PDF/arquivo
   - Verificar se os produtos são criados

3. **Verificar Ativos & Insumos**:
   - Ir para "Ativos & Insumos"
   - Deve mostrar produtos com classificação (classe, criticidade)
   - Filtros devem funcionar

### Validações

```bash
# Na máquina de produção, testar conectividade:
curl http://localhost:3000/

# Deve retornar HTTP 200

# Checar logs:
docker-compose logs -f app --tail 100

# Procure por erros tipo:
# [Database] Failed to connect
# [Error] Insert failed
```

---

## Questões Frequentes

**P: Como isso aconteceu?**
R: Provável redeployment parcial ou rollback que não aplicou todas as migrações.

**P: Vou perder os dados?**
R: Não, se aplicar a migração. As colunas já existem ou será adicionadas. Dados antigos em outras colunas são preservados.

**P: Preciso fazer downtime?**
R: Não, se usar a migração. Se usar redeploy.sh, alguns segundos de downtime (containers restarting).

**P: Como evitar no futuro?**
R: Ver `SECURITY.md` e `DEPLOYMENT_GUIDE.md` para melhorar pipeline de deploy.

---

## Escalação

Se após aplicar migração **ainda houver problemas**:

1. Coletar logs completos:
   ```bash
   docker-compose logs > logs-$(date +%Y%m%d-%H%M%S).txt
   ```

2. Verificar código vs banco:
   ```sql
   -- No MySQL:
   SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
   FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_NAME = 'products' 
   ORDER BY ORDINAL_POSITION;
   ```

3. Contactar desenvolvimento com logs

---

## Referências

- `DEPLOYMENT_GUIDE.md` — Procedimento padrão de deploy
- `SECURITY.md` — Credenciais e segurança
- `drizzle/0030_add_classification_to_products.sql` — Migração
- `redeploy.sh` — Script de redeploy idempotente

**Last Updated:** 2026-06-25  
**Status:** Em diagnóstico  
**Responsável:** DevOps/Infra
