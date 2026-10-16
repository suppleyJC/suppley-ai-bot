-- ============================================================
-- proformas.fileUrl: VARCHAR(512) → VARCHAR(1024)
-- ============================================================
-- A URL pré-assinada do S3 (com X-Amz-Credential/Signature/checksum) passa
-- de 450 caracteres com nomes de arquivo comuns — nomes longos estouram os
-- 512 atuais e derrubam o INSERT ("Data too long for column 'fileUrl'").
-- operacao_anexos.fileUrl já usa 1024; isto alinha as duas tabelas.
--
-- Migração ADITIVA e IDEMPOTENTE (segura para re-rodar). MySQL 8.0+.
--
-- Aplicar em produção (senha colada no -p, SEM espaço):
--   docker exec -i suppley-mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0041_widen_proforma_file_url.sql
-- ============================================================

SET @len := (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proformas' AND COLUMN_NAME = 'fileUrl'
);
SET @ddl := IF(@len IS NOT NULL AND @len < 1024,
  'ALTER TABLE proformas MODIFY COLUMN fileUrl VARCHAR(1024) NULL',
  'SELECT 1 /* proformas.fileUrl já tem 1024+ (ou não existe) */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
