-- Permite el origen de código 'rut': cuando un documento de un proveedor/cliente
-- ya tiene código (asignado manualmente, explícito o detectado), ese código se
-- propaga automáticamente al resto de documentos con el mismo RUT, incluidas
-- futuras importaciones. Así clasificar un proveedor una vez basta para que todos
-- sus documentos queden codificados al importar.
ALTER TABLE public.transacciones
  DROP CONSTRAINT IF EXISTS transacciones_codigo_origen_check;
ALTER TABLE public.transacciones
  ADD CONSTRAINT transacciones_codigo_origen_check
  CHECK (codigo_origen IS NULL OR codigo_origen IN (
    'explicito', 'id', 'clave', 'alias', 'nombre',
    'perfil', 'contraparte', 'manual', 'rut'
  ));

NOTIFY pgrst, 'reload schema';
