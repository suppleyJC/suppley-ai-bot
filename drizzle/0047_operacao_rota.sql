-- ============================================================
-- FEATURE — Rota logística da operação (Fase 3)
-- ============================================================
-- Acrescenta ao cabeçalho executivo da operação a rota física:
--   modal (marítimo/aéreo/...), incoterm (FOB/CIF/...) e os portos de
--   origem/destino. Alimenta o cabeçalho do detalhe e o landed cost.
--
-- Migração ADITIVA e IDEMPOTENTE (segura para re-rodar). MySQL 8.0+.
--
-- Aplicar em produção (senha colada no -p, SEM espaço):
--   docker exec -i suppley-mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0047_operacao_rota.sql
-- ============================================================

-- ---------- modal ----------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes' AND COLUMN_NAME = 'modal'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacoes ADD COLUMN modal ENUM(''maritimo'',''aereo'',''rodoviario'',''ferroviario'',''multimodal'') NULL AFTER modo',
  'SELECT 1 /* operacoes.modal já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- incoterm ----------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes' AND COLUMN_NAME = 'incoterm'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacoes ADD COLUMN incoterm VARCHAR(10) NULL AFTER modal',
  'SELECT 1 /* operacoes.incoterm já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- portoOrigem ----------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes' AND COLUMN_NAME = 'portoOrigem'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacoes ADD COLUMN portoOrigem VARCHAR(120) NULL AFTER incoterm',
  'SELECT 1 /* operacoes.portoOrigem já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- portoDestino ----------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes' AND COLUMN_NAME = 'portoDestino'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacoes ADD COLUMN portoDestino VARCHAR(120) NULL AFTER portoOrigem',
  'SELECT 1 /* operacoes.portoDestino já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
