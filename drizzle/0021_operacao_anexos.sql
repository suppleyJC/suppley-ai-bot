-- Fase 2 Schema: operacao_anexos table for file attachments
-- COMANDO 3: Support chat-first file uploads (drawings, PDFs, images, specs, catalogs, quotations)

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

CREATE INDEX `idx_anexos_operacao` ON `operacao_anexos` (`operacaoId`);

-- Expand operacao_eventos.tipo enum to include attachment events (timeline coesion)
ALTER TABLE `operacao_eventos` MODIFY COLUMN `tipo` enum(
  'demanda_criada','operacao_criada','rfq_enviada','cotacao_recebida',
  'cotacao_extraida','calculo_executado','go_decidido','no_go_decidido',
  'di_registrada','cambio_fechado','mensagem','nota_interna','alerta_ia',
  'estagio_avancado','anexo_adicionado','anexo_removido'
) NOT NULL;
