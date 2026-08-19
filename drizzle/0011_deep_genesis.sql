ALTER TABLE `company_settings` ADD `taxRegime` enum('simples_nacional','lucro_presumido','lucro_real') DEFAULT 'lucro_presumido' NOT NULL;--> statement-breakpoint
ALTER TABLE `company_settings` ADD `simplesAliquota` int DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `company_settings` ADD `simplesFaixa` int DEFAULT 1 NOT NULL;