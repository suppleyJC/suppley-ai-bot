-- ============================================================
-- SPRINT 1 — Proformas & Base Unificada (Fase 0.5)
-- ============================================================
-- Migração SEGURA e IDEMPOTENTE. Aplicar manualmente em produção:
--   docker exec -i suppley-mysql mysql -u suppley -p suppley_calc < drizzle/0025_sprint1_proformas.sql
--
-- NÃO usa drizzle-kit generate (evita drift do rfqSchema.ts contra o banco real).
-- Apenas ADITIVA: cria tabelas novas + adiciona 1 coluna em industries.
-- ============================================================

-- 1) Discriminador da base unificada (fornecedor × comprador)
--    Adiciona a coluna só se ainda não existir (compatível com MySQL 8).
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'industries'
    AND COLUMN_NAME = 'tipoEntidade'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE industries ADD COLUMN tipoEntidade ENUM(''fornecedor'',''comprador'') NOT NULL DEFAULT ''fornecedor''',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Tabela de Proformas/Invoices (resultado estruturado)
CREATE TABLE IF NOT EXISTS proformas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  numero VARCHAR(50),
  tipo ENUM('proforma','invoice') NOT NULL DEFAULT 'proforma',
  documentoId INT,
  industriaId INT,
  supplierName VARCHAR(255),
  supplierCountry VARCHAR(100),
  supplierEmail VARCHAR(320),
  supplierPhone VARCHAR(50),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  incoterm VARCHAR(5) DEFAULT 'FOB',
  paymentTerms VARCHAR(255),
  leadTimeDays INT,
  moq INT,
  totalFobCents BIGINT,
  validUntil TIMESTAMP NULL,
  operacaoId INT,
  rfqId INT,
  fileUrl VARCHAR(512),
  fileName VARCHAR(255),
  extractionConfidence INT,
  rawExtraction JSON,
  status ENUM('rascunho','extraida','revisada','distribuida','arquivada') NOT NULL DEFAULT 'rascunho',
  distributedAt TIMESTAMP NULL,
  notes TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_proformas_user (userId),
  INDEX idx_proformas_industria (industriaId)
);

-- 3) Itens da proforma
CREATE TABLE IF NOT EXISTS proforma_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proformaId INT NOT NULL,
  productName VARCHAR(255) NOT NULL,
  ncmCode VARCHAR(10),
  quantity INT NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'UN',
  unitPriceCents BIGINT NOT NULL,
  totalPriceCents BIGINT,
  productId INT,
  nationalizedUnitCostCents BIGINT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_proforma_items_proforma (proformaId)
);
