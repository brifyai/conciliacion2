import { describe, expect, it } from 'vitest'
import { analizarPeriodo } from './analisisConciliacion'
import type { Transaccion } from '@/types/conciliacion'

const tx = (
  id: string,
  estado: Transaccion['estado'],
  extra: Partial<Transaccion> = {},
): Transaccion => ({
  id,
  fuente: 'banco',
  monto: -1000,
  fecha: '2026-01-10',
  descripcion: 'MOVIMIENTO',
  estado,
  ...extra,
})

describe('analizarPeriodo', () => {
  it('clasifica cada movimiento en su grupo accionable', () => {
    const { secciones } = analizarPeriodo([
      tx('a', 'resuelta', { codigoId: 'COVE' }),
      tx('b', 'no_conciliada', { codigoId: 'COVE' }),
      tx('c', 'sugerida', { matchId: 'x' }),
      tx('d', 'no_conciliada'),
      tx('e', 'no_conciliada', { codigoId: 'TRFC' }),
      tx('f', 'resuelta', { codigoId: 'TRFC' }),
      tx('g', 'conciliada', { matchId: 'h' }),
    ])
    expect(secciones.map((s) => [s.id, s.items.map((t) => t.id)])).toEqual([
      ['operacion-sin-documento', ['a']],
      ['esperan-documento', ['b']],
      ['por-revisar', ['c']],
      ['sin-codigo', ['d']],
      ['tesoreria-abierta', ['e']],
      ['explicadas', ['f']],
    ])
  })

  it('acumula el monto absoluto del grupo', () => {
    const { secciones } = analizarPeriodo([
      tx('a', 'no_conciliada', { codigoId: 'TRFC', monto: -1500 }),
      tx('b', 'no_conciliada', { codigoId: 'TRFC', monto: -2500 }),
    ])
    expect(secciones).toHaveLength(1)
    expect(secciones[0].monto).toBe(4000)
  })

  it('omite los grupos vacíos y avisa cuando no hay brechas', () => {
    const { secciones, diagnosticos } = analizarPeriodo([
      tx('a', 'conciliada', { matchId: 'b' }),
    ])
    expect(secciones).toEqual([])
    expect(diagnosticos).toEqual([
      'No hay brechas en el período: todo está conciliado o explicado por su código.',
    ])
  })

  it('prioriza los cierres manuales de operación en el diagnóstico', () => {
    const { diagnosticos } = analizarPeriodo([
      tx('a', 'resuelta', { codigoId: 'IVEN' }),
      tx('b', 'no_conciliada', { codigoId: 'TRFC' }),
    ])
    expect(diagnosticos).toHaveLength(2)
    expect(diagnosticos[0]).toContain('cerrados sin documento')
    expect(diagnosticos[1]).toContain('sólo falta cerrarlos')
  })

  it('mide sobre el banco cuando hay cartola: la contabilidad sin pago no es brecha', () => {
    const { secciones } = analizarPeriodo([
      tx('a', 'no_conciliada', { codigoId: 'TRFC' }),
      tx('c1', 'no_conciliada', { fuente: 'contabilidad' }),
    ])
    expect(secciones.flatMap((s) => s.items).map((t) => t.id)).toEqual(['a'])
  })

  it('ignora los movimientos de monto cero', () => {
    const { secciones } = analizarPeriodo([tx('a', 'no_conciliada', { monto: 0 })])
    expect(secciones).toEqual([])
  })
})
