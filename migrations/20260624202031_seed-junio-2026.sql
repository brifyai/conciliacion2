-- Datos de junio 2026 (mismo patrón que el seed de mayo 2025).
-- 9 transacciones de banco + 8 de contabilidad, con fechas en junio 2026.
-- Algunas se concilian entre sí, otras quedan sin contraparte.

INSERT INTO transacciones (id, fuente, banco, fecha, monto, saldo, descripcion, rut, categoria, estado) VALUES
  ('banco-10', 'banco', 'Banco de Chile', '2026-06-01',  2950000, 9450000, 'TRANSFERENCIA RECIBIDA SUELDO JUNIO','76543218-9', NULL, 'no_conciliada'),
  ('banco-11', 'banco', 'Banco de Chile', '2026-06-03', -1320000, 8130000, 'PAGO PROVEEDOR DISTRIBUIDORA DEL SUR','60111222-3', NULL, 'no_conciliada'),
  ('banco-12', 'banco', 'Banco de Chile', '2026-06-05',    52340, 8182340, 'TRANSBANK WEBPAY VENTA POS',        NULL,         NULL, 'no_conciliada'),
  ('banco-13', 'banco', 'Banco de Chile', '2026-06-07',   -91230, 8091110, 'PAGO CGE ELECTRICIDAD',             NULL,         NULL, 'no_conciliada'),
  ('banco-14', 'banco', 'Banco de Chile', '2026-06-10',   450000, 8541110, 'TRANSFERENCIA TERCEROS CLIENTE NUEVO','13888999-2', NULL, 'no_conciliada'),
  ('banco-15', 'banco', 'Banco de Chile', '2026-06-15',    -1200, 8539910, 'COMISION MANTENCION CUENTA',        NULL,         NULL, 'no_conciliada'),
  ('banco-16', 'banco', 'Banco de Chile', '2026-06-18',   -40000, 8499910, 'GIRO CAJERO AUTOMATICO',            NULL,         NULL, 'no_conciliada'),
  ('banco-17', 'banco', 'Banco de Chile', '2026-06-20',  -680000, 7819910, 'TRF ARRIENDO INMOBILIARIA CENTRO',  NULL,         NULL, 'no_conciliada'),
  ('banco-18', 'banco', 'Banco de Chile', '2026-06-25',   280000, 8099910, 'DEPOSITO CHEQUE COBRO CLIENTE',     '13888999-2', NULL, 'no_conciliada'),
  ('contab-10', 'contabilidad', NULL, '2026-06-01',  2950000, NULL, 'Remuneraciones junio',          '76543218-9', 'Remuneraciones',         'no_conciliada'),
  ('contab-11', 'contabilidad', NULL, '2026-06-03', -1320000, NULL, 'Factura Distribuidora del Sur','60111222-3', 'Costo de venta',         'no_conciliada'),
  ('contab-12', 'contabilidad', NULL, '2026-06-05',    52340, NULL, 'Ventas POS del día',          NULL,         'Ventas',                 'no_conciliada'),
  ('contab-13', 'contabilidad', NULL, '2026-06-07',   -91230, NULL, 'CGE Energía cuenta luz',      NULL,         'Gastos generales',       'no_conciliada'),
  ('contab-14', 'contabilidad', NULL, '2026-06-15',    -1200, NULL, 'Comisión bancaria',           NULL,         'Gastos bancarios',       'no_conciliada'),
  ('contab-15', 'contabilidad', NULL, '2026-06-20',  -680000, NULL, 'Arriendo local comercial',    NULL,         'Arriendo',               'no_conciliada'),
  ('contab-16', 'contabilidad', NULL, '2026-06-22',  -210000, NULL, 'Honorarios contador',         NULL,         'Servicios profesionales','no_conciliada'),
  ('contab-17', 'contabilidad', NULL, '2026-06-28',   -45000, NULL, 'Suministros de oficina',      NULL,         'Gastos generales',       'no_conciliada')
ON CONFLICT (id) DO NOTHING;