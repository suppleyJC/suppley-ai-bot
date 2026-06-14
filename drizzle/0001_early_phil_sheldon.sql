CREATE TABLE `company_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyName` varchar(255),
	`cnpj` varchar(18),
	`stateCode` varchar(2) NOT NULL DEFAULT 'SC',
	`defaultMarkupPercent` int NOT NULL DEFAULT 3000,
	`defaultCustomsBrokerCents` bigint NOT NULL DEFAULT 150000,
	`defaultStorageCents` bigint NOT NULL DEFAULT 50000,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_settings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromCurrency` varchar(3) NOT NULL,
	`toCurrency` varchar(3) NOT NULL,
	`rate` bigint NOT NULL,
	`source` varchar(50) NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exchange_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `icms_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stateCode` varchar(2) NOT NULL,
	`stateName` varchar(100) NOT NULL,
	`internalRate` int NOT NULL DEFAULT 1700,
	`importRate` int NOT NULL DEFAULT 400,
	`interstateRate` int NOT NULL DEFAULT 1200,
	`hasIncentive` boolean NOT NULL DEFAULT false,
	`incentiveDescription` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `icms_rates_id` PRIMARY KEY(`id`),
	CONSTRAINT `icms_rates_stateCode_unique` UNIQUE(`stateCode`)
);
--> statement-breakpoint
CREATE TABLE `import_calculations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int,
	`supplierId` int,
	`productName` varchar(255) NOT NULL,
	`ncmCode` varchar(10) NOT NULL,
	`quantity` int NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'UN',
	`originCountry` varchar(100) NOT NULL,
	`isMercosul` boolean NOT NULL DEFAULT false,
	`destinationState` varchar(2) NOT NULL DEFAULT 'SC',
	`fobValueCents` bigint NOT NULL,
	`fobCurrency` varchar(3) NOT NULL DEFAULT 'USD',
	`freightCents` bigint NOT NULL DEFAULT 0,
	`insuranceCents` bigint NOT NULL DEFAULT 0,
	`exchangeRate` bigint NOT NULL,
	`cifBrlCents` bigint NOT NULL,
	`iiValueCents` bigint NOT NULL,
	`ipiValueCents` bigint NOT NULL,
	`pisValueCents` bigint NOT NULL,
	`cofinsValueCents` bigint NOT NULL,
	`icmsValueCents` bigint NOT NULL,
	`customsBrokerCents` bigint NOT NULL DEFAULT 0,
	`storageCents` bigint NOT NULL DEFAULT 0,
	`otherCostsCents` bigint NOT NULL DEFAULT 0,
	`totalCostCents` bigint NOT NULL,
	`unitCostCents` bigint NOT NULL,
	`markupPercent` int NOT NULL DEFAULT 3000,
	`suggestedPriceCents` bigint NOT NULL,
	`aiAnalysis` text,
	`viabilityScore` int,
	`status` enum('draft','completed','archived') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `import_calculations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ncm_tax_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ncmCode` varchar(10) NOT NULL,
	`description` text,
	`iiRate` int NOT NULL DEFAULT 0,
	`ipiRate` int NOT NULL DEFAULT 0,
	`pisRate` int NOT NULL DEFAULT 216,
	`cofinsRate` int NOT NULL DEFAULT 1000,
	`mercosulIiRate` int NOT NULL DEFAULT 0,
	`notes` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ncm_tax_rates_id` PRIMARY KEY(`id`),
	CONSTRAINT `ncm_tax_rates_ncmCode_unique` UNIQUE(`ncmCode`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`supplierId` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`ncmCode` varchar(10) NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'UN',
	`weightKg` int,
	`volumeM3` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`country` varchar(100) NOT NULL,
	`city` varchar(100),
	`contactName` varchar(255),
	`contactEmail` varchar(320),
	`contactPhone` varchar(50),
	`notes` text,
	`isMercosul` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
