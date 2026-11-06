import type { Regla, Transaccion } from '@/types/conciliacion'

/** Evalúa si una transacción cumple la condición de una regla. */
export function cumpleRegla(tx: Transaccion, regla: Regla): boolean {
  const valor = regla.valor?.toLowerCase().trim() ?? ''
  const campoStr = String(tx[regla.campo] ?? '').toLowerCase()

  switch (regla.operador) {
    case 'contiene':
      return campoStr.includes(valor)
    case 'no_contiene':
      return !campoStr.includes(valor)
    case 'es_igual':
      return campoStr === valor
    case 'comienza_con':
      return campoStr.startsWith(valor)
    case 'termina_con':
      return campoStr.endsWith(valor)
    case 'mayor_que':
      return tx.monto > Number(regla.valor)
    case 'menor_que':
      return tx.monto < Number(regla.valor)
    case 'monto_positivo':
      return tx.monto > 0
    case 'monto_negativo':
      return tx.monto < 0
    default:
      return false
  }
}

/**
 * Aplica las reglas activas (ordenadas por prioridad) a las transacciones.
 * Solo asigna categoría; la conciliación siempre exige contraparte real.
 * @returns copia de transacciones con categoría actualizada.
 */
export function aplicarReglas(
  transacciones: Transaccion[],
  reglas: Regla[],
): Transaccion[] {
  const activas = [...reglas].filter((r) => r.activa).sort((a, b) => a.prioridad - b.prioridad)

  return transacciones.map((tx) => {
    // Una categoría manual o aportada por un código tiene prioridad. Las
    // reglas sólo completan transacciones todavía sin categoría.
    if (tx.categoria) return tx
    for (const regla of activas) {
      if (cumpleRegla(tx, regla) && regla.accion.asignarCategoria) {
        return { ...tx, categoria: regla.accion.asignarCategoria }
      }
    }
    return tx
  })
}
