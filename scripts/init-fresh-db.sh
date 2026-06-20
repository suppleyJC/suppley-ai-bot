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
# USO (no servidor, em /opt/suppley/suppley-ai-bot):
#   bash scripts/init-fresh-db.sh
#
# ATENÇÃO: assume banco VAZIO (deploy limpo). Remove a tabela `conversas` órfã
# (resíduo de migration parcial) se existir, mas NÃO apaga outras tabelas.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRIZZLE_DIR="${SCRIPT_DIR}/../drizzle"

# Carrega credenciais do .env (mesma fonte do docker-compose), se existir.
if [ -f "${SCRIPT_DIR}/../.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${SCRIPT_DIR}/../.env"
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

# Remove a tabela órfã da migration parcial 0024 (será recriada por 0024).
echo "[INIT] Removendo tabela órfã 'conversas' (se existir) ..."
mysql_exec -e "SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS conversas; SET FOREIGN_KEY_CHECKS=1;"

# Aplica todas as migrations numeradas em ordem.
for FILE in $(ls "${DRIZZLE_DIR}"/[0-9]*.sql | sort); do
  NAME=$(basename "$FILE")
  echo "[INIT] → aplicando ${NAME} ..."
  # Remove os marcadores '--> statement-breakpoint' do drizzle antes de aplicar.
  grep -v "statement-breakpoint" "$FILE" | docker exec -i "$DB_CONTAINER" \
    mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
  echo "[INIT]   ok"
done

AFTER=$(mysql_exec -N -s -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}';" \
  2>/dev/null || echo "?")
echo ""
echo "[INIT] ✅ Concluído. Tabelas depois: ${AFTER}"
echo "[INIT] Verificação de tabelas-chave:"
mysql_exec -N -s -e "SHOW TABLES;" | grep -E \
  "^(users|operacoes|sofia_chat_messages|conversas|company_settings)$" || true
echo ""
echo "[INIT] Confirme a coluna conversaId em sofia_chat_messages:"
mysql_exec -N -s -e \
  "SELECT COUNT(*) AS conversaId_ok FROM information_schema.columns \
   WHERE table_schema='${DB_NAME}' AND table_name='sofia_chat_messages' \
   AND column_name='conversaId';"
