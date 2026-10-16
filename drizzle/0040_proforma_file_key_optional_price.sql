-- ============================================================
-- CORAÇÃO DA VIABILIDADE — arquivo recuperável + item sem preço
-- ============================================================
-- 1) proformas.fileKey: referência PERMANENTE do arquivo no storage (S3).
--    Até aqui só se gravava fileUrl (URL pré-assinada que expira em ~1h) —
--    o PDF ficava órfão e a Excambia não conseguia reler o documento.
--    Com a chave, a URL é re-assinada na hora, em qualquer momento.
--
-- 2) proforma_items.unitPriceCents passa a aceitar NULL: item de cotação
--    sem preço unitário ENTRA na base sinalizado (antes era descartado
--    silenciosamente — cotações com 27 itens viravam 11).
--
-- Migração ADITIVA e IDEMPOTENTE (segura para re-rodar). MySQL 8.0+.
--
-- Aplicar em produção (senha colada no -p, SEM espaço):
--   docker exec -i suppley-mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0040_proforma_file_key_optional_price.sql
-- ============================================================

-- 1) proformas.fileKey (se ainda não existir)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proformas' AND COLUMN_NAME = 'fileKey'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE proformas ADD COLUMN fileKey VARCHAR(512) NULL AFTER fileUrl',
  'SELECT 1 /* proformas.fileKey já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) proforma_items.unitPriceCents → NULLable (idempotente: só altera se ainda for NOT NULL)
SET @is_nullable := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proforma_items' AND COLUMN_NAME = 'unitPriceCents'
);
SET @ddl2 := IF(@is_nullable = 'NO',
  'ALTER TABLE proforma_items MODIFY COLUMN unitPriceCents BIGINT NULL',
  'SELECT 1 /* proforma_items.unitPriceCents já aceita NULL */');
PREPARE stmt2 FROM @ddl2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
