-- ============================================================
-- SPRINT 2 — Proforma Price History: quotationDate Field
-- ============================================================
-- Migração ADITIVA e IDEMPOTENTE. Adiciona campo quotationDate
-- à tabela proformas para capturar a data da cotação extraída
-- via IA do PDF.
--
-- Aplicar manualmente em produção (senha colada no -p, SEM espaço):
--   docker exec -i suppley-mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0027_add_quotation_date_to_proformas.sql
--
-- Ou via docker-compose (requer database running):
--   docker-compose exec -T mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0027_add_quotation_date_to_proformas.sql
-- ============================================================

-- 1) Adiciona quotationDate à tabela proformas (se ainda não existir)
--    Compatível com MySQL 8.0+
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'proformas'
    AND COLUMN_NAME = 'quotationDate'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE proformas ADD COLUMN quotationDate TIMESTAMP NULL AFTER moq',
  'SELECT 1 /* quotationDate já existe em proformas */');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) (Opcional) Índice para queries cronológicas
--    Útil para getProductPriceHistory e getSupplierCatalog.
--    MySQL 8.0 NÃO suporta "CREATE INDEX IF NOT EXISTS", então usamos
--    o mesmo padrão idempotente via information_schema + prepared statement.
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'proformas'
    AND INDEX_NAME = 'idx_proformas_quotation_date'
);
SET @idx_ddl := IF(@idx_exists = 0,
  'CREATE INDEX idx_proformas_quotation_date ON proformas(userId, quotationDate)',
  'SELECT 1 /* índice idx_proformas_quotation_date já existe */');
PREPARE idx_stmt FROM @idx_ddl;
EXECUTE idx_stmt;
DEALLOCATE PREPARE idx_stmt;
