-- Fase 2 Schema: Add operational metadata fields to operacoes table
-- COMANDO 2: Support chat-first operations with priority, deadline, responsible user, and preferred origin

ALTER TABLE `operacoes` ADD COLUMN `origemDesejada` varchar(60);
ALTER TABLE `operacoes` ADD COLUMN `prioridade` enum('baixa', 'media', 'alta', 'critica') DEFAULT 'media';
ALTER TABLE `operacoes` ADD COLUMN `prazoDesejado` timestamp;
ALTER TABLE `operacoes` ADD COLUMN `responsavelId` int;
