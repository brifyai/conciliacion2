-- Agrega la columna clave (identificador numérico opcional) al catálogo de códigos.

ALTER TABLE codigos ADD COLUMN IF NOT EXISTS clave text;
