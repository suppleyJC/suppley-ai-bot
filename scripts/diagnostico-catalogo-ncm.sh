#!/usr/bin/env bash
#
# DIAGNÓSTICO DO CATÁLOGO DE PRODUTOS — estado do campo NCM. SOMENTE LEITURA.
#
# Este script NÃO altera nada. Ele lê a tabela `products`, normaliza cada
# `ncmCode` e classifica em baldes, para dimensionar o saneamento antes de
# qualquer escrita.
#
# Por que existe: o campo `ncmCode` acumulou três defeitos distintos que se
# escondem um atrás do outro, porque `getNCMByCode` remove os pontos NA LEITURA
# e faz tudo parecer funcionar:
#   1. FORMATO       — a mesma NCM gravada como '3923.30.90', '39233090' e
#                      '3923300000'. Fragmenta agrupamento, junção e cache.
#   2. INEXISTENTE   — código que não existe na nomenclatura (ex.: '39233000',
#                      que é SUBPOSIÇÃO usada como se fosse item de 8 dígitos).
#   3. SEM CLASSIFICAÇÃO — literais legados como '<UNKNOWN>' e '00000000'.
#
# Só um caminho de escrita normaliza hoje (quotationExtractorService.ts:232);
# todos os outros gravam o que receberem.
#
# Isso deixou de ser dívida interna: sob DUIMP o catálogo é a fonte de uma
# declaração oficial, e código inexistente ou vazio trava a operação.
#
# USO (no servidor, dentro de /opt/suppley/suppley-ai-bot):
#   bash scripts/diagnostico-catalogo-ncm.sh
#
# Variáveis (opcionais — defaults batem com o docker-compose.yml):
#   DB_CONTAINER (suppley-mysql) | DB_USER | DB_PASSWORD | DB_NAME (suppley_calc)
# Sem DB_USER/DB_PASSWORD as credenciais são lidas do próprio container, então
# não há senha neste arquivo nem risco de divergir da que o banco usa.
#
# RESSALVA de leitura: o balde "INEXISTENTE" significa "não está em
# `ncm_tax_rates`". Essa tabela é a nossa cópia da nomenclatura; se ela estiver
# desatualizada, uma NCM nova e legítima cai aqui. Confira uma amostra na TEC
# antes de tratar o balde inteiro como erro.
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

# MYSQL_PWD em vez de -p: evita a senha na linha de comando (e o aviso do mysql).
# --default-character-set=utf8mb4: sem isso o cliente negocia latin1 e todo
# acento sai como '?' no relatório (os dados no banco estão corretos).
consulta() {
  docker exec -i -e MYSQL_PWD="$DB_PASSWORD" "$DB_CONTAINER" \
    mysql -u "$DB_USER" "$DB_NAME" --table --default-character-set=utf8mb4
}

echo "═══════════════════════════════════════════════════════════════════"
echo " DIAGNÓSTICO DO CATÁLOGO — campo NCM        (somente leitura)"
echo " banco '${DB_NAME}' · container '${DB_CONTAINER}'"
echo "═══════════════════════════════════════════════════════════════════"

# A classificação em baldes é a mesma em todas as consultas: definida uma vez
# como VIEW temporária da sessão seria ideal, mas cada `docker exec` abre uma
# conexão nova. Por isso o CTE é repetido — é a única forma de manter cada
# consulta autocontida sem criar objeto no banco (o script é somente leitura).
CTE="
WITH cls AS (
  SELECT
    p.id,
    p.ncmCode AS bruto,
    REGEXP_REPLACE(p.ncmCode, '[^0-9]', '') AS dig,
    CASE WHEN CHAR_LENGTH(REGEXP_REPLACE(p.ncmCode, '[^0-9]', '')) >= 8
         THEN LEFT(REGEXP_REPLACE(p.ncmCode, '[^0-9]', ''), 8) END AS canon
  FROM products p
),
baldes AS (
  SELECT c.*, t.ncmCode AS existe, t.description AS desc_oficial,
    CASE
      WHEN c.dig = '' OR c.canon = '00000000'    THEN '5 · SEM CLASSIFICACAO'
      WHEN c.canon IS NULL                       THEN '6 · DIGITOS INSUFICIENTES'
      WHEN t.ncmCode IS NULL                     THEN '4 · INEXISTENTE NA NOMENCLATURA'
      WHEN c.bruto = c.canon                     THEN '1 · CANONICO'
      WHEN CHAR_LENGTH(c.dig) > 8                THEN '3 · EXCESSO DE DIGITOS'
      ELSE                                            '2 · FORMATO DIVERGENTE'
    END AS balde
  FROM cls c
  LEFT JOIN ncm_tax_rates t ON t.ncmCode = c.canon
)"

echo
echo "── 0. FORMA DA NOMENCLATURA (ncm_tax_rates) ───────────────────────"
echo "   O que a coluna 'description' contém de fato: folha isolada ('Outros')"
echo "   ou caminho hierárquico? Isso decide se a busca precisa ser reindexada."
consulta <<'SQL'
SELECT COUNT(*) AS linhas,
       SUM(description IS NULL OR description = '') AS sem_descricao,
       SUM(description LIKE '% > %')                AS com_caminho,
       ROUND(AVG(CHAR_LENGTH(description)))         AS media_chars,
       ROUND(AVG(CHAR_LENGTH(SUBSTRING_INDEX(description, ' > ', -1)))) AS media_folha
FROM ncm_tax_rates;
SQL
consulta <<'SQL'
SELECT ncmCode, CHAR_LENGTH(description) AS chars, LEFT(description, 150) AS amostra
FROM ncm_tax_rates
WHERE ncmCode IN ('39269090','73084000','76109000','94051990','40151100','01012900')
ORDER BY ncmCode;
SQL

echo
echo "── 1. PANORAMA ────────────────────────────────────────────────────"
echo "   Quanto do catálogo está pronto para uso e quanto precisa de ação."
consulta <<SQL
${CTE}
SELECT balde,
       COUNT(*) AS produtos,
       CONCAT(ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM products), 1), '%') AS fatia
FROM baldes GROUP BY balde ORDER BY balde;
SQL

echo
echo "── 2. CÓDIGOS QUE NÃO EXISTEM NA NOMENCLATURA ─────────────────────"
echo "   Bloqueiam DUIMP. Confira uma amostra na TEC antes de tratar como erro."
consulta <<SQL
${CTE}
SELECT bruto AS gravado, canon AS normalizado, COUNT(*) AS produtos
FROM baldes WHERE balde = '4 · INEXISTENTE NA NOMENCLATURA'
GROUP BY bruto, canon ORDER BY produtos DESC LIMIT 20;
SQL

echo
echo "── 2b. NATUREZA DO CÓDIGO INEXISTENTE ─────────────────────────────"
echo "   Separa dois defeitos com conserto MUITO diferente: SH6 preenchido com"
echo "   '00' (a subposição existe, falta descer ao item) × código extinto."
consulta <<SQL
${CTE}
SELECT diagnostico, COUNT(*) AS produtos FROM (
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM ncm_tax_rates s WHERE s.ncmCode LIKE CONCAT(LEFT(b.canon,6),'%'))
      THEN 'A · subposicao valida — falta descer ao item certo'
    WHEN EXISTS (SELECT 1 FROM ncm_tax_rates s WHERE s.ncmCode LIKE CONCAT(LEFT(b.canon,4),'%'))
      THEN 'B · posicao valida, subposicao inexistente'
    ELSE 'C · nem a posicao existe (extinto ou outra nomenclatura)'
  END AS diagnostico
  FROM baldes b WHERE b.balde = '4 · INEXISTENTE NA NOMENCLATURA'
) x GROUP BY diagnostico ORDER BY produtos DESC;
SQL

echo "   Para os mais frequentes: quais itens VÁLIDOS existem sob a subposição."
consulta <<SQL
${CTE}
SELECT b.canon AS gravado, COUNT(*) AS produtos,
       LEFT((SELECT GROUP_CONCAT(s.ncmCode ORDER BY s.ncmCode SEPARATOR ', ')
             FROM ncm_tax_rates s
             WHERE s.ncmCode LIKE CONCAT(LEFT(b.canon,6),'%')), 70) AS itens_validos
FROM baldes b WHERE b.balde = '4 · INEXISTENTE NA NOMENCLATURA'
GROUP BY b.canon ORDER BY produtos DESC LIMIT 12;
SQL

echo
echo "── 3. SEM CLASSIFICAÇÃO ───────────────────────────────────────────"
consulta <<SQL
${CTE}
SELECT bruto AS gravado, COUNT(*) AS produtos
FROM baldes WHERE balde IN ('5 · SEM CLASSIFICACAO', '6 · DIGITOS INSUFICIENTES')
GROUP BY bruto ORDER BY produtos DESC LIMIT 20;
SQL

echo
echo "── 4. FRAGMENTAÇÃO POR FORMATO ────────────────────────────────────"
echo "   Mesma NCM gravada de várias formas. Cada linha é um código real que"
echo "   hoje se comporta como se fossem produtos de NCMs diferentes."
consulta <<SQL
${CTE}
SELECT canon AS ncm_real,
       COUNT(DISTINCT bruto) AS formas_gravadas,
       GROUP_CONCAT(DISTINCT bruto ORDER BY bruto SEPARATOR ' | ') AS variacoes,
       COUNT(*) AS produtos
FROM baldes WHERE canon IS NOT NULL
GROUP BY canon HAVING formas_gravadas > 1
ORDER BY produtos DESC LIMIT 20;
SQL

echo
echo "── 5. CONCENTRAÇÃO EM POSIÇÕES RESIDUAIS ──────────────────────────"
echo "   Folha cuja descrição é 'Outros/Outras' = classificação por desistência."
echo "   É onde a fiscalização olha primeiro e onde a DUIMP exige mais atributo."
consulta <<SQL
${CTE}
SELECT canon AS ncm,
       COUNT(*) AS produtos,
       CASE WHEN REGEXP_REPLACE(SUBSTRING_INDEX(desc_oficial, ' > ', -1),
                                '^[0-9.]+ *', '') LIKE 'Outr%'
            THEN 'RESIDUAL' ELSE '' END AS tipo,
       LEFT(SUBSTRING_INDEX(COALESCE(desc_oficial, '(sem descricao)'), ' > ', -1), 55) AS folha
FROM baldes WHERE existe IS NOT NULL
GROUP BY canon, desc_oficial ORDER BY produtos DESC LIMIT 20;
SQL

consulta <<SQL
${CTE}
SELECT COUNT(*) AS classificados,
       SUM(REGEXP_REPLACE(SUBSTRING_INDEX(desc_oficial, ' > ', -1),
                          '^[0-9.]+ *', '') LIKE 'Outr%') AS em_residual,
       CONCAT(ROUND(100.0 * SUM(REGEXP_REPLACE(SUBSTRING_INDEX(desc_oficial, ' > ', -1),
                                               '^[0-9.]+ *', '') LIKE 'Outr%')
                    / COUNT(*), 1), '%') AS fatia_residual
FROM baldes WHERE existe IS NOT NULL;
SQL

echo
echo "── 6. MATÉRIA-PRIMA PARA RECLASSIFICAÇÃO ──────────────────────────"
echo "   Quantos produtos têm descrição técnica na proforma de origem — é dela"
echo "   que saem a reclassificação e os atributos da DUIMP."
consulta <<SQL
SELECT COUNT(DISTINCT p.id) AS produtos,
       COUNT(DISTINCT CASE WHEN CHAR_LENGTH(i.description) > 20 THEN p.id END) AS com_desc_tecnica,
       COUNT(DISTINCT CASE WHEN p.material  IS NOT NULL THEN p.id END) AS com_material,
       COUNT(DISTINCT CASE WHEN p.dimensoes IS NOT NULL THEN p.id END) AS com_dimensoes
FROM products p
LEFT JOIN proforma_items i ON i.productId = p.id;
SQL

echo
echo "═══════════════════════════════════════════════════════════════════"
echo " Nada foi alterado. Os baldes 2, 3 e 4 são o escopo do saneamento;"
echo " o 5 e o 6 exigem reclassificação, não conserto de formato."
echo "═══════════════════════════════════════════════════════════════════"
