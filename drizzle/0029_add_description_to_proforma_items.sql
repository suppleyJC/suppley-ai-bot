-- ============================================================
-- FEATURE — Nome curto + especificações técnicas separadas
-- ============================================================
-- Adiciona `description` (TEXT) à tabela proforma_items para guardar
-- as especificações técnicas completas, deixando `productName` com
-- apenas o nome curto comercial (ex.: "Escora de aço Q235").
--
-- Migração ADITIVA e IDEMPOTENTE (segura para re-rodar). MySQL 8.0+.
--
-- Aplicar em produção (senha colada no -p, SEM espaço):
--   docker exec -i suppley-mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0029_add_description_to_proforma_items.sql
-- ============================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'proforma_items'
    AND COLUMN_NAME = 'description'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE proforma_items ADD COLUMN description TEXT NULL AFTER productName',
  'SELECT 1 /* proforma_items.description já existe */');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
