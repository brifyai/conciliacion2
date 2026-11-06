-- Incorpora campos documentales de exdatos sin modificar huellas, datos ni RLS.
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS contraparte text;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS codigo_tipo_doc text;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS iva_total numeric;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS iva_debito numeric;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS saldo_documento numeric;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS folio_referencia text;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS tipo_doc_referencia text;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS subtipo_documento text;

CREATE UNIQUE INDEX IF NOT EXISTS transacciones_org_fuente_external_id_uidx
  ON public.transacciones (organization_id, fuente, external_id)
  WHERE external_id IS NOT NULL AND btrim(external_id) <> '';

-- Conserva la firma RPC, autorización, bloqueo por organización, límites,
-- atomicidad e idempotencia existentes; sólo amplía el registro importado.
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
    WHERE i.organization_id = v_organization_id
      AND i.import_id = p_import_id
  ) THEN
    RETURN jsonb_build_object(
      'insertadas', 0,
      'omitidas', v_total,
      'ya_importado', true
    );
  END IF;

  IF p_modo = 'reemplazar' THEN
    DELETE FROM public.transacciones
    WHERE organization_id = v_organization_id;
  END IF;

  INSERT INTO public.transacciones (
    id, organization_id, fuente, banco, fecha, monto, saldo, descripcion,
    rut, categoria, estado, match_id, confianza, documento, external_id,
    contraparte, codigo_tipo_doc, iva_total, iva_debito, saldo_documento,
    folio_referencia, tipo_doc_referencia, subtipo_documento, proveedor,
    tipo_doc, folio, exento, neto, iva_recup, iva_nr, fecha_vencimiento,
    estado_pago, metadatos, import_id, row_fingerprint
  )
  SELECT
    v_organization_id::text || ':' || r.id,
    v_organization_id,
    r.fuente,
    r.banco,
    r.fecha,
    r.monto,
    r.saldo,
    r.descripcion,
    r.rut,
    r.categoria,
    'no_conciliada',
    NULL,
    NULL,
    r.documento,
    NULLIF(btrim(r.external_id), ''),
    r.contraparte,
    r.codigo_tipo_doc,
    r.iva_total,
    r.iva_debito,
    r.saldo_documento,
    r.folio_referencia,
    r.tipo_doc_referencia,
    r.subtipo_documento,
    r.proveedor,
    r.tipo_doc,
    r.folio,
    r.exento,
    r.neto,
    r.iva_recup,
    r.iva_nr,
    r.fecha_vencimiento,
    r.estado_pago,
    COALESCE(r.metadatos, '{}'::jsonb),
    p_import_id,
    r.row_fingerprint
  FROM jsonb_to_recordset(p_rows) AS r(
    id text,
    fuente text,
    banco text,
    fecha date,
    monto numeric,
    saldo numeric,
    descripcion text,
    rut text,
    categoria text,
    documento text,
    external_id text,
    contraparte text,
    codigo_tipo_doc text,
    iva_total numeric,
    iva_debito numeric,
    saldo_documento numeric,
    folio_referencia text,
    tipo_doc_referencia text,
    subtipo_documento text,
    proveedor text,
    tipo_doc text,
    folio text,
    exento numeric,
    neto numeric,
    iva_recup numeric,
    iva_nr numeric,
    fecha_vencimiento date,
    estado_pago text,
    metadatos jsonb,
    row_fingerprint text
  )
  WHERE r.id IS NOT NULL AND r.id <> ''
    AND r.row_fingerprint IS NOT NULL AND r.row_fingerprint <> ''
    AND r.fuente IN ('banco', 'contabilidad')
    AND r.fecha IS NOT NULL
    AND r.monto IS NOT NULL
    AND r.descripcion IS NOT NULL AND r.descripcion <> ''
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

REVOKE ALL ON FUNCTION public.import_transacciones(text, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_transacciones(text, text, text, jsonb)
  TO authenticated;