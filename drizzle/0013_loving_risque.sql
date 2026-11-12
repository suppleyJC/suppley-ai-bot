CREATE TABLE `sofia_chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`sessionId` varchar(64),
	`model` varchar(100),
	`tokensUsed` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sofia_chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sofia_learning_context` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`contextType` enum('preference','business_rule','supplier_info','product_insight','market_trend','calculation_pattern','feedback') NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`importance` int NOT NULL DEFAULT 50,
	`source` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastUsedAt` timestamp,
	CONSTRAINT `sofia_learning_context_id` PRIMARY KEY(`id`)
);
