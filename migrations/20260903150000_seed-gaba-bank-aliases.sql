-- Asigna automáticamente GABA (Gastos Bancarios) a los documentos de compra
-- emitidos por bancos, usando su RUT como alias. En un libro de compras, las
-- facturas de un banco corresponden a comisiones, mantención y tarifas
-- bancarias, que es justamente lo que agrupa GABA.
--
-- BCI (97006000-6) es el proveedor sin código más frecuente del libro (~197
-- filas); Santander (97036000-K) aporta el resto. Es aditivo y reversible: si
-- el tratamiento contable correcto fuera otro (p. ej. intereses), basta editar
-- el código en /codigos o reasignar el documento.
--
-- Se dejan fuera a propósito proveedores de rubro ambiguo (Enel, HS Chile,
-- Comercializadora GC, etc.): requieren tu criterio contable.
UPDATE public.codigos AS c
SET aliases = ARRAY(
  SELECT DISTINCT btrim(valor)
  FROM unnest(
    COALESCE(c.aliases, '{}'::text[]) || ARRAY[
      '97006000-6',  -- Banco de Crédito e Inversiones (BCI)
      '97036000-K'   -- Banco Santander - Chile
    ]::text[]
  ) AS valor
  WHERE btrim(valor) <> ''
)
WHERE c.id = 'GABA';

NOTIFY pgrst, 'reload schema';
