Reading schema files:
/home/user/suppley-ai-bot/drizzle/schema.ts
/home/user/suppley-ai-bot/drizzle/rfqSchema.ts

CREATE TABLE `agent_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`actionType` enum('analysis_generated','alert_created','recommendation_made','data_fetched','trend_detected','optimization_suggested','exchange_check','market_analysis','recommendation_generation','chat_response') NOT NULL,
	`description` text NOT NULL,
	`result` text,
	`confidenceScore` int,
	`executionTimeMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_actions_id` PRIMARY KEY(`id`)
);

CREATE TABLE `agent_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`alertType` enum('exchange_rate','exchange_rate_favorable','exchange_rate_unfavorable','market_opportunity','cost_optimization','supplier_recommendation','tax_update','trend_alert','recommendation') NOT NULL,
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

CREATE TABLE `ativo_fornecedor` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ativoId` int NOT NULL,
	`fornecedorId` int NOT NULL,
	`origem` enum('nacional','internacional') NOT NULL,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ativo_fornecedor_id` PRIMARY KEY(`id`)
);

CREATE TABLE `ativo_precos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ativoId` int NOT NULL,
	`origem` enum('nacional','internacional') NOT NULL,
	`fornecedorId` int,
	`precoCents` bigint NOT NULL,
	`moeda` varchar(3) NOT NULL DEFAULT 'BRL',
	`incoterm` varchar(10),
	`moq` int,
	`fonte` enum('proforma','invoice','cotacao','manual','mercado') NOT NULL,
	`documentoId` int,
	`registradoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ativo_precos_id` PRIMARY KEY(`id`)
);

CREATE TABLE `calculation_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`calculationId` int NOT NULL,
	`productName` varchar(255) NOT NULL,
	`sku` varchar(100),
	`ncmCode` varchar(10) NOT NULL,
	`ncmConfirmed` boolean NOT NULL DEFAULT false,
	`quantity` int NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'UN',
	`unitPriceCents` bigint NOT NULL,
	`totalPriceCents` bigint NOT NULL,
	`unitPriceBrlCents` bigint,
	`totalPriceBrlCents` bigint,
	`iiValueCents` bigint,
	`ipiValueCents` bigint,
	`pisValueCents` bigint,
	`cofinsValueCents` bigint,
	`icmsValueCents` bigint,
	`totalCostCents` bigint,
	`unitCostCents` bigint,
	`suggestedPriceCents` bigint,
	`extractedFromPdf` boolean NOT NULL DEFAULT false,
	`pdfLineReference` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calculation_items_id` PRIMARY KEY(`id`)
);

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

CREATE TABLE `company_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyName` varchar(255),
	`cnpj` varchar(18),
	`stateCode` varchar(2) NOT NULL DEFAULT 'SC',
	`taxRegime` enum('simples_nacional','lucro_presumido','lucro_real') NOT NULL DEFAULT 'lucro_presumido',
	`simplesAliquota` int NOT NULL DEFAULT 1000,
	`simplesFaixa` int NOT NULL DEFAULT 1,
	`defaultMarkupPercent` int NOT NULL DEFAULT 3000,
	`defaultCustomsBrokerCents` bigint NOT NULL DEFAULT 150000,
	`defaultStorageCents` bigint NOT NULL DEFAULT 50000,
	`openaiApiKey` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_settings_userId_unique` UNIQUE(`userId`)
);

CREATE TABLE `conversa_mensagens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversaId` int NOT NULL,
	`role` enum('user','assistant','system','tool') NOT NULL,
	`content` text NOT NULL,
	`toolsUsed` json,
	`toolResults` json,
	`criadaEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversa_mensagens_id` PRIMARY KEY(`id`)
);

CREATE TABLE `conversas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`status` enum('ativa','arquivada') NOT NULL DEFAULT 'ativa',
	`operacaoId` int,
	`estagio` enum('demand','source','analyze','execute','finance','closed','lost'),
	`ultimaMensagemEm` timestamp,
	`criadaEm` timestamp NOT NULL DEFAULT (now()),
	`atualizadaEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversas_id` PRIMARY KEY(`id`)
);

CREATE TABLE `demandas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clienteNome` varchar(255),
	`productId` int,
	`descricao` text NOT NULL,
	`ncmProvavel` varchar(10),
	`quantidade` int,
	`unidade` varchar(20) DEFAULT 'UN',
	`paisDestino` varchar(60) DEFAULT 'Brasil',
	`estadoDestino` varchar(2) DEFAULT 'SC',
	`precoAlvoBrlCents` int,
	`prazoDesejado` timestamp,
	`status` enum('aberta','em_operacao','atendida','descartada') NOT NULL DEFAULT 'aberta',
	`criadaEm` timestamp NOT NULL DEFAULT (now()),
	`atualizadaEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `demandas_id` PRIMARY KEY(`id`)
);

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

CREATE TABLE `etl_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`job` varchar(60) NOT NULL,
	`periodFrom` varchar(7),
	`periodTo` varchar(7),
	`status` varchar(20) NOT NULL,
	`rowsProcessed` int NOT NULL DEFAULT 0,
	`message` varchar(500),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `etl_runs_id` PRIMARY KEY(`id`)
);

CREATE TABLE `exchange_rate_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromCurrency` varchar(3) NOT NULL,
	`toCurrency` varchar(3) NOT NULL,
	`rate` bigint NOT NULL,
	`source` varchar(50) NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exchange_rate_history_id` PRIMARY KEY(`id`)
);

CREATE TABLE `exchange_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromCurrency` varchar(3) NOT NULL,
	`toCurrency` varchar(3) NOT NULL,
	`rate` bigint NOT NULL,
	`source` varchar(50) NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exchange_rates_id` PRIMARY KEY(`id`)
);

CREATE TABLE `fase5_documentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tipo` enum('proforma','invoice','cotacao','planilha','pdf_outro') NOT NULL,
	`nomeArquivo` varchar(255) NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`status` enum('recebido','extraindo','extraido','em_revisao','aprovado','erro') NOT NULL DEFAULT 'recebido',
	`extracao` json,
	`confianca` int,
	`operacaoId` int,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fase5_documentos_id` PRIMARY KEY(`id`)
);

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

CREATE TABLE `fornecedor_ocorrencias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fornecedorId` int NOT NULL,
	`tipo` enum('nao_conformidade','atraso','elogio','observacao') NOT NULL,
	`descricao` text,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fornecedor_ocorrencias_id` PRIMARY KEY(`id`)
);

CREATE TABLE `icms_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stateCode` varchar(2) NOT NULL,
	`stateName` varchar(100) NOT NULL,
	`internalRate` int NOT NULL DEFAULT 1700,
	`importRate` int NOT NULL DEFAULT 400,
	`icmsAntecipadoRate` int NOT NULL DEFAULT 100,
	`interstateRate` int NOT NULL DEFAULT 1200,
	`hasIncentive` boolean NOT NULL DEFAULT false,
	`incentiveDescription` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `icms_rates_id` PRIMARY KEY(`id`),
	CONSTRAINT `icms_rates_stateCode_unique` UNIQUE(`stateCode`)
);

CREATE TABLE `import_calculations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int,
	`supplierId` int,
	`quotationId` int,
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
	`icmsAntecipadoCents` bigint NOT NULL DEFAULT 0,
	`icmsDiferidoCents` bigint NOT NULL DEFAULT 0,
	`iofCents` bigint NOT NULL DEFAULT 0,
	`spreadCents` bigint NOT NULL DEFAULT 0,
	`royaltiesCents` bigint NOT NULL DEFAULT 0,
	`assistsCents` bigint NOT NULL DEFAULT 0,
	`commissionsCents` bigint NOT NULL DEFAULT 0,
	`totalCostCents` bigint NOT NULL,
	`unitCostCents` bigint NOT NULL,
	`markupPercent` int NOT NULL DEFAULT 3000,
	`suggestedPriceCents` bigint NOT NULL,
	`quotationFileUrl` varchar(512),
	`quotationFileKey` varchar(255),
	`quotationFileName` varchar(255),
	`aiAnalysis` text,
	`viabilityScore` int,
	`status` enum('draft','completed','archived') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `import_calculations_id` PRIMARY KEY(`id`)
);

CREATE TABLE `inbound_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`industryId` int,
	`contactId` int,
	`rfqId` int,
	`outboundMessageId` int,
	`channel` enum('email','whatsapp','wechat','portal','other') NOT NULL,
	`senderAddress` varchar(320),
	`senderName` varchar(255),
	`subject` varchar(500),
	`body` text NOT NULL,
	`attachments` json,
	`extractedPrices` json,
	`extractedLeadTime` int,
	`extractedMoq` int,
	`extractedIncoterm` varchar(10),
	`status` enum('unread','read','processed','converted','archived') NOT NULL DEFAULT 'unread',
	`responseToken` varchar(64),
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inbound_messages_id` PRIMARY KEY(`id`)
);

CREATE TABLE `industries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`tradeName` varchar(255),
	`registrationNumber` varchar(100),
	`website` varchar(500),
	`sector` enum('metals','construction','machinery','electronics','chemicals','textiles','food','automotive','plastics','wood','packaging','energy','other') NOT NULL DEFAULT 'other',
	`subsector` varchar(100),
	`country` varchar(100) NOT NULL,
	`state` varchar(100),
	`city` varchar(100),
	`address` text,
	`postalCode` varchar(20),
	`region` enum('asia_china','asia_india','asia_southeast','asia_other','europe_west','europe_east','north_america','south_america','middle_east','africa','oceania') NOT NULL DEFAULT 'asia_china',
	`contactName` varchar(255),
	`contactRole` varchar(100),
	`contactEmail` varchar(320),
	`contactPhone` varchar(50),
	`contactWhatsapp` varchar(50),
	`contactWechat` varchar(100),
	`isMercosul` boolean NOT NULL DEFAULT false,
	`preferredIncoterm` enum('EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP') DEFAULT 'FOB',
	`preferredCurrency` varchar(3) DEFAULT 'USD',
	`paymentTerms` varchar(255),
	`minOrderValue` bigint,
	`leadTimeDays` int,
	`productionCapacity` varchar(255),
	`certifications` text,
	`yearEstablished` int,
	`employeeCount` int,
	`overallRating` decimal(3,2) DEFAULT '0',
	`priceRating` decimal(3,2) DEFAULT '0',
	`qualityRating` decimal(3,2) DEFAULT '0',
	`deliveryRating` decimal(3,2) DEFAULT '0',
	`communicationRating` decimal(3,2) DEFAULT '0',
	`totalOrders` int DEFAULT 0,
	`preferredLanguage` enum('pt','en','es','zh','ar','fr','de','it','ja','ko') DEFAULT 'en',
	`preferredChannel` enum('email','whatsapp','wechat','phone','alibaba','other') DEFAULT 'email',
	`status` enum('active','prospect','inactive','blacklisted') NOT NULL DEFAULT 'prospect',
	`notes` text,
	`tags` text,
	`legacySupplierId` int,
	`segmento` varchar(120),
	`regiao` varchar(120),
	`perfilDemanda` enum('recorrente','eventual','projeto','spot'),
	`sensibilidadePreco` enum('alta','media','baixa'),
	`volumeEstimadoMensal` int,
	`potencialComercial` enum('alto','medio','baixo'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `industries_id` PRIMARY KEY(`id`)
);

CREATE TABLE `industry_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`industryId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`role` varchar(100),
	`department` varchar(100),
	`email` varchar(320),
	`phone` varchar(50),
	`whatsapp` varchar(50),
	`wechat` varchar(100),
	`skype` varchar(100),
	`preferredChannel` enum('email','whatsapp','wechat','phone','skype','other') DEFAULT 'email',
	`language` enum('pt','en','es','zh','ar','fr','de','it','ja','ko') DEFAULT 'en',
	`isPrimary` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `industry_contacts_id` PRIMARY KEY(`id`)
);

CREATE TABLE `industry_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`industryId` int NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`sku` varchar(100),
	`ncmCode` varchar(10),
	`hsCode` varchar(10),
	`category` varchar(100),
	`subcategory` varchar(100),
	`specifications` text,
	`unit` varchar(20) NOT NULL DEFAULT 'UN',
	`weightPerUnit` decimal(10,4),
	`priceExw` bigint,
	`priceFob` bigint,
	`priceCif` bigint,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`moq` int,
	`leadTimeDays` int,
	`packagingInfo` varchar(255),
	`priceValidFrom` timestamp,
	`priceValidUntil` timestamp,
	`lastQuotedAt` timestamp,
	`qualityGrade` varchar(50),
	`certifications` varchar(500),
	`priceRank` int,
	`totalCompetitors` int,
	`priceVsAverage` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`imageUrl` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `industry_products_id` PRIMARY KEY(`id`)
);

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

CREATE TABLE `market_reference_ncm` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ncmCode` varchar(8) NOT NULL,
	`flow` varchar(6) NOT NULL,
	`countryCode` varchar(8),
	`countryName` varchar(120),
	`economicBlock` varchar(80),
	`periodFrom` varchar(7) NOT NULL,
	`periodTo` varchar(7) NOT NULL,
	`totalFobUsd` bigint NOT NULL DEFAULT 0,
	`totalCifUsd` bigint NOT NULL DEFAULT 0,
	`totalFreightUsd` bigint NOT NULL DEFAULT 0,
	`totalNetKg` bigint NOT NULL DEFAULT 0,
	`totalStatQty` bigint NOT NULL DEFAULT 0,
	`avgFobPerKgUsd` decimal(14,4),
	`avgCifPerKgUsd` decimal(14,4),
	`freightSharePct` decimal(6,2),
	`originSharePct` decimal(6,2),
	`recordCount` int NOT NULL DEFAULT 0,
	`isOutlierFiltered` int NOT NULL DEFAULT 0,
	`source` varchar(40) NOT NULL DEFAULT 'comexstat',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `market_reference_ncm_id` PRIMARY KEY(`id`)
);

CREATE TABLE `market_trend_ncm` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ncmCode` varchar(8) NOT NULL,
	`flow` varchar(6) NOT NULL,
	`yearMonth` varchar(7) NOT NULL,
	`totalFobUsd` bigint NOT NULL DEFAULT 0,
	`totalNetKg` bigint NOT NULL DEFAULT 0,
	`avgFobPerKgUsd` decimal(14,4),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `market_trend_ncm_id` PRIMARY KEY(`id`)
);

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

CREATE TABLE `operacao_anexos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`userId` int NOT NULL,
	`tipo` enum('desenho','pdf','imagem','especificacao','catalogo','cotacao','outro') NOT NULL DEFAULT 'outro',
	`nome` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` varchar(1024) NOT NULL,
	`contentType` varchar(120),
	`tamanhoBytes` bigint,
	`descricao` text,
	`autor` enum('usuario','excambia','sistema') NOT NULL DEFAULT 'usuario',
	`estagio` enum('demand','source','analyze','execute','finance','closed','lost'),
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operacao_anexos_id` PRIMARY KEY(`id`)
);

CREATE TABLE `operacao_estagios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`estagio` enum('demand','source','analyze','execute','finance') NOT NULL,
	`entrouEm` timestamp NOT NULL DEFAULT (now()),
	`saiuEm` timestamp,
	`gateCumprido` int NOT NULL DEFAULT 0,
	`gateChecklist` json,
	CONSTRAINT `operacao_estagios_id` PRIMARY KEY(`id`)
);

CREATE TABLE `operacao_eventos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`tipo` enum('demanda_criada','operacao_criada','rfq_enviada','cotacao_recebida','cotacao_extraida','calculo_executado','go_decidido','no_go_decidido','di_registrada','cambio_fechado','mensagem','nota_interna','alerta_ia','estagio_avancado','anexo_adicionado','anexo_removido','financeiro_lancado','financeiro_removido','pedido_confirmado','producao_iniciada','produto_embarcado','nacionalizado','entregue') NOT NULL,
	`estagio` enum('demand','source','analyze','execute','finance','closed','lost') NOT NULL,
	`refTipo` varchar(40),
	`refId` int,
	`autor` enum('usuario','excambia','sistema') NOT NULL DEFAULT 'usuario',
	`titulo` varchar(255),
	`payload` json,
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operacao_eventos_id` PRIMARY KEY(`id`)
);

CREATE TABLE `operacao_financeiro` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`userId` int NOT NULL,
	`tipo` enum('cambio','pagamento_fornecedor','imposto','frete','seguro','despesa_local','comissao','receita','outro') NOT NULL DEFAULT 'outro',
	`direcao` enum('entrada','saida') NOT NULL DEFAULT 'saida',
	`status` enum('previsto','realizado','cancelado') NOT NULL DEFAULT 'previsto',
	`descricao` varchar(255),
	`valorCents` bigint NOT NULL,
	`moeda` varchar(3) NOT NULL DEFAULT 'BRL',
	`valorBrlCents` bigint,
	`cambioRate` bigint,
	`refTipo` varchar(40),
	`refId` int,
	`dataReferencia` timestamp,
	`vencimento` timestamp,
	`autor` enum('usuario','excambia','sistema') NOT NULL DEFAULT 'usuario',
	`estagio` enum('demand','source','analyze','execute','finance','closed','lost'),
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	`atualizadoEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operacao_financeiro_id` PRIMARY KEY(`id`)
);

CREATE TABLE `operacao_marcos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operacaoId` int NOT NULL,
	`userId` int NOT NULL,
	`tipo` enum('pedido_confirmado','producao_iniciada','produto_embarcado','di_registrada','nacionalizado','entregue') NOT NULL,
	`status` enum('planejado','realizado','cancelado') NOT NULL DEFAULT 'realizado',
	`descricao` text,
	`dataReferencia` timestamp NOT NULL,
	`refTipo` varchar(40),
	`refId` int,
	`autor` enum('usuario','excambia','sistema') NOT NULL DEFAULT 'usuario',
	`criadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operacao_marcos_id` PRIMARY KEY(`id`)
);

CREATE TABLE `operacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`codigo` varchar(20) NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`demandaId` int,
	`clienteNome` varchar(255),
	`fornecedorId` int,
	`fornecedorNome` varchar(255),
	`cotacaoVencedoraId` int,
	`calculoId` int,
	`estagioAtual` enum('demand','source','analyze','execute','finance','closed','lost') NOT NULL DEFAULT 'demand',
	`status` enum('ativa','pausada','go','no_go','concluida','perdida') NOT NULL DEFAULT 'ativa',
	`regimeTributario` enum('lucro_real','lucro_presumido','simples_nacional'),
	`origemPais` varchar(60),
	`origemDesejada` varchar(60),
	`valorEstimadoBrlCents` int,
	`margemEstimadaBp` int,
	`prioridade` enum('baixa','media','alta','critica') DEFAULT 'media',
	`prazoDesejado` timestamp,
	`responsavelId` int,
	`decisaoGoNoGo` json,
	`criadaEm` timestamp NOT NULL DEFAULT (now()),
	`atualizadaEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operacoes_id` PRIMARY KEY(`id`)
);

CREATE TABLE `outbound_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`industryId` int NOT NULL,
	`contactId` int,
	`rfqId` int,
	`channel` enum('email','whatsapp','wechat','phone','other') NOT NULL,
	`recipientAddress` varchar(320) NOT NULL,
	`subject` varchar(500),
	`body` text NOT NULL,
	`language` enum('pt','en','es','zh','ar','fr') NOT NULL DEFAULT 'en',
	`responseToken` varchar(64),
	`responseUrl` varchar(500),
	`status` enum('draft','queued','sent','delivered','read','responded','bounced','expired') NOT NULL DEFAULT 'draft',
	`sentAt` timestamp,
	`deliveredAt` timestamp,
	`readAt` timestamp,
	`respondedAt` timestamp,
	`expiresAt` timestamp,
	`messageId` varchar(255),
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outbound_messages_id` PRIMARY KEY(`id`)
);

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

CREATE TABLE `product_best_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productNameNormalized` varchar(255) NOT NULL,
	`ncmCode` varchar(10),
	`bestPriceBrlCents` bigint NOT NULL,
	`bestPriceSupplierId` int NOT NULL,
	`bestPriceSupplierName` varchar(255) NOT NULL,
	`bestPriceQuotationId` int,
	`bestPriceDate` timestamp NOT NULL,
	`totalSuppliers` int NOT NULL DEFAULT 1,
	`avgPriceBrlCents` bigint,
	`minPriceBrlCents` bigint,
	`maxPriceBrlCents` bigint,
	`savingsPercent` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_best_prices_id` PRIMARY KEY(`id`)
);

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
	`categoria` varchar(120),
	`aplicacao` varchar(255),
	`material` varchar(120),
	`dimensoes` varchar(120),
	`ncmStatus` enum('sugerido','validado') DEFAULT 'sugerido',
	`origem` enum('nacional','internacional','ambos','importado_antes','cotado_nao_importado') DEFAULT 'cotado_nao_importado',
	`paisOrigem` varchar(100),
	`moqPadrao` int,
	`leadTimeMedioDias` int,
	`custoNacionalRefCents` bigint,
	`custoImportadoRefCents` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);

CREATE TABLE `quotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`supplierId` int,
	`quotationNumber` varchar(100),
	`supplierName` varchar(255),
	`supplierCountry` varchar(100),
	`quotationFileUrl` varchar(512),
	`quotationFileKey` varchar(255),
	`quotationFileName` varchar(255),
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`exchangeRate` bigint,
	`originCountry` varchar(100),
	`destinationState` varchar(2) DEFAULT 'SC',
	`isMercosul` boolean NOT NULL DEFAULT false,
	`freightCents` bigint NOT NULL DEFAULT 0,
	`insuranceCents` bigint NOT NULL DEFAULT 0,
	`customsBrokerCents` bigint NOT NULL DEFAULT 0,
	`storageCents` bigint NOT NULL DEFAULT 0,
	`otherCostsCents` bigint NOT NULL DEFAULT 0,
	`icmsAntecipadoCents` bigint NOT NULL DEFAULT 0,
	`icmsDiferidoCents` bigint NOT NULL DEFAULT 0,
	`iofCents` bigint NOT NULL DEFAULT 0,
	`spreadCents` bigint NOT NULL DEFAULT 0,
	`royaltiesCents` bigint NOT NULL DEFAULT 0,
	`assistsCents` bigint NOT NULL DEFAULT 0,
	`commissionsCents` bigint NOT NULL DEFAULT 0,
	`totalFobCents` bigint NOT NULL DEFAULT 0,
	`totalCifCents` bigint NOT NULL DEFAULT 0,
	`totalTaxesCents` bigint NOT NULL DEFAULT 0,
	`totalCostCents` bigint NOT NULL DEFAULT 0,
	`totalSuggestedPriceCents` bigint NOT NULL DEFAULT 0,
	`markupPercent` int NOT NULL DEFAULT 3000,
	`status` enum('draft','analyzing','viable','not_viable','negotiating','approved','ordered','shipped','customs','nationalized','completed','cancelled') NOT NULL DEFAULT 'draft',
	`notes` text,
	`aiAnalysis` text,
	`viabilityScore` int,
	`quotationDate` timestamp,
	`validUntil` timestamp,
	`orderDate` timestamp,
	`shipmentDate` timestamp,
	`estimatedArrival` timestamp,
	`customsClearanceDate` timestamp,
	`completionDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotations_id` PRIMARY KEY(`id`)
);

CREATE TABLE `sofia_chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conversaId` int,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`sessionId` varchar(64),
	`model` varchar(100),
	`tokensUsed` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sofia_chat_messages_id` PRIMARY KEY(`id`)
);

CREATE TABLE `excambia_learning_context` (
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
	CONSTRAINT `excambia_learning_context_id` PRIMARY KEY(`id`)
);

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

CREATE TABLE `supplier_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`supplierId` int NOT NULL,
	`quotationId` int,
	`calculationId` int,
	`productName` varchar(255) NOT NULL,
	`productNameNormalized` varchar(255) NOT NULL,
	`ncmCode` varchar(10),
	`sku` varchar(100),
	`unitPriceCents` bigint NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`unit` varchar(20) NOT NULL DEFAULT 'UN',
	`unitPriceBrlCents` bigint NOT NULL,
	`exchangeRate` bigint NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`minOrderQuantity` int,
	`leadTimeDays` int,
	`incoterm` varchar(10),
	`paymentTerms` varchar(100),
	`quotationDate` timestamp NOT NULL DEFAULT (now()),
	`validUntil` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_prices_id` PRIMARY KEY(`id`)
);

CREATE TABLE `supplier_ratings` (
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
	`tipo` enum('fabrica','trading','distribuidor','exportador','representante','fornecedor_nacional','fabricante_nacional','importador_local','distribuidor_brasileiro') DEFAULT 'fabrica',
	`origem` enum('nacional','internacional') DEFAULT 'internacional',
	`categorias` json,
	`moedas` json,
	`incotermsPraticados` json,
	`leadTimeMedioDias` int,
	`ratingScore` int,
	`ratingClasse` enum('A','B','C','D'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);

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

CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64),
	`name` text,
	`email` varchar(320),
	`passwordHash` varchar(255),
	`loginMethod` enum('email','oauth','apple','google','manus') NOT NULL DEFAULT 'email',
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`isEmailVerified` boolean NOT NULL DEFAULT false,
	`resetPasswordToken` varchar(255),
	`resetPasswordExpires` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);

CREATE TABLE `consolidated_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rfqId` int NOT NULL,
	`userId` int NOT NULL,
	`selectedSupplierQuoteId` int,
	`quoteNumber` varchar(50) NOT NULL,
	`selectedPort` varchar(100) NOT NULL,
	`selectedState` varchar(2) NOT NULL,
	`incoterm` varchar(3) NOT NULL DEFAULT 'FOB',
	`totalFobCents` bigint NOT NULL,
	`totalFreightCents` bigint NOT NULL,
	`totalInsuranceCents` bigint NOT NULL,
	`totalCifCents` bigint NOT NULL,
	`totalIiCents` bigint NOT NULL,
	`totalIpiCents` bigint NOT NULL,
	`totalPisCents` bigint NOT NULL,
	`totalCofinsCents` bigint NOT NULL,
	`totalIcmsCents` bigint NOT NULL,
	`totalTaxesCents` bigint NOT NULL,
	`customsBrokerCents` bigint NOT NULL DEFAULT 0,
	`storageCents` bigint NOT NULL DEFAULT 0,
	`otherCostsCents` bigint NOT NULL DEFAULT 0,
	`totalCostCents` bigint NOT NULL,
	`exchangeRate` bigint NOT NULL,
	`markupPercent` int NOT NULL DEFAULT 3000,
	`totalSuggestedPriceCents` bigint,
	`platformFeeCents` bigint NOT NULL DEFAULT 0,
	`platformFeePercent` int NOT NULL DEFAULT 150,
	`reformImpactJson` text,
	`excambiaVerdict` enum('GO','NEGOTIATE','NO_GO','WAIT'),
	`excambiaScore` int,
	`excambiaFullReport` text,
	`validUntil` timestamp,
	`status` enum('draft','ready','sent','viewed','accepted','rejected','expired','converted') NOT NULL DEFAULT 'draft',
	`sentAt` timestamp,
	`viewedAt` timestamp,
	`respondedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consolidated_quotes_id` PRIMARY KEY(`id`)
);

CREATE TABLE `rfq_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rfqId` int NOT NULL,
	`productName` varchar(255) NOT NULL,
	`productNameEn` varchar(255),
	`productNameZh` varchar(255),
	`description` text,
	`ncmCode` varchar(10),
	`ncmSuggested` varchar(10),
	`ncmConfirmed` boolean NOT NULL DEFAULT false,
	`hsCode` varchar(10),
	`specifications` text,
	`qualityStandard` varchar(100),
	`quantity` int NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'UN',
	`minOrderQuantity` int,
	`targetUnitPriceCents` bigint,
	`marketReferencePriceCents` bigint,
	`lastImportPriceCents` bigint,
	`weightKgPerUnit` int,
	`volumeM3PerUnit` int,
	`packagingRequirements` text,
	`certifications` text,
	`sampleRequired` boolean NOT NULL DEFAULT false,
	`sampleQuantity` int,
	`referenceImageUrls` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rfq_items_id` PRIMARY KEY(`id`)
);

CREATE TABLE `rfqs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`rfqNumber` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`importPurpose` enum('resale','own_use','industrialization','temporary') NOT NULL DEFAULT 'resale',
	`requesterType` enum('self','client') NOT NULL DEFAULT 'self',
	`clientName` varchar(255),
	`clientEmail` varchar(320),
	`clientPhone` varchar(50),
	`clientCompany` varchar(255),
	`clientCnpj` varchar(18),
	`clientState` varchar(2),
	`preferredCountries` text,
	`excludedCountries` text,
	`preferredIncoterm` enum('EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP') DEFAULT 'FOB',
	`destinationState` varchar(2) NOT NULL DEFAULT 'SC',
	`destinationPort` varchar(100),
	`urgency` enum('standard','fast','urgent') NOT NULL DEFAULT 'standard',
	`budgetMaxCents` bigint,
	`targetPriceCents` bigint,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`status` enum('draft','submitted','sourcing','quotes_sent','quotes_received','analyzing','ready','presented','accepted','rejected','expired','converted') NOT NULL DEFAULT 'draft',
	`excambiaAnalysis` text,
	`excambiaVerdict` enum('GO','NEGOTIATE','NO_GO','WAIT'),
	`excambiaScore` int,
	`excambiaRecommendation` text,
	`consolidatedQuoteId` int,
	`notes` text,
	`internalNotes` text,
	`desiredDeliveryDate` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rfqs_id` PRIMARY KEY(`id`)
);

CREATE TABLE `supplier_outreach` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rfqId` int NOT NULL,
	`supplierId` int,
	`recipientName` varchar(255) NOT NULL,
	`recipientEmail` varchar(320),
	`recipientPhone` varchar(50),
	`channel` enum('email','wechat','whatsapp','alibaba','phone','other') NOT NULL,
	`language` varchar(5) NOT NULL DEFAULT 'en',
	`subject` varchar(255),
	`messageContent` text NOT NULL,
	`status` enum('draft','queued','sent','delivered','read','replied','bounced','no_response') NOT NULL DEFAULT 'draft',
	`sentAt` timestamp,
	`deliveredAt` timestamp,
	`readAt` timestamp,
	`repliedAt` timestamp,
	`supplierQuoteId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_outreach_id` PRIMARY KEY(`id`)
);

CREATE TABLE `supplier_quote_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierQuoteId` int NOT NULL,
	`rfqItemId` int NOT NULL,
	`unitPriceCents` bigint NOT NULL,
	`totalPriceCents` bigint NOT NULL,
	`quantity` int NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'UN',
	`priceBreaks` text,
	`supplierProductName` varchar(255),
	`supplierSku` varchar(100),
	`supplierSpecs` text,
	`inStock` boolean,
	`stockQuantity` int,
	`productionDays` int,
	`nationalizedUnitCostCents` bigint,
	`nationalizedTotalCostCents` bigint,
	`vsTargetPercent` int,
	`vsMarketPercent` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_quote_items_id` PRIMARY KEY(`id`)
);

CREATE TABLE `supplier_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rfqId` int NOT NULL,
	`supplierId` int,
	`supplierName` varchar(255) NOT NULL,
	`supplierCountry` varchar(100) NOT NULL,
	`supplierContact` varchar(255),
	`supplierEmail` varchar(320),
	`supplierPhone` varchar(50),
	`supplierPlatform` varchar(50),
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`incoterm` varchar(3) NOT NULL DEFAULT 'FOB',
	`totalFobCents` bigint,
	`totalCifCents` bigint,
	`freightEstimateCents` bigint,
	`paymentTerms` varchar(255),
	`leadTimeDays` int,
	`moq` int,
	`validUntil` timestamp,
	`quotationFileUrl` varchar(512),
	`quotationFileKey` varchar(255),
	`quotationFileName` varchar(255),
	`excambiaScore` int,
	`excambiaAnalysis` text,
	`priceCompetitiveness` enum('best','competitive','above_average','expensive'),
	`status` enum('pending','received','analyzing','shortlisted','selected','rejected','expired') NOT NULL DEFAULT 'pending',
	`overallRank` int,
	`notes` text,
	`communicationChannel` enum('email','wechat','whatsapp','alibaba_chat','phone','other') DEFAULT 'email',
	`communicationLanguage` varchar(5) DEFAULT 'en',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_quotes_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_ativo_fornecedor_ativo` ON `ativo_fornecedor` (`ativoId`);
CREATE INDEX `idx_ativo_fornecedor_forn` ON `ativo_fornecedor` (`fornecedorId`);
CREATE INDEX `idx_ativo_precos_ativo` ON `ativo_precos` (`ativoId`);
CREATE INDEX `idx_conversa_msgs` ON `conversa_mensagens` (`conversaId`);
CREATE INDEX `idx_conversas_user` ON `conversas` (`userId`);
CREATE INDEX `idx_conversas_operacao` ON `conversas` (`operacaoId`);
CREATE INDEX `idx_demandas_user` ON `demandas` (`userId`);
CREATE INDEX `idx_fase5_docs_user` ON `fase5_documentos` (`userId`);
CREATE INDEX `idx_forn_ocorr_forn` ON `fornecedor_ocorrencias` (`fornecedorId`);
CREATE INDEX `uq_market_ref` ON `market_reference_ncm` (`ncmCode`,`flow`,`countryCode`,`periodFrom`,`periodTo`);
CREATE INDEX `idx_market_ref_ncm` ON `market_reference_ncm` (`ncmCode`);
CREATE INDEX `uq_market_trend` ON `market_trend_ncm` (`ncmCode`,`flow`,`yearMonth`);
CREATE INDEX `idx_market_trend_ncm` ON `market_trend_ncm` (`ncmCode`);
CREATE INDEX `idx_anexos_operacao` ON `operacao_anexos` (`operacaoId`);
CREATE INDEX `idx_estagios_operacao` ON `operacao_estagios` (`operacaoId`);
CREATE INDEX `idx_eventos_operacao` ON `operacao_eventos` (`operacaoId`);
CREATE INDEX `idx_financeiro_operacao` ON `operacao_financeiro` (`operacaoId`);
CREATE INDEX `idx_marcos_operacao` ON `operacao_marcos` (`operacaoId`);
CREATE INDEX `idx_operacoes_user` ON `operacoes` (`userId`);
CREATE INDEX `idx_operacoes_stage` ON `operacoes` (`estagioAtual`);
CREATE INDEX `idx_operacoes_codigo` ON `operacoes` (`codigo`);
