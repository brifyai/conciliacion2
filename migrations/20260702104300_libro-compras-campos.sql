-- Amplía la tabla transacciones con los campos contables del Libro de Compras.
-- Las filas bancarias quedan con NULL en estos campos; solo se usan cuando
-- fuente = 'contabilidad'. La columna `metadatos` (jsonb) preserva los campos
-- operacionales restantes (pagos parciales P1-P4, saldos, período campaña,
-- factoring, notas, fechas de pago, etc.) sin ensuciar el esquema.

ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS proveedor          text;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS tipo_doc           text;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS folio              text;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS exento             numeric;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS neto               numeric;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS iva_recup          numeric;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS iva_nr             numeric;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS fecha_vencimiento  date;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS estado_pago        text;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS metadatos          jsonb NOT NULL DEFAULT '{}'::jsonb;
