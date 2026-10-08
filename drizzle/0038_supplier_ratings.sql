-- 0038: garante a tabela supplier_ratings (feedback loop previsto × realizado).
-- A tabela está no _full_schema.sql (instalações novas), mas bancos de produção
-- criados antes dela precisam desta migração. CREATE TABLE IF NOT EXISTS é
-- idempotente por natureza — segura para re-rodar a cada deploy.

CREATE TABLE IF NOT EXISTS `supplier_ratings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`industryId` int NOT NULL,
	`quotationId` int,
	`productId` int,
	`priceScore` int NOT NULL,
	`qualityScore` int NOT NULL,
	`deliveryScore` int NOT NULL,
	`communicationScore` int NOT NULL,
	`comment` text,
	`orderDate` timestamp,
	`orderValue` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_ratings_id` PRIMARY KEY(`id`)
);
