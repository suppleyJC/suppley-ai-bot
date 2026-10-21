-- ============================================================
-- FEATURE — Marcos granulares da jornada (Fase 3)
-- ============================================================
-- Expande o vocabulário de marcos de 13 → 30, organizados em 9 fases de
-- apresentação (Produto e conformidade → Entrega e fechamento). Os 13 marcos
-- atuais são MANTIDOS (nada se perde); os 17 novos são ADITIVOS.
--
-- Os 5 estágios internos (Kanban) NÃO mudam — cada marco continua mapeado a um
-- deles no service (MARCO_ESTAGIO), preservando a convergência do card.
--
-- Também acrescenta o evento genérico "marco_registrado" em operacao_eventos,
-- usado pelos marcos granulares sem tipo de evento próprio.
--
-- MODIFY COLUMN com a lista completa é IDEMPOTENTE (re-rodar reaplica o mesmo
-- enum). MySQL 8.0+.
--
-- Aplicar em produção (senha colada no -p, SEM espaço):
--   docker exec -i suppley-mysql mysql -u suppley -p<SENHA> suppley_calc < drizzle/0046_marcos_granulares.sql
-- ============================================================

-- ---------- 1) operacao_marcos.tipo — 30 marcos (fases 1–9) ----------
ALTER TABLE operacao_marcos MODIFY COLUMN tipo ENUM(
  -- Fase 1 — Produto e conformidade
  'item_pesquisado','especificacao_definida','ncm_classificada','conformidade_verificada',
  -- Fase 2 — Sourcing e homologação
  'fornecedores_identificados','rfq_enviada','cotacao_recebida','fornecedor_selecionado',
  -- Fase 3 — Viabilidade econômica
  'calculo_feito','benchmark_mercado','go_aprovado',
  -- Fase 4 — Contratação e pedido
  'contrato_assinado','pedido_confirmado','pagamento_realizado',
  -- Fase 5 — Produção e qualidade
  'producao_iniciada','inspecao_agendada','inspecao_aprovada',
  -- Fase 6 — Logística na origem
  'booking_confirmado','invoice_emitida','bl_emitido','produto_embarcado',
  -- Fase 7 — Trânsito internacional
  'em_transito','chegada_prevista',
  -- Fase 8 — Desembaraço
  'di_registrada','impostos_recolhidos','carga_chegou','nacionalizado',
  -- Fase 9 — Entrega e fechamento
  'carga_liberada','entregue','operacao_fechada'
) NOT NULL;

-- ---------- 2) operacao_eventos.tipo — + "marco_registrado" ----------
ALTER TABLE operacao_eventos MODIFY COLUMN tipo ENUM(
  'demanda_criada','operacao_criada','rfq_enviada','cotacao_recebida',
  'cotacao_extraida','calculo_executado','go_decidido','no_go_decidido',
  'di_registrada','cambio_fechado','mensagem','nota_interna','alerta_ia',
  'estagio_avancado','anexo_adicionado','anexo_removido',
  'financeiro_lancado','financeiro_removido',
  'pedido_confirmado','producao_iniciada','produto_embarcado',
  'nacionalizado','entregue',
  'item_pesquisado','fornecedores_identificados','fornecedor_selecionado',
  'marco_registrado'
) NOT NULL;
