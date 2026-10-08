CREATE TABLE `agent_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`actionType` enum('analysis_generated','alert_created','recommendation_made','data_fetched','trend_detected','optimization_suggested') NOT NULL,
	`description` text NOT NULL,
	`result` text,
	`confidenceScore` int,
	`executionTimeMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`alertType` enum('exchange_rate_favorable','exchange_rate_unfavorable','market_opportunity','cost_optimization','supplier_recommendation','tax_update','trend_alert') NOT NULL,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`actionRecommended` text,
	`relatedProductId` int,
	`relatedSupplierId` int,
	`relatedCalculationId` int,
	`metadata` text,
	`isRead` boolean NOT NULL DEFAULT false,
	`isDismissed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `agent_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`enableExchangeAlerts` boolean NOT NULL DEFAULT true,
	`usdTargetRate` bigint,
	`eurTargetRate` bigint,
	`enableEmailNotifications` boolean NOT NULL DEFAULT false,
	`enablePushNotifications` boolean NOT NULL DEFAULT true,
	`autoAnalyzeNewCalculations` boolean NOT NULL DEFAULT true,
	`preferredAnalysisDepth` enum('basic','standard','detailed') NOT NULL DEFAULT 'standard',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_preferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `ai_chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`relatedCalculationId` int,
	`tokensUsed` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exchange_rate_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromCurrency` varchar(3) NOT NULL,
	`toCurrency` varchar(3) NOT NULL,
	`rate` bigint NOT NULL,
	`source` varchar(50) NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exchange_rate_history_id` PRIMARY KEY(`id`)
);
