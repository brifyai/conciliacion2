import { describe, expect, it } from 'vitest'
import {
  detectarCodigoEnTransaccion,
  propagarCodigosPorRut,
  resolverPorClasificacion,
} from './categoriesEngine'
import type { Codigo, Transaccion } from '@/types/conciliacion'

const codigo = (id: string, categoria?: string): Codigo => ({
  id, nombre: id, categoria, aliases: [], prioridad: 100, activo: true,
})

const tx = (id: string, extra: Partial<Transaccion> = {}): Transaccion => ({
  id, fuente: 'contabilidad', fecha: '2026-01-10', monto: -1000,
  descripcion: 'FACTURA', estado: 'no_conciliada', ...extra,
})

describe('propagarCodigosPorRut', () => {
  const codigos = [codigo('PUBL', 'Publicidad'), codigo('HONO', 'Honorarios')]

  it('copia el código a otros documentos del mismo RUT sin clasificar', () => {
    const res = propagarCodigosPorRut([
      tx('a', { rut: '76115436-2', codigoId: 'PUBL', codigoOrigen: 'manual' }),
      tx('b', { rut: '76115436-2' }),
      tx('c', { rut: '99999999-9' }),
    ], codigos)
    const b = res.find((t) => t.id === 'b')!
    const c = res.find((t) => t.id === 'c')!
    expect(b.codigoId).toBe('PUBL')
    expect(b.codigoOrigen).toBe('rut')
    expect(c.codigoId).toBeUndefined()
  })

  it('no pisa un código ya asignado', () => {
    const res = propagarCodigosPorRut([
      tx('a', { rut: '76115436-2', codigoId: 'PUBL', codigoOrigen: 'manual' }),
      tx('b', { rut: '76115436-2', codigoId: 'HONO', codigoOrigen: 'alias' }),
    ], codigos)
    expect(res.find((t) => t.id === 'b')!.codigoId).toBe('HONO')
  })

  it('no propaga cuando el mismo RUT tiene códigos en conflicto y sin desempate', () => {
    const res = propagarCodigosPorRut([
      tx('a', { rut: '76115436-2', codigoId: 'PUBL', codigoOrigen: 'alias' }),
      tx('b', { rut: '76115436-2', codigoId: 'HONO', codigoOrigen: 'alias' }),
      tx('c', { rut: '76115436-2' }),
    ], codigos)
    expect(res.find((t) => t.id === 'c')!.codigoId).toBeUndefined()
  })

  it('el origen manual gana sobre una detección más débil al desempatar', () => {
    const res = propagarCodigosPorRut([
      tx('a', { rut: '76115436-2', codigoId: 'PUBL', codigoOrigen: 'manual' }),
      tx('b', { rut: '76115436-2', codigoId: 'HONO', codigoOrigen: 'alias' }),
      tx('c', { rut: '76115436-2' }),
    ], codigos)
    expect(res.find((t) => t.id === 'c')!.codigoId).toBe('PUBL')
  })
})

describe('detección por alias con forma de RUT', () => {
  const cove: Codigo = {
    id: 'COVE', nombre: 'Costo de Ventas', categoria: 'Costo de venta',
    aliases: ['81689800-5'], prioridad: 100, activo: true,
  }

  it('asigna el código cuando el RUT del documento calza con un alias-RUT', () => {
    const d = detectarCodigoEnTransaccion(
      tx('x', { rut: '81689800-5', descripcion: 'FACTURA ELECTRONICA TVN' }),
      [cove],
    )
    expect(d?.codigo.id).toBe('COVE')
    expect(d?.origen).toBe('alias')
  })

  it('no asigna a documentos de otro RUT', () => {
    const d = detectarCodigoEnTransaccion(
      tx('y', { rut: '76115436-2', descripcion: 'FACTURA OTRO PROVEEDOR' }),
      [cove],
    )
    expect(d).toBeNull()
  })
})

describe('resolverPorClasificacion', () => {
  const banco = (id: string, extra: Partial<Transaccion> = {}): Transaccion => ({
    id, fuente: 'banco', fecha: '2026-01-10', monto: -40000,
    descripcion: 'CARGO', estado: 'no_conciliada', ...extra,
  })

  it('resuelve un movimiento bancario de tesorería con código y sin contraparte', () => {
    const [r] = resolverPorClasificacion([banco('a', { codigoId: 'DONA' })])
    expect(r.estado).toBe('resuelta')
  })

  it('no resuelve códigos ligados a documento (COVE/IVEN/MER/FACT)', () => {
    const res = resolverPorClasificacion([
      banco('a', { codigoId: 'COVE' }),
      banco('b', { codigoId: 'IVEN' }),
    ])
    expect(res.every((t) => t.estado === 'no_conciliada')).toBe(true)
  })

  it('no resuelve movimientos sin código, ya conciliados o de contabilidad', () => {
    const res = resolverPorClasificacion([
      banco('a'),
      banco('b', { codigoId: 'DONA', estado: 'conciliada', matchId: 'x' }),
      { id: 'c', fuente: 'contabilidad', fecha: '2026-01-10', monto: -40000, descripcion: 'F', estado: 'no_conciliada', codigoId: 'GABA' },
    ])
    expect(res.find((t) => t.id === 'a')!.estado).toBe('no_conciliada')
    expect(res.find((t) => t.id === 'b')!.estado).toBe('conciliada')
    expect(res.find((t) => t.id === 'c')!.estado).toBe('no_conciliada')
  })
})
