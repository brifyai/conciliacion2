-- Seed de catálogos base (bancos y códigos) para la organización principal.
-- Se fija organization_id explícito y se desactivan los triggers de organización
-- porque en una migración no hay usuario autenticado (auth.uid() es NULL).

-- ------------------------------- Bancos -------------------------------
alter table public.bancos disable trigger bancos_set_organization;

insert into public.bancos (organization_id, nombre)
select '00000000-0000-4000-8000-000000000001', b.nombre
from (values
  ('Banco de Chile'),
  ('Banco Santander'),
  ('Banco Itaú'),
  ('BancoEstado'),
  ('Banco BCI'),
  ('Scotiabank'),
  ('Banco BICE'),
  ('Otro')
) as b(nombre)
on conflict (organization_id, nombre) do nothing;

alter table public.bancos enable trigger bancos_set_organization;

-- ------------------------------- Códigos -------------------------------
alter table public.codigos disable trigger codigos_set_organization;

insert into public.codigos (organization_id, id, nombre, categoria, descripcion, activo) values
  ('00000000-0000-4000-8000-000000000001', 'COVE', 'Costo de Ventas',        'Costo de venta',          'Compras y costos asociados a la venta de productos', true),
  ('00000000-0000-4000-8000-000000000001', 'IVEN', 'Ingreso por Ventas',     'Ventas',                  'Ingresos provenientes de ventas de productos o servicios', true),
  ('00000000-0000-4000-8000-000000000001', 'MER',  'Mercaderías',            'Costo de venta',          'Compra de mercaderías para reventa', true),
  ('00000000-0000-4000-8000-000000000001', 'REMU', 'Remuneraciones',         'Remuneraciones',          'Sueldos, salarios y pagos al personal', true),
  ('00000000-0000-4000-8000-000000000001', 'INCE', 'Incentivos y Bonos',     'Remuneraciones',          'Bonos de productividad, incentivos', true),
  ('00000000-0000-4000-8000-000000000001', 'CRGA', 'Cargas Sociales',        'Remuneraciones',          'Cotizaciones previsionales, AFP, Fonasa, Isapre', true),
  ('00000000-0000-4000-8000-000000000001', 'ARRI', 'Arriendo',               'Arriendo',                'Arriendo de oficinas, locales, bodegas', true),
  ('00000000-0000-4000-8000-000000000001', 'INMO', 'Gastos Inmobiliarios',   'Arriendo',                'Gastos comunes, contribuciones', true),
  ('00000000-0000-4000-8000-000000000001', 'HONO', 'Honorarios',             'Servicios profesionales', 'Honorarios por servicios profesionales', true),
  ('00000000-0000-4000-8000-000000000001', 'ASES', 'Asesorías',              'Servicios profesionales', 'Asesorías legales, tributarias, financieras', true),
  ('00000000-0000-4000-8000-000000000001', 'CAPA', 'Capacitación',           'Capacitación',            'Cursos, seminarios, becas de estudio', true),
  ('00000000-0000-4000-8000-000000000001', 'IMPU', 'Impuestos',              'Impuestos',               'Pago de impuestos', true),
  ('00000000-0000-4000-8000-000000000001', 'IVAA', 'IVA',                    'Impuestos',               'IVA débito y crédito fiscal', true),
  ('00000000-0000-4000-8000-000000000001', 'RETE', 'Retenciones',            'Impuestos',               'Retenciones de impuestos', true),
  ('00000000-0000-4000-8000-000000000001', 'PATE', 'Patentes Municipales',   'Impuestos',               'Patentes y permisos municipales', true),
  ('00000000-0000-4000-8000-000000000001', 'COMI', 'Comisiones Bancarias',   'Gastos bancarios',        'Comisiones y cargos bancarios', true),
  ('00000000-0000-4000-8000-000000000001', 'INTE', 'Intereses',              'Gastos financieros',      'Intereses bancarios y financieros', true),
  ('00000000-0000-4000-8000-000000000001', 'PRES', 'Préstamos',              'Gastos financieros',      'Cuotas y amortización de préstamos', true),
  ('00000000-0000-4000-8000-000000000001', 'DESC', 'Descuentos Obtenidos',   'Ingresos financieros',    'Descuentos por pronto pago', true),
  ('00000000-0000-4000-8000-000000000001', 'ENER', 'Energía Eléctrica',      'Servicios básicos',       'Cuentas de electricidad', true),
  ('00000000-0000-4000-8000-000000000001', 'AGUA', 'Agua Potable',           'Servicios básicos',       'Cuentas de agua', true),
  ('00000000-0000-4000-8000-000000000001', 'TELE', 'Telefonía e Internet',   'Servicios básicos',       'Teléfono, internet, cable', true),
  ('00000000-0000-4000-8000-000000000001', 'SEGU', 'Seguros',                'Seguros',                 'Seguros generales, vehículos, vida', true),
  ('00000000-0000-4000-8000-000000000001', 'MANT', 'Mantención',             'Mantención',              'Mantención y reparaciones', true),
  ('00000000-0000-4000-8000-000000000001', 'VIAJ', 'Viajes y Viáticos',      'Viajes',                  'Pasajes, hospedaje, viáticos', true),
  ('00000000-0000-4000-8000-000000000001', 'PUBL', 'Publicidad',             'Publicidad',              'Publicidad y marketing', true),
  ('00000000-0000-4000-8000-000000000001', 'TRAN', 'Transporte',             'Transporte',              'Fletes, encomiendas, transporte', true),
  ('00000000-0000-4000-8000-000000000001', 'COMB', 'Combustible',            'Combustible',             'Combustibles y lubricantes', true),
  ('00000000-0000-4000-8000-000000000001', 'MATR', 'Materiales',             'Materiales',              'Materiales de oficina y operación', true),
  ('00000000-0000-4000-8000-000000000001', 'EQUI', 'Equipos',                'Equipos',                 'Equipos computacionales y tecnológicos', true),
  ('00000000-0000-4000-8000-000000000001', 'MUEB', 'Mobiliario',             'Mobiliario',              'Mobiliario y decoración', true),
  ('00000000-0000-4000-8000-000000000001', 'VEHI', 'Vehículos',              'Vehículos',               'Vehículos y transporte propio', true),
  ('00000000-0000-4000-8000-000000000001', 'LIMP', 'Limpieza',               'Servicios básicos',       'Productos y servicios de limpieza', true),
  ('00000000-0000-4000-8000-000000000001', 'VIGI', 'Vigilancia',             'Servicios básicos',       'Servicios de seguridad y vigilancia', true),
  ('00000000-0000-4000-8000-000000000001', 'COST', 'Costas Judiciales',      'Gastos legales',          'Costas y gastos judiciales', true),
  ('00000000-0000-4000-8000-000000000001', 'MULT', 'Multas',                 'Gastos legales',          'Multas y sanciones', true),
  ('00000000-0000-4000-8000-000000000001', 'DEVO', 'Devoluciones',           'Devoluciones',            'Devoluciones de dinero o productos', true),
  ('00000000-0000-4000-8000-000000000001', 'PROP', 'Propinas',               'Gastos generales',        'Propinas y gratificaciones', true),
  ('00000000-0000-4000-8000-000000000001', 'ALIM', 'Alimentación',           'Gastos generales',        'Gastos de alimentación y casino', true),
  ('00000000-0000-4000-8000-000000000001', 'SUMI', 'Suministros',            'Gastos generales',        'Suministros menores', true),
  ('00000000-0000-4000-8000-000000000001', 'DONC', 'Donaciones',             'Gastos generales',        'Donaciones y aportes', true),
  ('00000000-0000-4000-8000-000000000001', 'GAST', 'Gastos Generales',       'Gastos generales',        'Gastos generales no clasificados', true),
  ('00000000-0000-4000-8000-000000000001', 'INVA', 'Inversión en Activos',   'Inversiones',             'Compra de activos fijos e inversiones', true),
  ('00000000-0000-4000-8000-000000000001', 'INGR', 'Otros Ingresos',         'Otros ingresos',          'Otros ingresos no clasificados', true),
  ('00000000-0000-4000-8000-000000000001', 'EGRE', 'Otros Egresos',          'Otros egresos',           'Otros egresos no clasificados', true),
  ('00000000-0000-4000-8000-000000000001', 'DEPR', 'Depreciación',           'Depreciación',            'Depreciación de activos fijos', true),
  ('00000000-0000-4000-8000-000000000001', 'AMRT', 'Amortización',           'Amortización',            'Amortización de intangibles', true)
on conflict (organization_id, id) do nothing;

-- Código de factoring usado por la detección automática.
insert into public.codigos (
  organization_id, id, nombre, categoria, descripcion, clave, aliases, prioridad, activo
) values (
  '00000000-0000-4000-8000-000000000001', 'FACT', 'Operación de Factoring', 'Factoring',
  'Cesión o anticipo de documentos mediante factoring', null,
  array['Factoring']::text[], 100, true
)
on conflict (organization_id, id) do nothing;

-- Aliases de detección para los códigos del catálogo base que los admiten.
with baseline(id, nuevos) as (values
  ('IVEN', array['Cobro Cliente']::text[]),
  ('REMU', array['Pago remuneraciones', 'Nómina de sueldos']::text[]),
  ('COMI', array['Comisión mantención', 'Cargo mantención cuenta', 'Tarifa bancaria']::text[]),
  ('FACT', array['Factoring', 'Anticipo factoring']::text[]),
  ('INTE', array['Interés crédito bancario', 'Interés línea de crédito']::text[]),
  ('SEGU', array['Pago de seguros']::text[]),
  ('ARRI', array['Pago arriendo oficina']::text[]),
  ('INMO', array['Pago gastos comunes']::text[]),
  ('HONO', array['Honorarios profesionales externos']::text[]),
  ('IVAA', array['Pago F29', 'Pago IVA ventas']::text[]),
  ('CRGA', array['Previred', 'Pago leyes sociales']::text[]),
  ('INGR', array['Otros ingresos']::text[]),
  ('PUBL', array['Facebook Ads', 'Google Ads', 'Meta Platforms']::text[])
)
update public.codigos as c
set aliases = array(
  select distinct btrim(valor)
  from unnest(coalesce(c.aliases, '{}'::text[]) || b.nuevos) as valor
  where btrim(valor) <> ''
)
from baseline as b
where c.organization_id = '00000000-0000-4000-8000-000000000001'
  and c.id = b.id;

alter table public.codigos enable trigger codigos_set_organization;
