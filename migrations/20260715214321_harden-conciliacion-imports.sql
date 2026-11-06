-- Endurece aislamiento, integridad e importaciones sin eliminar datos existentes.
-- La organización inicial conserva el modelo compartido actual y permite
-- agregar organizaciones separadas mediante membresías en el futuro.

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

INSERT INTO public.organizations (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'Organización principal')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT '00000000-0000-4000-8000-000000000001', id, 'admin'
FROM auth.users
ON CONFLICT (organization_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT om.organization_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
  ORDER BY CASE om.role WHEN 'admin' THEN 0 WHEN 'member' THEN 1 ELSE 2 END,
           om.created_at
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_organization_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
  )
$$;


REVOKE ALL ON FUNCTION public.current_organization_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_organization_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid) TO authenticated;

ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.reglas ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.codigos ADD COLUMN IF NOT EXISTS organization_id uuid;

UPDATE public.transacciones
SET organization_id = '00000000-0000-4000-8000-000000000001'
WHERE organization_id IS NULL;
UPDATE public.reglas
SET organization_id = '00000000-0000-4000-8000-000000000001'
WHERE organization_id IS NULL;
UPDATE public.codigos
SET organization_id = '00000000-0000-4000-8000-000000000001'
WHERE organization_id IS NULL;

ALTER TABLE public.transacciones ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.reglas ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.codigos ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.reglas
  ADD CONSTRAINT reglas_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.codigos
  ADD CONSTRAINT codigos_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Reglas y códigos pueden repetir su identificador en organizaciones distintas.
ALTER TABLE public.reglas DROP CONSTRAINT IF EXISTS reglas_pkey;
ALTER TABLE public.reglas ADD CONSTRAINT reglas_pkey PRIMARY KEY (organization_id, id);
ALTER TABLE public.codigos DROP CONSTRAINT IF EXISTS codigos_pkey;
ALTER TABLE public.codigos ADD CONSTRAINT codigos_pkey PRIMARY KEY (organization_id, id);

ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS import_id text;
ALTER TABLE public.transacciones ADD COLUMN IF NOT EXISTS row_fingerprint text;
CREATE INDEX IF NOT EXISTS transacciones_org_fecha_id_idx
  ON public.transacciones (organization_id, fecha, id);
CREATE UNIQUE INDEX IF NOT EXISTS transacciones_org_fingerprint_uidx
  ON public.transacciones (organization_id, row_fingerprint)
  WHERE row_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.importaciones (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  import_id text NOT NULL,
  nombre_archivo text NOT NULL,
  modo text NOT NULL CHECK (modo IN ('agregar', 'reemplazar')),
  filas integer NOT NULL CHECK (filas >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, import_id)
);

-- Corrige cartolas antiguas: Cargo quedó como monto positivo y Abono se
-- preservó en metadatos. El convenio definitivo es ingreso + / egreso -.
UPDATE public.transacciones
SET monto = CASE
  WHEN monto <> 0 THEN -abs(monto)
  ELSE COALESCE(
    NULLIF(regexp_replace(COALESCE(metadatos ->> 'abono', ''), '[^0-9]', '', 'g'), '')::numeric,
    0
  )
END
WHERE fuente = 'banco'
  AND metadatos ? 'abono';

-- Las notas de crédito de compras revierten un egreso y deben ser positivas.
UPDATE public.transacciones
SET monto = abs(monto)
WHERE fuente = 'contabilidad'
  AND lower(tipo_doc) LIKE 'nota de credito%';

-- Una conciliación confirmada siempre tiene contraparte. Se elimina el
-- comportamiento ON DELETE SET NULL que podía dejar estados incoherentes.
ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS transacciones_match_id_fkey;
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_match_id_fkey
  FOREIGN KEY (match_id) REFERENCES public.transacciones(id)
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_conciliada_con_match_check
  CHECK (estado <> 'conciliada' OR match_id IS NOT NULL);
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_confianza_rango_check
  CHECK (confianza IS NULL OR (confianza >= 0 AND confianza <= 1));

CREATE OR REPLACE FUNCTION public.set_row_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_organization_id uuid := public.current_organization_id();
BEGIN
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'el usuario no pertenece a una organización';
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := v_organization_id;
  ELSIF NEW.organization_id <> v_organization_id THEN
    RAISE EXCEPTION 'organización no autorizada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reglas_set_organization ON public.reglas;
CREATE TRIGGER reglas_set_organization
BEFORE INSERT ON public.reglas
FOR EACH ROW EXECUTE FUNCTION public.set_row_organization();
DROP TRIGGER IF EXISTS codigos_set_organization ON public.codigos;
CREATE TRIGGER codigos_set_organization
BEFORE INSERT ON public.codigos
FOR EACH ROW EXECUTE FUNCTION public.set_row_organization();


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

  -- Serializa importaciones de una misma organización y hace reintentos seguros.
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
    rut, categoria, estado, match_id, confianza, documento, proveedor,
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
  IF v_insertadas + 0 = 0 AND p_modo = 'reemplazar' THEN
    RAISE EXCEPTION 'ninguna fila válida pudo importarse';
  END IF;

  INSERT INTO public.importaciones (
    organization_id, import_id, nombre_archivo, modo, filas, created_by
  ) VALUES (
    v_organization_id, p_import_id, COALESCE(NULLIF(p_nombre_archivo, ''), 'archivo'),
    p_modo, v_total, auth.uid()
  );

  RETURN jsonb_build_object(
    'insertadas', v_insertadas,
    'omitidas', v_total - v_insertadas,
    'ya_importado', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_transacciones()
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
  DELETE FROM public.transacciones WHERE organization_id = v_organization_id;
  DELETE FROM public.importaciones WHERE organization_id = v_organization_id;
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

  UPDATE public.transacciones AS destino
  SET estado = c.estado,
      match_id = c.match_id,
      confianza = c.confianza,
      categoria = c.categoria
  FROM jsonb_to_recordset(p_cambios) AS c(
    id text,
    estado text,
    match_id text,
    confianza numeric,
    categoria text
  )
  WHERE destino.id = c.id
    AND destino.organization_id = v_organization_id;

  IF EXISTS (
    SELECT 1
    FROM public.transacciones a
    LEFT JOIN public.transacciones b ON b.id = a.match_id
    WHERE a.organization_id = v_organization_id
      AND a.match_id IS NOT NULL
      AND (
        b.id IS NULL
        OR b.organization_id <> v_organization_id
        OR b.match_id IS DISTINCT FROM a.id
        OR b.estado IS DISTINCT FROM a.estado
        OR b.fuente = a.fuente
      )
  ) THEN
    RAISE EXCEPTION 'el lote deja conciliaciones no recíprocas';
  END IF;
END;
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codigos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transacciones_authenticated_access ON public.transacciones;
DROP POLICY IF EXISTS reglas_authenticated_access ON public.reglas;
DROP POLICY IF EXISTS codigos_authenticated_access ON public.codigos;

CREATE POLICY organizations_member_select ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_organization_member(id));
CREATE POLICY organization_members_self_select ON public.organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY importaciones_member_select ON public.importaciones
  FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY transacciones_member_select ON public.transacciones
  FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY reglas_member_access ON public.reglas
  FOR ALL TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY codigos_member_access ON public.codigos
  FOR ALL TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

REVOKE ALL ON public.organizations, public.organization_members,
  public.importaciones, public.transacciones, public.reglas, public.codigos FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.transacciones FROM authenticated;
GRANT SELECT ON public.organizations, public.organization_members,
  public.importaciones, public.transacciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reglas, public.codigos TO authenticated;

REVOKE ALL ON FUNCTION public.import_transacciones(text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_transacciones() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_transacciones(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_transacciones(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_transacciones() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_transacciones(jsonb) TO authenticated;