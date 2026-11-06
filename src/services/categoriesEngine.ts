import type { Codigo, CodigoOrigen, Transaccion } from '@/types/conciliacion'
import { cuerpoRUT } from '@/lib/rut'

const CAMPOS_METADATA_PERMITIDOS = new Set([
  'glosa_detalle',
  'tipo_movimiento',
  'motivo',
])

export interface DeteccionCodigo {
  codigo: Codigo
  origen: Exclude<CodigoOrigen, 'manual'>
  confianza: number
  evidencia: string
}

function normalizar(texto: string): string {
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function contieneFrase(texto: string, frase: string): boolean {
  const textoNormalizado = normalizar(texto)
  const fraseNormalizada = normalizar(frase)
  if (!textoNormalizado || !fraseNormalizada) return false
  return ` ${textoNormalizado} `.includes(` ${fraseNormalizada} `)
}

/** Busca un valor delimitado; nunca acepta substrings dentro de otra palabra. */
export function codigoEnDescripcion(descripcion: string, codigo: string): boolean {
  return contieneFrase(descripcion, codigo)
}

/** Un alias que tiene forma de RUT (7-8 dígitos + verificador) mapea proveedor
 *  a código de forma determinista, sin depender de la glosa. */
function esAliasRut(alias: string): boolean {
  return /^\s*\d{7,8}-?[\dkK]\s*$/i.test(alias)
}

function textoSemantico(tx: Transaccion): string {
  const partes = [tx.descripcion, tx.contraparte, tx.proveedor]
  for (const [campo, valor] of Object.entries(tx.metadatos ?? {})) {
    if (CAMPOS_METADATA_PERMITIDOS.has(campo) && typeof valor === 'string') {
      partes.push(valor)
    }
  }
  return partes.filter(Boolean).join(' ')
}

/** Texto normalizado con un espacio a cada lado, para buscar frases delimitadas. */
const acolchar = (normalizado: string): string => ` ${normalizado} `

/** Primera palabra de una frase normalizada ('' si está vacía). */
const primeraPalabra = (normalizado: string): string => normalizado.split(' ')[0] ?? ''

/** Código con los textos ya normalizados, para no repetirlo por transacción. */
interface CodigoPreparado {
  codigo: Codigo
  id: string
  idNorm: string
  idAcolchado: string
  primeraId: string
  nombre: string
  nombreNorm: string
  nombreAcolchado: string
  primeraNombre: string
  /** Alias de texto (no RUT) ya acolchados, con su primera palabra. */
  aliasTexto: { original: string; acolchado: string; primera: string }[]
  /** Alias con forma de RUT, ya recortados. */
  aliasRut: string[]
}

/**
 * Precalcula lo que antes se recalculaba para CADA transacción: normalizar el
 * id, el nombre y los alias de cada código, y dejarlos listos para comparar.
 * Con decenas de miles de movimientos × 55 códigos eso eran millones de
 * normalizaciones y de concatenaciones por corrida.
 */
function prepararCodigos(codigos: Codigo[]): CodigoPreparado[] {
  return codigos
    .filter((codigo) => codigo.activo)
    .map((codigo) => {
      const nombre = codigo.nombre.trim()
      const nombreNorm = normalizar(nombre)
      const idNorm = normalizar(codigo.id)
      const aliasTexto: { original: string; acolchado: string; primera: string }[] = []
      const aliasRut: string[] = []
      for (const valor of codigo.aliases) {
        const original = valor.trim()
        if (!original) continue
        if (esAliasRut(original)) {
          aliasRut.push(original)
          continue
        }
        const norm = normalizar(original)
        if (norm.length >= 4) {
          aliasTexto.push({ original, acolchado: acolchar(norm), primera: primeraPalabra(norm) })
        }
      }
      return {
        codigo,
        id: codigo.id,
        idNorm,
        idAcolchado: acolchar(idNorm),
        primeraId: primeraPalabra(idNorm),
        nombre,
        nombreNorm,
        nombreAcolchado: acolchar(nombreNorm),
        primeraNombre: primeraPalabra(nombreNorm),
        aliasTexto,
        aliasRut,
      }
    })
}

/** Índice normalizado (id y clave) para resolver una referencia explícita. */
function mapaReferencias(preparados: CodigoPreparado[]): Map<string, Codigo[]> {
  const mapa = new Map<string, Codigo[]>()
  const agregar = (clave: string, codigo: Codigo) => {
    if (!clave) return
    const lista = mapa.get(clave) ?? []
    if (!lista.includes(codigo)) lista.push(codigo)
    mapa.set(clave, lista)
  }
  for (const preparado of preparados) {
    agregar(preparado.idNorm, preparado.codigo)
    agregar(normalizar(preparado.codigo.clave ?? ''), preparado.codigo)
  }
  return mapa
}

/** Igual que `contieneFrase`, pero con el texto ya acolchado y la frase lista. */
function contieneFraseAcolchada(textoAcolchado: string, fraseAcolchada: string): boolean {
  return fraseAcolchada.length > 2 && textoAcolchado.includes(fraseAcolchada)
}

function candidatosAutomaticos(
  tx: Transaccion,
  preparados: CodigoPreparado[],
  referencias: Map<string, Codigo[]>,
): DeteccionCodigo[] {
  const refMetadata = typeof tx.metadatos?.codigo_contable === 'string'
    ? tx.metadatos.codigo_contable.trim()
    : ''
  // La referencia persistida en metadatos permite reconstruir la clasificación
  // explícita tras recargar los datos, cuando codigoReferencia ya no existe.
  const explicito = tx.codigoReferencia?.trim() || refMetadata
  if (explicito) {
    const valor = normalizar(explicito)
    const coincidencias = (valor ? referencias.get(valor) : undefined) ?? []
    const codigo = coincidencias.length === 1 ? coincidencias[0] : null
    return codigo
      ? [{ codigo, origen: 'explicito', confianza: 1, evidencia: explicito }]
      : []
  }

  // El texto se normaliza y se acolcha UNA sola vez por transacción (antes se
  // reconstruía en cada comparación, una por código). El set de palabras evita
  // la búsqueda cara cuando la primera palabra de la frase ni aparece.
  const texto = acolchar(normalizar(textoSemantico(tx)))
  const palabras = new Set(texto.split(' '))
  const cuerpoRutTx = tx.rut ? cuerpoRUT(tx.rut) : ''
  const candidatos: DeteccionCodigo[] = []
  for (const preparado of preparados) {
    // El RUT del proveedor/cliente es la evidencia más fiable: un alias con
    // forma de RUT que calza con el documento asigna el código directamente.
    if (cuerpoRutTx) {
      const aliasRut = preparado.aliasRut.find((valor) => cuerpoRUT(valor) === cuerpoRutTx)
      if (aliasRut) {
        candidatos.push({
          codigo: preparado.codigo,
          origen: 'alias',
          confianza: 0.96,
          evidencia: `RUT ${aliasRut}`,
        })
        continue
      }
    }
    if (
      palabras.has(preparado.primeraId) &&
      contieneFraseAcolchada(texto, preparado.idAcolchado)
    ) {
      candidatos.push({
        codigo: preparado.codigo,
        origen: 'id',
        confianza: 0.98,
        evidencia: preparado.id,
      })
      continue
    }
    // Las claves sólo se aceptan en la columna explícita. Buscar números
    // sueltos en glosas confunde claves contables con folios o códigos SII.
    const alias = preparado.aliasTexto.find(
      (item) => palabras.has(item.primera) && contieneFraseAcolchada(texto, item.acolchado),
    )
    if (alias) {
      candidatos.push({
        codigo: preparado.codigo,
        origen: 'alias',
        confianza: 0.88,
        evidencia: alias.original,
      })
      continue
    }
    if (
      preparado.nombreNorm.length >= 8 &&
      palabras.has(preparado.primeraNombre) &&
      contieneFraseAcolchada(texto, preparado.nombreAcolchado)
    ) {
      candidatos.push({
        codigo: preparado.codigo,
        origen: 'nombre',
        confianza: 0.72,
        evidencia: preparado.nombre,
      })
    }
  }

  // Un perfil documental es una evidencia estructurada y se usa como fallback.
  // No se asigna un código genérico a Compras: ese libro mezcla mercaderías,
  // servicios, activos y gastos que requieren evidencia adicional.
  const perfil = tx.metadatos?.perfil_archivo
  const codigoPerfil = typeof perfil === 'string'
    ? ({
        ventas: 'IVEN',
        nota_credito: 'IVEN',
        factoring: 'FACT',
      } as Record<string, string>)[perfil]
    : undefined
  const codigoEstructurado = codigoPerfil
    ? preparados.find((preparado) => preparado.codigo.id === codigoPerfil)?.codigo
    : undefined
  if (codigoEstructurado) {
    candidatos.push({
      codigo: codigoEstructurado,
      origen: 'perfil',
      confianza: 0.7,
      evidencia: `Perfil de archivo: ${String(perfil)}`,
    })
  }

  return candidatos
}

/**
 * Núcleo de la detección sobre códigos ya preparados. Permite reutilizar el
 * preprocesamiento cuando se clasifican miles de movimientos.
 */
function detectarConPreparados(
  tx: Transaccion,
  preparados: CodigoPreparado[],
  referencias: Map<string, Codigo[]>,
): DeteccionCodigo | null {
  if (tx.codigoOrigen === 'manual' && tx.codigoId) {
    const manual = preparados.find((preparado) => preparado.codigo.id === tx.codigoId)?.codigo
    return manual
      ? { codigo: manual, origen: 'explicito', confianza: 1, evidencia: tx.codigoEvidencia ?? 'Manual' }
      : null
  }

  const candidatos = candidatosAutomaticos(tx, preparados, referencias)
  candidatos.sort((a, b) =>
    b.confianza - a.confianza ||
    b.evidencia.length - a.evidencia.length ||
    a.codigo.prioridad - b.codigo.prioridad,
  )
  const primero = candidatos[0]
  if (!primero) return null
  const segundo = candidatos[1]
  if (
    segundo &&
    segundo.confianza === primero.confianza &&
    segundo.evidencia.length === primero.evidencia.length &&
    segundo.codigo.prioridad === primero.codigo.prioridad
  ) return null
  return primero
}

/** Detecta un código revisando todas las coincidencias y rechazando empates. */
export function detectarCodigoEnTransaccion(
  tx: Transaccion,
  codigos: Codigo[],
): DeteccionCodigo | null {
  const preparados = prepararCodigos(codigos)
  return detectarConPreparados(tx, preparados, mapaReferencias(preparados))
}

/** Compatibilidad para consumidores que sólo disponen de una descripción. */
export function detectarCodigo(descripcion: string, codigos: Codigo[]): Codigo | null {
  const deteccion = detectarCodigoEnTransaccion({
    id: 'preview', fuente: 'contabilidad', fecha: '', monto: 0,
    descripcion, estado: 'no_conciliada',
  }, codigos)
  return deteccion?.codigo ?? null
}

/** Asigna código, origen, confianza y evidencia sin confundirlo con categoría. */
export function aplicarCodigos(
  transacciones: Transaccion[],
  codigos: Codigo[],
): Transaccion[] {
  // Se prepara una sola vez para todo el lote; antes se recalculaba por fila.
  const preparados = prepararCodigos(codigos)
  const referencias = mapaReferencias(preparados)
  const porId = new Map(codigos.map((codigo) => [codigo.id, codigo]))
  return transacciones.map((tx) => {
    const anterior = tx.codigoId ? porId.get(tx.codigoId) : undefined
    if (tx.codigoOrigen === 'manual' && tx.codigoId) {
      const codigo = anterior?.activo ? anterior : undefined
      if (!codigo) {
        return {
          ...tx,
          categoria: anterior?.categoria === tx.categoria ? undefined : tx.categoria,
          codigoId: undefined,
          codigoOrigen: undefined,
          codigoConfianza: undefined,
          codigoEvidencia: undefined,
        }
      }
      return { ...tx, categoria: codigo.categoria ?? tx.categoria }
    }

    const deteccion = detectarConPreparados(tx, preparados, referencias)
    if (!deteccion) {
      return {
        ...tx,
        categoria: anterior?.categoria === tx.categoria ? undefined : tx.categoria,
        codigoId: undefined,
        codigoOrigen: undefined,
        codigoConfianza: undefined,
        codigoEvidencia: undefined,
      }
    }
    return {
      ...tx,
      codigoId: deteccion.codigo.id,
      codigoOrigen: deteccion.origen,
      codigoConfianza: deteccion.confianza,
      codigoEvidencia: deteccion.evidencia,
      categoria: deteccion.codigo.categoria ?? tx.categoria,
    }
  })
}

/**
 * Copia un código a la contraparte 1:1 confirmada cuando sólo uno de los dos
 * movimientos tiene clasificación. Nunca reemplaza códigos existentes.
 */
export function propagarCodigosConciliados(
  transacciones: Transaccion[],
  codigos: Codigo[],
): Transaccion[] {
  const porId = new Map(transacciones.map((tx) => [tx.id, tx]))
  const activos = new Map(codigos.filter((codigo) => codigo.activo).map((codigo) => [codigo.id, codigo]))

  return transacciones.map((tx) => {
    if (tx.codigoId || tx.estado !== 'conciliada' || !tx.matchId) return tx
    const contraparte = porId.get(tx.matchId)
    if (
      !contraparte?.codigoId ||
      contraparte.estado !== 'conciliada' ||
      contraparte.matchId !== tx.id
    ) return tx
    const codigo = activos.get(contraparte.codigoId)
    if (!codigo) return tx
    const confianzaCodigo = contraparte.codigoConfianza ?? 1
    const confianzaMatch = Math.min(tx.confianza ?? 1, contraparte.confianza ?? 1)
    return {
      ...tx,
      codigoId: codigo.id,
      codigoOrigen: 'contraparte',
      codigoConfianza: Math.min(confianzaCodigo, confianzaMatch),
      codigoEvidencia: `Contraparte conciliada: ${contraparte.codigoEvidencia ?? codigo.id}`,
      categoria: codigo.categoria ?? tx.categoria,
    }
  })
}

/**
 * Propaga el código por RUT: cada proveedor/cliente suele corresponder siempre
 * al mismo código contable. Cuando algún documento de un RUT ya tiene código de
 * origen confiable (manual, explícito o detectado), se copia a los demás
 * documentos del mismo RUT que estén sin clasificar. Así basta clasificar un
 * proveedor una vez para que todos sus documentos —de ésta y futuras
 * importaciones— queden codificados automáticamente al importar.
 *
 * Sólo rellena documentos sin código: nunca pisa una detección o asignación
 * previa. Si un RUT tiene códigos en conflicto, no propaga (evita adivinar).
 */
export function propagarCodigosPorRut(
  transacciones: Transaccion[],
  codigos: Codigo[],
): Transaccion[] {
  const activos = new Map(
    codigos.filter((codigo) => codigo.activo).map((codigo) => [codigo.id, codigo]),
  )
  // Peso por confiabilidad del origen que puede servir de ancla.
  const PESO: Partial<Record<CodigoOrigen, number>> = {
    manual: 5, explicito: 4, id: 3, alias: 2, nombre: 1,
  }

  interface Voto { codigoId: string; peso: number; freq: number }
  const votosPorRut = new Map<string, Map<string, Voto>>()
  for (const tx of transacciones) {
    if (!tx.rut || !tx.codigoId) continue
    const peso = PESO[tx.codigoOrigen ?? 'perfil']
    if (!peso || !activos.has(tx.codigoId)) continue
    const clave = cuerpoRUT(tx.rut)
    if (!clave) continue
    const votos = votosPorRut.get(clave) ?? new Map<string, Voto>()
    const voto = votos.get(tx.codigoId) ?? { codigoId: tx.codigoId, peso: 0, freq: 0 }
    voto.peso = Math.max(voto.peso, peso)
    voto.freq += 1
    votos.set(tx.codigoId, voto)
    votosPorRut.set(clave, votos)
  }

  const elegidoPorRut = new Map<string, string>()
  for (const [rut, votos] of votosPorRut) {
    const ordenados = [...votos.values()].sort(
      (a, b) => b.peso - a.peso || b.freq - a.freq,
    )
    const ganador = ordenados[0]
    const segundo = ordenados[1]
    // Sólo propaga si hay un ganador claro (mejor origen o más frecuente).
    if (!segundo || ganador.peso > segundo.peso || ganador.freq > segundo.freq) {
      elegidoPorRut.set(rut, ganador.codigoId)
    }
  }
  if (elegidoPorRut.size === 0) return transacciones

  return transacciones.map((tx) => {
    if (tx.codigoId || !tx.rut) return tx
    const codigoId = elegidoPorRut.get(cuerpoRUT(tx.rut))
    if (!codigoId) return tx
    const codigo = activos.get(codigoId)
    if (!codigo) return tx
    return {
      ...tx,
      codigoId: codigo.id,
      codigoOrigen: 'rut',
      codigoConfianza: 0.85,
      codigoEvidencia: `Mismo RUT que un documento clasificado (${codigo.id})`,
      categoria: codigo.categoria ?? tx.categoria,
    }
  })
}

/**
 * Códigos cuyo movimiento bancario SIEMPRE debería calzar con un documento
 * (factura de compra/venta, factoring): no se auto-resuelven, para que un pago
 * a proveedor/cliente sin match siga visible como brecha por conciliar.
 */
export const CODIGOS_CON_DOCUMENTO: ReadonlySet<string> = new Set([
  'COVE', 'IVEN', 'MER', 'FACT',
])

/**
 * Marca como 'resuelta' los movimientos bancarios sin contraparte que ya están
 * explicados por su código de tesorería (comisiones, impuestos, traspasos,
 * intereses, donaciones, etc.). No toca:
 *  - documentos de contabilidad (una factura sin pago sigue no conciliada),
 *  - movimientos ya conciliados o resueltos,
 *  - movimientos con código ligado a documento (COVE/IVEN/MER/FACT), que deben
 *    calzar con una factura y por eso permanecen visibles como pendientes.
 */
export function resolverPorClasificacion(
  transacciones: Transaccion[],
): Transaccion[] {
  return transacciones.map((tx) => {
    if (tx.fuente !== 'banco') return tx
    if (tx.estado !== 'no_conciliada' || tx.matchId) return tx
    if (!tx.codigoId || CODIGOS_CON_DOCUMENTO.has(tx.codigoId)) return tx
    return { ...tx, estado: 'resuelta', matchId: undefined, confianza: undefined }
  })
}

export interface ResumenCodigoDetectado {
  nombre: string
  categoria: string | undefined
  count: number
  origenes: Partial<Record<CodigoOrigen, number>>
  evidencias: string[]
}

export function resumenCodigosDetectados(
  transacciones: Transaccion[],
  codigos: Codigo[],
): Record<string, ResumenCodigoDetectado> {
  const resumen: Record<string, ResumenCodigoDetectado> = {}
  const preparados = prepararCodigos(codigos)
  const referencias = mapaReferencias(preparados)
  for (const tx of transacciones) {
    const deteccion = detectarConPreparados(tx, preparados, referencias)
    if (!deteccion) continue
    const { codigo, origen, evidencia } = deteccion
    resumen[codigo.id] ??= {
      nombre: codigo.nombre,
      categoria: codigo.categoria,
      count: 0,
      origenes: {},
      evidencias: [],
    }
    const item = resumen[codigo.id]
    item.count += 1
    item.origenes[origen] = (item.origenes[origen] ?? 0) + 1
    if (!item.evidencias.includes(evidencia) && item.evidencias.length < 3) {
      item.evidencias.push(evidencia)
    }
  }
  return resumen
}
