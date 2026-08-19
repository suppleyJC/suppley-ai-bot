-- ============================================================
-- Quantidade DECIMAL: proforma_items.quantity e supplier_prices.quantity
-- INT → DOUBLE
-- ============================================================
-- Cotações por peso (vergalhão, cordoalha, bobinas...) vêm com quantidades
-- fracionadas (ex.: 24,5 t). Como INT, o valor era arredondado (24,5 → 25),
-- distorcendo a quantidade real e o total FOB. DOUBLE preserva a fração;
-- os valores monetários seguem em centavos inteiros (bigint).
--
-- Migração ADITIVA e IDEMPOTENTE (segura para re-rodar). MySQL 8.0+.
--
-- Aplicar em produção (senha colada no -p, SEM espaço):
--   docker exec -i suppley-mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0042_decimal_quantity.sql
-- ============================================================

SET @tipo := (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proforma_items' AND COLUMN_NAME = 'quantity'
);
SET @ddl := IF(@tipo IS NOT NULL AND @tipo <> 'double',
  'ALTER TABLE proforma_items MODIFY COLUMN quantity DOUBLE NOT NULL',
  'SELECT 1 /* proforma_items.quantity já é DOUBLE (ou tabela não existe) */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tipo := (
  SELECT DATA_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_prices' AND COLUMN_NAME = 'quantity'
);
SET @ddl := IF(@tipo IS NOT NULL AND @tipo <> 'double',
  'ALTER TABLE supplier_prices MODIFY COLUMN quantity DOUBLE NOT NULL DEFAULT 1',
  'SELECT 1 /* supplier_prices.quantity já é DOUBLE (ou tabela não existe) */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
