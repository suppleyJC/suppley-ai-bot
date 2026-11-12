-- ============================================================
-- Papel de administrador do dono da conta.
--   • Garante que jean@suppley.com.br tenha role='admin'.
-- A partir daqui, apenas administradores cadastram novos usuários
-- (auto-cadastro público desabilitado — bootstrap do 1º usuário à parte).
-- Idempotente (UPDATE condicional). MySQL 8.0+.
--   docker exec -i suppley-mysql sh -c 'exec mysql -u suppley -p"$MYSQL_PASSWORD" suppley_calc' < drizzle/0036_admin_role.sql
-- ============================================================

UPDATE `users`
   SET `role` = 'admin'
 WHERE LOWER(`email`) = 'jean@suppley.com.br' AND `role` <> 'admin';
