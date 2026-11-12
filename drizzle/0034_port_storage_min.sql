-- ============================================================
-- port_costs: mínimo de armazenagem por contêiner + carga da Portonave (Navegantes).
-- Simplificação escolhida: 1º período como padrão (sem faixas por dia).
-- Idempotente. MySQL 8.0+.
--   docker exec -i suppley-mysql sh -c 'exec mysql -u suppley -p"$MYSQL_PASSWORD" suppley_calc' < drizzle/0034_port_storage_min.sql
-- ============================================================

-- 1) Coluna storageMinCents (aditiva, idempotente)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'port_costs' AND COLUMN_NAME = 'storageMinCents'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE port_costs ADD COLUMN storageMinCents BIGINT NOT NULL DEFAULT 0 AFTER storageBp',
  'SELECT 1 /* port_costs.storageMinCents já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Portonave / Navegantes (SC) — Tabela de Preços v02/2026
--    Armazenagem importação (1º período): 0,68% do CIF, mínimo R$ 1.523,00 por contêiner.
UPDATE `port_costs`
   SET `portName` = 'Porto de Navegantes (Portonave)',
       `storageBp` = 68,
       `storageMinCents` = 152300,
       `legalBasis` = 'Portonave — Tabela de Preços e Serviços v02/2026',
       `notes` = 'Armazenagem 1º período: 0,68% do CIF, mín. R$ 1.523/contêiner (faixas por dia não modeladas).'
 WHERE `portCode` = 'BRNAV';
