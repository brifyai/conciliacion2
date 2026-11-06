import { describe, expect, it } from 'vitest'
import { conciliar } from './matching'
import type { Transaccion } from '@/types/conciliacion'

const tx = (id: string, fuente: Transaccion['fuente'], monto: number, fecha: string, extra: Partial<Transaccion> = {}): Transaccion => ({
  id, fuente, monto, fecha, descripcion: 'PAGO PROVEEDOR', estado: 'no_conciliada', ...extra,
})

describe('conciliar', () => {
  it('usa vencimiento y no emisión cuando existe', () => {
    // El vencimiento queda fuera de la ventana de tolerancia y la emisión
    // dentro: si el matching usara la emisión conciliaría; al usar el
    // vencimiento no debe hacerlo.
    const resultado = conciliar([
      tx('b', 'banco', -1000, '2026-01-02'),
      tx('c', 'contabilidad', -1000, '2026-01-01', { fechaVencimiento: '2026-06-01' }),
    ])
    expect(resultado.every((t) => t.estado !== 'conciliada')).toBe(true)
  })

  it('exige signo compatible y veta RUT distinto', () => {
    const signo = conciliar([tx('b', 'banco', 1000, '2026-01-10'), tx('c', 'contabilidad', -1000, '2026-01-10')])
    expect(signo.every((t) => !t.matchId)).toBe(true)
    const rut = conciliar([
      tx('b', 'banco', 1000, '2026-01-10', { rut: '11111111-1' }),
      tx('c', 'contabilidad', 1000, '2026-01-10', { rut: '22222222-2' }),
    ])
    expect(rut.every((t) => !t.matchId)).toBe(true)
  })

  it('crea un match recíproco válido', () => {
    const resultado = conciliar([tx('b', 'banco', -1000, '2026-01-10'), tx('c', 'contabilidad', -1000, '2026-01-10')])
    expect(resultado.map((t) => [t.estado, t.matchId])).toEqual([
      ['conciliada', 'c'], ['conciliada', 'b'],
    ])
  })

  it('concilia por monto y fecha aunque la glosa difiera y el pago sea posterior', () => {
    const resultado = conciliar([
      tx('b', 'banco', -1000, '2026-02-15', { descripcion: 'TRANSFER WEB 998877' }),
      tx('c', 'contabilidad', -1000, '2026-01-20', { descripcion: 'FACTURA PROVEEDOR ACME' }),
    ])
    // ~26 días de diferencia y glosas distintas: antes quedaba "sugerida",
    // ahora se concilia automáticamente.
    expect(resultado.every((t) => t.estado === 'conciliada' && t.matchId)).toBe(true)
  })

  it('concilia un pago parcial contra el total del documento', () => {
    // Factura por -11.305.000 pagada con una cuota de -6.305.000. El banco
    // refleja sólo la cuota; debe calzar con la factura vía montos_pago.
    const resultado = conciliar([
      tx('b', 'banco', -6305000, '2026-01-22'),
      tx('c', 'contabilidad', -11305000, '2026-01-20', {
        metadatos: { montos_pago: [6305000] },
      }),
    ])
    expect(resultado.every((t) => t.estado === 'conciliada' && t.matchId)).toBe(true)
  })

  it('no concilia un parcial cuyo monto no aparece en el documento', () => {
    const resultado = conciliar([
      tx('b', 'banco', -500000, '2026-01-22'),
      tx('c', 'contabilidad', -11305000, '2026-01-20', {
        metadatos: { montos_pago: [6305000] },
      }),
    ])
    expect(resultado.every((t) => !t.matchId)).toBe(true)
  })

  it('preserva los movimientos resueltos y no los empareja', () => {
    const resultado = conciliar([
      tx('b', 'banco', -1000, '2026-01-10', { estado: 'resuelta', codigoId: 'DONA' }),
      tx('c', 'contabilidad', -1000, '2026-01-10'),
    ])
    const b = resultado.find((t) => t.id === 'b')!
    const c = resultado.find((t) => t.id === 'c')!
    expect(b.estado).toBe('resuelta')
    expect(b.matchId).toBeUndefined()
    expect(c.matchId).toBeUndefined() // no roba al resuelto como contraparte
  })
  it('concilia con llave dura cuando el RUT coincide, aunque la glosa no ayude', () => {
    const resultado = conciliar([
      tx('b', 'banco', -1000, '2026-01-10', {
        rut: '078187230-K',
        descripcion: 'PAGO RECIBIDO PRV 078187230-K',
      }),
      tx('c', 'contabilidad', -1000, '2026-01-20', { rut: '78187230K', descripcion: 'FACTURA ACME' }),
    ])
    expect(resultado.every((t) => t.estado === 'conciliada' && t.confianza === 1)).toBe(true)
  })

  it('propone sugerida (recíproca) cuando hay dos facturas con el mismo monto', () => {
    const resultado = conciliar([
      tx('b', 'banco', -1000, '2026-01-10', { descripcion: 'TRANSFER WEB 998877' }),
      tx('c1', 'contabilidad', -1000, '2026-01-09', { descripcion: 'FACTURA A' }),
      tx('c2', 'contabilidad', -1000, '2026-01-11', { descripcion: 'FACTURA B' }),
    ])
    const b = resultado.find((t) => t.id === 'b')!
    expect(b.estado).toBe('sugerida')
    expect(b.matchId).toBeTruthy()
    const par = resultado.find((t) => t.id === b.matchId)!
    expect(par.estado).toBe('sugerida')
    expect(par.matchId).toBe('b')
  })

  it('propone sugerida con mismo RUT y diferencia de monto bajo 0,5%', () => {
    const resultado = conciliar([
      tx('b', 'banco', -1005, '2026-01-10', { rut: '78187230K' }),
      tx('c', 'contabilidad', -1000, '2026-01-10', { rut: '78187230K' }),
    ])
    const b = resultado.find((t) => t.id === 'b')!
    expect(b.estado).toBe('sugerida')
    expect(b.matchId).toBe('c')
  })

  it('no degrada a sugerida por un rival fuera de la ventana de fecha', () => {
    // 'c2' pesa lo mismo que el movimiento, pero está a ~7 meses: no puede ser
    // su contraparte, así que no debe contar como competencia.
    const resultado = conciliar([
      tx('b', 'banco', -1000, '2026-01-10', { descripcion: 'TRANSFER WEB 998877' }),
      tx('c1', 'contabilidad', -1000, '2026-01-09', { descripcion: 'FACTURA A' }),
      tx('c2', 'contabilidad', -1000, '2025-06-10', { descripcion: 'FACTURA ANTIGUA' }),
    ])
    const b = resultado.find((t) => t.id === 'b')!
    expect(b.estado).toBe('conciliada')
    expect(b.matchId).toBe('c1')
  })

})
