-- ============================================================
-- FASE 5 — Migração ADITIVA (não destrói dados existentes)
-- Aplicar no banco em produção UMA vez:
--   docker exec -i suppley-mysql mysql -u root -p<senha> <database> < drizzle/migrations-fase5.sql
-- Tudo é ADD COLUMN / CREATE TABLE — nenhum DROP.
-- Obs.: rode em um banco já com as tabelas products/suppliers/industries.
-- ============================================================

-- ---------- 2.1 Ativos & Insumos (amplia products) ----------
ALTER TABLE `products`
  ADD COLUMN `categoria` VARCHAR(120) NULL,
  ADD COLUMN `aplicacao` VARCHAR(255) NULL,
  ADD COLUMN `material` VARCHAR(120) NULL,
  ADD COLUMN `dimensoes` VARCHAR(120) NULL,
  ADD COLUMN `ncmStatus` ENUM('sugerido','validado') NULL DEFAULT 'sugerido',
  ADD COLUMN `origem` ENUM('nacional','internacional','ambos','importado_antes','cotado_nao_importado') NULL DEFAULT 'cotado_nao_importado',
  ADD COLUMN `paisOrigem` VARCHAR(100) NULL,
  ADD COLUMN `moqPadrao` INT NULL,
  ADD COLUMN `leadTimeMedioDias` INT NULL,
  ADD COLUMN `custoNacionalRefCents` BIGINT NULL,
  ADD COLUMN `custoImportadoRefCents` BIGINT NULL;

-- ---------- 2.2 Fornecedores / Fabricantes (amplia suppliers) ----------
ALTER TABLE `suppliers`
  ADD COLUMN `tipo` ENUM('fabrica','trading','distribuidor','exportador','representante','fornecedor_nacional','fabricante_nacional','importador_local','distribuidor_brasileiro') NULL DEFAULT 'fabrica',
  ADD COLUMN `origem` ENUM('nacional','internacional') NULL DEFAULT 'internacional',
  ADD COLUMN `categorias` JSON NULL,
  ADD COLUMN `moedas` JSON NULL,
  ADD COLUMN `incotermsPraticados` JSON NULL,
  ADD COLUMN `leadTimeMedioDias` INT NULL,
  ADD COLUMN `ratingScore` INT NULL,
  ADD COLUMN `ratingClasse` ENUM('A','B','C','D') NULL;

-- ---------- 2.3 Compradores nacionais / Setores (amplia industries) ----------
ALTER TABLE `industries`
  ADD COLUMN `segmento` VARCHAR(120) NULL,
  ADD COLUMN `regiao` VARCHAR(120) NULL,
  ADD COLUMN `perfilDemanda` ENUM('recorrente','eventual','projeto','spot') NULL,
  ADD COLUMN `sensibilidadePreco` ENUM('alta','media','baixa') NULL,
  ADD COLUMN `volumeEstimadoMensal` INT NULL,
  ADD COLUMN `potencialComercial` ENUM('alto','medio','baixo') NULL;

-- ---------- 2.4 Tabelas novas ----------
CREATE TABLE IF NOT EXISTS `ativo_precos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ativoId` INT NOT NULL,
  `origem` ENUM('nacional','internacional') NOT NULL,
  `fornecedorId` INT NULL,
  `precoCents` BIGINT NOT NULL,
  `moeda` VARCHAR(3) NOT NULL DEFAULT 'BRL',
  `incoterm` VARCHAR(10) NULL,
  `moq` INT NULL,
  `fonte` ENUM('proforma','invoice','cotacao','manual','mercado') NOT NULL,
  `documentoId` INT NULL,
  `registradoEm` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ativo_precos_ativo` (`ativoId`)
);

CREATE TABLE IF NOT EXISTS `ativo_fornecedor` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `ativoId` INT NOT NULL,
  `fornecedorId` INT NOT NULL,
  `origem` ENUM('nacional','internacional') NOT NULL,
  `criadoEm` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ativo_fornecedor_ativo` (`ativoId`),
  INDEX `idx_ativo_fornecedor_forn` (`fornecedorId`)
);

CREATE TABLE IF NOT EXISTS `fornecedor_ocorrencias` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `fornecedorId` INT NOT NULL,
  `tipo` ENUM('nao_conformidade','atraso','elogio','observacao') NOT NULL,
  `descricao` TEXT NULL,
  `criadoEm` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_forn_ocorr_forn` (`fornecedorId`)
);

CREATE TABLE IF NOT EXISTS `fase5_documentos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `tipo` ENUM('proforma','invoice','cotacao','planilha','pdf_outro') NOT NULL,
  `nomeArquivo` VARCHAR(255) NOT NULL,
  `storageKey` VARCHAR(512) NOT NULL,
  `status` ENUM('recebido','extraindo','extraido','em_revisao','aprovado','erro') NOT NULL DEFAULT 'recebido',
  `extracao` JSON NULL,
  `confianca` INT NULL,
  `operacaoId` INT NULL,
  `criadoEm` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_fase5_docs_user` (`userId`)
);
