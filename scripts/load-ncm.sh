#!/usr/bin/env bash
#
# Carrega a tabela NCM (códigos + descrições + alíquotas-padrão por capítulo)
# no banco MySQL de produção, a partir de data/ncm_import.sql.gz.
#
# Idempotente: usa INSERT ... ON DUPLICATE KEY UPDATE (atualiza só a descrição,
# preservando alíquotas reais já cadastradas). Pode rodar quantas vezes quiser.
#
# USO (no servidor, dentro de /opt/suppley/suppley-ai-bot):
#   bash scripts/load-ncm.sh
#
# Variáveis (opcionais — defaults batem com o docker-compose.prod.yml):
#   DB_CONTAINER (suppley_db) | DB_USER (suppley) | DB_PASSWORD | DB_NAME (suppley_calc)
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-suppley_db}"
DB_USER="${DB_USER:-suppley}"
DB_PASSWORD="${DB_PASSWORD:-SuppleyDb2024}"
DB_NAME="${DB_NAME:-suppley_calc}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_GZ="${SCRIPT_DIR}/../data/ncm_import.sql.gz"

if [ ! -f "$SQL_GZ" ]; then
  echo "ERRO: não encontrei $SQL_GZ" >&2
  exit 1
fi

echo "[NCM] Carregando $(basename "$SQL_GZ") no banco '${DB_NAME}' (container '${DB_CONTAINER}')..."
gunzip -c "$SQL_GZ" | docker exec -i "$DB_CONTAINER" \
  mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"

echo "[NCM] Contagem final de NCMs na tabela:"
docker exec -i "$DB_CONTAINER" \
  mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  -e "SELECT COUNT(*) AS total_ncm FROM ncm_tax_rates;"

echo "[NCM] Concluído. Lembre de limpar o cache de NCM (endpoint ncm.clearCache) ou reiniciar o container."
