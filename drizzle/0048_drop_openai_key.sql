-- ============================================================
-- CLEANUP — remove a API key OpenAI dedicada (recurso morto)
-- ============================================================
-- A Excambia roda 100% na Anthropic (chave do sistema). A coluna
-- company_settings.openaiApiKey guardava a chave OpenAI por usuário de um
-- fluxo que não existe mais (seção "API OpenAI Dedicada" removida da UI).
--
-- DROP idempotente e guardado (só cai se a coluna existir). MySQL 8.0+.
--
-- Aplicar em produção:
--   docker exec -i suppley-mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0048_drop_openai_key.sql
-- ============================================================

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_settings' AND COLUMN_NAME = 'openaiApiKey'
);
SET @ddl := IF(@col_exists = 1,
  'ALTER TABLE company_settings DROP COLUMN openaiApiKey',
  'SELECT 1 /* company_settings.openaiApiKey já removida */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
