# Guia de Migração de Banco de Dados

## Arquitetura Atual

O SUPPLEY Calc utiliza **MySQL/TiDB** como banco de dados, com **Drizzle ORM** como camada de abstração. Toda a lógica de acesso ao banco está isolada em:

- `server/db/config.ts` — Configuração centralizada e conexão
- `server/db/*.ts` — Módulos de query por domínio (userDb, supplierDb, etc.)
- `drizzle/schema.ts` — Definição de tabelas
- `drizzle.config.ts` — Configuração do Drizzle Kit

## Opções de Migração

### Opção 1: MySQL Dedicado (PlanetScale, Railway)

**Esforço: Mínimo** — Apenas trocar a `DATABASE_URL`.

1. Criar banco no provedor escolhido
2. Atualizar `DATABASE_URL` nos secrets do projeto
3. Executar `pnpm db:push` para criar as tabelas
4. Migrar dados com `mysqldump` + `mysql` import

```bash
# Exportar dados do banco atual
mysqldump -h <host_atual> -u <user> -p <database> > backup.sql

# Importar no novo banco
mysql -h <novo_host> -u <user> -p <database> < backup.sql
```

### Opção 2: PostgreSQL (Supabase, Neon)

**Esforço: Médio** — Requer alteração de dialeto.

1. Alterar imports no schema:
   ```ts
   // De:
   import { mysqlTable, varchar, int } from "drizzle-orm/mysql-core";
   // Para:
   import { pgTable, varchar, integer } from "drizzle-orm/pg-core";
   ```

2. Atualizar `drizzle.config.ts`:
   ```ts
   dialect: "postgresql",
   ```

3. Atualizar `server/db/config.ts`:
   ```ts
   import { drizzle } from "drizzle-orm/node-postgres";
   // ou para Neon:
   import { drizzle } from "drizzle-orm/neon-http";
   ```

4. Instalar driver:
   ```bash
   pnpm add pg
   # ou para Neon:
   pnpm add @neondatabase/serverless
   ```

5. Ajustar tipos incompatíveis:
   - `int()` → `integer()`
   - `mysqlTable()` → `pgTable()`
   - `mysqlEnum()` → `pgEnum()` (definir separadamente)
   - `bigint()` → `bigint()` (compatível)

6. Executar `pnpm db:push`

### Opção 3: SQLite (Turso, D1)

**Esforço: Alto** — Não recomendado para este projeto.

## Checklist de Migração

- [ ] Backup completo do banco atual
- [ ] Criar banco no novo provedor
- [ ] Atualizar `DATABASE_URL`
- [ ] Se mudou dialeto: atualizar schema, config e drivers
- [ ] Executar `pnpm db:push`
- [ ] Migrar dados existentes
- [ ] Testar todas as funcionalidades
- [ ] Atualizar SSL se necessário (`?ssl=true`)

## Variáveis de Ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string completa (mysql://user:pass@host:port/db) |

## Notas Importantes

- Todas as queries usam Drizzle ORM — nenhum SQL raw que impeça migração
- Os poucos usos de `sql` template são para ORDER BY e LIKE, compatíveis com todos os dialetos
- O schema está centralizado em `drizzle/schema.ts` e `drizzle/rfqSchema.ts`
- Timestamps são armazenados como UTC (compatível com qualquer banco)
