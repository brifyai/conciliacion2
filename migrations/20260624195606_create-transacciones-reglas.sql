-- Tablas para la conciliación bancaria.
-- RLS desactivada: la app aún no tiene login y se accede con el anon key.

-- Transacciones normalizadas del banco y de contabilidad.
CREATE TABLE IF NOT EXISTS transacciones (
  id          text PRIMARY KEY,
  fuente      text NOT NULL CHECK (fuente IN ('banco', 'contabilidad')),
  banco       text,
  fecha       date NOT NULL,
  monto       numeric NOT NULL,
  saldo       numeric,
  descripcion text NOT NULL,
  rut         text,
  categoria   text,
  estado      text NOT NULL DEFAULT 'no_conciliada'
              CHECK (estado IN ('conciliada', 'pendiente', 'no_conciliada', 'sugerida')),
  match_id    text,
  confianza   numeric,
  documento   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Reglas de categorización / auto-match.
CREATE TABLE IF NOT EXISTS reglas (
  id         text PRIMARY KEY,
  nombre     text NOT NULL,
  activa     boolean NOT NULL DEFAULT true,
  campo      text NOT NULL,
  operador   text NOT NULL,
  valor      text NOT NULL DEFAULT '',
  accion     jsonb NOT NULL DEFAULT '{}'::jsonb,
  prioridad  integer NOT NULL DEFAULT 99,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sin RLS (acceso público vía anon key).
ALTER TABLE transacciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE reglas       DISABLE ROW LEVEL SECURITY;

-- Permisos para los roles de PostgREST (anon y authenticated).
GRANT SELECT, INSERT, UPDATE, DELETE ON transacciones TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON reglas       TO anon, authenticated;
