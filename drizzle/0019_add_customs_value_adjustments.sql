-- Ajustes de Valor Aduaneiro (Royalties, Assists, Comissões)
-- Adiciona campos para rastreamento de ajustes que afetam valor aduaneiro (CIF)
-- Conforme Lei 8.846/1994 e Decreto 6.759/2009

-- Quotations table
ALTER TABLE `quotations` ADD COLUMN `royaltiesCents` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `quotations` ADD COLUMN `assistsCents` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `quotations` ADD COLUMN `commissionsCents` bigint DEFAULT 0 NOT NULL;

-- Import Calculations table
ALTER TABLE `import_calculations` ADD COLUMN `royaltiesCents` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `import_calculations` ADD COLUMN `assistsCents` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `import_calculations` ADD COLUMN `commissionsCents` bigint DEFAULT 0 NOT NULL;
