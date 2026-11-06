-- Corrige el error 57014 (canceling statement due to statement timeout) al
-- finalizar importaciones grandes (por ejemplo el libro de compras).
--
-- Causa raíz:
--   finalize_importacion reconstruye todos los bloques cargados e inserta todas
--   las filas dentro de una única transacción. Cada fila insertada dispara el
--   trigger validate_transaction_fingerprint, que llama a transaction_hash: una
--   función PL/pgSQL que recorre carácter a carácter toda la cadena canónica de
--   la transacción. Para un archivo con muchas filas esa pasada por fila supera
--   el statement_timeout por defecto del rol authenticated y la sentencia se
--   cancela (SQLSTATE 57014).
--
-- Arreglo:
--   Subimos el statement_timeout SOLO en las funciones RPC de finalización.
--   PostgREST >= 12.2 "eleva" (hoist) el statement_timeout declarado en la
--   función al nivel de la transacción del RPC, de modo que el ajuste aplica al
--   llamado completo (incluida la llamada anidada a import_transacciones) sin
--   modificar el timeout global de las demás consultas.
--
--   Ref: https://supabase.com/blog/postgrest-12-2
--
-- El tope de 20000 filas por importación acota el peor caso, por lo que 120s da
-- holgura suficiente sin volver ilimitada la sentencia.

ALTER FUNCTION public.finalize_importacion(text)
  SET statement_timeout = '120s';

ALTER FUNCTION public.finalize_sync_transacciones(text)
  SET statement_timeout = '120s';

NOTIFY pgrst, 'reload schema';
