-- ============================================================
-- FEATURE — Parâmetros de Cálculo (fundação de dados versionada)
-- ============================================================
-- Cria e SEMEIA, de forma idempotente:
--   1) tax_parameters  — alíquotas/taxas globais com vigência por data
--                        (PIS, COFINS, AFRMM, Siscomex, despesas fixas)
--   2) port_costs       — custos portuários por terminal (lançáveis na planilha)
--   3) ncm_exceptions   — Ex-Tarifário (redução/suspensão de II/IPI por NCM)
--   4) fiscal_benefits  — seed dos benefícios nacionais + Mercosul/ALADI
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + INSERT IGNORE (chaves únicas).
-- Seguro para re-rodar. MySQL 8.0+.
--
-- Aplicar em produção (senha colada no -p, SEM espaço):
--   docker exec -i suppley-mysql sh -c 'exec mysql -u suppley -p"$MYSQL_PASSWORD" suppley_calc' < drizzle/0032_parametros_de_calculo.sql
-- ============================================================

-- ---------- 1) tax_parameters ----------
CREATE TABLE IF NOT EXISTS `tax_parameters` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `paramKey` VARCHAR(60) NOT NULL,
  `label` VARCHAR(180) NOT NULL,
  `category` VARCHAR(40) NOT NULL,
  `unit` VARCHAR(12) NOT NULL,
  `valueBp` INT NULL,
  `valueCents` BIGINT NULL,
  `effectiveDate` TIMESTAMP NOT NULL,
  `endDate` TIMESTAMP NULL,
  `legalBasis` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tax_parameters` (`paramKey`, `effectiveDate`),
  KEY `idx_tax_parameters_key` (`paramKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `tax_parameters`
  (`paramKey`, `label`, `category`, `unit`, `valueBp`, `valueCents`, `effectiveDate`, `legalBasis`, `notes`)
VALUES
  ('PIS_IMPORT',      'PIS-Importação',                 'tributo_federal', 'bp',    210,  NULL,  '2025-01-01 00:00:00', 'Lei 10.865/2004, art. 8º',                 'Base: valor aduaneiro (CIF).'),
  ('COFINS_IMPORT',   'COFINS-Importação',              'tributo_federal', 'bp',   1025,  NULL,  '2025-01-01 00:00:00', 'Lei 10.865/2004 + LC 224/2025',            '9,65% + 0,6% adicional (LC 224/2025).'),
  ('AFRMM_RATE',      'AFRMM (sobre frete marítimo)',   'tributo_federal', 'bp',   2500,  NULL,  '2025-01-01 00:00:00', 'Lei 10.893/1990, art. 17',                 'Incide apenas sobre frete marítimo.'),
  ('SISCOMEX_BASE',   'Taxa Siscomex — base',           'taxa_fixa',       'cents', NULL, 18500, '2025-01-01 00:00:00', 'Portaria MF (Siscomex)',                   'Valor por DI.'),
  ('SISCOMEX_ADICAO', 'Taxa Siscomex — por adição',     'taxa_fixa',       'cents', NULL,  2950, '2025-01-01 00:00:00', 'Portaria MF (Siscomex)',                   'Por adição além da primeira.'),
  ('BL_LIBERATION',   'Liberação de BL',                'despesa',         'cents', NULL, 35000, '2025-01-01 00:00:00', NULL,                                       'Estimativa.'),
  ('CUSTOMS_BROKER',  'Honorários de despachante',      'despesa',         'cents', NULL, 80000, '2025-01-01 00:00:00', NULL,                                       'Estimativa.');

-- ---------- 2) port_costs ----------
CREATE TABLE IF NOT EXISTS `port_costs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `portCode` VARCHAR(10) NOT NULL,
  `portName` VARCHAR(180) NOT NULL,
  `stateCode` VARCHAR(2) NOT NULL,
  `modal` VARCHAR(20) NOT NULL DEFAULT 'maritimo',
  `thcCents` BIGINT NOT NULL DEFAULT 0,
  `storageBp` INT NOT NULL DEFAULT 0,
  `liberationCents` BIGINT NOT NULL DEFAULT 0,
  `otherCents` BIGINT NOT NULL DEFAULT 0,
  `effectiveDate` TIMESTAMP NOT NULL,
  `legalBasis` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_port_costs` (`portCode`, `modal`, `effectiveDate`),
  KEY `idx_port_costs_port` (`portCode`),
  KEY `idx_port_costs_state` (`stateCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `port_costs`
  (`portCode`, `portName`, `stateCode`, `modal`, `thcCents`, `storageBp`, `liberationCents`, `effectiveDate`, `notes`)
VALUES
  ('BRMAN','Porto de Manaus','AM','maritimo',120000,150,40000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRBEL','Porto de Belém','PA','maritimo',110000,150,38000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRVDC','Porto de Vila do Conde','PA','maritimo',100000,140,35000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRITQ','Porto de Itaqui','MA','maritimo',105000,140,36000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRFOR','Porto de Fortaleza (Mucuripe)','CE','maritimo',110000,150,38000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRPEC','Porto do Pecém','CE','maritimo',115000,150,39000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRNAT','Porto de Natal','RN','maritimo',100000,140,35000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRREC','Porto de Recife','PE','maritimo',110000,150,38000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRSUA','Porto de Suape','PE','maritimo',120000,150,40000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRSSA','Porto de Salvador','BA','maritimo',115000,150,39000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRARI','Porto de Aratu','BA','maritimo',110000,140,37000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRVIX','Porto de Vitória','ES','maritimo',120000,150,40000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRTUB','Porto de Tubarão','ES','maritimo',110000,140,37000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRRIO','Porto do Rio de Janeiro','RJ','maritimo',140000,180,45000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRSEP','Porto de Sepetiba (Itaguaí)','RJ','maritimo',130000,160,42000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRSSZ','Porto de Santos','SP','maritimo',150000,200,50000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRSSO','Porto de São Sebastião','SP','maritimo',120000,150,40000,'2025-01-01 00:00:00','Estimativa. (corrige código duplicado BRSFS)'),
  ('BRPNG','Porto de Paranaguá','PR','maritimo',130000,160,42000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRANT','Porto de Antonina','PR','maritimo',110000,140,37000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRIOA','Porto de Itajaí','SC','maritimo',125000,150,41000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRNAV','Porto de Navegantes','SC','maritimo',120000,150,40000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRSFS','Porto de São Francisco do Sul','SC','maritimo',115000,140,38000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRIBB','Porto de Imbituba','SC','maritimo',110000,140,37000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRRGI','Porto de Rio Grande','RS','maritimo',120000,150,40000,'2025-01-01 00:00:00','Estimativa.'),
  ('BRPOA','Porto de Porto Alegre','RS','maritimo',110000,140,37000,'2025-01-01 00:00:00','Estimativa.');

-- ---------- 3) ncm_exceptions (Ex-Tarifário) ----------
CREATE TABLE IF NOT EXISTS `ncm_exceptions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ncmCode` VARCHAR(10) NOT NULL,
  `exCode` VARCHAR(20) NULL,
  `description` TEXT NULL,
  `reducedIiRate` INT NULL,
  `reducedIpiRate` INT NULL,
  `legalBasis` VARCHAR(255) NULL,
  `startDate` TIMESTAMP NULL,
  `endDate` TIMESTAMP NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ncm_exceptions` (`ncmCode`, `exCode`),
  KEY `idx_ncm_exceptions_ncm` (`ncmCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Exemplos-modelo, INATIVOS (isActive=0) — não afetam cálculo até serem
-- validados/ativados pelo usuário com a Resolução GECEX vigente.
INSERT IGNORE INTO `ncm_exceptions`
  (`ncmCode`, `exCode`, `description`, `reducedIiRate`, `legalBasis`, `isActive`)
VALUES
  ('8479.89.99','Ex 001','Modelo de Ex-Tarifário (BK) — validar vigência',0,'Resolução GECEX (exemplo)',0),
  ('8443.39.10','Ex 002','Modelo de Ex-Tarifário (BIT) — validar vigência',0,'Resolução GECEX (exemplo)',0);

-- ---------- 4) fiscal_benefits — seed nacional + Mercosul/ALADI ----------
-- A tabela já existe (migração 0014). Seed idempotente por `code`.
INSERT INTO `fiscal_benefits`
  (`name`, `code`, `stateCode`, `ncmPattern`, `benefitType`, `reductionPercent`, `requirements`, `legalBasis`, `isActive`)
SELECT * FROM (
  SELECT 'Mercosul — Livre comércio intrazona'                AS name, 'MERCOSUL'      AS code, CAST(NULL AS CHAR) AS stateCode, CAST(NULL AS CHAR) AS ncmPattern, 'ii_exemption'         AS benefitType, 10000 AS reductionPercent, 'Certificado de Origem Mercosul (CO)'        AS requirements, 'Tratado de Assunção / ACE-18 (ALADI)'          AS legalBasis, 1 AS isActive
  UNION ALL SELECT 'ALADI/ACE — Preferência tarifária por acordo','ALADI_ACE', NULL, NULL, 'ii_reduction',  NULL, 'Certificado de Origem do acordo (ACE)',        'ALADI — Acordos de Complementação Econômica', 1
  UNION ALL SELECT 'Drawback Suspensão',                          'DRAWBACK_SUSP', NULL, NULL, 'drawback',  10000, 'Ato Concessório de Drawback; exportação vinculada', 'Lei 11.945/2009; IN RFB 1.911/2019', 1
  UNION ALL SELECT 'Drawback Isenção',                            'DRAWBACK_ISEN', NULL, NULL, 'drawback',  10000, 'Comprovação de exportação anterior',          'Lei 11.945/2009; IN RFB 1.911/2019', 1
  UNION ALL SELECT 'RECOF — Entreposto Industrial',               'RECOF',         NULL, NULL, 'recof',     NULL,  'Habilitação RFB; controle informatizado',     'IN RFB 1.291/2012', 1
  UNION ALL SELECT 'RECOF-SPED',                                  'RECOF_SPED',    NULL, NULL, 'recof',     NULL,  'Habilitação RFB via SPED',                    'IN RFB 1.612/2016', 1
  UNION ALL SELECT 'REPETRO-SPED (petróleo e gás)',              'REPETRO',       NULL, NULL, 'pis_cofins_suspension', NULL, 'Habilitação no regime; bens da Lista REPETRO', 'Decreto 9.537/2018', 1
  UNION ALL SELECT 'Ex-Tarifário (BK/BIT)',                       'EX_TARIFARIO',  NULL, NULL, 'ii_reduction', NULL, 'Bem sem produção nacional equivalente',       'Resolução GECEX (ver tabela ncm_exceptions)', 1
  UNION ALL SELECT 'Zona Franca de Manaus — Isenção/Redução',     'ZFM',           'AM', NULL, 'ii_reduction', NULL, 'Internamento na ZFM; projeto na SUFRAMA',      'Decreto-Lei 288/1967', 1
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM `fiscal_benefits` fb WHERE fb.`code` = seed.code
);
