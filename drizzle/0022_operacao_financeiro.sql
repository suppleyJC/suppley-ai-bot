-- Fase 2 Schema: operacao_financeiro table (transversal financial layer)
-- COMANDO 4: Track planned/realized financial entries per operation
-- (exchange, supplier payment, taxes, freight, local expenses, revenue)

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
  `dataReferencia` timestamp NULL,
  `vencimento` timestamp NULL,
  `autor` enum('usuario','excambia','sistema') NOT NULL DEFAULT 'usuario',
  `estagio` enum('demand','source','analyze','execute','finance','closed','lost'),
  `criadoEm` timestamp NOT NULL DEFAULT (now()),
  `atualizadoEm` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `operacao_financeiro_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_financeiro_operacao` ON `operacao_financeiro` (`operacaoId`);

-- Expand operacao_eventos.tipo enum to include financial events (timeline coesion)
ALTER TABLE `operacao_eventos` MODIFY COLUMN `tipo` enum(
  'demanda_criada','operacao_criada','rfq_enviada','cotacao_recebida',
  'cotacao_extraida','calculo_executado','go_decidido','no_go_decidido',
  'di_registrada','cambio_fechado','mensagem','nota_interna','alerta_ia',
  'estagio_avancado','anexo_adicionado','anexo_removido',
  'financeiro_lancado','financeiro_removido'
) NOT NULL;
