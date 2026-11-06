import type { Codigo } from '@/types/conciliacion'

/**
 * Clasificación por IA de glosas sin código contable.
 *
 * A diferencia de `inspeccionIA` (que evalúa una conciliación con contexto de
 * la base de datos), aquí sólo mapeamos texto → código del catálogo. Se trabaja
 * sobre glosas ÚNICAS y en lotes, de modo que el costo es una llamada por lote
 * de glosas distintas y no una por transacción.
 *
 * Usa el mismo proxy `/api/clinepass` que añade la API key del lado servidor.
 */

const ENDPOINT = import.meta.env.VITE_CLINEPASS_ENDPOINT ?? '/api/clinepass'
const MODELO = import.meta.env.VITE_CLINEPASS_MODEL ?? 'deepseek-flash'

/** Glosas por lote. Suficientes glosas cortas caben en el presupuesto de tokens. */
const TAM_LOTE = 25

export interface GlosaParaClasificar {
  glosa: string
  monto?: number
  rut?: string
  proveedor?: string
}

export interface SugerenciaCodigo {
  glosa: string
  /** ID del catálogo, o "" si la IA no encontró uno adecuado. */
  codigoSugerido: string
  confianza: number
}

const INSTRUCCIONES = `Eres un analista contable chileno experto en clasificación de movimientos.
Recibirás un catálogo de códigos contables y una lista de glosas (descripciones de movimientos
bancarios o del libro de compras/ventas). Para CADA glosa, elige el código MÁS probable del
catálogo según su significado, considerando el monto (positivo=abono/ingreso, negativo=cargo/
egreso), el RUT y el proveedor cuando estén presentes.

Reglas:
- Usa SOLO IDs que existan en el catálogo entregado.
- Si ninguna categoría aplica con certeza razonable, deja "codigoSugerido": "".
- "confianza" (0 a 1) refleja qué tan seguro estás. Sé conservador ante la ambigüedad.

Responde SOLO con un JSON array válido, sin texto adicional ni bloques de código, respetando el
índice "i" de cada glosa recibida:
[{ "i": number, "codigoSugerido": string, "confianza": number }]`

function extraerArray(texto: string): unknown[] {
  const limpio = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const parsear = (s: string): unknown => JSON.parse(s)
  try {
    const v = parsear(limpio)
    return Array.isArray(v) ? v : []
  } catch {
    const ini = limpio.indexOf('[')
    const fin = limpio.lastIndexOf(']')
    if (ini === -1 || fin <= ini) {
      throw new Error('La respuesta del modelo no contenía un JSON array válido')
    }
    const v = parsear(limpio.slice(ini, fin + 1))
    return Array.isArray(v) ? v : []
  }
}

async function clasificarLote(
  lote: GlosaParaClasificar[],
  catalogo: { id: string; nombre: string; categoria?: string }[],
  idsValidos: Set<string>,
  señal?: AbortSignal,
): Promise<SugerenciaCodigo[]> {
  const items = lote.map((g, i) => ({
    i,
    glosa: g.glosa,
    monto: g.monto,
    rut: g.rut || undefined,
    proveedor: g.proveedor || undefined,
  }))

  const respuesta = await fetch(ENDPOINT, {
    method: 'POST',
    signal: señal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0.1,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: INSTRUCCIONES },
        {
          role: 'user',
          content: [
            'Catálogo de códigos contables:',
            JSON.stringify(catalogo),
            '',
            'Glosas a clasificar:',
            JSON.stringify(items),
          ].join('\n'),
        },
      ],
    }),
  })

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '')
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new Error(
        'La API rechazó la credencial. Revisa CLINEPASS_API_KEY en .env y reinicia el servidor.',
      )
    }
    if (respuesta.status === 404 && ENDPOINT.startsWith('/')) {
      throw new Error(
        `No se encontró el proxy ${ENDPOINT}. En local hace falta \`npm run dev\`; ` +
        'en el servidor, que la función de api/ esté desplegada.',
      )
    }
    throw new Error(`El modelo respondió ${respuesta.status}. ${detalle.slice(0, 300)}`.trim())
  }

  const json = await respuesta.json() as {
    choices?: { message?: { content?: string } }[]
    // La puerta de enlace de Cline envuelve la respuesta en `data`.
    data?: { choices?: { message?: { content?: string } }[] }
  }
  const contenido = (json.choices ?? json.data?.choices)?.[0]?.message?.content
  if (!contenido) throw new Error('El modelo no devolvió contenido')

  const salida: SugerenciaCodigo[] = []
  for (const item of extraerArray(contenido)) {
    const o = (item ?? {}) as Record<string, unknown>
    const i = typeof o.i === 'number' ? o.i : -1
    if (i < 0 || i >= lote.length) continue
    const codigo = typeof o.codigoSugerido === 'string' ? o.codigoSugerido.trim().toUpperCase() : ''
    const confianza = typeof o.confianza === 'number' && Number.isFinite(o.confianza)
      ? Math.min(1, Math.max(0, o.confianza))
      : 0
    salida.push({
      glosa: lote[i].glosa,
      codigoSugerido: idsValidos.has(codigo) ? codigo : '',
      confianza,
    })
  }
  return salida
}

/**
 * Sugiere un código del catálogo para cada glosa entregada, procesando en
 * lotes. Devuelve una sugerencia por glosa (las que la IA no pudo clasificar
 * quedan con `codigoSugerido` vacío).
 */
export async function sugerirCodigosPorGlosa(
  glosas: GlosaParaClasificar[],
  codigos: Codigo[],
  opciones?: { signal?: AbortSignal; onProgreso?: (hechas: number, total: number) => void },
): Promise<SugerenciaCodigo[]> {
  const activos = codigos.filter((c) => c.activo)
  const catalogo = activos.map((c) => ({ id: c.id, nombre: c.nombre, categoria: c.categoria }))
  const idsValidos = new Set(activos.map((c) => c.id))

  const resultado: SugerenciaCodigo[] = []
  for (let inicio = 0; inicio < glosas.length; inicio += TAM_LOTE) {
    const lote = glosas.slice(inicio, inicio + TAM_LOTE)
    const parcial = await clasificarLote(lote, catalogo, idsValidos, opciones?.signal)
    resultado.push(...parcial)
    opciones?.onProgreso?.(Math.min(inicio + TAM_LOTE, glosas.length), glosas.length)
  }
  return resultado
}
