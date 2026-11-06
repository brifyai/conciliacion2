/**
 * Esquema y normalización de la cartola bancaria para la conversión PDF a Excel.
 * Aislado de `pdfAExcel.ts` (que importa pdf.js y sólo corre en el navegador)
 * para poder probar la lógica pura sin DOM.
 */

/** Moneda de la cartola. La mayoría son CLP; Global 66 viene en USD. */
export type Moneda = 'CLP' | 'USD'

/** Columnas fijas de la cartola, en el orden del Excel de salida. */
export function columnasCartola(moneda: Moneda): string[] {
  return [
    'Fecha',
    'Descripción',
    'Tipo Movimiento',
    'Glosa Detalle',
    'N° Referencia',
    'RUT Contraparte',
    'Nombre Contraparte',
    `Cargo (${moneda})`,
    `Abono (${moneda})`,
    `Saldo (${moneda})`,
  ]
}

/** ¿El encabezado corresponde a una columna de monto (Cargo/Abono/Saldo)? */
export function esColumnaMonto(header: string): boolean {
  return /\((?:CLP|USD)\)\s*$/.test(header)
}

/** Deduce la moneda a partir del sufijo del encabezado. */
export function monedaDeColumna(header: string): Moneda {
  return header.includes('(USD)') ? 'USD' : 'CLP'
}

/** Convierte un movimiento del modelo en una fila con el orden de las columnas. */
export function filaDeMovimiento(item: unknown): string[] {
  const o = (item ?? {}) as Record<string, unknown>
  const s = (v: unknown): string => (v == null ? '' : String(v).trim())
  return [
    s(o.fecha),
    s(o.descripcion),
    s(o.tipoMovimiento),
    s(o.glosaDetalle),
    s(o.referencia),
    s(o.rut),
    s(o.nombre),
    s(o.cargo),
    s(o.abono),
    s(o.saldo),
  ]
}

/** Extrae las filas de movimientos de la respuesta del modelo, descartando vacías. */
export function extraerMovimientos(bruto: unknown): string[][] {
  const raiz = (bruto ?? {}) as Record<string, unknown>
  const lista = Array.isArray(raiz.movimientos) ? raiz.movimientos : []
  return lista.map(filaDeMovimiento).filter((fila) => fila.some((celda) => celda !== ''))
}

/**
 * Convierte un monto a número según la moneda.
 * - CLP: entero, se descartan todos los separadores (no hay decimales).
 * - USD: conserva decimales; el último separador ("," o ".") es el decimal y
 *   el otro se trata como separador de miles.
 */
export function aNumero(valor: string, moneda: Moneda): number | null {
  const bruto = valor.trim()
  if (!bruto) return null

  if (moneda === 'CLP') {
    const limpio = bruto.replace(/[^\d-]/g, '')
    if (!limpio || limpio === '-') return null
    const numero = Number(limpio)
    return Number.isFinite(numero) ? numero : null
  }

  let s = bruto.replace(/[^\d.,-]/g, '')
  const negativo = s.startsWith('-')
  s = s.replace(/-/g, '')
  if (!s) return null
  const ultimaComa = s.lastIndexOf(',')
  const ultimoPunto = s.lastIndexOf('.')
  const decimal = ultimaComa > ultimoPunto ? ',' : ultimoPunto > ultimaComa ? '.' : ''
  if (decimal) {
    const miles = decimal === ',' ? '.' : ','
    s = s.split(miles).join('').replace(decimal, '.')
  }
  if (!s || s === '.') return null
  const numero = Number((negativo ? '-' : '') + s)
  return Number.isFinite(numero) ? numero : null
}
