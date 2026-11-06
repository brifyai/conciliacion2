-- Datos iniciales (extraídos de src/data/mockData.ts).
-- Idempotente: ON CONFLICT DO NOTHING para poder re-aplicar sin duplicar.

INSERT INTO transacciones (id, fuente, banco, fecha, monto, saldo, descripcion, rut, categoria, estado) VALUES
  ('banco-1',  'banco', 'Banco de Chile', '2025-05-02',  2850000, 8420000, 'TRANSFERENCIA RECIBIDA SUELDO',     '76543218-9', NULL, 'no_conciliada'),
  ('banco-2',  'banco', 'Banco de Chile', '2025-05-05', -1250000, 7170000, 'PAGO PROVEEDOR DISTRIBUIDORA DEL SUR','60111222-3', NULL, 'no_conciliada'),
  ('banco-3',  'banco', 'Banco de Chile', '2025-05-06',    45670, 7215670, 'TRANSBANK WEBPAY VENTA POS',        NULL,         NULL, 'no_conciliada'),
  ('banco-4',  'banco', 'Banco de Chile', '2025-05-07',   -89450, 7126220, 'PAGO CGE ELECTRICIDAD',             NULL,         NULL, 'no_conciliada'),
  ('banco-5',  'banco', 'Banco de Chile', '2025-05-08',   580000, 7706220, 'TRANSFERENCIA TERCEROS CLIENTE',    '13888999-2', NULL, 'no_conciliada'),
  ('banco-6',  'banco', 'Banco de Chile', '2025-05-09',    -1200, 7705020, 'COMISION MANTENCION CUENTA',        NULL,         NULL, 'no_conciliada'),
  ('banco-7',  'banco', 'Banco de Chile', '2025-05-10',   -50000, 7655020, 'GIRO CAJERO AUTOMATICO',            NULL,         NULL, 'no_conciliada'),
  ('banco-8',  'banco', 'Banco de Chile', '2025-05-12',  -650000, 7005020, 'TRF ARRIENDO INMOBILIARIA CENTRO',  NULL,         NULL, 'no_conciliada'),
  ('banco-9',  'banco', 'Banco de Chile', '2025-05-14',   320000, 7325020, 'DEPOSITO CHEQUE COBRO CLIENTE',     '13888999-2', NULL, 'no_conciliada'),
  ('contab-1', 'contabilidad', NULL, '2025-05-02',  2850000, NULL, 'Remuneraciones mayo',       '76543218-9', 'Remuneraciones',        'no_conciliada'),
  ('contab-2', 'contabilidad', NULL, '2025-05-05', -1250000, NULL, 'Factura Distribuidora del Sur','60111222-3','Costo de venta',        'no_conciliada'),
  ('contab-3', 'contabilidad', NULL, '2025-05-06',    45670, NULL, 'Ventas POS del día',        NULL,         'Ventas',                'no_conciliada'),
  ('contab-4', 'contabilidad', NULL, '2025-05-07',   -89450, NULL, 'CGE Energía cuenta luz',    NULL,         'Gastos generales',      'no_conciliada'),
  ('contab-5', 'contabilidad', NULL, '2025-05-09',    -1200, NULL, 'Comisión bancaria',         NULL,         'Gastos bancarios',      'no_conciliada'),
  ('contab-6', 'contabilidad', NULL, '2025-05-15',    -1200, NULL, 'Cargo mantención cuenta',   NULL,         'Gastos bancarios',      'no_conciliada'),
  ('contab-7', 'contabilidad', NULL, '2025-05-12',  -650000, NULL, 'Arriendo local comercial',  NULL,         'Arriendo',              'no_conciliada'),
  ('contab-8', 'contabilidad', NULL, '2025-05-20',  -200000, NULL, 'Honorarios contador',       NULL,         'Servicios profesionales','no_conciliada'),
  ('contab-9', 'contabilidad', NULL, '2025-05-22',   -15000, NULL, 'Gasto menor de caja',       NULL,         'Gastos generales',      'no_conciliada')
ON CONFLICT (id) DO NOTHING;

INSERT INTO reglas (id, nombre, activa, campo, operador, valor, accion, prioridad) VALUES
  ('regla-1', 'Sueldos a Remuneraciones',      true,  'descripcion', 'contiene',       'SUELDO',  '{"asignarCategoria": "Remuneraciones"}'::jsonb,                 1),
  ('regla-2', 'Webpay a Ventas',               true,  'descripcion', 'contiene',       'WEBPAY',  '{"asignarCategoria": "Ventas"}'::jsonb,                          2),
  ('regla-3', 'Arriendo auto-match',           true,  'descripcion', 'contiene',       'ARRIENDO','{"asignarCategoria": "Arriendo", "autoMatch": true}'::jsonb,      3),
  ('regla-4', 'Transferencias recibidas',      false, 'monto',       'monto_positivo', '',        '{"asignarCategoria": "Otros ingresos"}'::jsonb,                  4)
ON CONFLICT (id) DO NOTHING;
