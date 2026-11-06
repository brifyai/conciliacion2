import { describe, expect, it } from 'vitest'
import { analizarFilas, detectarPerfilArchivo, sugerirMapeo } from './parseFiles'

describe('analizarFilas', () => {
  it('deriva abono menos cargo y conserva saldo/documento', () => {
    const filas = [{ Fecha: '10/01/2026', Cargo: '1.000', Abono: '0', Saldo: '5.000', Documento: 'ABC' }]
    const resultado = analizarFilas(filas, sugerirMapeo(Object.keys(filas[0])), 'banco', 'Banco de Chile')
    expect(resultado.transacciones[0]).toMatchObject({
      monto: -1000,
      saldo: 5000,
      documento: 'ABC',
      fingerprint: 'bc2941669ff0aa5a-1',
    })
  })

  it('normaliza notas de crédito según el tipo de libro', () => {
    const filas = [{ Fecha: '10/01/2026', Total: '1.000', Tipo: 'Nota de Crédito Electrónica' }]
    const mapeo = sugerirMapeo(Object.keys(filas[0]))
    expect(analizarFilas(filas, mapeo, 'contabilidad', undefined, true).transacciones[0].monto).toBe(1000)
    expect(analizarFilas(filas, mapeo, 'contabilidad', undefined, false).transacciones[0].monto).toBe(-1000)
  })

  it('reporta y omite fechas o montos inválidos', () => {
    const filas = [
      { Fecha: '31/02/2026', Total: '100' },
      { Fecha: '10/01/2026', Total: 'no-numérico' },
    ]
    const resultado = analizarFilas(filas, sugerirMapeo(['Fecha', 'Total']), 'contabilidad', undefined)
    expect(resultado.transacciones).toHaveLength(0)
    expect(resultado.omitidas).toBe(2)
  })

  it('genera huellas estables', () => {
    const filas = [{ Fecha: '10/01/2026', Total: '100', Glosa: 'Pago' }]
    const mapeo = sugerirMapeo(Object.keys(filas[0]))
    const a = analizarFilas(filas, mapeo, 'contabilidad', undefined).transacciones[0]
    const b = analizarFilas(filas, mapeo, 'contabilidad', undefined).transacciones[0]
    expect(a.id).toBe(b.id)
    expect(a.fingerprint).toBe(b.fingerprint)
  })
})

describe('sugerirMapeo con encabezados de cartola BCI', () => {
  it('mapea "Cheques y otros cargos" a cargo y "Depósitos y Abono" a abono', () => {
    const encabezados = [
      'Fecha', 'Sucursal', 'Descripción', 'N° Documento',
      'Cheques y otros cargos', 'Depósitos y Abono', 'Saldo diario',
    ]
    const mapeo = sugerirMapeo(encabezados, 'banco')
    expect(mapeo['Fecha']).toBe('fecha')
    expect(mapeo['Descripción']).toBe('descripcion')
    expect(mapeo['N° Documento']).toBe('documento')
    expect(mapeo['Cheques y otros cargos']).toBe('cargo')
    expect(mapeo['Depósitos y Abono']).toBe('abono')
    expect(mapeo['Saldo diario']).toBe('saldo')
  })

  it('mapea la columna CODIGO a código contable', () => {
    const mapeo = sugerirMapeo(['Fecha', 'Descripción', 'CODIGO'], 'banco')
    expect(mapeo['CODIGO']).toBe('codigo_contable')
  })
})

describe('columnas de pago del libro de compras', () => {
  const encabezados = [
    'RUT', 'PROVEEDOR', 'TIPO DOC', 'FACTURA', 'EMI', 'TOTAL',
    'P1', 'P2', 'P3', 'P4', 'SALDO FALTANTE', 'TOTAL PAGOS', 'SALDO',
  ]

  it('mapea P1..P4 y TOTAL PAGOS a pago del documento (no ignorar)', () => {
    const mapeo = sugerirMapeo(encabezados, 'compras')
    for (const p of ['P1', 'P2', 'P3', 'P4', 'TOTAL PAGOS']) {
      expect(mapeo[p]).toBe('pago_parcial')
    }
    expect(mapeo['TOTAL']).toBe('monto')
  })

  it('no manda el saldo faltante al saldo bancario', () => {
    const mapeo = sugerirMapeo(encabezados, 'compras')
    expect(mapeo['SALDO']).toBe('saldo_documento')
    expect(mapeo['SALDO FALTANTE']).not.toBe('saldo')
  })

  it('consolida los pagos parciales en metadatos.montos_pago', () => {
    const mapeo = sugerirMapeo(encabezados, 'compras')
    const filas = [{
      RUT: '99557680-5', PROVEEDOR: 'IDEAS Y PROYECTOS S.A.', 'TIPO DOC': 'Factura Electronica',
      FACTURA: '7', EMI: '2026-01-20', TOTAL: '11.305.000',
      P1: '6.305.000', P2: '', P3: '', P4: '', 'SALDO FALTANTE': '5.000.000',
      'TOTAL PAGOS': '6.305.000', SALDO: '5.000.000',
    }]
    const tx = analizarFilas(filas, mapeo, 'contabilidad', undefined, 'compras').transacciones[0]
    expect(tx.metadatos?.montos_pago).toContain(6305000)
  })
})

describe('RUT en la glosa y coherencia del libro', () => {
  it('recupera el RUT desde la glosa de la cartola', () => {
    const filas = [{
      Fecha: '10/01/2026',
      Descripción: 'PAGO RECIBIDO PRV 078187230-K BCO CHILE',
      'Cheques y otros cargos': '1.000',
    }]
    const mapeo = sugerirMapeo(Object.keys(filas[0]), 'banco')
    const tx = analizarFilas(filas, mapeo, 'banco', 'Banco de Chile').transacciones[0]
    expect(tx.rut).toBe('78187230K')
  })

  it('advierte cuando el monto del libro no cuadra con neto + IVA + exento', () => {
    const mapeo = sugerirMapeo(['Fecha', 'Monto Neto', 'Monto IVA', 'Total'], 'compras')

    const cuadrado = analizarFilas(
      [{ Fecha: '10/01/2026', 'Monto Neto': '1.000', 'Monto IVA': '190', Total: '1.190' }],
      mapeo, 'contabilidad', undefined, 'compras',
    )
    expect(cuadrado.diagnosticos.some((d) => d.motivo.includes('no cuadra'))).toBe(false)

    const descuadrado = analizarFilas(
      [{ Fecha: '10/01/2026', 'Monto Neto': '1.000', 'Monto IVA': '190', Total: '1.000' }],
      mapeo, 'contabilidad', undefined, 'compras',
    )
    expect(descuadrado.diagnosticos.some((d) => d.motivo.includes('no cuadra'))).toBe(true)
  })
})

describe('detectarPerfilArchivo', () => {
  it('reconoce los libros por el nombre aunque no digan "libro de ..."', () => {
    const compras = ['RUT', 'Razón Social', 'Tipo Doc', 'Folio', 'Fecha', 'Neto', 'IVA', 'Monto Total']
    const ventas = ['RUT', 'Razón Social', 'Tipo Doc', 'Folio', 'Fecha', 'Monto Total']
    expect(detectarPerfilArchivo('COMPRAS (lista).xlsx', compras)).toBe('compras')
    expect(detectarPerfilArchivo('ventas.xlsx', ventas)).toBe('ventas')
    expect(detectarPerfilArchivo('LIBRO VENTA 2025.xlsx', ventas)).toBe('ventas')
  })

  it('sigue tratando la cartola como banco', () => {
    const cartola = ['Fecha', 'Descripción', 'RUT', 'Cargo', 'Abono', 'Saldo', 'Código']
    expect(detectarPerfilArchivo('CARTOLA ACUMULADA (lista).xlsx', cartola)).toBe('banco')
    expect(detectarPerfilArchivo('cartola bci.xlsx', cartola)).toBe('banco')
  })
})

