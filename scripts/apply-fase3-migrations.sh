#!/usr/bin/env bash
#
# Aplica as migrations da FASE 3 no banco MySQL de produção.
# Segue o mesmo padrão de scripts/apply-fase2-migrations.sh (docker exec no DB).
#
# Migrations (ADITIVAS — backward-compatible):
#   0024_conversas.sql  → tabela `conversas` + coluna `conversaId` em sofia_chat_messages
#
# IMPORTANTE: rode ANTES de subir o novo código.
#
# ATENÇÃO: NÃO idempotente (CREATE TABLE / ADD COLUMN falham se já existirem).
# Rode UMA vez por ambiente.
#
# USO (no servidor, dentro de /opt/suppley/suppley-ai-bot):
#   bash scripts/apply-fase3-migrations.sh
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-suppley_db}"
DB_USER="${DB_USER:-suppley}"
DB_PASSWORD="${DB_PASSWORD:-SuppleyDb2024}"
DB_NAME="${DB_NAME:-suppley_calc}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRIZZLE_DIR="${SCRIPT_DIR}/../drizzle"

MIGRATIONS=(
  "0024_conversas.sql"
)

echo "[FASE3] Aplicando ${#MIGRATIONS[@]} migration(s) no banco '${DB_NAME}' (container '${DB_CONTAINER}')"

for m in "${MIGRATIONS[@]}"; do
  FILE="${DRIZZLE_DIR}/${m}"
  if [ ! -f "$FILE" ]; then
    echo "ERRO: não encontrei $FILE" >&2
    exit 1
  fi
  echo "[FASE3] → aplicando ${m} ..."
  docker exec -i "$DB_CONTAINER" \
    mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$FILE"
  echo "[FASE3]   ok"
done

echo "[FASE3] Verificação pós-migration:"
docker exec -i "$DB_CONTAINER" mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  SELECT 'table conversas' AS check_item, COUNT(*) AS found FROM information_schema.tables
  WHERE table_schema = '${DB_NAME}' AND table_name = 'conversas'
  UNION ALL
  SELECT 'sofia_chat_messages.conversaId', COUNT(*) FROM information_schema.columns
  WHERE table_schema = '${DB_NAME}' AND table_name = 'sofia_chat_messages' AND column_name = 'conversaId';
"

echo "[FASE3] ✅ Migrations aplicadas. Agora pode subir o novo código (deploy)."
