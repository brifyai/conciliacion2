import { supabase } from '@/lib/supabase'
import type { Codigo, Transaccion } from '@/types/conciliacion'

/**
 * Inspección asistida por IA de una transacción sugerida.
 *
 * El flujo consulta primero a Supabase el contexto que un analista miraría
 * (la contraparte propuesta, otros candidatos con el mismo monto y el
 * historial del mismo RUT) y recién entonces le pide al modelo un veredicto.
 * Así la respuesta se apoya en datos reales de la organización y no en lo que
 * el modelo pueda suponer a partir de la glosa.
 *
 * La petición sale contra `/api/clinepass`, una ruta del mismo origen que el
 * servidor de desarrollo de Vite reenvía a la API real (ver `vite.config.ts`).
 * Hacen falta las dos cosas:
 *  1. La API de Cline no debe llamarse desde el navegador: así no se expone la
 *     key y no se depende de CORS.
 *  2. El proxy añade la API key del lado servidor, con lo que nunca aparece en
 *     el bundle que descarga el cliente.
 *
 * OJO: el proxy sólo existe en `npm run dev`. Para publicar la aplicación hay
 * que reemplazarlo por un backend real (por ejemplo la función serverless
 * `api/clinepass.js` en Vercel) que guarde la key como secreto.
 */

/** Ruta única del proxy: el servidor de desarrollo o la función lo resuelven. */
const ENDPOINT = import.meta.env.VITE_CLINEPASS_ENDPOINT ?? '/api/clinepass'
const MODELO = import.meta.env.VITE_CLINEPASS_MODEL ?? 'deepseek-flash'

export type VeredictoIA = 'confirmar' | 'rechazar' | 'revisar'

export interface InspeccionIA {
  veredicto: VeredictoIA
  confianza: number
  resumen: string
  motivos: string[]
  codigoSugerido?: string
  acciones: string[]
}

/** Columnas mínimas para razonar sobre un movimiento sin traer filas enormes. */
const COLUMNAS =
  'id,fuente,banco,fecha,monto,descripcion,rut,contraparte,documento,folio,tipo_doc,estado,codigo_id,match_id,confianza'

interface FilaContexto {
  id: string
  fuente: string
  banco: string | null
  fecha: string
  monto: number | string
  descripcion: string
  rut: string | null
  contraparte: string | null
  documento: string | null
  folio: string | null
  tipo_doc: string | null
  estado: string
  codigo_id: string | null
  match_id: string | null
  confianza: number | string | null
}

const compacta = (f: FilaContexto) => ({
  id: f.id,
  fuente: f.fuente,
  banco: f.banco ?? undefined,
  fecha: f.fecha,
  monto: Number(f.monto),
  descripcion: f.descripcion,
  rut: f.rut ?? undefined,
  contraparte: f.contraparte ?? undefined,
  documento: f.documento ?? undefined,
  folio: f.folio ?? undefined,
  tipoDoc: f.tipo_doc ?? undefined,
  estado: f.estado,
  codigoId: f.codigo_id ?? undefined,
  confianza: f.confianza === null ? undefined : Number(f.confianza),
})

const sumarDiasISO = (iso: string, dias: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  return new Date(d.getTime() + dias * 86400000).toISOString().slice(0, 10)
}

export interface ContextoInspeccion {
  movimiento: ReturnType<typeof compacta>
  contraparistaPropuesta?: ReturnType<typeof compacta>
  otrosCandidatos: ReturnType<typeof compacta>[]
  historialMismoRut: ReturnType<typeof compacta>[]
}

/** Reúne desde Supabase el contexto necesario para evaluar el movimiento. */
export async function reunirContexto(tx: Transaccion): Promise<ContextoInspeccion> {
  const uno = async (id: string) => {
    const { data } = await supabase
      .from('transacciones')
      .select(COLUMNAS)
      .eq('id', id)
      .maybeSingle()
    return data ? compacta(data as unknown as FilaContexto) : undefined
  }

  const propuesta = tx.matchId ? await uno(tx.matchId) : undefined

  // Candidatos alternativos: lado opuesto, mismo monto (±$1, el signo va
  // implícito) y fecha cercana. Es lo mismo que evalúa el motor de matching.
  const { data: candidatos } = await supabase
    .from('transacciones')
    .select(COLUMNAS)
    .neq('fuente', tx.fuente)
    .gte('monto', tx.monto - 1)
    .lte('monto', tx.monto + 1)
    .gte('fecha', sumarDiasISO(tx.fecha, -45))
    .lte('fecha', sumarDiasISO(tx.fecha, 45))
    .neq('estado', 'conciliada')
    .limit(8)

  // Cómo se resolvieron antes movimientos del mismo RUT: la mejor pista para
  // sugerir un código contable coherente con el histórico.
  let historial: ReturnType<typeof compacta>[] = []
  if (tx.rut) {
    const { data } = await supabase
      .from('transacciones')
      .select(COLUMNAS)
      .eq('rut', tx.rut)
      .eq('estado', 'conciliada')
      .not('codigo_id', 'is', null)
      .limit(6)
    historial = ((data as unknown as FilaContexto[] | null) ?? []).map(compacta)
  }

  return {
    movimiento: compacta({
      id: tx.id,
      fuente: tx.fuente,
      banco: tx.banco ?? null,
      fecha: tx.fecha,
      monto: tx.monto,
      descripcion: tx.descripcion,
      rut: tx.rut ?? null,
      contraparte: tx.contraparte ?? null,
      documento: tx.documento ?? null,
      folio: tx.folio ?? null,
      tipo_doc: tx.tipoDoc ?? null,
      estado: tx.estado,
      codigo_id: tx.codigoId ?? null,
      match_id: tx.matchId ?? null,
      confianza: tx.confianza ?? null,
    }),
    contraparistaPropuesta: propuesta,
    otrosCandidatos: ((candidatos as unknown as FilaContexto[] | null) ?? [])
      .filter((c) => c.id !== tx.matchId)
      .map(compacta),
    historialMismoRut: historial,
  }
}

const FORMATO_JSON = `Responde SOLO con un objeto JSON válido, sin texto adicional ni bloques de código:
{
  "veredicto": "confirmar" | "rechazar" | "revisar",
  "confianza": number,          // 0 a 1
  "resumen": string,            // una frase, en español
  "motivos": string[],          // 2 a 4 evidencias concretas citando datos
  "codigoSugerido": string,     // ID de código contable del catálogo, o ""
  "acciones": string[]          // 1 a 3 pasos concretos para el analista
}`

const CONSIDERACIONES = `Considera: coincidencia de monto y signo, cercanía de fechas, RUT, folio/documento,
similitud de glosa, y si existen varios candidatos con el mismo monto (ambigüedad).
Montos en CLP: positivo = abono/ingreso, negativo = cargo/egreso.`

const INSTRUCCIONES_SUGERIDA = `Eres un analista contable chileno experto en conciliación bancaria.
Recibirás un movimiento en estado "sugerida": el motor encontró una contraparte que calza
en monto y fecha, pero no pudo confirmarla (normalmente porque falta el RUT o la glosa no
se parece). Tu tarea es decidir qué hacer con él.

Criterios:
- "confirmar": la contraparte propuesta es casi con certeza la correcta.
- "rechazar": la contraparte propuesta es incorrecta o hay otro candidato mejor.
- "revisar": la evidencia no alcanza y requiere que una persona lo verifique.

${CONSIDERACIONES}

${FORMATO_JSON}`

const INSTRUCCIONES_NO_CONCILIADA = `Eres un analista contable chileno experto en conciliación bancaria.
Recibirás un movimiento que el motor NO logró conciliar (estado "no_conciliada" o "pendiente"):
no encontró ninguna contraparte que calzara. Tu tarea es explicar POR QUÉ no se concilió y
qué debe hacer el analista para resolverlo.

En el contexto, "otrosCandidatos" son movimientos del lado opuesto con monto parecido en
fechas cercanas. Si viene vacío, significa que no existe ninguna contraparte con ese monto:
probablemente el movimiento no tiene par (comisión, impuesto, transferencia interna, gasto sin
documento) o falta cargar el archivo del otro origen (banco o contabilidad).

Criterios:
- "revisar": existen uno o más candidatos plausibles que una persona debería confirmar a mano.
- "rechazar": no hay contraparte posible; el movimiento no es conciliable con los datos actuales
  o requiere cargar información que falta.
- "confirmar": úsalo sólo si hay un ÚNICO candidato inequívoco (mismo monto, fecha y RUT o glosa)
  que es claramente el par.

En "resumen" explica en una frase la razón por la que no se concilió.
En "motivos" cita evidencia concreta (si no hay candidatos, dilo explícitamente).
En "acciones" indica pasos concretos: cargar el archivo faltante, buscar por RUT, asignar un
código contable, marcarlo como no conciliable, etc.

${CONSIDERACIONES}

${FORMATO_JSON}`

const INSTRUCCIONES_RESUELTA = `Eres un analista contable chileno experto en conciliación bancaria.
Recibirás un movimiento del banco que ya está en estado "resuelta": se cerró SIN contraparte,
explicado sólo por su código contable (traspasos entre cuentas, comisiones, impuestos, seguros,
pagos de tarjeta, boletas de garantía, etc.). Tu tarea es revisar si esa explicación se sostiene
y resumir qué es el movimiento.

Criterios:
- "confirmar": el código asignado es coherente con la glosa, el monto, el signo y el historial
  del mismo RUT, y no se espera un documento que lo respalde.
- "rechazar": el código no calza (por ejemplo, un pago a proveedor o un cobro de cliente que
  debería tener factura, o un monto demasiado alto para ser una comisión) y hay que conciliarlo.
- "revisar": la evidencia no alcanza para decidir.

En "resumen" explica en una frase qué es el movimiento y por qué está cerrado sin contraparte.
En "motivos" cita evidencia concreta: código, monto, glosa, RUT e histórico.
En "codigoSugerido" propón otro código del catálogo sólo si el asignado no corresponde.
En "acciones" indica qué haría un analista: dejarlo cerrado, buscar contraparte o cambiar el código.

${CONSIDERACIONES}

${FORMATO_JSON}`

/** Elige las instrucciones según el estado del movimiento a inspeccionar. */
function instruccionesPara(estado: Transaccion['estado']): string {
  if (estado === 'sugerida') return INSTRUCCIONES_SUGERIDA
  if (estado === 'resuelta') return INSTRUCCIONES_RESUELTA
  return INSTRUCCIONES_NO_CONCILIADA
}

function extraerJSON(texto: string): unknown {
  const limpio = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(limpio)
  } catch {
    // El modelo puede anteponer explicación: rescata el primer objeto completo.
    const inicio = limpio.indexOf('{')
    const fin = limpio.lastIndexOf('}')
    if (inicio === -1 || fin <= inicio) {
      throw new Error('La respuesta del modelo no contenía un JSON válido')
    }
    return JSON.parse(limpio.slice(inicio, fin + 1))
  }
}

function normalizar(bruto: unknown): InspeccionIA {
  const o = (bruto ?? {}) as Record<string, unknown>
  const veredicto = o.veredicto === 'confirmar' || o.veredicto === 'rechazar'
    ? o.veredicto
    : 'revisar'
  const lista = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
  const confianza = typeof o.confianza === 'number' && Number.isFinite(o.confianza)
    ? Math.min(1, Math.max(0, o.confianza))
    : 0
  const codigo = typeof o.codigoSugerido === 'string' ? o.codigoSugerido.trim().toUpperCase() : ''
  return {
    veredicto,
    confianza,
    resumen: typeof o.resumen === 'string' && o.resumen.trim() !== ''
      ? o.resumen.trim()
      : 'El modelo no entregó un resumen.',
    motivos: lista(o.motivos),
    codigoSugerido: codigo || undefined,
    acciones: lista(o.acciones),
  }
}

/**
 * Consulta el contexto en Supabase y pide al modelo un veredicto sobre el
 * movimiento sugerido.
 */
export async function inspeccionarConIA(
  tx: Transaccion,
  codigos: Codigo[],
  señal?: AbortSignal,
): Promise<{ inspeccion: InspeccionIA; contexto: ContextoInspeccion }> {
  const contexto = await reunirContexto(tx)
  const catalogo = codigos
    .filter((c) => c.activo)
    .map((c) => ({ id: c.id, nombre: c.nombre, categoria: c.categoria }))

  const respuesta = await fetch(ENDPOINT, {
    method: 'POST',
    signal: señal,
    // Sin cabecera Authorization: la añade el proxy con la key del servidor.
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0.2,
      // El razonamiento interno del modelo también consume presupuesto: un
      // límite ajustado trunca el JSON de respuesta a media frase.
      max_tokens: 2500,
      messages: [
        { role: 'system', content: instruccionesPara(tx.estado) },
        {
          role: 'user',
          content: [
            'Contexto consultado en la base de datos:',
            JSON.stringify(contexto, null, 1),
            '',
            'Catálogo de códigos contables disponibles:',
            JSON.stringify(catalogo),
          ].join('\n'),
        },
      ],
    }),
  })

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '')
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new Error(
        'La API rechazó la credencial. Revisa CLINEPASS_API_KEY en el archivo .env ' +
        'y reinicia el servidor de desarrollo (el proxy la lee al arrancar).',
      )
    }
    if (respuesta.status === 404 && ENDPOINT.startsWith('/')) {
      throw new Error(
        `No se encontró el proxy ${ENDPOINT}. En local hace falta \`npm run dev\`; ` +
        'en el servidor, que la función de api/ esté desplegada.',
      )
    }
    throw new Error(
      `El modelo respondió ${respuesta.status}. ${detalle.slice(0, 300)}`.trim(),
    )
  }

  const json = await respuesta.json() as {
    choices?: { message?: { content?: string } }[]
    // Algunas pasarelas envuelven la respuesta en `data`; se contempla por compatibilidad.
    data?: { choices?: { message?: { content?: string } }[] }
  }
  // DeepSeek devuelve el formato OpenAI estándar; si el modelo razona, el campo
  // `reasoning`/`reasoning_content` se ignora y sólo se usa `content`.
  const contenido = (json.choices ?? json.data?.choices)?.[0]?.message?.content
  if (!contenido) throw new Error('El modelo no devolvió contenido')

  return { inspeccion: normalizar(extraerJSON(contenido)), contexto }
}
