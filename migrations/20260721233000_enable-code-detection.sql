-- Habilita detección automática segura con perfiles y aliases observados.
-- Es aditiva: preserva aliases personalizados y no toca transacciones.
ALTER TABLE public.transacciones
  DROP CONSTRAINT IF EXISTS transacciones_codigo_origen_check;
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_codigo_origen_check
  CHECK (codigo_origen IS NULL OR codigo_origen IN (
    'explicito', 'id', 'clave', 'alias', 'nombre',
    'perfil', 'contraparte', 'manual'
  ));

ALTER TABLE public.codigos DISABLE TRIGGER codigos_set_organization;
INSERT INTO public.codigos (
  organization_id, id, nombre, categoria, descripcion,
  clave, aliases, prioridad, activo
)
SELECT
  o.id, 'FACT', 'Operación de Factoring', 'Factoring',
  'Cesión o anticipo de documentos mediante factoring',
  NULL, ARRAY['Factoring']::text[], 100, true
FROM public.organizations o
ON CONFLICT (organization_id, id) DO NOTHING;
ALTER TABLE public.codigos ENABLE TRIGGER codigos_set_organization;

WITH baseline(id, nuevos) AS (VALUES
  ('ABCL', ARRAY['Cargo línea de crédito']::text[]),
  ('ACCR', ARRAY['Amortización capital crédito', 'Amortización de crédito']::text[]),
  ('ACTY', ARRAY['Contabilidad Yarad', 'Yarad']::text[]),
  ('AGYB', ARRAY['Pago aguinaldos', 'Pago de bonos']::text[]),
  ('AUNO', ARRAY['Austral Noticias']::text[]),
  ('BGIT', ARRAY['Toma de boleta de garantía']::text[]),
  ('BUPA', ARRAY['Bupa', 'Seguro salud empresa']::text[]),
  ('CAMI', ARRAY['Remuneraciones Camilo', 'Sueldo Camilo']::text[]),
  ('CLCR', ARRAY['Abono línea de crédito']::text[]),
  ('COUS', ARRAY['Compra USD', 'Compra dólares']::text[]),
  ('CRIS', ARRAY['Remuneraciones Cristian', 'Sueldo Cristian']::text[]),
  ('DAAE', ARRAY['Local Planet']::text[]),
  ('DAP', ARRAY['Depósito a plazo']::text[]),
  ('DIAR', ARRAY['Devolución impuesto a la renta']::text[]),
  ('DONA', ARRAY['Donación', 'Aporte donación']::text[]),
  ('FACT', ARRAY['Factoring', 'Anticipo factoring']::text[]),
  ('FINQ', ARRAY['Pago finiquito']::text[]),
  ('GABA', ARRAY['Comisión mantención', 'Cargo mantención cuenta', 'Tarifa bancaria']::text[]),
  ('GAME', ARRAY['Pago arriendo oficina']::text[]),
  ('GCOB', ARRAY[]::text[]),
  ('GCOM', ARRAY['Pago gastos comunes']::text[]),
  ('GOFI', ARRAY['Insumos de oficina']::text[]),
  ('HPRO', ARRAY['Honorarios profesionales externos']::text[]),
  ('ICRE', ARRAY['Interés crédito bancario']::text[]),
  ('INRI', ARRAY['Interés línea de crédito']::text[]),
  ('IVEN', ARRAY['Cobro Cliente']::text[]),
  ('LLSS', ARRAY['Previred', 'Pago leyes sociales']::text[]),
  ('LSR', ARRAY['Regional La Serena']::text[]),
  ('MARB', ARRAY['Remuneraciones Miguel', 'Sueldo Miguel']::text[]),
  ('MIVAL', ARRAY['Mi Valdivia']::text[]),
  ('MIVE', ARRAY['Pago F29', 'Pago IVA ventas']::text[]),
  ('OGDI', ARRAY['Otros gastos directos']::text[]),
  ('OING', ARRAY['Otros ingresos']::text[]),
  ('PADD', ARRAY['Plataforma Padd', 'Padd']::text[]),
  ('PAF', ARRAY['Regional Antofagasta']::text[]),
  ('PALC', ARRAY['Amortización línea de crédito']::text[]),
  ('PALD', ARRAY['Patagonia Al Día']::text[]),
  ('PRBA', ARRAY['Otorgamiento de crédito']::text[]),
  ('QMR', ARRAY['Qumran']::text[]),
  ('RBTG', ARRAY['Rescate de boleta de garantía']::text[]),
  ('REMU', ARRAY['Pago remuneraciones', 'Nómina de sueldos']::text[]),
  ('RINV', ARRAY['Retiro de inversiones']::text[]),
  ('RSEX', ARRAY['Facebook Ads', 'Google Ads', 'Meta Platforms']::text[]),
  ('RUTI', ARRAY['Retiro de utilidades']::text[]),
  ('SECO', ARRAY['Pago de seguros']::text[]),
  ('TEYA', ARRAY['Temuco Ya']::text[]),
  ('TOCK', ARRAY['Pago Entel', 'Entel']::text[]),
  ('TRFA', ARRAY['Transferencia entre cuentas abono']::text[]),
  ('TRFC', ARRAY['Transferencia entre cuentas cargo']::text[]),
  ('VMEX', ARRAY['Venta moneda extranjera']::text[])
)
UPDATE public.codigos AS c
SET aliases = ARRAY(
  SELECT DISTINCT btrim(valor)
  FROM unnest(COALESCE(c.aliases, '{}'::text[]) || b.nuevos) AS valor
  WHERE btrim(valor) <> ''
)
FROM baseline AS b
WHERE c.id = b.id;
