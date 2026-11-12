-- ============================================================
-- FEATURE — Modelo de estados dos marcos da jornada (Fase 1)
-- ============================================================
-- Acrescenta ao marco duas dimensões que o pacote de UX pede separadas
-- do "status" (planejado/realizado/cancelado):
--   1) responsavel — QUEM deve agir para o marco acontecer
--   2) vencimento  — ATÉ QUANDO (a "saúde do prazo" é DERIVADA disto + status,
--                    no service, sem coluna extra)
--
-- Alimenta o cartão "Agora" (próxima ação), a central de pendências e os
-- chips de responsável/prazo em cada marco.
--
-- Migração ADITIVA e IDEMPOTENTE (segura para re-rodar). MySQL 8.0+.
--
-- Aplicar em produção (senha colada no -p, SEM espaço):
--   docker exec -i suppley-mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0043_marco_responsavel_vencimento.sql
-- ============================================================

-- ---------- 1) operacao_marcos.responsavel ----------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacao_marcos' AND COLUMN_NAME = 'responsavel'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacao_marcos ADD COLUMN responsavel ENUM(''cliente'',''excambia'',''fornecedor'',''agente'',''despachante'',''anuente'',''sistema'') NULL AFTER status',
  'SELECT 1 /* operacao_marcos.responsavel já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 2) operacao_marcos.vencimento ----------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacao_marcos' AND COLUMN_NAME = 'vencimento'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacao_marcos ADD COLUMN vencimento TIMESTAMP NULL AFTER responsavel',
  'SELECT 1 /* operacao_marcos.vencimento já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
