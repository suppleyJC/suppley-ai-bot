-- ============================================================
-- Alinha parâmetros à legislação vigente e ao modelo do contador:
--   • AFRMM longo curso: 25% → 8% (Lei 14.301/2022 — BR do Mar)
--   • Siscomex base: R$ 185,00 → R$ 154,23 (valor do modelo/contador)
-- Idempotente (UPDATE por valor-alvo). MySQL 8.0+.
--   docker exec -i suppley-mysql sh -c 'exec mysql -u suppley -p"$MYSQL_PASSWORD" suppley_calc' < drizzle/0033_afrmm_siscomex_vigentes.sql
-- ============================================================

UPDATE `tax_parameters`
   SET `valueBp` = 800,
       `legalBasis` = 'Lei 14.301/2022 (BR do Mar) — longo curso 8%',
       `notes` = 'Incide apenas sobre frete marítimo (longo curso).'
 WHERE `paramKey` = 'AFRMM_RATE' AND `valueBp` <> 800;

UPDATE `tax_parameters`
   SET `valueCents` = 15423,
       `notes` = 'Valor por DI (base + adições).'
 WHERE `paramKey` = 'SISCOMEX_BASE' AND `valueCents` <> 15423;
