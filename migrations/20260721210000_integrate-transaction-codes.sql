-- Integra códigos contables como dimensión auditable de cada transacción.
-- Es una migración aditiva: no elimina transacciones ni códigos existentes.
ALTER TABLE public.codigos
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.codigos
  ADD COLUMN IF NOT EXISTS prioridad integer NOT NULL DEFAULT 100;

ALTER TABLE public.codigos DROP CONSTRAINT IF EXISTS codigos_prioridad_check;
ALTER TABLE public.codigos
  ADD CONSTRAINT codigos_prioridad_check CHECK (prioridad >= 0);

ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS codigo_id text;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS codigo_origen text;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS codigo_confianza numeric;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS codigo_evidencia text;

ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS transacciones_codigo_origen_check;
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_codigo_origen_check
  CHECK (codigo_origen IS NULL OR codigo_origen IN (
    'explicito', 'id', 'clave', 'alias', 'nombre', 'manual'
  ));
ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS transacciones_codigo_confianza_check;
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_codigo_confianza_check
  CHECK (codigo_confianza IS NULL OR (codigo_confianza >= 0 AND codigo_confianza <= 1));

ALTER TABLE public.transacciones
  DROP CONSTRAINT IF EXISTS transacciones_codigo_fkey;
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_codigo_fkey
  FOREIGN KEY (organization_id, codigo_id)
  REFERENCES public.codigos (organization_id, id);

CREATE INDEX IF NOT EXISTS transacciones_org_codigo_idx
  ON public.transacciones (organization_id, codigo_id)
  WHERE codigo_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.clear_codigo_from_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.transacciones
  SET codigo_id = NULL, codigo_origen = NULL,
      codigo_confianza = NULL, codigo_evidencia = NULL
  WHERE organization_id = OLD.organization_id AND codigo_id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS codigos_clear_transactions_before_delete ON public.codigos;
CREATE TRIGGER codigos_clear_transactions_before_delete
BEFORE DELETE ON public.codigos
FOR EACH ROW EXECUTE FUNCTION public.clear_codigo_from_transactions();

CREATE OR REPLACE FUNCTION public.import_transacciones(
  p_import_id text,
  p_nombre_archivo text,
  p_modo text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_total integer;
  v_insertadas integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION 'usuario sin organización autorizada';
  END IF;
  IF p_import_id IS NULL OR length(trim(p_import_id)) < 8 OR length(p_import_id) > 160 THEN
    RAISE EXCEPTION 'import_id inválido';
  END IF;
  IF p_modo NOT IN ('agregar', 'reemplazar') THEN
    RAISE EXCEPTION 'modo de importación inválido';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows debe ser un arreglo JSON';
  END IF;

  v_total := jsonb_array_length(p_rows);
  IF v_total = 0 OR v_total > 20000 THEN
    RAISE EXCEPTION 'la importación debe contener entre 1 y 20000 filas';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_organization_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.importaciones i
    WHERE i.organization_id = v_organization_id AND i.import_id = p_import_id
  ) THEN
    RETURN jsonb_build_object(
      'insertadas', 0, 'omitidas', v_total, 'ya_importado', true
    );
  END IF;

  IF p_modo = 'reemplazar' THEN
    DELETE FROM public.transacciones WHERE organization_id = v_organization_id;
  END IF;

  INSERT INTO public.transacciones (
    id, organization_id, fuente, banco, fecha, monto, saldo, descripcion,
    rut, categoria, codigo_id, codigo_origen, codigo_confianza,
    codigo_evidencia, estado, match_id, confianza, documento, external_id,
    contraparte, codigo_tipo_doc, iva_total, iva_debito, saldo_documento,
    folio_referencia, tipo_doc_referencia, subtipo_documento, proveedor,
    tipo_doc, folio, exento, neto, iva_recup, iva_nr, fecha_vencimiento,
    estado_pago, metadatos, import_id, row_fingerprint
  )
  SELECT
    v_organization_id::text || ':' || r.id,
    v_organization_id, r.fuente, r.banco, r.fecha, r.monto, r.saldo,
    r.descripcion, r.rut, r.categoria, NULLIF(upper(btrim(r.codigo_id)), ''),
    r.codigo_origen, r.codigo_confianza, r.codigo_evidencia,
    'no_conciliada', NULL, NULL, r.documento,
    NULLIF(btrim(r.external_id), ''), r.contraparte, r.codigo_tipo_doc,
    r.iva_total, r.iva_debito, r.saldo_documento, r.folio_referencia,
    r.tipo_doc_referencia, r.subtipo_documento, r.proveedor, r.tipo_doc,
    r.folio, r.exento, r.neto, r.iva_recup, r.iva_nr,
    r.fecha_vencimiento, r.estado_pago, COALESCE(r.metadatos, '{}'::jsonb),
    p_import_id, r.row_fingerprint
  FROM jsonb_to_recordset(p_rows) AS r(
    id text, fuente text, banco text, fecha date, monto numeric, saldo numeric,
    descripcion text, rut text, categoria text, codigo_id text,
    codigo_origen text, codigo_confianza numeric, codigo_evidencia text,
    documento text, external_id text, contraparte text, codigo_tipo_doc text,
    iva_total numeric, iva_debito numeric, saldo_documento numeric,
    folio_referencia text, tipo_doc_referencia text, subtipo_documento text,
    proveedor text, tipo_doc text, folio text, exento numeric, neto numeric,
    iva_recup numeric, iva_nr numeric, fecha_vencimiento date,
    estado_pago text, metadatos jsonb, row_fingerprint text
  )
  WHERE r.id IS NOT NULL AND r.id <> ''
    AND r.row_fingerprint IS NOT NULL AND r.row_fingerprint <> ''
    AND r.fuente IN ('banco', 'contabilidad')
    AND r.fecha IS NOT NULL AND r.monto IS NOT NULL
    AND r.descripcion IS NOT NULL AND r.descripcion <> ''
    AND (
      r.codigo_id IS NULL OR btrim(r.codigo_id) = '' OR EXISTS (
        SELECT 1 FROM public.codigos c
        WHERE c.organization_id = v_organization_id
          AND c.id = upper(btrim(r.codigo_id)) AND c.activo
      )
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  IF v_insertadas = 0 AND p_modo = 'reemplazar' THEN
    RAISE EXCEPTION 'ninguna fila válida pudo importarse';
  END IF;

  INSERT INTO public.importaciones (
    organization_id, import_id, nombre_archivo, modo, filas, created_by
  ) VALUES (
    v_organization_id, p_import_id,
    COALESCE(NULLIF(p_nombre_archivo, ''), 'archivo'),
    p_modo, v_total, auth.uid()
  );

  RETURN jsonb_build_object(
    'insertadas', v_insertadas,
    'omitidas', v_total - v_insertadas,
    'ya_importado', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_transacciones(p_cambios jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_organization_id uuid := public.current_organization_id();
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION 'usuario sin organización autorizada';
  END IF;
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'array' THEN
    RAISE EXCEPTION 'p_cambios debe ser un arreglo JSON';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_cambios) AS c(id text)
    WHERE c.id IS NULL OR c.id = ''
  ) THEN
    RAISE EXCEPTION 'cada cambio debe incluir un id';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_cambios) AS c(id text)
    GROUP BY c.id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'un id no puede aparecer más de una vez en el lote';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_cambios) AS c(id text)
    LEFT JOIN public.transacciones t
      ON t.id = c.id AND t.organization_id = v_organization_id
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'el lote contiene una transacción inexistente o no autorizada';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_cambios) AS c(codigo_id text)
    LEFT JOIN public.codigos codigo
      ON codigo.organization_id = v_organization_id
     AND codigo.id = upper(btrim(c.codigo_id))
     AND codigo.activo
    WHERE c.codigo_id IS NOT NULL AND btrim(c.codigo_id) <> ''
      AND codigo.id IS NULL
  ) THEN
    RAISE EXCEPTION 'el lote contiene un código inexistente, inactivo o no autorizado';
  END IF;

  UPDATE public.transacciones AS destino
  SET estado = c.estado,
      match_id = c.match_id,
      confianza = c.confianza,
      categoria = c.categoria,
      codigo_id = NULLIF(upper(btrim(c.codigo_id)), ''),
      codigo_origen = CASE WHEN NULLIF(btrim(c.codigo_id), '') IS NULL
        THEN NULL ELSE c.codigo_origen END,
      codigo_confianza = CASE WHEN NULLIF(btrim(c.codigo_id), '') IS NULL
        THEN NULL ELSE c.codigo_confianza END,
      codigo_evidencia = CASE WHEN NULLIF(btrim(c.codigo_id), '') IS NULL
        THEN NULL ELSE c.codigo_evidencia END
  FROM jsonb_to_recordset(p_cambios) AS c(
    id text, estado text, match_id text, confianza numeric, categoria text,
    codigo_id text, codigo_origen text, codigo_confianza numeric,
    codigo_evidencia text
  )
  WHERE destino.id = c.id AND destino.organization_id = v_organization_id;

  IF EXISTS (
    SELECT 1
    FROM public.transacciones a
    LEFT JOIN public.transacciones b ON b.id = a.match_id
    WHERE a.organization_id = v_organization_id
      AND a.match_id IS NOT NULL
      AND (
        b.id IS NULL OR b.organization_id <> v_organization_id
        OR b.match_id IS DISTINCT FROM a.id
        OR b.estado IS DISTINCT FROM a.estado OR b.fuente = a.fuente
      )
  ) THEN
    RAISE EXCEPTION 'el lote deja conciliaciones no recíprocas';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_codigo_from_transactions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_transacciones(text, text, text, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_transacciones(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_transacciones(text, text, text, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_transacciones(jsonb) TO authenticated;
