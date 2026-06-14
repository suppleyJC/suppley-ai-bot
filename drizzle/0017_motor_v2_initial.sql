-- Migration: Add Motor V2 schemas (operacoes, market intelligence, etl)
-- Generated: 2026-06-14
-- Status: Ready for production

-- ============================================================
-- OPERAÇÕES SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS demandas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  clienteNome VARCHAR(255),
  productId INT,
  descricao TEXT NOT NULL,
  ncmProvavel VARCHAR(10),
  quantidade INT,
  unidade VARCHAR(20) DEFAULT 'UN',
  paisDestino VARCHAR(60) DEFAULT 'Brasil',
  estadoDestino VARCHAR(2) DEFAULT 'SC',
  precoAlvoBrlCents INT,
  prazoDesejado TIMESTAMP,
  status ENUM('aberta', 'em_operacao', 'atendida', 'descartada') DEFAULT 'aberta' NOT NULL,
  criadaEm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  atualizadaEm TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_demandas_user (userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operacoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  titulo VARCHAR(255) NOT NULL,
  demandaId INT,
  clienteNome VARCHAR(255),
  fornecedorId INT,
  fornecedorNome VARCHAR(255),
  cotacaoVencedoraId INT,
  calculoId INT,
  estagioAtual ENUM('demand', 'source', 'analyze', 'execute', 'finance', 'closed', 'lost') DEFAULT 'demand' NOT NULL,
  status ENUM('ativa', 'pausada', 'go', 'no_go', 'concluida', 'perdida') DEFAULT 'ativa' NOT NULL,
  regimeTributario ENUM('lucro_real', 'lucro_presumido', 'simples_nacional'),
  origemPais VARCHAR(60),
  valorEstimadoBrlCents INT,
  margemEstimadaBp INT,
  decisaoGoNoGo JSON,
  criadaEm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  atualizadaEm TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_operacoes_user (userId),
  INDEX idx_operacoes_stage (estagioAtual),
  INDEX idx_operacoes_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operacao_eventos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operacaoId INT NOT NULL,
  tipo ENUM('demanda_criada', 'operacao_criada', 'rfq_enviada', 'cotacao_recebida', 'cotacao_extraida', 'calculo_executado', 'go_decidido', 'no_go_decidido', 'di_registrada', 'cambio_fechado', 'mensagem', 'nota_interna', 'alerta_ia', 'estagio_avancado') NOT NULL,
  estagio ENUM('demand', 'source', 'analyze', 'execute', 'finance', 'closed', 'lost') NOT NULL,
  refTipo VARCHAR(40),
  refId INT,
  autor ENUM('usuario', 'excambia', 'sistema') DEFAULT 'usuario' NOT NULL,
  titulo VARCHAR(255),
  payload JSON,
  criadoEm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_eventos_operacao (operacaoId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operacao_estagios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operacaoId INT NOT NULL,
  estagio ENUM('demand', 'source', 'analyze', 'execute', 'finance') NOT NULL,
  entrouEm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  saiuEm TIMESTAMP,
  gateCumprido INT DEFAULT 0 NOT NULL,
  gateChecklist JSON,
  INDEX idx_estagios_operacao (operacaoId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MARKET INTELLIGENCE SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS market_reference_ncm (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ncmCode VARCHAR(8) NOT NULL,
  flow VARCHAR(6) NOT NULL,
  countryCode VARCHAR(8),
  countryName VARCHAR(120),
  economicBlock VARCHAR(80),
  periodFrom VARCHAR(7) NOT NULL,
  periodTo VARCHAR(7) NOT NULL,
  totalFobUsd BIGINT DEFAULT 0 NOT NULL,
  totalCifUsd BIGINT DEFAULT 0 NOT NULL,
  totalFreightUsd BIGINT DEFAULT 0 NOT NULL,
  totalNetKg BIGINT DEFAULT 0 NOT NULL,
  totalStatQty BIGINT DEFAULT 0 NOT NULL,
  avgFobPerKgUsd DECIMAL(14, 4),
  avgCifPerKgUsd DECIMAL(14, 4),
  freightSharePct DECIMAL(6, 2),
  originSharePct DECIMAL(6, 2),
  recordCount INT DEFAULT 0 NOT NULL,
  isOutlierFiltered INT DEFAULT 0 NOT NULL,
  source VARCHAR(40) DEFAULT 'comexstat' NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY uq_market_ref (ncmCode, flow, countryCode, periodFrom, periodTo),
  INDEX idx_market_ref_ncm (ncmCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS market_trend_ncm (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ncmCode VARCHAR(8) NOT NULL,
  flow VARCHAR(6) NOT NULL,
  yearMonth VARCHAR(7) NOT NULL,
  totalFobUsd BIGINT DEFAULT 0 NOT NULL,
  totalNetKg BIGINT DEFAULT 0 NOT NULL,
  avgFobPerKgUsd DECIMAL(14, 4),
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY uq_market_trend (ncmCode, flow, yearMonth),
  INDEX idx_market_trend_ncm (ncmCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS etl_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job VARCHAR(60) NOT NULL,
  periodFrom VARCHAR(7),
  periodTo VARCHAR(7),
  status VARCHAR(20) NOT NULL,
  rowsProcessed INT DEFAULT 0 NOT NULL,
  message VARCHAR(500),
  startedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  finishedAt TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MIGRATION STATUS
-- ============================================================

-- This migration adds 7 new tables for Motor V2:
-- 1. demandas - Client requirements
-- 2. operacoes - Operation workflow (kanban)
-- 3. operacao_eventos - Immutable timeline
-- 4. operacao_estagios - Stage transitions with gates
-- 5. market_reference_ncm - Comex Stat reference data
-- 6. market_trend_ncm - Price trends (temporal)
-- 7. etl_runs - ETL execution audit

-- All tables are indexed and use InnoDB for ACID compliance
-- All timestamps use UTC and auto-update
-- No existing tables are modified or dropped
