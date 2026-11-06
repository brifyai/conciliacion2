/**
 * Devuelve a 'no_conciliada' los movimientos de BANCO que están 'resuelta',
 * para que el motor de matching vuelva a evaluarlos.
 *
 * Por qué: el estado 'resuelta' es terminal para el matching (matching.ts
 * excluye esas filas). Si un pago o cobro quedó resuelto por código, ya nunca
 * se emparejará con su documento, aunque exista. Este script deshace eso.
 *
 * Uso (SIEMPRE parte en modo dry-run):
 *   node scripts/revertir-resueltas-banco.mjs                          # todos los períodos, sólo COVE/IVEN/MER/FACT
 *   node scripts/revertir-resueltas-banco.mjs --codigos=todos          # todos los códigos
 *   node scripts/revertir-resueltas-banco.mjs --periodo=2026-01        # un mes
 *   node scripts/revertir-resueltas-banco.mjs --aplicar                # ejecuta los cambios
 *
 * Antes de escribir guarda un respaldo JSON en `backups/` con las filas
 * afectadas (estado, match_id y confianza originales), para poder restaurarlas.
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY (o una clave secreta) en el entorno o en
 * `.env`; con la clave publicable RLS bloquea la lectura.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
cargarEnv()

const argumento = (nombre) =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1]
const tieneFlag = (nombre) => process.argv.includes(`--${nombre}`)

const APLICAR = tieneFlag('aplicar')
const PERIODO = argumento('periodo') // "YYYY-MM"
const CODES = argumento('codigos') // "COVE,IVEN,MER,FACT" | "todos"
const CODIGOS_PROTEGIDOS = ['COVE', 'IVEN', 'MER', 'FACT']
const codigosObjetivo = !CODES || CODES === 'protegidos' ? CODIGOS_PROTEGIDOS : CODES === 'todos' ? null : CODES.split(',').map((c) => c.trim().toUpperCase())

const url = process.env.VITE_SUPABASE_URL
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !clave) {
  console.error('Falta VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (revisa .env).')
  process.exit(1)
}
const sb = createClient(url, clave, { auth: { persistSession: false } })

const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
const num = (n) => Number(n || 0).toLocaleString('es-CL')

const COLUMNAS = [
  'id', 'organization_id', 'fuente', 'banco', 'fecha', 'monto', 'saldo',
  'descripcion', 'rut', 'categoria', 'codigo_id', 'codigo_origen',
  'codigo_confianza', 'codigo_evidencia', 'estado', 'match_id', 'confianza',
  'documento', 'external_id', 'contraparte', 'import_id', 'row_fingerprint',
].join(',')

async function traerAfectadas() {
  const filas = []
  const TAMANO = 1000
  for (let inicio = 0; ; inicio += TAMANO) {
    let consulta = sb
      .from('transacciones')
      .select(COLUMNAS)
      .eq('fuente', 'banco')
      .eq('estado', 'resuelta')
      .order('id')
      .range(inicio, inicio + TAMANO - 1)
    if (codigosObjetivo) consulta = consulta.in('codigo_id', codigosObjetivo)
    if (PERIODO) {
      const [anio, mes] = PERIODO.split('-').map(Number)
      const hasta = new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 10)
      consulta = consulta.gte('fecha', `${PERIODO}-01`).lt('fecha', hasta)
    }
    const { data, error } = await consulta
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []))
    if (!data || data.length < TAMANO) break
  }
  return filas
}

const afectadas = await traerAfectadas()

console.log('=== Revertir movimientos de banco "resuelta" -> "no_conciliada" ===')
console.log(`Modo      : ${APLICAR ? 'APLICAR (escribe)' : 'DRY-RUN (no escribe)'}`)
console.log(`Período   : ${PERIODO ?? 'todos'}`)
console.log(`Códigos   : ${codigosObjetivo ? codigosObjetivo.join(', ') : 'todos'}`)
console.log(`Afectadas : ${num(afectadas.length)} · ${clp(afectadas.reduce((a, t) => a + Math.abs(Number(t.monto)), 0))}`)
console.log('')

if (afectadas.length === 0) {
  console.log('Nada que revertir.')
  process.exit(0)
}

const porCodigo = new Map()
const porMes = new Map()
for (const t of afectadas) {
  const c = t.codigo_id ?? '—'
  const g = porCodigo.get(c) ?? { n: 0, monto: 0 }
  g.n += 1
  g.monto += Math.abs(Number(t.monto))
  porCodigo.set(c, g)
  const m = String(t.fecha).slice(0, 7)
  porMes.set(m, (porMes.get(m) ?? 0) + 1)
}
console.log('Por código:')
for (const [c, v] of [...porCodigo.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${c.padEnd(8)} ${String(v.n).padStart(5)}  ${clp(v.monto)}`)
}
console.log('')
console.log('Por mes:')
for (const [m, n] of [...porMes.entries()].sort()) console.log(`  ${m}  ${String(n).padStart(5)}`)

// --- Respaldo JSON antes de escribir nada ---
const marca = new Date().toISOString().replace(/[:.]/g, '-')
const dirRespaldos = path.join(RAIZ, 'backups')
const archivoRespaldo = path.join(
  dirRespaldos,
  `resueltas-banco-${PERIODO ?? 'todos'}-${marca}.json`,
)
if (APLICAR) {
  fs.mkdirSync(dirRespaldos, { recursive: true })
  fs.writeFileSync(
    archivoRespaldo,
    JSON.stringify(
      {
        generado: new Date().toISOString(),
        motivo: 'Revertir estado resuelta -> no_conciliada para re-evaluar el matching',
        filtro: { periodo: PERIODO ?? null, codigos: codigosObjetivo ?? 'todos' },
        total: afectadas.length,
        filas: afectadas,
      },
      null,
      2,
    ),
    'utf8',
  )
  console.log('')
  console.log(`Respaldo escrito: ${path.relative(RAIZ, archivoRespaldo)}`)
}

if (!APLICAR) {
  console.log('')
  console.log('DRY-RUN: no se escribió nada. Agrega --aplicar para ejecutar los cambios.')
  process.exit(0)
}

// --- Aplicar por lotes de ids ---
const ids = afectadas.map((t) => t.id)
const TAMANO_LOTE = 200
let actualizadas = 0
for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
  const lote = ids.slice(i, i + TAMANO_LOTE)
  const { error } = await sb
    .from('transacciones')
    .update({ estado: 'no_conciliada', match_id: null, confianza: null })
    .in('id', lote)
  if (error) throw new Error(`Lote ${i / TAMANO_LOTE + 1}: ${error.message}`)
  actualizadas += lote.length
  console.log(`  ${num(actualizadas)} / ${num(ids.length)} actualizadas`)
}

// --- Verificación ---
const restantes = await traerAfectadas()
console.log('')
console.log('=== Verificación ===')
console.log(`Filas objetivo que siguen en 'resuelta': ${num(restantes.length)} (esperado 0)`)

const { count } = await sb
  .from('transacciones')
  .select('id', { count: 'exact', head: true })
  .eq('fuente', 'banco')
  .eq('estado', 'no_conciliada')
console.log(`Movimientos de banco ahora en 'no_conciliada': ${num(count ?? 0)}`)
console.log('')
console.log('Siguiente paso: abrir la app y pulsar "Conciliar" para que el motor')
console.log('vuelva a emparejar (o "Recalcular conciliación" si ya está disponible).')
