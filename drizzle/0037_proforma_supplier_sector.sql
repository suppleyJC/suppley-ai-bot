-- ============================================================
-- FEATURE — Setor do fornecedor sugerido na proforma
-- ============================================================
-- Adiciona `supplierSector` à tabela `proformas`: a Excambia sugere o setor
-- do fornecedor na extração (com base no fornecedor e nos produtos) e o
-- usuário pode ajustar na revisão. Na distribuição, o setor é aplicado ao
-- cadastro do fornecedor em `industries`.
--
-- Migração ADITIVA e IDEMPOTENTE (segura para re-rodar). MySQL 8.0+.
--
-- Aplicar em produção (senha colada no -p, SEM espaço):
--   docker exec -i suppley-mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0037_proforma_supplier_sector.sql
-- ============================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proformas' AND COLUMN_NAME = 'supplierSector'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE proformas ADD COLUMN supplierSector VARCHAR(30) NULL AFTER supplierPhone',
  'SELECT 1 /* proformas.supplierSector já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
