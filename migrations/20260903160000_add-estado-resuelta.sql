-- Agrega el estado 'resuelta': un movimiento (típicamente bancario) que queda
-- explicado por su código contable aunque no tenga contraparte documental
-- (comisiones, impuestos, traspasos, intereses, donaciones, etc.). No es lo
-- mismo que 'conciliada' (que exige un par recíproco), por eso es un estado
-- propio: así la métrica de conciliación no se falsea y a la vez el dashboard
-- puede mostrar "Explicados = conciliadas + resueltas".
--
-- La restricción transacciones_conciliada_con_match_check sigue exigiendo
-- contraparte SOLO para 'conciliada'; 'resuelta' no requiere match_id.
ALTER TABLE public.transacciones
  DROP CONSTRAINT IF EXISTS transacciones_estado_check;
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_estado_check
  CHECK (estado IN ('conciliada', 'pendiente', 'no_conciliada', 'sugerida', 'resuelta'));

NOTIFY pgrst, 'reload schema';
