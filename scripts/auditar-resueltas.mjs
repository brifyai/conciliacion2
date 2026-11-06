/**
 * Auditoría de movimientos "resueltos" y del estado de conciliación de un
 * período, leyendo directamente desde Supabase (sin pasar por la UI).
 *
 * Responde preguntas como "¿de dónde salen las 292 resueltas de enero 2026?":
 * agrupa las resoluciones por código y por origen de detección, lista las de
 * menor confianza (candidatas a falso positivo), muestra contra qué calzaron
 * las conciliadas y calcula la tasa de conciliación real.
 *
 * Uso:
 *   node scripts/auditar-resueltas.mjs 2026-01     # un período
 *   node scripts/auditar-resueltas.mjs             # todos los datos
 *
 * Credenciales, por orden de prioridad:
 *   1. SUPABASE_SERVICE_ROLE_KEY   -> acceso total (salta RLS). Sólo servidor.
 *   2. AUDIT_EMAIL + AUDIT_PASSWORD -> inicia sesión como usuario miembro.
 *   3. VITE_SUPABASE_ANON_KEY (.env) -> diagnóstico: con RLS devuelve 0 filas.
 *
 * Las claves nunca se imprimen. El script sólo reporta agregados y filas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Carga .env sin dependencias extra, sin sobrescribir el entorno real. */
function cargarEnv() {
  const archivo = path.join(RAIZ, '.env')
  if (!fs.existsSync(archivo)) return
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#')) continue
    const corte = limpia.indexOf('=')
    if (corte === -1) continue
    const clave = limpia.slice(0, corte).trim()
    let valor = limpia.slice(corte + 1).trim()
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }
    if (clave && !(clave in process.env)) process.env[clave] = valor
  }
}

const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const num = (n) => Number(n || 0).toLocaleString('es-CL')
const pct = (parte, total) =>
  total > 0 ? ((parte / total) * 100).toFixed(1) + '%' : '—'

/** Trae todas las filas del período paginando (PostgREST corta en 1000). */
async function traerTransacciones(cliente, desde, hasta) {
  const filas = []
  const TAMANO = 1000
  const COLUMNAS = [
    'id', 'fuente', 'banco', 'fecha', 'monto', 'descripcion', 'rut', 'estado',
    'match_id', 'codigo_id', 'codigo_origen', 'codigo_confianza',
    'codigo_evidencia', 'contraparte', 'proveedor', 'folio', 'documento',
    'tipo_doc', 'import_id',
  ].join(',')
  for (let inicio = 0; ; inicio += TAMANO) {
    let consulta = cliente
      .from('transacciones')
      .select(COLUMNAS)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true })
      .range(inicio, inicio + TAMANO - 1)
    if (desde) consulta = consulta.gte('fecha', desde)
    if (hasta) consulta = consulta.lt('fecha', hasta)
    const { data, error } = await consulta
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []))
    if (!data || data.length < TAMANO) break
  }
  return filas
}

function tabla(filas, encabezados) {
  if (filas.length === 0) {
    console.log('  (sin datos)')
    return
  }
  const anchos = encabezados.map((h, i) =>
    Math.max(h.length, ...filas.map((f) => String(f[i] ?? '').length)),
  )
  const linea = (celdas) =>
    '  ' + celdas.map((c, i) => String(c ?? '').padEnd(anchos[i])).join('  ')
  console.log(linea(encabezados))
  console.log('  ' + anchos.map((a) => '-'.repeat(a)).join('  '))
  for (const f of filas) console.log(linea(f))
}

async function main() {
  cargarEnv()

  const url = process.env.VITE_SUPABASE_URL
  if (!url) throw new Error('Falta VITE_SUPABASE_URL (revisa .env).')

  const periodo = process.argv[2] // "YYYY-MM" opcional
  let desde = null
  let hasta = null
  if (periodo) {
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      throw new Error('El período debe tener el formato YYYY-MM, por ejemplo 2026-01')
    }
    const [anio, mes] = periodo.split('-').map(Number)
    desde = `${periodo}-01`
    hasta = new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 10)
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const email = process.env.AUDIT_EMAIL
  const password = process.env.AUDIT_PASSWORD

  let cliente
  let modo
  if (serviceKey) {
    cliente = createClient(url, serviceKey, { auth: { persistSession: false } })
    modo = 'service-role (salta RLS)'
  } else if (email && password) {
    cliente = createClient(url, anonKey, { auth: { persistSession: false } })
    modo = `usuario ${email}`
  } else {
    cliente = createClient(url, anonKey, { auth: { persistSession: false } })
    modo = 'clave publicable (anon) sin sesión: RLS aplica'
  }

  console.log('=== Auditoría de conciliación ===')
  console.log(`Proyecto : ${url}`)
  console.log(`Modo     : ${modo}`)
  console.log(`Período  : ${periodo ?? 'todos los datos'}`)
  console.log('')

  if (email && password && !serviceKey) {
    const { error } = await cliente.auth.signInWithPassword({ email, password })
    if (error) throw new Error(`No se pudo iniciar sesión: ${error.message}`)
  }

  let transacciones
  try {
    transacciones = await traerTransacciones(cliente, desde, hasta)
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    console.error(`No se pudo leer public.transacciones: ${detalle}`)
    if (/permission denied|not authorized|JWT|row-level security/i.test(detalle)) {
      console.error('')
      console.error('La credencial disponible no puede leer la tabla (RLS / GRANT).')
      console.error('Vuelve a ejecutar con una de estas opciones:')
      console.error('  $env:SUPABASE_SERVICE_ROLE_KEY="<sb_secret_...>" ; node scripts/auditar-resueltas.mjs 2026-01')
      console.error('  $env:AUDIT_EMAIL="tu@dominio.cl"; $env:AUDIT_PASSWORD="<clave>"; node scripts/auditar-resueltas.mjs 2026-01')
      console.error('')
      console.error('Alternativa sin credenciales: pega scripts/auditar-resueltas.sql')
      console.error('en Supabase → SQL Editor.')
    }
    process.exit(1)
  }
  if (transacciones.length === 0) {
    console.log('No se leyó ninguna fila.')
    if (!serviceKey && !(email && password)) {
      console.log('')
      console.log('Causa más probable: RLS. Sin sesión, auth.uid() es NULL y la')
      console.log('política transacciones_member_select no devuelve filas.')
      console.log('')
      console.log('Vuelve a ejecutarlo con una de estas opciones:')
      console.log('  $env:SUPABASE_SERVICE_ROLE_KEY="<sb_secret_...>" ; node scripts/auditar-resueltas.mjs 2026-01')
      console.log('  $env:AUDIT_EMAIL="tu@dominio.cl"; $env:AUDIT_PASSWORD="<clave>"; node scripts/auditar-resueltas.mjs 2026-01')
    }
    return
  }

  // Nombres de los códigos, para traducir codigo_id a algo legible.
  const { data: codigos } = await cliente.from('codigos').select('id,nombre')
  const nombreCodigo = new Map((codigos ?? []).map((c) => [c.id, c.nombre]))

  const banco = transacciones.filter((t) => t.fuente === 'banco')
  const contab = transacciones.filter((t) => t.fuente === 'contabilidad')
  const porEstado = (filas, estado) => filas.filter((t) => t.estado === estado)
  const universo = banco.filter((t) => Number(t.monto) !== 0)
  const conciliadas = porEstado(universo, 'conciliada')
  const resueltas = porEstado(universo, 'resuelta')
  const noConciliadas = universo.filter(
    (t) => t.estado !== 'conciliada' && t.estado !== 'resuelta',
  )
  const montoAbs = (filas) => filas.reduce((a, t) => a + Math.abs(Number(t.monto)), 0)

  console.log('--- 1. Totales por fuente y estado ---')
  tabla(
    [
      ['banco', num(banco.length), num(porEstado(banco, 'conciliada').length), num(porEstado(banco, 'resuelta').length), num(porEstado(banco, 'sugerida').length), num(porEstado(banco, 'pendiente').length), num(porEstado(banco, 'no_conciliada').length)],
      ['contabilidad', num(contab.length), num(porEstado(contab, 'conciliada').length), num(porEstado(contab, 'resuelta').length), num(porEstado(contab, 'sugerida').length), num(porEstado(contab, 'pendiente').length), num(porEstado(contab, 'no_conciliada').length)],
    ],
    ['fuente', 'total', 'conciliada', 'resuelta', 'sugerida', 'pendiente', 'no_conciliada'],
  )

  console.log('')
  console.log('--- 2. KPIs (universo = banco con monto != 0) ---')
  console.log(`  Universo ............ ${num(universo.length)}`)
  console.log(`  Conciliadas ......... ${num(conciliadas.length)}  (${pct(conciliadas.length, universo.length)})  ${clp(montoAbs(conciliadas))}`)
  console.log(`  Resueltas ........... ${num(resueltas.length)}  (${pct(resueltas.length, universo.length)})  ${clp(montoAbs(resueltas))}`)
  console.log(`  Sugeridas .......... ${num(porEstado(universo, 'sugerida').length)}  (${pct(porEstado(universo, 'sugerida').length, universo.length)})`)
  console.log(`  No conciliadas ...... ${num(noConciliadas.length)}  (${pct(noConciliadas.length, universo.length)})  ${clp(montoAbs(noConciliadas))}`)
  console.log(`  Explicado (conc + resueltas) .. ${pct(conciliadas.length + resueltas.length, universo.length)}`)
  console.log(`  Conciliado real (pares) ....... ${pct(conciliadas.length, universo.length)}   <- KPI del dashboard`)

  console.log('')
  console.log('--- 3. De que estan resueltas: codigo x origen de deteccion ---')
  const agrupado = new Map()
  for (const t of resueltas) {
    const clave = `${t.codigo_id ?? '(sin codigo)'}|${t.codigo_origen ?? '(sin origen)'}`
    const actual = agrupado.get(clave) ?? { codigo: t.codigo_id ?? '(sin codigo)', origen: t.codigo_origen ?? '—', count: 0, monto: 0, conf: [] }
    actual.count += 1
    actual.monto += Math.abs(Number(t.monto))
    if (t.codigo_confianza != null) actual.conf.push(Number(t.codigo_confianza))
    agrupado.set(clave, actual)
  }
  tabla(
    [...agrupado.values()]
      .sort((a, b) => b.count - a.count)
      .map((g) => [
        g.codigo,
        nombreCodigo.get(g.codigo) ?? '',
        g.origen,
        num(g.count),
        pct(g.count, resueltas.length),
        clp(g.monto),
        g.conf.length ? (g.conf.reduce((a, b) => a + b, 0) / g.conf.length).toFixed(2) : '—',
      ]),
    ['codigo', 'nombre', 'origen', 'movs', '%', 'monto', 'conf.media'],
  )

  const porOrigen = new Map()
  for (const t of resueltas) {
    const o = t.codigo_origen ?? '—'
    porOrigen.set(o, (porOrigen.get(o) ?? 0) + 1)
  }
  console.log('')
  console.log('  Resumen por origen (evidencia de la deteccion):')
  for (const [origen, n] of [...porOrigen.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${origen.padEnd(12)} ${num(n).padStart(6)}  (${pct(n, resueltas.length)})`)
  }

  console.log('')
  console.log('--- 4. Resoluciones de menor confianza (posibles falsos positivos) ---')
  tabla(
    [...resueltas]
      .sort((a, b) => Number(a.codigo_confianza ?? -1) - Number(b.codigo_confianza ?? -1))
      .slice(0, 25)
      .map((t) => [
        t.fecha,
        clp(t.monto),
        String(t.descripcion ?? '').slice(0, 40),
        t.codigo_id ?? '—',
        t.codigo_origen ?? '—',
        t.codigo_confianza != null ? Number(t.codigo_confianza).toFixed(2) : '—',
        String(t.codigo_evidencia ?? '').slice(0, 26),
      ]),
    ['fecha', 'monto', 'glosa', 'codigo', 'origen', 'conf', 'evidencia'],
  )

  console.log('')
  console.log('--- 5. Conciliadas: contra que calzaron ---')
  const porId = new Map(transacciones.map((t) => [t.id, t]))
  tabla(
    conciliadas.slice(0, 40).map((t) => {
      const par = t.match_id ? porId.get(t.match_id) : undefined
      return [
        t.fecha,
        clp(t.monto),
        String(t.descripcion ?? '').slice(0, 34),
        par ? `${par.fuente}:${par.fecha}` : '—',
        par ? String(par.descripcion ?? par.proveedor ?? '').slice(0, 28) : '—',
        t.codigo_id ?? '—',
      ]
    }),
    ['fecha', 'monto', 'glosa banco', 'par', 'glosa contabilidad', 'codigo'],
  )
  if (conciliadas.length > 40) console.log(`  ... y ${num(conciliadas.length - 40)} mas.`)

  console.log('')
  console.log('--- 6. Contabilidad del periodo ---')
  console.log(`  Documentos ............ ${num(contab.length)}`)
  console.log(`  Con pago (conciliada) .. ${num(porEstado(contab, 'conciliada').length)}`)
  console.log(`  Pendientes de pago ..... ${num(contab.filter((t) => t.estado !== 'conciliada').length)}  ${clp(montoAbs(contab.filter((t) => t.estado !== 'conciliada')))}`)
  console.log('')
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e)
  process.exit(1)
})
