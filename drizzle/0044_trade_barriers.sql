-- ============================================================
-- FEATURE — Barreiras comerciais estruturadas por NCM (Pilar 2)
-- ============================================================
-- Defesa comercial (antidumping, medidas compensatórias, salvaguardas)
-- e CIDE mapeadas por PREFIXO de NCM + país de origem. A Excambia passa a
-- DETECTAR e EVIDENCIAR essas medidas automaticamente no cálculo, em vez
-- de depender só de pesquisa web.
--
-- `valor` NULO = medida detectada sem valor parametrizado (o agente
-- confirma o valor vigente na Resolução GECEX/CAMEX antes de fechar).
--
-- Migração ADITIVA e IDEMPOTENTE (segura para re-rodar). MySQL 8.0+.
-- ============================================================

CREATE TABLE IF NOT EXISTS trade_barriers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ncmPrefix VARCHAR(8) NOT NULL,
  paisOrigem VARCHAR(60) NULL,
  tipo ENUM('antidumping','medida_compensatoria','salvaguarda','cide','direito_provisorio') NOT NULL,
  mecanismo ENUM('ad_valorem','usd_por_kg','usd_por_ton','usd_por_unidade') NULL,
  valor INT NULL,
  descricao TEXT NULL,
  baseLegal VARCHAR(255) NULL,
  vigenciaAte TIMESTAMP NULL,
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  fonte VARCHAR(255) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_trade_barriers_ncm (ncmPrefix),
  UNIQUE KEY uq_trade_barriers (ncmPrefix, paisOrigem, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- SEED inicial — medidas de LONGA VIGÊNCIA e amplamente conhecidas.
-- Nível de detecção: o valor exato deve ser confirmado na Resolução
-- vigente (o agente faz isso); onde o valor histórico é notório e
-- estável, ele vem parametrizado.
-- Idempotente via INSERT ... WHERE NOT EXISTS (funciona com paisOrigem
-- em qualquer valor, sem depender de chave única com NULL).
-- ------------------------------------------------------------

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '6402', 'China', 'antidumping', 'usd_por_unidade', 1022,
  'Calçados — direito antidumping definitivo de US$ 10,22/par para calçados da China (medida de longa vigência, prorrogada). Confirme a vigência e as exclusões de NCM na resolução atual.',
  'Res. CAMEX 14/2010 e prorrogações', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='6402' AND paisOrigem='China' AND tipo='antidumping');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '6403', 'China', 'antidumping', 'usd_por_unidade', 1022,
  'Calçados — direito antidumping definitivo de US$ 10,22/par para calçados da China (medida de longa vigência, prorrogada). Confirme a vigência e as exclusões de NCM na resolução atual.',
  'Res. CAMEX 14/2010 e prorrogações', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='6403' AND paisOrigem='China' AND tipo='antidumping');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '6404', 'China', 'antidumping', 'usd_por_unidade', 1022,
  'Calçados — direito antidumping definitivo de US$ 10,22/par para calçados da China (medida de longa vigência, prorrogada). Confirme a vigência e as exclusões de NCM na resolução atual.',
  'Res. CAMEX 14/2010 e prorrogações', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='6404' AND paisOrigem='China' AND tipo='antidumping');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '691110', 'China', 'antidumping', 'usd_por_kg', NULL,
  'Objetos de louça/porcelana para mesa — antidumping vigente para a China (US$/kg por produtor). Confirmar o valor na resolução vigente.',
  'Res. CAMEX (louças/porcelanas) e prorrogações', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='691110' AND paisOrigem='China' AND tipo='antidumping');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '691200', 'China', 'antidumping', 'usd_por_kg', NULL,
  'Objetos de louça/cerâmica para mesa — antidumping vigente para a China (US$/kg por produtor). Confirmar o valor na resolução vigente.',
  'Res. CAMEX (louças) e prorrogações', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='691200' AND paisOrigem='China' AND tipo='antidumping');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '070320', 'China', 'antidumping', 'usd_por_kg', NULL,
  'Alho fresco/refrigerado — antidumping histórico e recorrentemente prorrogado para a China (US$/kg). Confirmar o valor na resolução vigente.',
  'Res. CAMEX/GECEX (alho) e prorrogações', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='070320' AND paisOrigem='China' AND tipo='antidumping');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '7208', 'China', 'antidumping', 'usd_por_ton', NULL,
  'Laminados planos de aço a quente — antidumping para a China (US$/t por produtor). Siderúrgicos da China têm histórico amplo de medidas — confirmar NCM exata e valor na resolução vigente.',
  'Res. CAMEX 77/2017 e correlatas', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='7208' AND paisOrigem='China' AND tipo='antidumping');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '7208', 'Rússia', 'antidumping', 'usd_por_ton', NULL,
  'Laminados planos de aço a quente — antidumping para a Rússia (US$/t por produtor). Confirmar NCM exata e valor na resolução vigente.',
  'Res. CAMEX 77/2017 e correlatas', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='7208' AND paisOrigem='Rússia' AND tipo='antidumping');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '700529', 'China', 'antidumping', 'usd_por_ton', NULL,
  'Vidros planos flotados incolores — antidumping vigente para a China (US$/t). Confirmar o valor na resolução vigente.',
  'Res. CAMEX (vidros planos) e prorrogações', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='700529' AND paisOrigem='China' AND tipo='antidumping');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '401120', 'China', 'antidumping', 'usd_por_kg', NULL,
  'Pneus de carga (ônibus/caminhão) — antidumping vigente para a China. Confirmar o valor na resolução vigente.',
  'Res. CAMEX/GECEX (pneus de carga)', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='401120' AND paisOrigem='China' AND tipo='antidumping');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '960810', 'China', 'antidumping', 'usd_por_unidade', NULL,
  'Canetas esferográficas — antidumping de longa vigência para a China (US$/unidade). Confirmar o valor na resolução vigente.',
  'Res. CAMEX (canetas) e prorrogações', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='960810' AND paisOrigem='China' AND tipo='antidumping');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '830110', 'China', 'antidumping', 'usd_por_unidade', NULL,
  'Cadeados — antidumping de longa vigência para a China (US$/unidade por faixa de tamanho). Confirmar o valor na resolução vigente.',
  'Res. CAMEX (cadeados) e prorrogações', 'Seed inicial — CAMEX/GECEX'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='830110' AND paisOrigem='China' AND tipo='antidumping');

-- CIDE-Combustíveis (detecção — alíquotas específicas por m³/t no decreto vigente)
INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '2710', NULL, 'cide', NULL, NULL,
  'Combustíveis (gasolinas/diesel/querosenes/óleos) — importação sujeita à CIDE-Combustíveis, com alíquotas específicas por m³/t definidas em decreto. Verificar a alíquota vigente do produto.',
  'Lei 10.336/2001 e decreto vigente', 'Seed inicial — Receita Federal'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='2710' AND tipo='cide');

INSERT INTO trade_barriers (ncmPrefix, paisOrigem, tipo, mecanismo, valor, descricao, baseLegal, fonte)
SELECT '2711', NULL, 'cide', NULL, NULL,
  'GLP e gases de petróleo — importação sujeita à CIDE-Combustíveis, com alíquotas específicas definidas em decreto. Verificar a alíquota vigente do produto.',
  'Lei 10.336/2001 e decreto vigente', 'Seed inicial — Receita Federal'
WHERE NOT EXISTS (SELECT 1 FROM trade_barriers WHERE ncmPrefix='2711' AND tipo='cide');
