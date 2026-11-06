-- Catálogo de códigos contables (ej. COVE = Costo de Ventas).
-- Se usan para auto-clasificar transacciones según el código presente
-- en la descripción de la cartola bancaria o libro contable.

CREATE TABLE IF NOT EXISTS codigos (
  id          text PRIMARY KEY,           -- código en mayúsculas (COVE, IVEN, ...)
  nombre      text NOT NULL,              -- nombre descriptivo
  categoria   text NOT NULL,              -- categoría contable a asignar
  descripcion text,                       -- descripción opcional
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE codigos DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON codigos TO anon, authenticated;