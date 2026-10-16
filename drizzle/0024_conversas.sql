-- Fase 3 Schema: conversas (threads de chat nomeáveis e retomáveis)
-- COMANDO 10: Histórico de conversas na Excambia + vínculo com Operação (sync chat ↔ Painel)
--
-- ADITIVA e backward-compatible:
--   - cria a tabela `conversas`
--   - adiciona `conversaId` em `sofia_chat_messages` (NULL para mensagens legadas)

CREATE TABLE `conversas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `titulo` varchar(255) NOT NULL,
  `status` enum('ativa','arquivada') NOT NULL DEFAULT 'ativa',
  `operacaoId` int,
  `estagio` enum('demand','source','analyze','execute','finance','closed','lost'),
  `ultimaMensagemEm` timestamp NULL,
  `criadaEm` timestamp NOT NULL DEFAULT (now()),
  `atualizadaEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(),
  CONSTRAINT `conversas_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_conversas_user` ON `conversas` (`userId`);
CREATE INDEX `idx_conversas_operacao` ON `conversas` (`operacaoId`);

-- Vincula mensagens existentes/novas a uma conversa (NULL = histórico legado).
ALTER TABLE `sofia_chat_messages` ADD COLUMN `conversaId` int;
CREATE INDEX `idx_chat_conversa` ON `sofia_chat_messages` (`conversaId`);
