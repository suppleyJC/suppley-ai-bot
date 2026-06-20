#!/usr/bin/env bash
#
# Inicializa o banco MySQL do ZERO, aplicando TODAS as migrations (0000→0024)
# em ordem. Use para um deploy limpo, sem dados anteriores.
#
# Por que existe: as migrations 0000-0016 foram geradas pelo drizzle-kit (com
# marcadores '--> statement-breakpoint', que não são SQL válido via pipe) e as
# 0017-0024 foram escritas à mão. Este script normaliza tudo e aplica via
# `docker exec ... mysql`, garantindo o schema completo num banco recém-criado.
#
# Importante:
#   - Usa SOMENTE as migrations rastreadas pelo git (ignora arquivos .sql órfãos
#     que possam existir no diretório drizzle/ de deploys antigos).
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

# Aplica SOMENTE as migrations rastreadas pelo git, em ordem.
echo "[INIT] Aplicando migrations rastreadas pelo git ..."
MIGRATIONS=$(git -C "$REPO_DIR" ls-files 'drizzle/*.sql' | sort)
if [ -z "$MIGRATIONS" ]; then
  echo "ERRO: nenhuma migration rastreada encontrada em drizzle/" >&2
  exit 1
fi

while IFS= read -r REL; do
  [ -z "$REL" ] && continue
  NAME=$(basename "$REL")
  echo "[INIT] → aplicando ${NAME} ..."
  # Remove os marcadores '--> statement-breakpoint' do drizzle antes de aplicar.
  grep -v "statement-breakpoint" "${REPO_DIR}/${REL}" | docker exec -i "$DB_CONTAINER" \
    mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
  echo "[INIT]   ok"
done <<< "$MIGRATIONS"

AFTER=$(mysql_exec -N -s -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" \
  2>/dev/null || echo "?")
echo ""
echo "[INIT] ✅ Concluído. Tabelas depois: ${AFTER}"
echo "[INIT] Tabelas-chave presentes:"
mysql_exec -N -s -e "SHOW TABLES;" | grep -E \
  "^(users|operacoes|sofia_chat_messages|conversas|company_settings)$" || true
echo ""
echo "[INIT] Coluna conversaId em sofia_chat_messages (esperado: 1):"
mysql_exec -N -s -e \
  "SELECT COUNT(*) FROM information_schema.columns \
   WHERE table_schema='${DB_NAME}' AND table_name='sofia_chat_messages' \
   AND column_name='conversaId';"
