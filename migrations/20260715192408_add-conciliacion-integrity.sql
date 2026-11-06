-- Las conciliaciones siempre deben conservar una contraparte existente.
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_match_id_fkey
  FOREIGN KEY (match_id) REFERENCES public.transacciones(id)
  ON DELETE SET NULL;

ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_match_distinto_check
  CHECK (match_id IS NULL OR match_id <> id);

-- El cliente envía todos los cambios relacionados en una llamada. Si un
-- match quedara incompleto, la excepción revierte el lote completo.
CREATE OR REPLACE FUNCTION public.sync_transacciones(p_cambios jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'array' THEN
    RAISE EXCEPTION 'p_cambios debe ser un arreglo JSON';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_cambios) AS cambio(id text)
    WHERE id IS NULL OR id = ''
  ) THEN
    RAISE EXCEPTION 'cada cambio debe incluir un id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_cambios) AS cambio(id text)
    GROUP BY id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'un id no puede aparecer más de una vez en el lote';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_cambios) AS cambio(id text)
    LEFT JOIN public.transacciones t ON t.id = cambio.id
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'el lote contiene una transacción inexistente';
  END IF;

  UPDATE public.transacciones AS destino
  SET
    estado = cambio.estado,
    match_id = cambio.match_id,
    confianza = cambio.confianza,
    categoria = cambio.categoria
  FROM jsonb_to_recordset(p_cambios) AS cambio(
    id text,
    estado text,
    match_id text,
    confianza numeric,
    categoria text
  )
  WHERE destino.id = cambio.id;

  IF EXISTS (
    SELECT 1
    FROM public.transacciones a
    LEFT JOIN public.transacciones b ON b.id = a.match_id
    WHERE a.match_id IS NOT NULL
      AND (
        b.id IS NULL
        OR b.match_id IS DISTINCT FROM a.id
        OR b.estado IS DISTINCT FROM a.estado
        OR b.fuente = a.fuente
      )
  ) THEN
    RAISE EXCEPTION 'el lote deja conciliaciones no recíprocas';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_transacciones(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_transacciones(jsonb) TO authenticated;

-- La aplicación es compartida por usuarios corporativos autenticados: no se
-- permite ningún acceso directo usando únicamente la clave anónima.
ALTER TABLE public.transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codigos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.transacciones, public.reglas, public.codigos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transacciones, public.reglas, public.codigos TO authenticated;

DROP POLICY IF EXISTS transacciones_authenticated_access ON public.transacciones;
CREATE POLICY transacciones_authenticated_access ON public.transacciones
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS reglas_authenticated_access ON public.reglas;
CREATE POLICY reglas_authenticated_access ON public.reglas
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS codigos_authenticated_access ON public.codigos;
CREATE POLICY codigos_authenticated_access ON public.codigos
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
