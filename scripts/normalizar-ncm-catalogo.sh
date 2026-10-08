#!/usr/bin/env bash
#
# NORMALIZAÇÃO DO CATÁLOGO — grava uma grafia só para cada NCM.
#
# POR PADRÃO NÃO ALTERA NADA. Roda em modo seco e imprime exatamente o que
# faria. Só escreve com --aplicar.
#
# O QUE ELE CONSERTA (e só isso):
#   produtos cujo código, depois de normalizado para 8 dígitos, EXISTE na
#   nomenclatura mas está gravado com outra grafia — '3923.30.90', '3923.3090',
#   '3923309000' viram todos '39233090'. São 1.368 produtos (38,3% do catálogo),
#   e o conserto é determinístico: nenhuma decisão de classificação está em jogo.
#
# O QUE ELE NÃO TOCA, DE PROPÓSITO:
#   - código que normaliza para algo INEXISTENTE na nomenclatura (963 produtos,
#     dos quais 736 são subposição completada com '00', como '3923.30.00').
#     Corrigir isso é ESCOLHER o item certo — classificação, não formatação.
#   - código parcial ('3923', '3304.99') e ausente ('<UNKNOWN>'): 300 produtos
#     que precisam ser classificados do zero.
#   - `proforma_items`: é o registro fiel do que o documento do fornecedor
#     dizia. O catálogo é a fonte da declaração; a proforma é prova documental,
#     e reescrevê-la apagaria a diferença entre as duas coisas.
#
# SEGURANÇA: a troca é feita por JOIN contra `ncm_tax_rates`, então um produto
# só muda se o destino existir de fato. Cada alteração é registrada em
# `ncm_normalizacao_log` (de → para, por produto), o que dá reversão e a trilha
# de auditoria que a DUIMP exige.
#
# USO (no servidor, dentro de /opt/suppley/suppley-ai-bot):
#   bash scripts/normalizar-ncm-catalogo.sh              # modo seco (padrão)
#   bash scripts/normalizar-ncm-catalogo.sh --aplicar    # grava
#
# Variáveis (opcionais — defaults batem com o docker-compose.yml):
#   DB_CONTAINER (suppley-mysql) | DB_USER | DB_PASSWORD | DB_NAME (suppley_calc)
set -euo pipefail

APLICAR=0
[ "${1:-}" = "--aplicar" ] && APLICAR=1

DB_CONTAINER="${DB_CONTAINER:-suppley-mysql}"
DB_NAME="${DB_NAME:-suppley_calc}"

if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  echo "ERRO: container '$DB_CONTAINER' não existe." >&2
  exit 1
fi

DB_USER="${DB_USER:-$(docker exec "$DB_CONTAINER" printenv MYSQL_USER 2>/dev/null || echo suppley)}"
DB_PASSWORD="${DB_PASSWORD:-$(docker exec "$DB_CONTAINER" printenv MYSQL_PASSWORD 2>/dev/null || true)}"

if [ -z "$DB_PASSWORD" ]; then
  echo "ERRO: não consegui obter a senha do container. Passe DB_PASSWORD=... na chamada." >&2
  exit 1
fi

consulta() {
  docker exec -i -e MYSQL_PWD="$DB_PASSWORD" "$DB_CONTAINER" \
    mysql -u "$DB_USER" "$DB_NAME" --table --default-character-set=utf8mb4
}

# Alvo: normaliza para 8 dígitos e exige que o destino EXISTA na nomenclatura.
# É o mesmo predicado no modo seco e na escrita — o que você vê é o que grava.
ALVO="
FROM products p
JOIN ncm_tax_rates t
  ON t.ncmCode = LEFT(REGEXP_REPLACE(p.ncmCode, '[^0-9]', ''), 8)
WHERE CHAR_LENGTH(REGEXP_REPLACE(p.ncmCode, '[^0-9]', '')) >= 8
  AND p.ncmCode <> t.ncmCode"

echo "═══════════════════════════════════════════════════════════════════"
if [ "$APLICAR" = "1" ]; then
  echo " NORMALIZAÇÃO DO CATÁLOGO — MODO ESCRITA"
else
  echo " NORMALIZAÇÃO DO CATÁLOGO — MODO SECO (nada será alterado)"
fi
echo " banco '${DB_NAME}' · container '${DB_CONTAINER}'"
echo "═══════════════════════════════════════════════════════════════════"

echo
echo "── O QUE SERÁ ALTERADO ────────────────────────────────────────────"
consulta <<SQL
SELECT COUNT(*) AS produtos_a_normalizar,
       COUNT(DISTINCT t.ncmCode) AS ncms_distintas
${ALVO};
SQL

echo "   Amostra (grafia atual → grafia canônica):"
consulta <<SQL
SELECT p.ncmCode AS de, t.ncmCode AS para, COUNT(*) AS produtos
${ALVO}
GROUP BY p.ncmCode, t.ncmCode
ORDER BY produtos DESC
LIMIT 25;
SQL

echo
echo "── O QUE NÃO SERÁ TOCADO (exige classificação, não formatação) ────"
consulta <<'SQL'
SELECT motivo, COUNT(*) AS produtos FROM (
  SELECT CASE
    WHEN REGEXP_REPLACE(p.ncmCode, '[^0-9]', '') = ''
      OR LEFT(REGEXP_REPLACE(p.ncmCode, '[^0-9]', ''), 8) = '00000000'
      THEN 'sem classificacao (<UNKNOWN>, 00000000)'
    WHEN CHAR_LENGTH(REGEXP_REPLACE(p.ncmCode, '[^0-9]', '')) IN (2,4,6)
      THEN 'parcial — e um nivel da hierarquia, nao um item'
    WHEN CHAR_LENGTH(REGEXP_REPLACE(p.ncmCode, '[^0-9]', '')) < 8
      THEN 'ambiguo — comprimento nao resolve sozinho'
    ELSE 'inexistente na nomenclatura (ex.: subposicao com 00)'
  END AS motivo
  FROM products p
  LEFT JOIN ncm_tax_rates t
    ON t.ncmCode = LEFT(REGEXP_REPLACE(p.ncmCode, '[^0-9]', ''), 8)
  WHERE t.ncmCode IS NULL
) x GROUP BY motivo ORDER BY produtos DESC;
SQL

if [ "$APLICAR" != "1" ]; then
  echo
  echo "═══════════════════════════════════════════════════════════════════"
  echo " MODO SECO — nada foi alterado."
  echo " Confira a amostra acima. Para gravar:"
  echo "   bash scripts/normalizar-ncm-catalogo.sh --aplicar"
  echo "═══════════════════════════════════════════════════════════════════"
  exit 0
fi

echo
echo "── GRAVANDO ───────────────────────────────────────────────────────"
# Log ANTES do UPDATE: depois da troca não há como saber o valor anterior.
# Tudo numa transação — o log e a alteração vivem ou morrem juntos, senão
# sobraria uma trilha de auditoria que não corresponde ao banco.
consulta <<SQL
CREATE TABLE IF NOT EXISTS ncm_normalizacao_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  productId INT NOT NULL,
  ncmAntes VARCHAR(20) NOT NULL,
  ncmDepois VARCHAR(10) NOT NULL,
  executadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ncm_norm_log_product (productId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

START TRANSACTION;

INSERT INTO ncm_normalizacao_log (productId, ncmAntes, ncmDepois)
SELECT p.id, p.ncmCode, t.ncmCode
${ALVO};

UPDATE products p
JOIN ncm_tax_rates t
  ON t.ncmCode = LEFT(REGEXP_REPLACE(p.ncmCode, '[^0-9]', ''), 8)
SET p.ncmCode = t.ncmCode
WHERE CHAR_LENGTH(REGEXP_REPLACE(p.ncmCode, '[^0-9]', '')) >= 8
  AND p.ncmCode <> t.ncmCode;

COMMIT;
SQL

echo
echo "── CONFERÊNCIA PÓS-ESCRITA ────────────────────────────────────────"
consulta <<'SQL'
SELECT COUNT(*) AS registros_no_log,
       COUNT(DISTINCT productId) AS produtos_alterados
FROM ncm_normalizacao_log;

SELECT SUM(ncmCode REGEXP '^[0-9]{8}$') AS canonicos,
       COUNT(*) AS total,
       CONCAT(ROUND(100.0 * SUM(ncmCode REGEXP '^[0-9]{8}$') / COUNT(*), 1), '%') AS fatia
FROM products;
SQL

echo
echo "═══════════════════════════════════════════════════════════════════"
echo " Concluído. Reversão, se necessário:"
echo "   UPDATE products p JOIN ncm_normalizacao_log l ON l.productId = p.id"
echo "     SET p.ncmCode = l.ncmAntes;"
echo " Lembre de limpar o cache de NCM (endpoint ncm.clearCache) ou reiniciar."
echo "═══════════════════════════════════════════════════════════════════"
