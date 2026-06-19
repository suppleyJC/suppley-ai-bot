#!/usr/bin/env bash
#
# Aplica as migrations da FASE 2 (COMANDOS 2–5) no banco MySQL de produção,
# na ordem correta. Segue o mesmo padrão de conexão do scripts/load-ncm.sh
# (docker exec no container do banco).
#
# Migrations aplicadas (todas ADITIVAS — backward-compatible):
#   0020_operacoes_fase2_fields.sql  → prioridade, prazoDesejado, responsavelId, origemDesejada
#   0021_operacao_anexos.sql         → tabela operacao_anexos + enum de eventos
#   0022_operacao_financeiro.sql     → tabela operacao_financeiro + enum de eventos
#   0023_operacao_marcos.sql         → tabela operacao_marcos + enum de eventos
#
# IMPORTANTE: rode ANTES de subir o novo código. O código já referencia as
# colunas/tabelas novas — sem a migration, o app quebra.
#
# ATENÇÃO: estas migrations NÃO são idempotentes (ADD COLUMN / CREATE TABLE
# falham se já existirem). Rode UMA vez por ambiente. Se precisar reaplicar,
# verifique antes o que já existe no banco.
#
# USO (no servidor, dentro de /opt/suppley/suppley-ai-bot):
#   bash scripts/apply-fase2-migrations.sh
#
# Variáveis (opcionais — defaults batem com o docker-compose.prod.yml):
#   DB_CONTAINER (suppley_db) | DB_USER (suppley) | DB_PASSWORD | DB_NAME (suppley_calc)
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-suppley_db}"
DB_USER="${DB_USER:-suppley}"
DB_PASSWORD="${DB_PASSWORD:-SuppleyDb2024}"
DB_NAME="${DB_NAME:-suppley_calc}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRIZZLE_DIR="${SCRIPT_DIR}/../drizzle"

MIGRATIONS=(
  "0020_operacoes_fase2_fields.sql"
  "0021_operacao_anexos.sql"
  "0022_operacao_financeiro.sql"
  "0023_operacao_marcos.sql"
)

echo "[FASE2] Aplicando ${#MIGRATIONS[@]} migrations no banco '${DB_NAME}' (container '${DB_CONTAINER}')"
echo "[FASE2] Snapshot ANTES da operacoes (colunas novas):"
docker exec -i "$DB_CONTAINER" mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  -e "SHOW COLUMNS FROM operacoes LIKE 'prioridade';" 2>/dev/null || true

for m in "${MIGRATIONS[@]}"; do
  FILE="${DRIZZLE_DIR}/${m}"
  if [ ! -f "$FILE" ]; then
    echo "ERRO: não encontrei $FILE" >&2
    exit 1
  fi
  echo "[FASE2] → aplicando ${m} ..."
  docker exec -i "$DB_CONTAINER" \
    mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$FILE"
  echo "[FASE2]   ok"
done

echo "[FASE2] Verificação pós-migration:"
docker exec -i "$DB_CONTAINER" mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  SELECT 'operacoes.prioridade' AS check_item,
         COUNT(*) AS found
  FROM information_schema.columns
  WHERE table_schema = '${DB_NAME}' AND table_name = 'operacoes' AND column_name = 'prioridade'
  UNION ALL
  SELECT 'table operacao_anexos', COUNT(*) FROM information_schema.tables
  WHERE table_schema = '${DB_NAME}' AND table_name = 'operacao_anexos'
  UNION ALL
  SELECT 'table operacao_financeiro', COUNT(*) FROM information_schema.tables
  WHERE table_schema = '${DB_NAME}' AND table_name = 'operacao_financeiro'
  UNION ALL
  SELECT 'table operacao_marcos', COUNT(*) FROM information_schema.tables
  WHERE table_schema = '${DB_NAME}' AND table_name = 'operacao_marcos';
"

echo "[FASE2] ✅ Migrations aplicadas. Agora pode subir o novo código (deploy)."
