-- Sincronización reanudable por bloques para conciliación y códigos masivos.
-- Los cambios sólo se aplican al finalizar, mediante sync_transacciones.
CREATE TABLE IF NOT EXISTS public.sync_operaciones (
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  sync_id text NOT NULL,
  total_esperado integer NOT NULL CHECK (total_esperado BETWEEN 1 AND 100000),
  completada boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (organization_id, sync_id)
);

CREATE TABLE IF NOT EXISTS public.sync_chunks (
  organization_id uuid NOT NULL,
  sync_id text NOT NULL,
  chunk_no integer NOT NULL CHECK (chunk_no >= 0),
  chunk_hash text NOT NULL,
  filas integer NOT NULL CHECK (filas BETWEEN 1 AND 1000),
  rows jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, sync_id, chunk_no),
  FOREIGN KEY (organization_id, sync_id)
    REFERENCES public.sync_operaciones(organization_id, sync_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sync_operaciones_created_idx
  ON public.sync_operaciones (created_at);
ALTER TABLE public.sync_operaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_chunks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.begin_sync_transacciones(
  p_sync_id text,
  p_total_esperado integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_operacion record;
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION 'usuario sin organización autorizada';
  END IF;
  IF p_sync_id IS NULL OR length(btrim(p_sync_id)) < 8
     OR length(p_sync_id) > 160 THEN
    RAISE EXCEPTION 'sync_id inválido';
  END IF;
  IF p_total_esperado IS NULL OR p_total_esperado NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'la sincronización debe contener entre 1 y 100000 cambios';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':sync:' || p_sync_id, 0)
  );

  SELECT total_esperado, completada INTO v_operacion
  FROM public.sync_operaciones
  WHERE organization_id = v_organization_id AND sync_id = p_sync_id;
  IF FOUND THEN
    IF v_operacion.total_esperado <> p_total_esperado THEN
      RAISE EXCEPTION 'la sincronización existente tiene otro total';
    END IF;
    RETURN jsonb_build_object(
      'completada', v_operacion.completada, 'reanudada', true
    );
  END IF;

  DELETE FROM public.sync_operaciones
  WHERE organization_id = v_organization_id
    AND created_by = auth.uid()
    AND (
      (completada AND completed_at < now() - interval '24 hours')
      OR (NOT completada AND created_at < now() - interval '24 hours')
    );

  INSERT INTO public.sync_operaciones (
    organization_id, sync_id, total_esperado, created_by
  ) VALUES (
    v_organization_id, p_sync_id, p_total_esperado, auth.uid()
  );

  RETURN jsonb_build_object('completada', false, 'reanudada', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.upload_sync_transacciones_chunk(
  p_sync_id text,
  p_chunk_no integer,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_esperadas integer;
  v_filas integer;
  v_acumuladas integer;
  v_hash text;
  v_existente record;
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION 'usuario sin organización autorizada';
  END IF;
  IF p_chunk_no IS NULL OR p_chunk_no < 0 OR p_chunk_no > 1000 THEN
    RAISE EXCEPTION 'número de bloque inválido';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'el bloque debe ser un arreglo JSON';
  END IF;
  v_filas := jsonb_array_length(p_rows);
  IF v_filas NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'cada bloque debe contener entre 1 y 1000 cambios';
  END IF;
  IF octet_length(p_rows::text) > 700000 THEN
    RAISE EXCEPTION 'el bloque supera el máximo de 700000 bytes';
  END IF;
  v_hash := md5(p_rows::text);

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':sync:' || p_sync_id, 0)
  );
  SELECT total_esperado INTO v_esperadas
  FROM public.sync_operaciones
  WHERE organization_id = v_organization_id
    AND sync_id = p_sync_id AND NOT completada;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no existe una sincronización pendiente';
  END IF;

  SELECT chunk_hash, filas INTO v_existente
  FROM public.sync_chunks
  WHERE organization_id = v_organization_id
    AND sync_id = p_sync_id AND chunk_no = p_chunk_no;
  IF FOUND THEN
    IF v_existente.chunk_hash <> v_hash OR v_existente.filas <> v_filas THEN
      RAISE EXCEPTION 'el bloque ya existe con contenido diferente';
    END IF;
    RETURN jsonb_build_object('guardado', true, 'ya_existia', true);
  END IF;

  SELECT COALESCE(sum(filas), 0) INTO v_acumuladas
  FROM public.sync_chunks
  WHERE organization_id = v_organization_id AND sync_id = p_sync_id;
  IF v_acumuladas + v_filas > v_esperadas THEN
    RAISE EXCEPTION 'los bloques superan el total esperado';
  END IF;

  INSERT INTO public.sync_chunks (
    organization_id, sync_id, chunk_no, chunk_hash, filas, rows
  ) VALUES (
    v_organization_id, p_sync_id, p_chunk_no, v_hash, v_filas, p_rows
  );
  RETURN jsonb_build_object('guardado', true, 'ya_existia', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_sync_transacciones(p_sync_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_operacion record;
  v_total integer;
  v_chunks integer;
  v_min_chunk integer;
  v_max_chunk integer;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION 'usuario sin organización autorizada';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':sync:' || p_sync_id, 0)
  );
  SELECT total_esperado, completada INTO v_operacion
  FROM public.sync_operaciones
  WHERE organization_id = v_organization_id AND sync_id = p_sync_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no existe una sincronización para finalizar';
  END IF;
  IF v_operacion.completada THEN
    RETURN jsonb_build_object('completada', true, 'ya_completada', true);
  END IF;

  SELECT COALESCE(sum(filas), 0), count(*), min(chunk_no), max(chunk_no)
  INTO v_total, v_chunks, v_min_chunk, v_max_chunk
  FROM public.sync_chunks
  WHERE organization_id = v_organization_id AND sync_id = p_sync_id;
  IF v_total <> v_operacion.total_esperado THEN
    RAISE EXCEPTION 'sincronización incompleta: % de % cambios',
      v_total, v_operacion.total_esperado;
  END IF;
  IF v_chunks = 0 OR v_min_chunk <> 0 OR v_max_chunk <> v_chunks - 1 THEN
    RAISE EXCEPTION 'la secuencia de bloques de sincronización está incompleta';
  END IF;

  SELECT jsonb_agg(elemento.value ORDER BY c.chunk_no, elemento.orden)
  INTO v_rows
  FROM public.sync_chunks c
  CROSS JOIN LATERAL jsonb_array_elements(c.rows)
    WITH ORDINALITY AS elemento(value, orden)
  WHERE c.organization_id = v_organization_id AND c.sync_id = p_sync_id;

  PERFORM public.sync_transacciones(v_rows);
  UPDATE public.sync_operaciones
  SET completada = true, completed_at = now()
  WHERE organization_id = v_organization_id AND sync_id = p_sync_id;
  DELETE FROM public.sync_chunks
  WHERE organization_id = v_organization_id AND sync_id = p_sync_id;

  RETURN jsonb_build_object('completada', true, 'ya_completada', false);
END;
$$;

CREATE POLICY sync_operaciones_member_select ON public.sync_operaciones
  FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY sync_chunks_member_select ON public.sync_chunks
  FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));

REVOKE ALL ON public.sync_operaciones, public.sync_chunks
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sync_operaciones, public.sync_chunks TO authenticated;
REVOKE ALL ON FUNCTION public.begin_sync_transacciones(text, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upload_sync_transacciones_chunk(text, integer, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_sync_transacciones(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_sync_transacciones(text, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.upload_sync_transacciones_chunk(text, integer, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_sync_transacciones(text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';