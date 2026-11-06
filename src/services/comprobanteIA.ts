import type { Codigo, Transaccion } from '@/types/conciliacion'
import { cuerpoRUT, limpiarRUT, validarRUT } from '@/lib/rut'
import { compareTwoStrings } from 'string-similarity'
import { parsearFecha, parsearMonto } from './parseFiles'
import { detectarCodigoEnTransaccion, type DeteccionCodigo } from './categoriesEngine'
import { sugerirCodigosPorGlosa } from './clasificacionIA'
import { montosCandidatos } from './matching'

/**
 * Lectura de comprobantes de transferencia con un modelo de visión.
 *
 * El caso de uso: la cartola trae glosas genéricas ("TRASPASO FONDOS OTRO BANCO
 * EN LINEA") que no permiten deducir a qué corresponde el movimiento. El
 * comprobante sí lo dice: beneficiario, RUT y sobre todo el motivo (p. ej.
 * "REM SEPT" → Remuneraciones).
 *
 * Se reutiliza el proxy `/api/pdf`, que ya apunta a un modelo con visión y
 * mantiene la API key del lado servidor, y el renderizado de PDF de `pdfAExcel`.
 */

const ENDPOINT = import.meta.env.VITE_PDF_ENDPOINT ?? '/api/pdf'
const MODELO = import.meta.env.VITE_MODELO_PDF ?? 'deepseek/deepseek-v4-flash-vision-exp'

/** Datos extraídos de un comprobante. String vacío = no aparecía. */
export interface DatosComprobante {
  tipoDocumento: string
  /** Fecha en formato ISO (YYYY-MM-DD) o vacío. */
  fecha: string
  monto: number | null
  moneda: string
  ordenante: string
  beneficiario: string
  rutBeneficiario: string
  bancoDestino: string
  cuentaDestino: string
  /** Motivo/glosa de la transferencia: el dato que revela el código. */
  detalle: string
  numeroOperacion: string
  /** Todo el texto legible, para la detección de códigos. */
  textoVisible: string
}

export interface EvaluacionComprobante {
  montoOK: boolean
  fechaOK: boolean
  rutOK: boolean
  veredicto: 'coincide' | 'parcial' | 'no_coincide'
  diferencias: string[]
}

export interface ProgresoComprobante {
  etapa: 'renderizando' | 'leyendo'
  mensaje: string
}

const INSTRUCCIONES = `Eres un extractor experto de comprobantes de transferencia bancaria chilenos.
Recibirás la imagen de un comprobante (transferencia, depósito, pago o voucher) y debes extraer sus datos.
Responde SOLO con un objeto JSON válido, sin texto adicional ni bloques de código:
{
  "tipoDocumento": "", "fecha": "", "monto": 0, "moneda": "CLP",
  "ordenante": "", "beneficiario": "", "rutBeneficiario": "", "bancoDestino": "",
  "cuentaDestino": "", "detalle": "", "numeroOperacion": "", "textoVisible": ""
}

Reglas:
- "detalle" es el motivo, glosa o comentario de la transferencia TAL COMO aparece (por ejemplo
  "REM SEPT", "PAGO FACTURA 1234", "ARRIENDO OFICINA"). Es el dato más importante: transcríbelo literal.
- "textoVisible" debe contener TODO el texto legible de la imagen, en una sola línea.
- "fecha" en formato DD/MM/AAAA. "monto" como número, sin símbolo de moneda ni separadores de miles.
- "rutBeneficiario" con formato chileno si aparece (12.345.678-9).
- No inventes datos: deja "" (o 0 en monto) cuando no aparezcan en la imagen.`

/** Convierte la respuesta del modelo en datos normalizados. Función pura. */
export function parsearComprobante(texto: string): DatosComprobante {
  const limpio = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  let crudo: Record<string, unknown>
  try {
    crudo = JSON.parse(limpio) as Record<string, unknown>
  } catch {
    const inicio = limpio.indexOf('{')
    const fin = limpio.lastIndexOf('}')
    if (inicio === -1 || fin <= inicio) {
      throw new Error('La respuesta del modelo no contenía un JSON válido.')
    }
    crudo = JSON.parse(limpio.slice(inicio, fin + 1)) as Record<string, unknown>
  }

  const str = (v: unknown): string =>
    typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
  const montoCrudo = crudo.monto
  const monto =
    typeof montoCrudo === 'number' && Number.isFinite(montoCrudo)
      ? Math.abs(montoCrudo)
      : Math.abs(parsearMonto(str(montoCrudo)) || 0)
  const rutCrudo = limpiarRUT(str(crudo.rutBeneficiario))

  return {
    tipoDocumento: str(crudo.tipoDocumento),
    fecha: parsearFecha(str(crudo.fecha)),
    monto: monto === 0 ? null : monto,
    moneda: str(crudo.moneda) || 'CLP',
    ordenante: str(crudo.ordenante),
    beneficiario: str(crudo.beneficiario),
    rutBeneficiario: rutCrudo && validarRUT(rutCrudo) ? rutCrudo : '',
    bancoDestino: str(crudo.bancoDestino),
    cuentaDestino: str(crudo.cuentaDestino),
    detalle: str(crudo.detalle),
    numeroOperacion: str(crudo.numeroOperacion),
    textoVisible: str(crudo.textoVisible),
  }
}

/** Días de diferencia entre dos fechas ISO. */
function diasEntre(a: string, b: string): number {
  return Math.abs(
    (new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000,
  )
}

/**
 * Compara el comprobante con el movimiento de la cartola. Función pura.
 *
 * El monto debe calzar al peso (±$1) y la fecha estar a lo más a 5 días: un
 * comprobante es evidencia fuerte, así que no se admite holgura amplia.
 */
export function evaluarContraMovimiento(
  datos: DatosComprobante,
  tx: Transaccion,
): EvaluacionComprobante {
  const diferencias: string[] = []

  const montoOK = datos.monto != null && Math.abs(datos.monto - Math.abs(tx.monto)) <= 1
  if (!montoOK) {
    diferencias.push(
      datos.monto == null
        ? 'El comprobante no muestra monto.'
        : `Monto distinto: comprobante $${datos.monto.toLocaleString('es-CL')} vs movimiento $${Math.abs(tx.monto).toLocaleString('es-CL')}.`,
    )
  }

  const fechaOK = !!datos.fecha && diasEntre(datos.fecha, tx.fecha) <= 5
  if (!fechaOK) {
    diferencias.push(
      datos.fecha
        ? `Fecha distinta: comprobante ${datos.fecha} vs movimiento ${tx.fecha}.`
        : 'El comprobante no muestra fecha.',
    )
  }

  const rutOK =
    !!datos.rutBeneficiario && !!tx.rut && cuerpoRUT(datos.rutBeneficiario) === cuerpoRUT(tx.rut)
  if (datos.rutBeneficiario && tx.rut && !rutOK) {
    diferencias.push(`RUT distinto: comprobante ${datos.rutBeneficiario} vs movimiento ${tx.rut}.`)
  }

  const veredicto: EvaluacionComprobante['veredicto'] =
    montoOK && fechaOK ? 'coincide' : montoOK || fechaOK ? 'parcial' : 'no_coincide'

  return { montoOK, fechaOK, rutOK, veredicto, diferencias }
}

/** Texto del comprobante que se usa para buscar el código contable. */
export function textoParaClasificar(datos: DatosComprobante): string {
  return [datos.detalle, datos.beneficiario, datos.tipoDocumento, datos.bancoDestino]
    .filter(Boolean)
    .join(' ')
}

/** Candidato del libro que podría ser la contraparte del movimiento. */
export interface ContraparteCandidata {
  transaccion: Transaccion
  /** 0..1: fuerza de la evidencia. */
  puntaje: number
  motivos: string[]
}

/** Normaliza texto para comparar glosas. */
function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tolerancia de monto para candidatos "similares" (0,5%). */
const TOLERANCIA_CERCANA = 0.005

/**
 * Busca en los libros los documentos que podrían ser la contraparte del
 * movimiento, usando lo que reveló el comprobante: RUT, monto y detalle.
 *
 * Es la conexión que falta cuando la glosa de la cartola es genérica: el
 * comprobante dice a quién y por cuánto se transfirió, y con eso se apunta a la
 * factura correcta en vez de adivinar por monto.
 *
 * Función pura: no escribe nada, sólo propone candidatos ordenados.
 */
export function buscarContrapartes(
  datos: DatosComprobante,
  tx: Transaccion,
  todas: Transaccion[],
  opciones?: { limite?: number; toleranciaDias?: number },
): ContraparteCandidata[] {
  const limite = opciones?.limite ?? 5
  const toleranciaDias = opciones?.toleranciaDias ?? 60
  const rutComprobante = datos.rutBeneficiario ? cuerpoRUT(datos.rutBeneficiario) : ''
  const montoObjetivo = datos.monto ?? Math.abs(tx.monto)
  const fechaObjetivo = datos.fecha || tx.fecha
  const signo = Math.sign(tx.monto) || 1
  const textoObjetivo = normalizarTexto(
    [datos.detalle, datos.beneficiario, datos.textoVisible].filter(Boolean).join(' '),
  )

  const candidatos: ContraparteCandidata[] = []
  for (const c of todas) {
    if (c.fuente === tx.fuente || c.monto === 0 || c.id === tx.id) continue
    // Un documento ya conciliado con otro movimiento no puede volver a usarse.
    if (c.matchId) continue
    // El signo debe ser compatible: un cargo no calza con un abono.
    if (Math.sign(c.monto) !== signo) continue

    // `montosCandidatos` incluye las cuotas, así que un pago parcial también
    // encuentra su factura.
    const difMonto = Math.min(
      ...montosCandidatos(c).map((m) => Math.abs(Math.abs(m) - montoObjetivo)),
    )
    const montoExacto = difMonto <= 1
    const montoCercano = !montoExacto && difMonto <= montoObjetivo * TOLERANCIA_CERCANA

    const cuerpoDoc = c.rut ? cuerpoRUT(c.rut) : ''
    const rutOK = !!rutComprobante && !!cuerpoDoc && cuerpoDoc === rutComprobante
    const rutConflicto = !!rutComprobante && !!cuerpoDoc && cuerpoDoc !== rutComprobante
    // Si el RUT difiere y el monto no calza al peso, no es la contraparte.
    if (rutConflicto && !montoExacto) continue
    if (!montoExacto && !montoCercano && !rutOK) continue

    const dias = diasEntre(fechaObjetivo, c.fechaVencimiento ?? c.fecha)
    const similitud = textoObjetivo
      ? compareTwoStrings(
          textoObjetivo,
          normalizarTexto(
            [c.descripcion, c.proveedor, c.contraparte, c.folio].filter(Boolean).join(' '),
          ),
        )
      : 0

    let puntaje = 0
    const motivos: string[] = []
    if (rutOK) {
      puntaje += 0.45
      motivos.push('Mismo RUT')
    }
    if (montoExacto) {
      puntaje += 0.35
      motivos.push('Monto exacto')
    } else if (montoCercano) {
      puntaje += 0.15
      motivos.push('Monto similar')
    }
    if (dias <= toleranciaDias) {
      puntaje += 0.15
      motivos.push(`Fecha a ${dias} día(s)`)
    }
    if (similitud >= 0.5) {
      puntaje += similitud * 0.15
      motivos.push('Glosa similar')
    }

    candidatos.push({ transaccion: c, puntaje: Math.min(1, puntaje), motivos })
  }

  return candidatos.sort((a, b) => b.puntaje - a.puntaje).slice(0, limite)
}

/** Sugerencia de código: del motor local (alias/RUT) o de la IA. */
export type SugerenciaComprobante =
  | DeteccionCodigo
  | { codigo: Codigo; origen: 'ia'; confianza: number; evidencia: string }

/** Convierte una imagen suelta a data URL. */
function imagenADataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result))
    lector.onerror = () => reject(new Error('No se pudo leer la imagen del comprobante.'))
    lector.readAsDataURL(file)
  })
}

/**
 * Lee un comprobante (PDF o imagen) con el modelo de visión.
 *
 * Se envía una sola imagen: si el PDF tiene varias páginas se usa la primera,
 * porque un comprobante de transferencia es de una página.
 */
export async function leerComprobante(
  file: File,
  opciones?: { onProgreso?: (p: ProgresoComprobante) => void; signal?: AbortSignal },
): Promise<DatosComprobante> {
  const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  let imagen: string
  if (esPdf) {
    opciones?.onProgreso?.({ etapa: 'renderizando', mensaje: 'Renderizando el PDF…' })
    // Import dinámico: pdfjs sólo se descarga cuando se sube un PDF.
    const { renderizarPaginas } = await import('./pdfAExcel')
    const paginas = await renderizarPaginas(file)
    if (paginas.length === 0) throw new Error('El PDF no tiene páginas legibles.')
    imagen = paginas[0]
  } else {
    imagen = await imagenADataUrl(file)
  }

  opciones?.onProgreso?.({ etapa: 'leyendo', mensaje: 'Leyendo el comprobante con IA…' })

  const respuesta = await fetch(ENDPOINT, {
    method: 'POST',
    signal: opciones?.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0,
      max_tokens: 2000,
      enable_thinking: false,
      messages: [
        { role: 'system', content: INSTRUCCIONES },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extrae los datos de este comprobante.' },
            { type: 'image_url', image_url: { url: imagen } },
          ],
        },
      ],
    }),
  })

  if (!respuesta.ok) {
    const detalle = (await respuesta.text().catch(() => '')).slice(0, 300)
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new Error(
        `La API rechazó la credencial (${respuesta.status}). Revisa PDF_MODEL_API_KEY. ${detalle}`.trim(),
      )
    }
    if (respuesta.status === 404) {
      throw new Error(
        `Respuesta 404 desde ${ENDPOINT}. En local hace falta \`npm run dev\`. ${detalle}`.trim(),
      )
    }
    throw new Error(`El modelo respondió ${respuesta.status}. ${detalle}`.trim())
  }

  const json = (await respuesta.json()) as {
    choices?: { message?: { content?: string } }[]
    // La puerta de enlace de Cline envuelve la respuesta en `data`.
    data?: { choices?: { message?: { content?: string } }[] }
  }
  const contenido = (json.choices ?? json.data?.choices)?.[0]?.message?.content
  if (!contenido) throw new Error('El modelo no devolvió contenido.')
  return parsearComprobante(contenido)
}

/**
 * Propone el código contable del movimiento a partir del comprobante.
 *
 * Primero se prueba el motor local (alias, RUT y nombre del catálogo), que es
 * determinista y explicable; sólo si no encuentra nada se consulta a la IA.
 */
export async function sugerirCodigoDeComprobante(
  datos: DatosComprobante,
  tx: Transaccion,
  codigos: Codigo[],
  signal?: AbortSignal,
): Promise<SugerenciaComprobante | null> {
  const texto = textoParaClasificar(datos)
  const sintetica: Transaccion = {
    ...tx,
    descripcion: [texto, datos.textoVisible].filter(Boolean).join(' ').slice(0, 400),
    contraparte: datos.beneficiario || tx.contraparte,
    rut: datos.rutBeneficiario || tx.rut,
    codigoId: undefined,
    codigoOrigen: undefined,
  }

  const local = detectarCodigoEnTransaccion(sintetica, codigos)
  if (local) return local

  if (!texto) return null
  const [ia] = await sugerirCodigosPorGlosa(
    [{ glosa: texto, monto: tx.monto, rut: datos.rutBeneficiario, proveedor: datos.beneficiario }],
    codigos,
    { signal },
  )
  if (!ia?.codigoSugerido) return null
  const codigo = codigos.find((c) => c.id === ia.codigoSugerido)
  if (!codigo) return null
  return {
    codigo,
    origen: 'ia',
    confianza: ia.confianza,
    evidencia: `IA a partir del comprobante: "${datos.detalle || datos.beneficiario}"`,
  }
}
