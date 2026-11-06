-- Hace idempotentes también las filas cargadas antes de incorporar import_id.
CREATE OR REPLACE FUNCTION public.transaction_canonical(
  p_fuente text,
  p_banco text,
  p_fecha date,
  p_monto numeric,
  p_descripcion text,
  p_rut text,
  p_documento text,
  p_tipo_doc text,
  p_folio text,
  p_proveedor text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT concat(
    COALESCE(p_fuente, ''), '|',
    COALESCE(p_banco, ''), '|',
    COALESCE(p_fecha::text, ''), '|',
    COALESCE(p_monto::text, ''), '|',
    lower(btrim(COALESCE(p_descripcion, ''))), '|',
    COALESCE(p_rut, ''), '|',
    COALESCE(p_documento, ''), '|',
    COALESCE(p_tipo_doc, ''), '|',
    COALESCE(p_folio, ''), '|',
    COALESCE(p_proveedor, '')
  )
$$;

CREATE OR REPLACE FUNCTION public.transaction_hash(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_a bigint := 2166136261;
  v_b bigint := 2654435769;
  v_code bigint;
  v_index integer;
BEGIN
  FOR v_index IN 1..char_length(p_text) LOOP
    v_code := ascii(substr(p_text, v_index, 1));
    v_a := mod((v_a # v_code)::numeric * 16777619, 4294967296)::bigint;
    v_b := mod((v_b # v_code)::numeric * 2246822507, 4294967296)::bigint;
  END LOOP;
  RETURN lpad(to_hex(v_a), 8, '0') || lpad(to_hex(v_b), 8, '0');
END;
$$;


WITH base AS (
  SELECT
    id,
    organization_id,
    public.transaction_canonical(
      fuente, banco, fecha, monto, descripcion, rut, documento,
      tipo_doc, folio, proveedor
    ) AS canonical,
    COALESCE(
      NULLIF(substring(id FROM '-([0-9]+)$'), '')::integer,
      2147483647
    ) AS source_index,
    created_at
  FROM public.transacciones
  WHERE row_fingerprint IS NULL
), ranked AS (
  SELECT
    id,
    public.transaction_hash(canonical) || '-' ||
      row_number() OVER (
        PARTITION BY organization_id, canonical
        ORDER BY source_index, created_at, id
      )::text AS fingerprint
  FROM base
)
UPDATE public.transacciones AS t
SET row_fingerprint = ranked.fingerprint
FROM ranked
WHERE t.id = ranked.id;

CREATE OR REPLACE FUNCTION public.validate_transaction_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_expected text;
BEGIN
  IF NEW.row_fingerprint IS NULL THEN
    RETURN NEW;
  END IF;
  v_expected := public.transaction_hash(public.transaction_canonical(
    NEW.fuente, NEW.banco, NEW.fecha, NEW.monto, NEW.descripcion, NEW.rut,
    NEW.documento, NEW.tipo_doc, NEW.folio, NEW.proveedor
  ));
  IF NEW.row_fingerprint !~ '^[0-9a-f]{16}-[1-9][0-9]*$'
    OR split_part(NEW.row_fingerprint, '-', 1) <> v_expected THEN
    RAISE EXCEPTION 'fingerprint de transacción inválido';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transacciones_validate_fingerprint ON public.transacciones;
CREATE TRIGGER transacciones_validate_fingerprint
BEFORE INSERT OR UPDATE OF fuente, banco, fecha, monto, descripcion, rut,
  documento, tipo_doc, folio, proveedor, row_fingerprint
ON public.transacciones
FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_fingerprint();

REVOKE ALL ON FUNCTION public.transaction_canonical(
  text, text, date, numeric, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transaction_hash(text) FROM PUBLIC, anon, authenticated;