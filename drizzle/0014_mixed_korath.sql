CREATE TABLE `commodity_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`commodityCode` varchar(50) NOT NULL,
	`commodityName` varchar(255) NOT NULL,
	`category` varchar(100),
	`priceCents` bigint NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`unit` varchar(20) NOT NULL,
	`changePercent` int,
	`changeDirection` enum('up','down','stable'),
	`source` varchar(100) NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commodity_prices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drawback_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`drawbackType` enum('suspension','exemption','restitution') NOT NULL,
	`actNumber` varchar(50),
	`actDate` timestamp,
	`validUntil` timestamp,
	`exportProductName` varchar(255),
	`exportNcm` varchar(10),
	`exportQuantity` int,
	`exportValueCents` bigint,
	`importProductName` varchar(255),
	`importNcm` varchar(10),
	`importQuantity` int,
	`importValueCents` bigint,
	`iiSuspendedCents` bigint DEFAULT 0,
	`ipiSuspendedCents` bigint DEFAULT 0,
	`pisSuspendedCents` bigint DEFAULT 0,
	`cofinsSuspendedCents` bigint DEFAULT 0,
	`status` enum('draft','requested','approved','active','fulfilled','expired','cancelled') NOT NULL DEFAULT 'draft',
	`quotationId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drawback_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fiscal_benefits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`code` varchar(50),
	`stateCode` varchar(2),
	`ncmPattern` varchar(20),
	`benefitType` enum('ii_reduction','ii_exemption','ipi_reduction','ipi_exemption','icms_reduction','icms_credit','icms_deferral','pis_cofins_suspension','drawback','recof') NOT NULL,
	`reductionPercent` int,
	`creditPercent` int,
	`requirements` text,
	`documentation` text,
	`startDate` timestamp,
	`endDate` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`legalBasis` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fiscal_benefits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `state_pricing_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stateCode` varchar(2) NOT NULL,
	`stateName` varchar(100) NOT NULL,
	`icmsInternalRate` int NOT NULL,
	`icmsInterstateRate` int NOT NULL,
	`hasDifal` boolean NOT NULL DEFAULT true,
	`difalCalculationMethod` enum('simple','double_base') NOT NULL DEFAULT 'simple',
	`hasStDefault` boolean NOT NULL DEFAULT false,
	`defaultMva` int,
	`additionalLogisticsCostPercent` int DEFAULT 0,
	`notes` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `state_pricing_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tax_change_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`changeType` enum('ncm_rate','state_rate','benefit_new','benefit_expired','agreement','regulatory') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`ncmCode` varchar(10),
	`stateCode` varchar(2),
	`impactLevel` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`isRead` boolean NOT NULL DEFAULT false,
	`readAt` timestamp,
	`effectiveDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tax_change_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tax_rate_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ncmCode` varchar(10) NOT NULL,
	`field` varchar(20) NOT NULL,
	`oldValue` int NOT NULL,
	`newValue` int NOT NULL,
	`source` varchar(100) NOT NULL,
	`effectiveDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tax_rate_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tax_update_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(100) NOT NULL,
	`success` boolean NOT NULL,
	`insertedCount` int NOT NULL DEFAULT 0,
	`updatedCount` int NOT NULL DEFAULT 0,
	`errors` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tax_update_logs_id` PRIMARY KEY(`id`)
);
