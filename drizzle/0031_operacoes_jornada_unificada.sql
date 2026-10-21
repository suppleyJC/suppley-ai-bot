-- ============================================================
-- FEATURE — Jornada unificada das Operações (modo + tracking + marcos)
-- ============================================================
-- 1) operacoes.modo          — ramificação da jornada (cotacao | desenvolvimento)
-- 2) operacoes.tracking*      — dados de embarque (preenchimento manual; API depois)
-- 3) operacao_marcos.tipo     — marcos expandidos p/ cobrir a jornada inteira
--                               (estudo → cotação/RFQ → viabilidade → produção → nac.)
--
-- Migração ADITIVA e IDEMPOTENTE (segura para re-rodar). MySQL 8.0+.
--
-- Aplicar em produção (senha colada no -p, SEM espaço):
--   docker exec -i suppley-mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0031_operacoes_jornada_unificada.sql
-- ============================================================

-- ---------- 1) operacoes.modo ----------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes' AND COLUMN_NAME = 'modo'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacoes ADD COLUMN modo ENUM(''cotacao'',''desenvolvimento'') NULL AFTER status',
  'SELECT 1 /* operacoes.modo já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 2) operacoes.tracking* ----------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes' AND COLUMN_NAME = 'trackingContainer'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacoes ADD COLUMN trackingContainer VARCHAR(60) NULL',
  'SELECT 1 /* operacoes.trackingContainer já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes' AND COLUMN_NAME = 'trackingBl'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacoes ADD COLUMN trackingBl VARCHAR(60) NULL',
  'SELECT 1 /* operacoes.trackingBl já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes' AND COLUMN_NAME = 'trackingArmador'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacoes ADD COLUMN trackingArmador VARCHAR(120) NULL',
  'SELECT 1 /* operacoes.trackingArmador já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes' AND COLUMN_NAME = 'trackingNavio'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacoes ADD COLUMN trackingNavio VARCHAR(120) NULL',
  'SELECT 1 /* operacoes.trackingNavio já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes' AND COLUMN_NAME = 'trackingEta'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacoes ADD COLUMN trackingEta TIMESTAMP NULL',
  'SELECT 1 /* operacoes.trackingEta já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'operacoes' AND COLUMN_NAME = 'trackingStatus'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE operacoes ADD COLUMN trackingStatus VARCHAR(120) NULL',
  'SELECT 1 /* operacoes.trackingStatus já existe */');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 3) operacao_marcos.tipo (expansão do enum) ----------
-- Idempotente por natureza: MODIFY reescreve o enum com o conjunto completo.
ALTER TABLE `operacao_marcos` MODIFY COLUMN `tipo` ENUM(
  'item_pesquisado','fornecedores_identificados',
  'rfq_enviada','cotacao_recebida','fornecedor_selecionado',
  'calculo_feito','go_aprovado',
  'pedido_confirmado','producao_iniciada','produto_embarcado',
  'di_registrada','nacionalizado','entregue'
) NOT NULL;

-- ---------- 4) operacao_eventos.tipo (novos eventos de marco) ----------
-- Acrescenta os 3 marcos da jornada (estudo/sourcing) que não tinham evento.
ALTER TABLE `operacao_eventos` MODIFY COLUMN `tipo` ENUM(
  'demanda_criada','operacao_criada','rfq_enviada','cotacao_recebida',
  'cotacao_extraida','calculo_executado','go_decidido','no_go_decidido',
  'di_registrada','cambio_fechado','mensagem','nota_interna','alerta_ia',
  'estagio_avancado','anexo_adicionado','anexo_removido',
  'financeiro_lancado','financeiro_removido',
  'pedido_confirmado','producao_iniciada','produto_embarcado',
  'nacionalizado','entregue',
  'item_pesquisado','fornecedores_identificados','fornecedor_selecionado'
) NOT NULL;
