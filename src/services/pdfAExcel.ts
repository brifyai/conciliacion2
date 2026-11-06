import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type ExcelJS from 'exceljs'
import {
  aNumero,
  columnasCartola,
  esColumnaMonto,
  extraerMovimientos,
  monedaDeColumna,
  type Moneda,
} from './pdfCartola'

// pdf.js necesita un worker; en Vite se resuelve como URL del bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Proxy propio del PDF a Excel (`/api/pdf`), con su proveedor y API key aparte
 * de la inspección/clasificación. La key vive sólo en el servidor.
 */
const ENDPOINT = import.meta.env.VITE_PDF_ENDPOINT ?? '/api/pdf'
/**
 * Modelo de visión usado para leer las páginas del PDF. Es su propia variable
 * (`VITE_MODELO_PDF`) para no interferir con `VITE_CLINEPASS_MODEL`, que usan la
 * inspección y la clasificación de códigos. Debe aceptar imágenes (visión).
 */
export const MODELO = import.meta.env.VITE_MODELO_PDF ?? 'deepseek/deepseek-v4-flash-vision-exp'

/**
 * Páginas por llamada al modelo. Lotes chicos evitan que cada invocación de la
 * función serverless (límite ~60s en Vercel) exceda el tiempo y dé 504.
 */
const PAGINAS_POR_LOTE = 2
/** Ancho máximo del render en px, para acotar el tamaño de cada imagen. */
const ANCHO_MAX = 1600

export interface TablaExtraida {
  nombre: string
  encabezados: string[]
  filas: string[][]
}

export interface ProgresoConversion {
  etapa: 'renderizando' | 'analizando' | 'construyendo'
  actual: number
  total: number
}

/** Renderiza cada página del PDF a una imagen JPEG (data URL). */
export async function renderizarPaginas(
  file: File,
  onProgress?: (p: ProgresoConversion) => void,
): Promise<string[]> {
  const datos = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data: datos }).promise
  const imagenes: string[] = []
  for (let numero = 1; numero <= pdf.numPages; numero += 1) {
    const pagina = await pdf.getPage(numero)
    const base = pagina.getViewport({ scale: 1 })
    // Escala para acercarse a ANCHO_MAX sin pasarse (máx 2.5x para nitidez).
    const escala = Math.min(2.5, ANCHO_MAX / base.width)
    const viewport = pagina.getViewport({ scale: escala })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const contexto = canvas.getContext('2d')
    if (!contexto) throw new Error('No se pudo preparar el lienzo para renderizar el PDF.')
    await pagina.render({ canvasContext: contexto, viewport }).promise
    imagenes.push(canvas.toDataURL('image/jpeg', 0.9))
    onProgress?.({ etapa: 'renderizando', actual: numero, total: pdf.numPages })
  }
  return imagenes
}

const INSTRUCCIONES = `Eres un extractor experto de cartolas bancarias chilenas desde imágenes.
Recibirás una o más imágenes que son páginas consecutivas de una cartola bancaria (extracto de
cuenta corriente). Extrae TODOS los movimientos, en orden, y normaliza cada uno a estos campos:

- "fecha": fecha del movimiento en formato DD/MM/AAAA.
- "descripcion": descripción general del movimiento (p. ej. "Transferencia enviada",
  "Transferencia recibida", "Cargo", "Abono", "Comisión").
- "tipoMovimiento": tipo específico si se distingue (p. ej. "Vale Vista", "Cheque",
  "Pago Proveedor", "Cobro Cliente", "Transferencia").
- "glosaDetalle": la glosa o detalle tal como aparece en la cartola.
- "referencia": número de referencia, operación o documento si aparece.
- "rut": RUT de la contraparte con formato chileno (12.345.678-9) si aparece.
- "nombre": nombre o razón social de la contraparte si aparece.
- "cargo": monto del cargo/egreso/débito como número, sin símbolo ni separadores de miles. Vacío si no aplica.
- "abono": monto del abono/ingreso/crédito como número, sin símbolo ni separadores de miles. Vacío si no aplica.
- "saldo": saldo posterior como número, sin símbolo ni separadores de miles. Vacío si no aparece.

Reglas:
- Cada movimiento va en "cargo" O en "abono", nunca en ambos: si es egreso/débito usa "cargo";
  si es ingreso/crédito usa "abono".
- Montos SIN símbolo de moneda y SIN separadores de miles; usa punto (.) como separador decimal.
  Si la cartola es en CLP los montos son enteros (ej: 1615544). Si es en USD conserva los
  decimales (ej: 580.24).
- No inventes datos: deja el campo en "" si no está visible en la imagen.
- No resumas ni omitas filas; incluye todos los movimientos de todas las páginas.

Responde SOLO con un objeto JSON válido, sin texto adicional ni bloques de código:
{
  "movimientos": [
    {
      "fecha": "", "descripcion": "", "tipoMovimiento": "", "glosaDetalle": "",
      "referencia": "", "rut": "", "nombre": "", "cargo": "", "abono": "", "saldo": ""
    }
  ]
}`

function extraerJSON(texto: string): unknown {
  const limpio = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(limpio)
  } catch {
    const inicio = limpio.indexOf('{')
    const fin = limpio.lastIndexOf('}')
    if (inicio === -1 || fin <= inicio) {
      throw new Error('La respuesta del modelo no contenía un JSON válido.')
    }
    return JSON.parse(limpio.slice(inicio, fin + 1))
  }
}

/** Llama al modelo de visión con un lote de imágenes y devuelve sus movimientos. */
async function analizarLote(
  imagenes: string[],
  moneda: Moneda,
  señal?: AbortSignal,
): Promise<string[][]> {
  const contenido: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: `Esta cartola está en ${moneda}. Extrae los movimientos de estas páginas `
        + `respetando los decimales del monto según esa moneda.`,
    },
    ...imagenes.map((url) => ({ type: 'image_url', image_url: { url } })),
  ]

  const respuesta = await fetch(ENDPOINT, {
    method: 'POST',
    signal: señal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0,
      max_tokens: 8000,
      // deepseek-v4-flash-vision-exp es un modelo de razonamiento; para extraer
      // tablas no necesitamos "thinking", y desactivarlo reduce la latencia ~3x
      // (evita los timeouts 504 de la función serverless).
      enable_thinking: false,
      messages: [
        { role: 'system', content: INSTRUCCIONES },
        { role: 'user', content: contenido },
      ],
    }),
  })

  if (!respuesta.ok) {
    const detalle = (await respuesta.text().catch(() => '')).slice(0, 400)
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new Error(
        `La API rechazó la credencial (${respuesta.status}). Revisa PDF_MODEL_API_KEY ` +
        `en .env (local) o en Vercel, y reinicia/redeploy. ${detalle}`.trim(),
      )
    }
    if (respuesta.status === 404) {
      // Puede ser la función/proxy no desplegada, o un 404 del propio proveedor
      // (modelo o ruta inexistente). El detalle distingue ambos casos.
      throw new Error(
        `Respuesta 404 desde ${ENDPOINT}. Si el detalle está vacío, la función /api/pdf ` +
        `no está desplegada (falta \`npm run dev\` en local, o redeploy en Vercel); si trae ` +
        `un mensaje, es el proveedor (modelo o ruta inexistente). ${detalle}`.trim(),
      )
    }
    throw new Error(`El modelo respondió ${respuesta.status}. ${detalle}`.trim())
  }

  const json = await respuesta.json() as {
    choices?: { message?: { content?: string } }[]
    // La puerta de enlace de Cline envuelve la respuesta en `data`.
    data?: { choices?: { message?: { content?: string } }[] }
  }
  const texto = (json.choices ?? json.data?.choices)?.[0]?.message?.content
  if (!texto) throw new Error('El modelo no devolvió contenido.')
  return extraerMovimientos(extraerJSON(texto))
}

/**
 * Convierte una cartola en PDF a una tabla normalizada: renderiza sus páginas,
 * las envía por lotes al modelo de visión y concatena los movimientos en el
 * esquema fijo de cartola. Devuelve siempre una sola tabla.
 */
export async function extraerTablasDePdf(
  file: File,
  opciones?: { moneda?: Moneda; onProgress?: (p: ProgresoConversion) => void; signal?: AbortSignal },
): Promise<TablaExtraida[]> {
  const moneda: Moneda = opciones?.moneda ?? 'CLP'
  const imagenes = await renderizarPaginas(file, opciones?.onProgress)
  if (imagenes.length === 0) throw new Error('El PDF no tiene páginas legibles.')

  const filas: string[][] = []
  const totalLotes = Math.ceil(imagenes.length / PAGINAS_POR_LOTE)
  for (let lote = 0; lote < totalLotes; lote += 1) {
    const desde = lote * PAGINAS_POR_LOTE
    const paginas = imagenes.slice(desde, desde + PAGINAS_POR_LOTE)
    opciones?.onProgress?.({ etapa: 'analizando', actual: lote + 1, total: totalLotes })
    filas.push(...await analizarLote(paginas, moneda, opciones?.signal))
  }

  if (filas.length === 0) return []
  return [{ nombre: 'Cartola', encabezados: columnasCartola(moneda), filas }]
}

/** Sanea el nombre de una hoja de Excel (máx 31 chars, sin caracteres inválidos). */
function nombreHoja(nombre: string, indice: number): string {
  const limpio = nombre.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28)
  return limpio || `Tabla ${indice + 1}`
}

/** Construye un Excel (.xlsx) con una hoja por tabla; montos como número. */
export async function construirExcel(tablas: TablaExtraida[]): Promise<Blob> {
  const { default: ExcelJSRuntime } = await import('exceljs')
  const wb: ExcelJS.Workbook = new ExcelJSRuntime.Workbook()
  wb.creator = 'Conciliación bancaria · PDF a Excel'
  wb.created = new Date()

  const usados = new Set<string>()
  tablas.forEach((tabla, indice) => {
    let nombre = nombreHoja(tabla.nombre, indice)
    let sufijo = 2
    while (usados.has(nombre.toLowerCase())) {
      nombre = `${nombreHoja(tabla.nombre, indice).slice(0, 24)} (${sufijo})`
      sufijo += 1
    }
    usados.add(nombre.toLowerCase())

    const ws = wb.addWorksheet(nombre)
    ws.addRow(tabla.encabezados)
    ws.getRow(1).font = { bold: true }
    // Columnas de monto y su moneda, deducidas del encabezado.
    const montos = new Map<number, ReturnType<typeof monedaDeColumna>>()
    tabla.encabezados.forEach((h, i) => {
      if (esColumnaMonto(h)) montos.set(i, monedaDeColumna(h))
    })
    tabla.filas.forEach((fila) => {
      const celdas: Array<string | number> = fila.map((celda, i) => {
        const moneda = montos.get(i)
        if (moneda && celda.trim() !== '') {
          const numero = aNumero(celda, moneda)
          if (numero !== null) return numero
        }
        return celda
      })
      ws.addRow(celdas)
    })
    ws.columns?.forEach((col) => { col.width = 20 })
  })

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/** Dispara la descarga de un blob con el nombre indicado. */
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}
