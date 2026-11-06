-- La categoría contable pasa a ser opcional en el catálogo de códigos.
-- Un código puede usarse solo para detección/marca sin asignar categoría.

ALTER TABLE codigos ALTER COLUMN categoria DROP NOT NULL;
