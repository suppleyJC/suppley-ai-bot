-- ============================================================
-- Conversas: coluna `fixada` (fixar conversa no topo da sidebar)
-- Migração ADITIVA — aplicar UMA vez no banco em produção:
--   docker exec -i suppley-mysql mysql -u root -p<senha> <database> < drizzle/migrations-conversas-fixada.sql
-- ============================================================
ALTER TABLE `conversas`
  ADD COLUMN `fixada` BOOLEAN NOT NULL DEFAULT FALSE;
