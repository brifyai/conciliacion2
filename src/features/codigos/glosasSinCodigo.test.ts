import { describe, expect, it } from 'vitest'
import { agruparGlosasSinCodigo } from './glosasSinCodigo'
import type { Transaccion } from '@/types/conciliacion'

const tx = (id: string, patch: Partial<Transaccion> = {}): Transaccion => ({
  id,
  fuente: 'banco',
  fecha: '2026-01-01',
  monto: -1000,
  descripcion: id,
  estado: 'no_conciliada',
  ...patch,
})

describe('agruparGlosasSinCodigo', () => {
  it('agrupa por glosa y ordena por frecuencia descendente', () => {
    const { grupos, totalSin } = agruparGlosasSinCodigo([
      tx('a', { descripcion: 'Cargo comisión' }),
      tx('b', { descripcion: 'Cargo comisión' }),
      tx('c', { descripcion: 'Pago proveedor' }),
      tx('d', { descripcion: 'Cargo comisión' }),
      tx('e', { descripcion: 'Pago proveedor' }),
    ])
    expect(totalSin).toBe(5)
    expect(grupos).toEqual([
      { glosa: 'Cargo comisión', count: 3 },
      { glosa: 'Pago proveedor', count: 2 },
    ])
  })

  it('excluye las transacciones que ya tienen código', () => {
    const { grupos, totalSin } = agruparGlosasSinCodigo([
      tx('a', { descripcion: 'Sin clasificar' }),
      tx('b', { descripcion: 'Ya clasificada', codigoId: 'COVE' }),
    ])
    expect(totalSin).toBe(1)
    expect(grupos).toEqual([{ glosa: 'Sin clasificar', count: 1 }])
  })

  it('agrupa sin distinguir mayúsculas pero conserva el primer texto visto', () => {
    const { grupos } = agruparGlosasSinCodigo([
      tx('a', { descripcion: 'Cargo Comisión' }),
      tx('b', { descripcion: 'cargo comisión' }),
    ])
    expect(grupos).toEqual([{ glosa: 'Cargo Comisión', count: 2 }])
  })

  it('usa proveedor o contraparte cuando no hay descripción, e ignora glosas vacías', () => {
    const { grupos, totalSin } = agruparGlosasSinCodigo([
      tx('a', { descripcion: '', proveedor: 'ACME SpA' }),
      tx('b', { descripcion: '', proveedor: '', contraparte: 'Juan Pérez' }),
      tx('c', { descripcion: '', proveedor: '', contraparte: '' }),
    ])
    expect(totalSin).toBe(2)
    expect(grupos.map((g) => g.glosa).sort()).toEqual(['ACME SpA', 'Juan Pérez'])
  })
})
