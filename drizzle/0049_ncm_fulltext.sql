-- Índice FULLTEXT sobre a descrição da nomenclatura NCM.
--
-- POR QUÊ: 95,4% das 11.023 linhas de `ncm_tax_rates` já guardam o CAMINHO
-- hierárquico completo (média 358 caracteres):
--
--   "39 Plástico e suas obras. > 39.26 Outras obras de plástico e obras de
--    outras matérias das posições 39.01 a 39.14. > 3926.90 - Outras
--    > 3926.90.90 Outras"
--
-- Com esse texto, a busca por LIKE '%termo%' casa com o CAPÍTULO INTEIRO — o
-- nome do capítulo está em todas as ~900 linhas do 39. Pior: o LIMIT 200 era
-- aplicado ANTES do ranqueamento e sem ORDER BY, então a resposta certa muitas
-- vezes nem entrava no conjunto de candidatos, e o desempate pelo menor código
-- criava um viés sistemático para o começo de cada capítulo.
--
-- O FULLTEXT em modo natural language resolve isso pela raiz: ele pondera por
-- IDF. "Plástico e suas obras", presente em centenas de linhas, recebe peso
-- próximo de zero; "solenoide", presente em poucas, domina o ranking. É o
-- instrumento certo para texto hierárquico, sem heurística inventada.
--
-- Aditivo e não destrutivo: cria um índice, não altera dado nem coluna. A busca
-- degrada para o caminho antigo (LIKE) se o índice ainda não existir, então
-- aplicar isto pode ser feito antes ou depois do deploy do código.
--
-- APLICAR (no servidor, dentro de /opt/suppley/suppley-ai-bot):
--   docker exec -i suppley-mysql sh -c \
--     'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < drizzle/0049_ncm_fulltext.sql
--
-- Idempotente: rodar de novo não faz nada e não falha.

SET @existe := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name   = 'ncm_tax_rates'
    AND index_name   = 'ft_ncm_description'
);

SET @ddl := IF(
  @existe = 0,
  'ALTER TABLE ncm_tax_rates ADD FULLTEXT INDEX ft_ncm_description (description)',
  'SELECT ''ft_ncm_description ja existe — nada a fazer'' AS aviso'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
