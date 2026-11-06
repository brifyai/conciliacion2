-- Carga reanudable por bloques para evitar agotar la memoria de PostgREST.
-- La publicación final sigue siendo una sola transacción PostgreSQL.
ALTER TABLE public.importaciones
  ADD COLUMN IF NOT EXISTS insertadas integer,
  ADD COLUMN IF NOT EXISTS omitidas integer;
UPDATE public.importaciones
SET insertadas = COALESCE(insertadas, filas),
    omitidas = COALESCE(omitidas, 0)
WHERE insertadas IS NULL OR omitidas IS NULL;

CREATE TABLE IF NOT EXISTS public.importacion_pendientes (
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  import_id text NOT NULL,
  nombre_archivo text NOT NULL,
  modo text NOT NULL CHECK (modo IN ('agregar', 'reemplazar')),
  total_esperado integer NOT NULL CHECK (total_esperado BETWEEN 1 AND 20000),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, import_id)
);

CREATE TABLE IF NOT EXISTS public.importacion_chunks (
  organization_id uuid NOT NULL,
  import_id text NOT NULL,
  chunk_no integer NOT NULL CHECK (chunk_no >= 0),
  chunk_hash text NOT NULL,
  filas integer NOT NULL CHECK (filas BETWEEN 1 AND 1000),
  rows jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, import_id, chunk_no),
  FOREIGN KEY (organization_id, import_id)
    REFERENCES public.importacion_pendientes(organization_id, import_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS importacion_pendientes_created_idx
  ON public.importacion_pendientes (created_at);

ALTER TABLE public.importacion_pendientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importacion_chunks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.begin_importacion(
  p_import_id text,
  p_nombre_archivo text,
  p_modo text,
  p_total_esperado integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_completada record;
  v_pendiente record;
  v_chunks integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION 'usuario sin organización autorizada';
  END IF;
  IF p_import_id IS NULL OR length(btrim(p_import_id)) < 8
     OR length(p_import_id) > 160 THEN
    RAISE EXCEPTION 'import_id inválido';
  END IF;
  IF p_modo NOT IN ('agregar', 'reemplazar') THEN
    RAISE EXCEPTION 'modo de importación inválido';
  END IF;
  IF p_total_esperado IS NULL OR p_total_esperado NOT BETWEEN 1 AND 20000 THEN
    RAISE EXCEPTION 'la importación debe contener entre 1 y 20000 filas';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':' || p_import_id, 0)
  );

  SELECT modo, filas, insertadas, omitidas
  INTO v_completada
  FROM public.importaciones
  WHERE organization_id = v_organization_id AND import_id = p_import_id;
  IF FOUND THEN
    IF v_completada.modo <> p_modo OR v_completada.filas <> p_total_esperado THEN
      RAISE EXCEPTION 'el identificador ya existe con otros parámetros';
    END IF;
    RETURN jsonb_build_object(
      'ya_importado', true,
      'insertadas', COALESCE(v_completada.insertadas, v_completada.filas),
      'omitidas', COALESCE(v_completada.omitidas, 0)
    );
  END IF;

  SELECT modo, total_esperado
  INTO v_pendiente
  FROM public.importacion_pendientes
  WHERE organization_id = v_organization_id AND import_id = p_import_id;
  IF FOUND THEN
    IF v_pendiente.modo <> p_modo
       OR v_pendiente.total_esperado <> p_total_esperado THEN
      RAISE EXCEPTION 'la carga pendiente tiene otros parámetros';
    END IF;
    SELECT count(*) INTO v_chunks
    FROM public.importacion_chunks
    WHERE organization_id = v_organization_id AND import_id = p_import_id;
    RETURN jsonb_build_object(
      'ya_importado', false, 'reanudada', true, 'chunks', v_chunks
    );
  END IF;

  DELETE FROM public.importacion_pendientes
  WHERE organization_id = v_organization_id
    AND created_by = auth.uid()
    AND created_at < now() - interval '24 hours';

  INSERT INTO public.importacion_pendientes (
    organization_id, import_id, nombre_archivo, modo,
    total_esperado, created_by
  ) VALUES (
    v_organization_id, p_import_id,
    COALESCE(NULLIF(btrim(p_nombre_archivo), ''), 'archivo'),
    p_modo, p_total_esperado, auth.uid()
  );

  RETURN jsonb_build_object(
    'ya_importado', false, 'reanudada', false, 'chunks', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upload_importacion_chunk(
  p_import_id text,
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
    RAISE EXCEPTION 'cada bloque debe contener entre 1 y 1000 filas';
  END IF;
  IF octet_length(p_rows::text) > 700000 THEN
    RAISE EXCEPTION 'el bloque supera el máximo de 700000 bytes';
  END IF;
  v_hash := md5(p_rows::text);

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':' || p_import_id, 0)
  );
  SELECT total_esperado INTO v_esperadas
  FROM public.importacion_pendientes
  WHERE organization_id = v_organization_id AND import_id = p_import_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no existe una carga pendiente para este archivo';
  END IF;

  SELECT chunk_hash, filas INTO v_existente
  FROM public.importacion_chunks
  WHERE organization_id = v_organization_id
    AND import_id = p_import_id AND chunk_no = p_chunk_no;
  IF FOUND THEN
    IF v_existente.chunk_hash <> v_hash OR v_existente.filas <> v_filas THEN
      RAISE EXCEPTION 'el bloque ya existe con contenido diferente';
    END IF;
    RETURN jsonb_build_object(
      'guardado', true, 'ya_existia', true,
      'chunk', p_chunk_no, 'filas', v_filas
    );
  END IF;

  SELECT COALESCE(sum(filas), 0) INTO v_acumuladas
  FROM public.importacion_chunks
  WHERE organization_id = v_organization_id AND import_id = p_import_id;
  IF v_acumuladas + v_filas > v_esperadas THEN
    RAISE EXCEPTION 'los bloques superan el total esperado';
  END IF;

  INSERT INTO public.importacion_chunks (
    organization_id, import_id, chunk_no, chunk_hash, filas, rows
  ) VALUES (
    v_organization_id, p_import_id, p_chunk_no, v_hash, v_filas, p_rows
  );

  RETURN jsonb_build_object(
    'guardado', true, 'ya_existia', false,
    'chunk', p_chunk_no, 'filas', v_filas
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_importacion(p_import_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_completada record;
  v_pendiente record;
  v_total integer;
  v_chunks integer;
  v_min_chunk integer;
  v_max_chunk integer;
  v_rows jsonb;
  v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION 'usuario sin organización autorizada';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':' || p_import_id, 0)
  );

  SELECT modo, filas, insertadas, omitidas
  INTO v_completada
  FROM public.importaciones
  WHERE organization_id = v_organization_id AND import_id = p_import_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'insertadas', COALESCE(v_completada.insertadas, v_completada.filas),
      'omitidas', COALESCE(v_completada.omitidas, 0),
      'ya_importado', true
    );
  END IF;

  SELECT nombre_archivo, modo, total_esperado
  INTO v_pendiente
  FROM public.importacion_pendientes
  WHERE organization_id = v_organization_id AND import_id = p_import_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no existe una carga pendiente para finalizar';
  END IF;

  SELECT COALESCE(sum(filas), 0), count(*), min(chunk_no), max(chunk_no)
  INTO v_total, v_chunks, v_min_chunk, v_max_chunk
  FROM public.importacion_chunks
  WHERE organization_id = v_organization_id AND import_id = p_import_id;

  IF v_total <> v_pendiente.total_esperado THEN
    RAISE EXCEPTION 'carga incompleta: % de % filas',
      v_total, v_pendiente.total_esperado;
  END IF;
  IF v_chunks = 0 OR v_min_chunk <> 0 OR v_max_chunk <> v_chunks - 1 THEN
    RAISE EXCEPTION 'la secuencia de bloques está incompleta';
  END IF;

  SELECT jsonb_agg(elemento.value ORDER BY c.chunk_no, elemento.orden)
  INTO v_rows
  FROM public.importacion_chunks c
  CROSS JOIN LATERAL jsonb_array_elements(c.rows)
    WITH ORDINALITY AS elemento(value, orden)
  WHERE c.organization_id = v_organization_id
    AND c.import_id = p_import_id;

  v_resultado := public.import_transacciones(
    p_import_id,
    v_pendiente.nombre_archivo,
    v_pendiente.modo,
    v_rows
  );

  IF NOT COALESCE((v_resultado ->> 'ya_importado')::boolean, false) THEN
    UPDATE public.importaciones
    SET insertadas = (v_resultado ->> 'insertadas')::integer,
        omitidas = (v_resultado ->> 'omitidas')::integer
    WHERE organization_id = v_organization_id AND import_id = p_import_id;
  END IF;

  DELETE FROM public.importacion_pendientes
  WHERE organization_id = v_organization_id AND import_id = p_import_id;

  RETURN v_resultado;
END;
$$;

DROP POLICY IF EXISTS importacion_pendientes_member_select
  ON public.importacion_pendientes;
CREATE POLICY importacion_pendientes_member_select
  ON public.importacion_pendientes
  FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS importacion_chunks_member_select
  ON public.importacion_chunks;
CREATE POLICY importacion_chunks_member_select
  ON public.importacion_chunks
  FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));

REVOKE ALL ON public.importacion_pendientes, public.importacion_chunks
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.importacion_pendientes, public.importacion_chunks
  TO authenticated;

REVOKE ALL ON FUNCTION public.begin_importacion(text, text, text, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upload_importacion_chunk(text, integer, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_importacion(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_importacion(text, text, text, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.upload_importacion_chunk(text, integer, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_importacion(text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';