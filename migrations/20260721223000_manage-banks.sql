-- Catálogo de bancos administrable por organización.
-- Eliminar un catálogo no modifica el nombre guardado en transacciones históricas.
CREATE TABLE IF NOT EXISTS public.bancos (
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, nombre),
  CONSTRAINT bancos_nombre_check
    CHECK (nombre = btrim(nombre) AND length(nombre) BETWEEN 2 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS bancos_org_nombre_lower_uidx
  ON public.bancos (organization_id, lower(nombre));

-- Inicializa cada organización existente con el catálogo que antes estaba
-- codificado en el frontend. Se ejecuta antes del trigger de organización.
INSERT INTO public.bancos (organization_id, nombre)
SELECT o.id, b.nombre
FROM public.organizations o
CROSS JOIN (VALUES
  ('Banco de Chile'),
  ('Banco Santander'),
  ('Banco Itaú'),
  ('BancoEstado'),
  ('Banco BCI'),
  ('Scotiabank'),
  ('Banco BICE'),
  ('Otro')
) AS b(nombre)
ON CONFLICT (organization_id, nombre) DO NOTHING;

DROP TRIGGER IF EXISTS bancos_set_organization ON public.bancos;
CREATE TRIGGER bancos_set_organization
BEFORE INSERT ON public.bancos
FOR EACH ROW EXECUTE FUNCTION public.set_row_organization();

ALTER TABLE public.bancos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bancos_member_access ON public.bancos;
CREATE POLICY bancos_member_access ON public.bancos
  FOR ALL TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

REVOKE ALL ON public.bancos FROM anon;
GRANT SELECT, INSERT, DELETE ON public.bancos TO authenticated;
