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
# Variáveis (opcionais — defaults batem com o docker-compose.yml):
#   DB_CONTAINER (suppley-mysql) | DB_USER | DB_PASSWORD | DB_NAME (suppley_calc)
# Sem DB_USER/DB_PASSWORD o script lê as credenciais do próprio container, então
# não há senha fixa aqui nem risco de divergir da que o banco realmente usa.
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-suppley-mysql}"
DB_NAME="${DB_NAME:-suppley_calc}"

if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  echo "ERRO: container '$DB_CONTAINER' não existe. Containers de banco no host:" >&2
  docker ps --filter ancestor=mysql:8.0 --format '  - {{.Names}} ({{.Status}})' >&2
  echo "Defina DB_CONTAINER=<nome> e rode de novo." >&2
  exit 1
fi

DB_USER="${DB_USER:-$(docker exec "$DB_CONTAINER" printenv MYSQL_USER 2>/dev/null || echo suppley)}"
DB_PASSWORD="${DB_PASSWORD:-$(docker exec "$DB_CONTAINER" printenv MYSQL_PASSWORD 2>/dev/null || true)}"

if [ -z "$DB_PASSWORD" ]; then
  echo "ERRO: não consegui obter a senha do container. Passe DB_PASSWORD=... na chamada." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_GZ="${SCRIPT_DIR}/../data/ncm_import.sql.gz"

if [ ! -f "$SQL_GZ" ]; then
  echo "ERRO: não encontrei $SQL_GZ" >&2
  exit 1
fi

echo "[NCM] Carregando $(basename "$SQL_GZ") no banco '${DB_NAME}' (container '${DB_CONTAINER}')..."
gunzip -c "$SQL_GZ" | docker exec -i -e MYSQL_PWD="$DB_PASSWORD" "$DB_CONTAINER" \
  mysql -u "$DB_USER" "$DB_NAME"

echo "[NCM] Contagem final de NCMs na tabela:"
docker exec -i -e MYSQL_PWD="$DB_PASSWORD" "$DB_CONTAINER" \
  mysql -u "$DB_USER" "$DB_NAME" \
  -e "SELECT COUNT(*) AS total_ncm FROM ncm_tax_rates;"

echo "[NCM] Concluído. Lembre de limpar o cache de NCM (endpoint ncm.clearCache) ou reiniciar o container."
