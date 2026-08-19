-- Fase 2 Schema: operacao_marcos table (key milestones in production/shipment/nationalization)
-- COMANDO 5: Track milestones (order confirmed, production started, shipped, DI registered, nationalized, delivered)

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

CREATE INDEX `idx_marcos_operacao` ON `operacao_marcos` (`operacaoId`);

-- Expand operacao_eventos.tipo enum to include milestone events (timeline coesion)
ALTER TABLE `operacao_eventos` MODIFY COLUMN `tipo` enum(
  'demanda_criada','operacao_criada','rfq_enviada','cotacao_recebida',
  'cotacao_extraida','calculo_executado','go_decidido','no_go_decidido',
  'di_registrada','cambio_fechado','mensagem','nota_interna','alerta_ia',
  'estagio_avancado','anexo_adicionado','anexo_removido',
  'financeiro_lancado','financeiro_removido',
  'pedido_confirmado','producao_iniciada','produto_embarcado',
  'nacionalizado','entregue'
) NOT NULL;
