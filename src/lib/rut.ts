/**
 * Utilidades para el RUT chileno (Rol Único Tributario).
 * Implementa cálculo del dígito verificador mediante módulo 11.
 */

/** Limpia un RUT quitando puntos, espacios y guion. Devuelve solo dígitos + DV. */
export function limpiarRUT(rut: string): string {
  return (rut ?? '').toString().replace(/[^0-9kK]/g, '').toUpperCase()
}

/**
 * Calcula el dígito verificador de un cuerpo de RUT (sin DV) usando módulo 11.
 * @param cuerpo Solo los dígitos (sin dígito verificador).
 * @returns Dígito verificador: '0'..'9' o 'K'.
 */
export function calcularDV(cuerpo: string): string {
  let suma = 0
  let mul = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mul
    mul = mul === 7 ? 2 : mul + 1
  }
  const resto = suma % 11
  const dv = 11 - resto
  if (dv === 11) return '0'
  if (dv === 10) return 'K'
  return dv.toString()
}

/** Valida si un RUT es correcto (formato + dígito verificador). */
export function validarRUT(rut: string): boolean {
  const limpio = limpiarRUT(rut)
  if (limpio.length < 2) return false
  const cuerpo = limpio.slice(0, -1)
  const dv = limpio.slice(-1)
  if (!/^\d+$/.test(cuerpo)) return false
  return calcularDV(cuerpo) === dv
}

/**
 * Formatea un RUT al estilo chileno: "12.345.678-9".
 * Acepta entradas con o sin formato. No valida (solo formatea).
 */
export function formatRUT(rut: string): string {
  const limpio = limpiarRUT(rut)
  if (limpio.length < 2) return rut ?? ''
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const dv = limpio.slice(-1)
  return `${cuerpo}-${dv}`
}

/** Devuelve solo el cuerpo del RUT (sin DV), útil para matching. */
export function cuerpoRUT(rut: string): string {
  const limpio = limpiarRUT(rut)
  if (limpio.length < 2) return ''
  // Se quitan ceros a la izquierda para que el RUT de una glosa bancaria
  // ("078187230-K") compare igual que el del libro ("78187230K").
  const cuerpo = limpio.slice(0, -1).replace(/^0+/, '')
  return cuerpo === '' ? '0' : cuerpo
}

/**
 * Recupera un RUT válido embebido en un texto libre (glosa de cartola).
 *
 * Las cartolas no traen columna de RUT, pero muchas glosas lo incluyen:
 *   "PAGO RECIBIDO PRV 078187230-K BCO CHILE"
 *   "0762531143 Transf. AGENCIA FORZA S"
 *   "Transfer a M.AVENDANO ARR"
 * Ese RUT es la única llave dura que cruza con los libros, así que conviene
 * recuperarlo.
 *
 * Se exige que el dígito verificador sea correcto (módulo 11); sin eso, los
 * números de operación del banco (por ejemplo "1331863784") se confundirían
 * con RUT.
 *
 * @returns RUT normalizado (dígitos sin ceros a la izquierda + DV) o undefined.
 */
export function extraerRUTDeTexto(texto: string): string | undefined {
  if (!texto) return undefined
  // Cuerpo con puntos (12.345.678), o de 7 a 9 dígitos (el relleno de ceros a
  // la izquierda es habitual en las cartolas). El DV es opcionalmente
  // precedido por guion y nunca puede ir pegado a más dígitos.
  const patron = /(?:^|[^0-9kK])(\d{1,3}(?:\.\d{3}){2}|\d{7,9})\s*-?\s*([\dkK])(?![0-9kK])/g
  let coincidencia: RegExpExecArray | null
  while ((coincidencia = patron.exec(texto)) !== null) {
    const cuerpo = coincidencia[1].replace(/\./g, '')
    const dv = coincidencia[2].toUpperCase()
    const candidato = `${cuerpo}${dv}`
    if (validarRUT(candidato)) {
      const cuerpoSinCeros = String(Number(cuerpo))
      return `${cuerpoSinCeros}${dv}`
    }
  }
  return undefined
}
