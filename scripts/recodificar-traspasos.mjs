/**
 * Recodifica traspasos entre cuentas que quedaron con código de compra/venta.
 *
 * Un movimiento con glosa "TRASPASO FONDOS OTRO BANCO EN LINEA" no es una
 * compra (COVE) ni una venta (IVEN): es un traspaso entre cuentas y debe ir
 * con TRFC (cargo) o TRFA (abono). 725 traspasos del año ya están así; estos
 * quedaron con COVE/IVEN y por eso no calzan con ninguna factura.
 *
 * Uso:
 *   node scripts/recodificar-traspasos.mjs              # dry-run
 *   node scripts/revertir... --aplicar                  # aplica (con respaldo)
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY.
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
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1)
    }
    if (clave && !(clave in process.env)) process.env[clave] = valor
  }
}
cargarEnv()

const APLICAR = process.argv.includes('--aplicar')
const MALOS = ['COVE', 'IVEN', 'MER', 'FACT']
const ES_TRASPASO =
  /\bTRASPASO FONDOS\b|\bCARGO POR TRANSF DE FONDOS\b|\bTRANSFER(?:ENCIA)? (?:ENTRE|DE FONDOS)/i

const url = process.env.VITE_SUPABASE_URL
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !clave) {
  console.error('Falta VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const sb = createClient(url, clave, { auth: { persistSession: false } })

const clp = (n) => '$' + Math.round(n).toLocaleString('es-CL')
const num = (n) => Number(n || 0).toLocaleString('es-CL')

const COLUMNAS = 'id,banco,fecha,monto,descripcion,codigo_id,codigo_origen,codigo_confianza,codigo_evidencia,categoria'

async function traerAfectadas() {
  const filas = []
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await sb
      .from('transacciones')
      .select(COLUMNAS)
      .eq('fuente', 'banco')
      .in('codigo_id', MALOS)
      .order('id')
      .range(inicio, inicio + 999)
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  // Sólo las que por glosa son traspasos entre cuentas.
  return filas.filter((t) => ES_TRASPASO.test(String(t.descripcion ?? '')))
}

const afectadas = await traerAfectadas()

console.log('=== Recodificar traspasos mal codificados (COVE/IVEN/MER/FACT -> TRFC/TRFA) ===')
console.log(`Modo: ${APLICAR ? 'APLICAR (escribe)' : 'DRY-RUN (no escribe)'}`)
console.log(`Afectadas: ${num(afectadas.length)} · ${clp(afectadas.reduce((a, t) => a + Math.abs(Number(t.monto)), 0))}`)
console.log('')

if (afectadas.length === 0) {
  console.log('Nada que recodificar.')
  process.exit(0)
}

const porMes = new Map()
for (const t of afectadas) {
  const m = String(t.fecha).slice(0, 7)
  const v = porMes.get(m) ?? { n: 0, monto: 0 }
  v.n += 1
  v.monto += Math.abs(Number(t.monto))
  porMes.set(m, v)
}
console.log('Por mes:')
for (const [m, v] of [...porMes.entries()].sort()) {
  console.log(`  ${m}  ${String(v.n).padStart(5)}  ${clp(v.monto)}`)
}
console.log('')
console.log('Nuevo código según el signo: cargo -> TRFC, abono -> TRFA.')
console.log('')

if (!APLICAR) {
  console.log('DRY-RUN: no se escribió nada. Agrega --aplicar para ejecutar.')
  process.exit(0)
}

const marca = new Date().toISOString().replace(/[:.]/g, '-')
const dirRespaldos = path.join(RAIZ, 'backups')
fs.mkdirSync(dirRespaldos, { recursive: true })
const archivoRespaldo = path.join(dirRespaldos, `traspasos-recodificados-${marca}.json`)
fs.writeFileSync(
  archivoRespaldo,
  JSON.stringify({ generado: new Date().toISOString(), motivo: 'Recodificar traspasos COVE/IVEN -> TRFC/TRFA', total: afectadas.length, filas: afectadas }, null, 2),
  'utf8',
)
console.log(`Respaldo escrito: ${path.relative(RAIZ, archivoRespaldo)}`)
console.log('')

const ids = afectadas.map((t) => t.id)
const TAMANO = 200

/** Aplica el mismo código a un lote de ids, reportando el avance. */
async function aplicar(ids, codigo) {
  for (let i = 0; i < ids.length; i += TAMANO) {
    const lote = ids.slice(i, i + TAMANO)
    const { error } = await sb
      .from('transacciones')
      .update({
        codigo_id: codigo,
        codigo_origen: 'manual',
        codigo_confianza: 1,
        codigo_evidencia: 'Recodificado: la glosa indica traspaso entre cuentas, no una compra/venta',
      })
      .in('id', lote)
    if (error) throw new Error(`${codigo} lote ${i / TAMANO + 1}: ${error.message}`)
    console.log(`  ${codigo}: ${num(i + lote.length)} / ${num(ids.length)}`)
  }
}

// Cargo (egreso) -> TRFC "Transferencias Entre Ctas - Cargo"; abono -> TRFA.
const cargos = afectadas.filter((t) => Number(t.monto) < 0).map((t) => t.id)
const abonos = afectadas.filter((t) => Number(t.monto) > 0).map((t) => t.id)
console.log(`Cargos -> TRFC: ${num(cargos.length)} · Abonos -> TRFA: ${num(abonos.length)}`)
await aplicar(cargos, 'TRFC')
await aplicar(abonos, 'TRFA')
console.log('')

// Verificación: ¿quedan traspasos con código de compra/venta?
const restantes = await traerAfectadas()
console.log('=== Verificación ===')
console.log(`Traspasos que siguen con COVE/IVEN/MER/FACT: ${num(restantes.length)} (esperado 0)`)
console.log('Siguiente paso: abrir la app y pulsar "Conciliar" para recalcular los estados.')
