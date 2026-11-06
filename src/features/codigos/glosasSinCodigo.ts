import type { Transaccion } from '@/types/conciliacion'

export interface GlosaSinCodigo {
  glosa: string
  count: number
}

export interface ResumenGlosasSinCodigo {
  /** Glosas distintas sin código, ordenadas por frecuencia descendente. */
  grupos: GlosaSinCodigo[]
  /** Total de transacciones sin código (suma de los conteos). */
  totalSin: number
}

/** Texto representativo de una transacción para agrupar glosas sin código. */
function glosaDe(t: Transaccion): string {
  return (t.descripcion || t.proveedor || t.contraparte || '').trim()
}

/**
 * Agrupa las transacciones sin código contable por su glosa, contando cuántas
 * comparten cada una y ordenando de la más frecuente a la menos. Las glosas
 * vacías se ignoran (no hay texto con el que asignar un código).
 */
export function agruparGlosasSinCodigo(transacciones: Transaccion[]): ResumenGlosasSinCodigo {
  const mapa = new Map<string, GlosaSinCodigo>()
  let totalSin = 0
  for (const t of transacciones) {
    if (t.codigoId) continue
    const glosa = glosaDe(t)
    if (!glosa) continue
    totalSin += 1
    const clave = glosa.toLowerCase()
    const existente = mapa.get(clave)
    if (existente) existente.count += 1
    else mapa.set(clave, { glosa, count: 1 })
  }
  return {
    grupos: [...mapa.values()].sort((a, b) => b.count - a.count),
    totalSin,
  }
}
