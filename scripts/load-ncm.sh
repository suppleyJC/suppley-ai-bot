#!/usr/bin/env bash
#
# Carrega as alíquotas de II (Imposto de Importação) por NCM no banco MySQL de
# produção, a partir de data/ncm_import.sql.gz.
#
# O .sql.gz é gerado por scripts/build_ncm_seed.py a partir do arquivo OFICIAL do
# MDIC (Anexos I a X da Res. GECEX 272/21 — Tarifas Vigentes), consolidando TEC +
# alíquota aplicada + elevações temporárias (DCC, ex.: aço a 25%).
#
# Idempotente: usa INSERT ... ON DUPLICATE KEY UPDATE que atualiza APENAS iiRate +
# notes, preservando IPI/PIS/COFINS/descrição já cadastrados. Pode rodar à vontade.
#
# PARA ATUALIZAR (quando a CAMEX mudar alíquotas):
#   1. Baixe o xlsx novo das Tarifas Vigentes (gov.br/mdic)
#   2. python3 scripts/build_ncm_seed.py /caminho/tec_vigente.xlsx
#   3. bash scripts/load-ncm.sh
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
