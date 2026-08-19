#!/usr/bin/env bash
#
# Inicializa o banco MySQL do ZERO aplicando o schema completo gerado a partir
# de schema.ts (drizzle/_full_schema.sql). Use para um deploy limpo, sem dados.
#
# Por que NÃO as migrations SQL numeradas: elas estão dessincronizadas do
# schema.ts (faltam colunas que o app usa, ex: users.passwordHash). O arquivo
# _full_schema.sql vem de `drizzle-kit export` e corresponde exatamente ao que
# o app espera — é a fonte da verdade.
#
# Importante:
#   - RESETA o banco (dropa todas as tabelas) antes de aplicar — é re-executável.
#
# USO (no servidor, em /opt/suppley/suppley-ai-bot):
#   bash scripts/init-fresh-db.sh
#
# ATENÇÃO: APAGA todas as tabelas de ${DB_NAME}. Use só em deploy limpo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Carrega credenciais do .env (mesma fonte do docker-compose), se existir.
if [ -f "${REPO_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${REPO_DIR}/.env"
  set +a
fi

DB_CONTAINER="${DB_CONTAINER:-suppley-mysql}"
DB_USER="${DB_USER:-suppley}"
DB_PASSWORD="${DB_PASSWORD:-changeme}"
DB_NAME="${DB_NAME:-suppley_calc}"

mysql_exec() {
  docker exec -i "$DB_CONTAINER" mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" "$@"
}

echo "[INIT] Banco alvo: '${DB_NAME}' no container '${DB_CONTAINER}'"

BEFORE=$(mysql_exec -N -s -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" \
  2>/dev/null || echo "?")
echo "[INIT] Tabelas antes: ${BEFORE}"

# RESET: dropa todas as tabelas existentes (clean slate, re-executável).
# CHAR(96) = crase, para citar nomes de tabela sem dor de cabeça com escaping.
echo "[INIT] Resetando banco (dropando todas as tabelas) ..."
DROP_LIST=$(mysql_exec -N -s -e \
  "SELECT GROUP_CONCAT(CONCAT(CHAR(96), table_name, CHAR(96))) \
   FROM information_schema.tables WHERE table_schema='${DB_NAME}';" 2>/dev/null || echo "")
if [ -n "$DROP_LIST" ] && [ "$DROP_LIST" != "NULL" ]; then
  mysql_exec -e "SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS ${DROP_LIST}; SET FOREIGN_KEY_CHECKS=1;"
  echo "[INIT]   tabelas removidas"
else
  echo "[INIT]   banco já estava vazio"
fi

# Aplica o schema COMPLETO gerado de schema.ts (drizzle/_full_schema.sql).
#
# Por que não as migrations SQL numeradas: elas estão dessincronizadas do
# schema.ts (ex: faltam as colunas de auth local em `users` — passwordHash,
# isEmailVerified, etc.), o que quebra login/cadastro. O arquivo _full_schema.sql
# é gerado por `drizzle-kit export` e corresponde EXATAMENTE ao que o app espera.
SCHEMA_FILE="${REPO_DIR}/drizzle/_full_schema.sql"
if [ ! -f "$SCHEMA_FILE" ]; then
  echo "ERRO: não encontrei ${SCHEMA_FILE}" >&2
  exit 1
fi
echo "[INIT] Aplicando schema completo (drizzle/_full_schema.sql) ..."
docker exec -i "$DB_CONTAINER" \
  mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$SCHEMA_FILE"
echo "[INIT]   ok"

AFTER=$(mysql_exec -N -s -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" \
  2>/dev/null || echo "?")
echo ""
echo "[INIT] ✅ Concluído. Tabelas depois: ${AFTER}"
echo "[INIT] Tabelas-chave presentes:"
mysql_exec -N -s -e "SHOW TABLES;" | grep -E \
  "^(users|operacoes|sofia_chat_messages|conversas|company_settings)$" || true
echo ""
echo "[INIT] Colunas críticas (esperado: 1 em cada):"
echo -n "  users.passwordHash:            "
mysql_exec -N -s -e \
  "SELECT COUNT(*) FROM information_schema.columns \
   WHERE table_schema='${DB_NAME}' AND table_name='users' AND column_name='passwordHash';"
echo -n "  sofia_chat_messages.conversaId: "
mysql_exec -N -s -e \
  "SELECT COUNT(*) FROM information_schema.columns \
   WHERE table_schema='${DB_NAME}' AND table_name='sofia_chat_messages' \
   AND column_name='conversaId';"
