import { describe, expect, it } from 'vitest'
import { calcularKpis } from './selectors'
import type { Transaccion } from '@/types/conciliacion'

const tx = (id: string, monto: number, estado: Transaccion['estado'], fuente: Transaccion['fuente'] = 'banco'): Transaccion => ({
  id, monto, estado, fuente, fecha: '2026-01-01', descripcion: id,
})

describe('calcularKpis', () => {
  it('excluye monto cero tanto del numerador como del denominador', () => {
    const kpi = calcularKpis([
      tx('uno', 100, 'conciliada'),
      tx('dos', 200, 'no_conciliada'),
      tx('cero', 0, 'conciliada'),
    ])
    expect(kpi.tasaConciliacion).toBe(50)
    expect(kpi.montoTotal).toBe(300)
    expect(kpi.montoNoConciliado).toBe(200)
  })

  it('no duplica montos contables cuando existe lado bancario', () => {
    const kpi = calcularKpis([
      tx('banco', -100, 'conciliada'),
      tx('libro', -100, 'conciliada', 'contabilidad'),
    ])
    expect(kpi.montoTotal).toBe(100)
  })

  it('mide la tasa sobre la cartola: las facturas del libro sin pago no bajan el %', () => {
    const kpi = calcularKpis([
      tx('b1', -100, 'conciliada'),
      tx('b2', -200, 'resuelta'),
      tx('f1', -100, 'conciliada', 'contabilidad'),
      tx('f2', -500, 'no_conciliada', 'contabilidad'),
      tx('f3', -700, 'no_conciliada', 'contabilidad'),
    ])
    // Universo = banco (b1, b2): 2 de 2 explicados.
    expect(kpi.tasaExplicado).toBe(100)
    expect(kpi.tasaConciliacion).toBe(50)
    expect(kpi.conciliadas).toBe(1)
    expect(kpi.resueltas).toBe(1)
    expect(kpi.montoNoConciliado).toBe(0)
  })
})
