-- Retira una evidencia operativa que clasificaba filas genéricas como GCOB.
-- No modifica transacciones ni otros aliases personalizados.
UPDATE public.codigos
SET aliases = array_remove(aliases, 'Cobranza externa')
WHERE id = 'GCOB'
  AND aliases @> ARRAY['Cobranza externa']::text[];