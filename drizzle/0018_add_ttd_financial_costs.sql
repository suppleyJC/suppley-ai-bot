-- TTD SC (ICMS diferido/antecipado) e custos financeiros (IOF, Spread)
-- Adiciona campos para acompanhar ICMS antecipado e diferido no TTD 409/SC
-- Adiciona campos para custos financeiros (IOF e Spread cambial)

-- Quotations table
ALTER TABLE `quotations` ADD COLUMN `icmsAntecipadoCents` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `quotations` ADD COLUMN `icmsDiferidoCents` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `quotations` ADD COLUMN `iofCents` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `quotations` ADD COLUMN `spreadCents` bigint DEFAULT 0 NOT NULL;

-- Import Calculations table
ALTER TABLE `import_calculations` ADD COLUMN `icmsAntecipadoCents` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `import_calculations` ADD COLUMN `icmsDiferidoCents` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `import_calculations` ADD COLUMN `iofCents` bigint DEFAULT 0 NOT NULL;
ALTER TABLE `import_calculations` ADD COLUMN `spreadCents` bigint DEFAULT 0 NOT NULL;
