-- =============================================================
-- SPRINT 2 — Pilar 1: Unificação de Fornecedores & Indústrias
-- =============================================================
-- Migração SEGURA e IDEMPOTENTE. Copia suppliers → industries
-- com tipoEntidade='fornecedor' (marca para identificar origem).
--
-- IMPORTANTE: suppliers continua existindo (compatibilidade).
-- Novo acesso: via industries com tipoEntidade='fornecedor'.
-- =============================================================

-- 1) Índice em tipoEntidade para queries rápidas
ALTER TABLE industries ADD INDEX idx_tipo_entidade (tipoEntidade);

-- 2) Migrar todos os suppliers → industries como "fornecedor"
--    IDEMPOTENTE: usa INSERT IGNORE (não duplica se já existir)
INSERT IGNORE INTO industries (
  userId,
  name,
  country,
  city,
  contactName,
  contactEmail,
  contactPhone,
  notes,
  tipoEntidade,
  status,
  createdAt,
  updatedAt
)
SELECT
  s.userId,
  s.name,
  s.country,
  s.city,
  s.contactName,
  s.contactEmail,
  s.contactPhone,
  s.notes,
  'fornecedor' AS tipoEntidade,
  CASE WHEN s.isMercosul = 1 THEN 'prospect' ELSE 'prospect' END AS status,
  s.createdAt,
  s.updatedAt
FROM suppliers s
WHERE NOT EXISTS (
  SELECT 1 FROM industries i
  WHERE i.userId = s.userId
    AND i.name = s.name
    AND i.country = s.country
    AND i.tipoEntidade = 'fornecedor'
);

-- 3) (Opcional) Atualizar comentário em suppliers para marcar como deprecated
-- ALTER TABLE suppliers COMMENT = 'DEPRECATED: use industries com tipoEntidade="fornecedor" em vez disso';
