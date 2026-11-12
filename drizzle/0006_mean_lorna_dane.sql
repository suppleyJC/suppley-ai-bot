CREATE TABLE `market_indicators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`indicatorType` varchar(50) NOT NULL,
	`indicatorName` varchar(100) NOT NULL,
	`value` int NOT NULL,
	`metadata` text,
	`source` varchar(100) NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `market_indicators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `predictive_analysis_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`analysisType` varchar(50) NOT NULL,
	`indicator` varchar(100) NOT NULL,
	`currentValue` int NOT NULL,
	`predictedValue` int NOT NULL,
	`actualValue` int,
	`confidence` int NOT NULL,
	`timeframeDays` int NOT NULL,
	`direction` enum('up','down','stable') NOT NULL,
	`predictionDate` timestamp NOT NULL DEFAULT (now()),
	`targetDate` timestamp NOT NULL,
	`wasAccurate` boolean,
	`accuracyScore` int,
	`fullAnalysis` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `predictive_analysis_results_id` PRIMARY KEY(`id`)
);
