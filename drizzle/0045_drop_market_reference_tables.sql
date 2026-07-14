-- ============================================================
-- CLEANUP — Remove as tabelas do ambiente "Inteligência de Mercado"
-- ============================================================
-- O ambiente dedicado de Inteligência de Mercado foi removido (a inteligência
-- passou a viver dentro da Excambia). Estas três tabelas eram materializadas
-- APENAS pelo ETL scripts/etlComexStat.ts (removido) e lidas somente pelo
-- marketReferenceService (removido) — ninguém mais as referencia.
--
-- O benchmark ao vivo da Excambia usa a API do Comex Stat em tempo real
-- (comexStatService), NÃO estas tabelas — então o drop não afeta o cálculo.
--
-- Migração IDEMPOTENTE (DROP ... IF EXISTS — segura para re-rodar). MySQL 8.0+.
-- ============================================================

DROP TABLE IF EXISTS market_reference_ncm;
DROP TABLE IF EXISTS market_trend_ncm;
DROP TABLE IF EXISTS etl_runs;
