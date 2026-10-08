-- ============================================================
-- Medição de tokens/custo por chamada de LLM (visibilidade p/ escalar).
-- Idempotente. MySQL 8.0+.
--   docker exec -i suppley-mysql sh -c 'exec mysql -u suppley -p"$MYSQL_PASSWORD" suppley_calc' < drizzle/0035_llm_usage.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS `llm_usage` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `model` VARCHAR(60) NOT NULL,
  `source` VARCHAR(40) NULL,
  `promptTokens` INT NOT NULL DEFAULT 0,
  `completionTokens` INT NOT NULL DEFAULT 0,
  `cacheCreationTokens` INT NOT NULL DEFAULT 0,
  `cacheReadTokens` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_llm_usage_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
