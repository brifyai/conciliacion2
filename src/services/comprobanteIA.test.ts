import { describe, expect, it } from 'vitest'
import {
  buscarContrapartes,
  evaluarContraMovimiento,
  parsearComprobante,
  textoParaClasificar,
} from './comprobanteIA'
import type { Transaccion } from '@/types/conciliacion'

const tx = (extra: Partial<Transaccion> = {}): Transaccion => ({
  id: 'b1',
  fuente: 'banco',
  fecha: '2026-01-30',
  monto: -1250000,
  descripcion: 'TRASPASO FONDOS OTRO BANCO EN LINEA',
  estado: 'no_conciliada',
  ...extra,
})

describe('parsearComprobante', () => {
  it('normaliza fecha, monto, RUT y detalle de la respuesta del modelo', () => {
    const datos = parsearComprobante(JSON.stringify({
      tipoDocumento: 'Comprobante de transferencia',
      fecha: '30/09/2026',
      monto: '$1.250.000',
      moneda: 'CLP',
      beneficiario: 'Jennifher Alexandr',
      rutBeneficiario: '12.345.678-5',
      detalle: 'REM SEPT',
      textoVisible: 'Transferencia realizada ...',
    }))
    expect(datos.fecha).toBe('2026-09-30')
    expect(datos.monto).toBe(1250000)
    expect(datos.detalle).toBe('REM SEPT')
    expect(datos.beneficiario).toBe('Jennifher Alexandr')
  })

  it('acepta JSON envuelto en bloque de código', () => {
    const datos = parsearComprobante('```json\n{"detalle":"ARRIENDO OFICINA","monto":500000}\n```')
    expect(datos.detalle).toBe('ARRIENDO OFICINA')
    expect(datos.monto).toBe(500000)
  })

  it('descarta un RUT con dígito verificador inválido', () => {
    const datos = parsearComprobante(JSON.stringify({ rutBeneficiario: '12.345.678-9' }))
    expect(datos.rutBeneficiario).toBe('')
  })

  it('falla si la respuesta no trae JSON', () => {
    expect(() => parsearComprobante('no pude leer la imagen')).toThrow()
  })
})

describe('evaluarContraMovimiento', () => {
  it('coincide cuando el monto y la fecha calzan', () => {
    const datos = parsearComprobante(JSON.stringify({ fecha: '30/01/2026', monto: 1250000 }))
    const ev = evaluarContraMovimiento(datos, tx())
    expect(ev.montoOK).toBe(true)
    expect(ev.fechaOK).toBe(true)
    expect(ev.veredicto).toBe('coincide')
    expect(ev.diferencias).toHaveLength(0)
  })

  it('marca parcial cuando sólo calza el monto', () => {
    const datos = parsearComprobante(JSON.stringify({ fecha: '15/03/2026', monto: 1250000 }))
    const ev = evaluarContraMovimiento(datos, tx())
    expect(ev.veredicto).toBe('parcial')
    expect(ev.diferencias.join(' ')).toContain('Fecha distinta')
  })

  it('marca no_coincide y reporta la diferencia de monto', () => {
    const datos = parsearComprobante(JSON.stringify({ fecha: '15/03/2026', monto: 999 }))
    const ev = evaluarContraMovimiento(datos, tx())
    expect(ev.veredicto).toBe('no_coincide')
    expect(ev.diferencias.join(' ')).toContain('Monto distinto')
  })

  it('detecta el RUT coincidente normalizando ceros a la izquierda', () => {
    const datos = parsearComprobante(JSON.stringify({ rutBeneficiario: '078187230-K' }))
    const ev = evaluarContraMovimiento(datos, tx({ rut: '78187230K' }))
    expect(ev.rutOK).toBe(true)
  })
})

describe('textoParaClasificar', () => {
  it('junta detalle, beneficiario y tipo para buscar el código', () => {
    const datos = parsearComprobante(JSON.stringify({
      detalle: 'REM SEPT',
      beneficiario: 'Jennifher Alexandr',
      tipoDocumento: 'Comprobante de transferencia',
    }))
    expect(textoParaClasificar(datos)).toBe(
      'REM SEPT Jennifher Alexandr Comprobante de transferencia',
    )
  })
})


describe('buscarContrapartes', () => {
  const banco: Transaccion = {
    id: 'b1',
    fuente: 'banco',
    fecha: '2026-01-30',
    monto: -1250000,
    descripcion: 'TRASPASO FONDOS OTRO BANCO EN LINEA',
    estado: 'no_conciliada',
  }
  const libro = (extra: Partial<Transaccion>): Transaccion => ({
    id: 'c1',
    fuente: 'contabilidad',
    fecha: '2026-01-28',
    monto: -1250000,
    descripcion: 'FACTURA',
    estado: 'no_conciliada',
    ...extra,
  })

  it('prioriza el documento con el mismo RUT y monto exacto', () => {
    const datos = parsearComprobante(
      JSON.stringify({ rutBeneficiario: '78187230K', monto: 1250000, detalle: 'PAGO FACTURA' }),
    )
    const conRut = libro({ id: 'c1', rut: '078187230-K', proveedor: 'ACME' })
    const sinRut = libro({ id: 'c2', rut: '11111111-1', proveedor: 'OTRO' })
    const res = buscarContrapartes(datos, banco, [conRut, sinRut])
    expect(res[0].transaccion.id).toBe('c1')
    expect(res[0].motivos).toContain('Mismo RUT')
    expect(res[0].puntaje).toBeGreaterThan(res[1].puntaje)
  })

  it('descarta documentos de monto distinto cuando el RUT difiere', () => {
    const datos = parsearComprobante(
      JSON.stringify({ rutBeneficiario: '78187230K', monto: 1250000 }),
    )
    const otro = libro({ id: 'c9', rut: '11111111-1', monto: -999 })
    expect(buscarContrapartes(datos, banco, [otro])).toHaveLength(0)
  })

  it('no propone documentos ya conciliados con otro movimiento', () => {
    const datos = parsearComprobante(JSON.stringify({ monto: 1250000 }))
    const usado = libro({ id: 'c1', matchId: 'b9' })
    expect(buscarContrapartes(datos, banco, [usado])).toHaveLength(0)
  })

  it('respeta el signo: un abono no calza con un cargo', () => {
    const datos = parsearComprobante(JSON.stringify({ monto: 1250000 }))
    const positivo = libro({ id: 'c1', monto: 1250000 })
    expect(buscarContrapartes(datos, banco, [positivo])).toHaveLength(0)
  })

  it('encuentra la factura por una cuota (pago parcial)', () => {
    const datos = parsearComprobante(JSON.stringify({ monto: 6305000 }))
    const factura = libro({
      id: 'c1',
      monto: -11305000,
      metadatos: { montos_pago: [6305000] },
    })
    const res = buscarContrapartes(datos, { ...banco, monto: -6305000 }, [factura])
    expect(res).toHaveLength(1)
    expect(res[0].motivos).toContain('Monto exacto')
  })
})
