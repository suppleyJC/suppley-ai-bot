# Deploy — Fase 2 (COMANDOS 1–5)

Roteiro para colocar em produção o painel de operações enriquecido
(prioridade, anexos, financeiro, marcos). Tudo já está no branch
`claude/manus-migration-independent-1kfrll`.

## ⚠️ Ordem obrigatória

O código já referencia as colunas/tabelas novas. **Migrations primeiro, código
depois** — caso contrário o app quebra (coluna/tabela inexistente).

```
1º  aplicar as 4 migrations (0020–0023)
2º  deploy do código (build + up dos containers)
3º  validar
```

## O que entra

| Migration | Conteúdo | Risco |
|---|---|---|
| `0020_operacoes_fase2_fields.sql` | `operacoes` += prioridade, prazoDesejado, responsavelId, origemDesejada | Aditivo |
| `0021_operacao_anexos.sql` | tabela `operacao_anexos` + enum de eventos | Aditivo |
| `0022_operacao_financeiro.sql` | tabela `operacao_financeiro` + enum de eventos | Aditivo |
| `0023_operacao_marcos.sql` | tabela `operacao_marcos` + enum de eventos | Aditivo |

> Todas são **aditivas** (ADD COLUMN / CREATE TABLE / ALTER enum expandindo).
> Backward-compatible: o código antigo continua funcionando se preciso reverter
> o deploy do app sem reverter o banco.

---

## Passo 1 — Backup do banco (recomendado)

```bash
cd /opt/suppley/suppley-ai-bot
docker exec suppley_db sh -c \
  'exec mysqldump -u suppley -p"$MYSQL_PASSWORD" suppley_calc' \
  > backup-pre-fase2-$(date +%F).sql
```

## Passo 2 — Aplicar as migrations

```bash
cd /opt/suppley/suppley-ai-bot
git fetch origin
git checkout claude/manus-migration-independent-1kfrll
git pull origin claude/manus-migration-independent-1kfrll

# aplica 0020–0023 em ordem, com verificação automática ao final
bash scripts/apply-fase2-migrations.sh
```

O script imprime, ao final, uma checagem confirmando que `operacoes.prioridade`
e as 3 tabelas novas existem (cada item deve retornar `1`).

> As variáveis de conexão (DB_CONTAINER/DB_USER/DB_PASSWORD/DB_NAME) têm
> defaults iguais aos do `docker-compose.yml`. Se o seu `.env.production`
> usa outra senha, exporte `DB_PASSWORD=...` antes de rodar.

## Passo 3 — Deploy do código

```bash
cd /opt/suppley/suppley-ai-bot
bash scripts/deploy.sh production
```

(O `deploy.sh` faz build Docker, sobe os containers e checa `/health`.)

## Passo 4 — Validar em produção

1. Abrir `/operacoes` → o Kanban deve mostrar as 5 colunas com os rótulos novos
   (incl. **Nacionalização / Entrega** no lugar de Câmbio).
2. Abrir uma operação (`/operacao/:id`):
   - Barra de metadados: trocar **Prioridade** e **Prazo desejado** (salva via
     `operations.update`).
   - **Marcos**: registrar um marco (ex.: "Pedido Confirmado") → aparece na
     esteira visual e na timeline.
   - **Anexos**: subir um PDF → aparece na lista e gera evento na timeline.
   - **Financeiro**: lançar um custo → resumo (entradas/saídas/saldo) atualiza
     e gera evento na timeline.
3. **Pendência antiga — NCM 7308.40.00:** rodar um cálculo real pela aba de
   cálculo e confirmar **II 25%** (não 14%). O banco já está com 2500 bp; falta
   só confirmar que a app lê o valor certo.

## Rollback

- **Só do app** (mantendo o banco): redeploy do commit anterior. As migrations
  aditivas não atrapalham o código antigo.
- **Do banco** (se realmente necessário):

```sql
ALTER TABLE operacoes
  DROP COLUMN origemDesejada, DROP COLUMN prioridade,
  DROP COLUMN prazoDesejado, DROP COLUMN responsavelId;
DROP TABLE operacao_anexos;
DROP TABLE operacao_financeiro;
DROP TABLE operacao_marcos;
-- (o enum ampliado de operacao_eventos pode permanecer; é compatível)
```

---

## Depois do deploy

Seguimos para o **COMANDO 6** — 5 tools da Excambia que consomem os serviços
já prontos (`anexarDocumento`, `lancarFinanceiro`, `registrarMarco`). Essas
mudanças são **backend puro** (sem migration), então o próximo deploy é mais
simples.
