/**
 * Genera 2 cartolas bancarias (Banco de Chile + BancoEstado) en XLSX cuyos
 * pagos SÍ casan con la contabilidad, leyendo DIRECTO de los archivos Excel:
 *
 *  - LIBRO DE COMPRAS (hoja FINAL): egresos → columna "Cargo" (negativo)
 *  - libro-ventas (hoja EMITIDAS):  ingresos → columna "Abono" (positivo)
 *
 * Cada factura genera un pago con el MISMO monto y MISMO RUT, y la fecha
 * desplazada +2..+6 días (dentro de la tolerancia de 8 días del motor).
 * Así, al cargar los libros y las cartolas en la app, el matching concilia.
 *
 * Importante: el archivo de contabilidad y la cartola se construyen a la vez
 * y de la misma fuente, así que nunca se desincronizan.
 *
 * Uso:  node scripts/generar-cartolas-bancarias.mjs
 */
import { read, utils, write } from 'xlsx/xlsx.mjs'
import { readFileSync, writeFileSync } from 'node:fs'

// --- Helpers ---
function limpiarRUT(r) {
  return (r ?? '').toString().replace(/[^0-9kK]/g, '').toUpperCase()
}

/** Parsea fechas tipo "46023" (serial Excel) o "31/3/2026" o "2026-03-31". */
function parsearFecha(valor) {
  if (valor == null || valor === '') return ''
  // Número de serie de Excel (46023 ≈ 2025-12-31)
  if (typeof valor === 'number' || /^\d{5}$/.test(String(valor).trim())) {
    const n = Number(valor)
    // 25569 = 1970-01-01 en serial Excel; a ms desde epoch:
    const d = new Date(Math.round((n - 25569) * 86400 * 1000))
    return d.toISOString().slice(0, 10)
  }
  const t = String(valor).trim()
  let m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  const d = new Date(t)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return ''
}

/** Limpia texto de monto: "1.234.567" o "2,390,508" → número. */
function parsearMonto(t) {
  if (t == null || t === '') return 0
  const s = String(t).replace(/[^\d-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/** Recorta el !ref de la hoja al rango real con datos. Algunos Excel declaran
 *  A1:XX1048576 y sheet_to_json se congela recorriendo 1 millón de filas. */
function truncarRango(ws) {
  if (!ws['!ref']) return
  let maxRow = 0, maxCol = 0
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue
    const c = utils.decode_cell(addr)
    if (c.r > maxRow) maxRow = c.r
    if (c.c > maxCol) maxCol = c.c
  }
  ws['!ref'] = utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } })
}

// --- 1) Leer facturas de COMPRAS (egresos) ---
const wbC = read(readFileSync('LIBRO DE COMPRAS - AL 22 DE JUNIO 2026.xlsx'), { type: 'buffer' })
truncarRango(wbC.Sheets['FINAL'])
const rowsC = utils.sheet_to_json(wbC.Sheets['FINAL'], { defval: '', blankrows: false, raw: false })
const compras = rowsC
  .map((r) => ({
    fecha: parsearFecha(r['EMI']),
    monto: parsearMonto(r['TOTAL']),
    rut: limpiarRUT(r['RUT']),
    glosa: `PAGO ${(r['PROVEEDOR'] ?? '').toString().trim()}`.slice(0, 60),
    tipo: 'egreso', // cargo bancario
  }))
  .filter((r) => r.fecha && r.monto > 0 && r.rut)
console.log(`Compras (egresos): ${compras.length}`)

// --- 2) Leer facturas de VENTAS (ingresos) ---
const wbV = read(readFileSync('libro-ventas-22-junio.xlsx'), { type: 'buffer' })
truncarRango(wbV.Sheets['EMITIDAS'])
const rowsV = utils.sheet_to_json(wbV.Sheets['EMITIDAS'], { defval: '', blankrows: false, raw: false })
const ventas = rowsV
  .map((r) => ({
    fecha: parsearFecha(r['EMISION']),
    monto: parsearMonto(r['TOTAL']),
    rut: limpiarRUT(r['RUT']),
    glosa: `COBRO ${(r['RAZON SOCIAL'] ?? r['RAZON SOCIAL'] ?? '').toString().trim()}`.slice(0, 60),
    tipo: 'ingreso', // abono bancario
  }))
  .filter((r) => r.fecha && r.monto > 0 && r.rut)
console.log(`Ventas (ingresos): ${ventas.length}`)

/**
 * Suma días a una fecha PERO garantizando que el resultado quede en el MISMO
 * mes calendario que la fecha original. Si el offset cruza de mes, lo recorta
 * al último día del mes. Esto es crítico para la conciliación: el motor solo
 * cruza transacciones dentro del mismo mes, así que un pago que cae en el mes
 * siguiente nunca encontraría a su factura.
 */
function addDaysMismoMes(iso, n) {
  const d = new Date(iso + 'T12:00:00Z')
  const mesOriginal = d.getUTCMonth()
  d.setUTCDate(d.getUTCDate() + n)
  // Si el offset cruzó al mes siguiente, recorta al último día del mes original.
  if (d.getUTCMonth() !== mesOriginal) {
    d.setUTCMonth(mesOriginal + 1, 0) // último día del mes original
  }
  return d.toISOString().slice(0, 10)
}

// --- 3) Combinar y repartir entre los dos bancos (alternado) ---
const todos = [...compras, ...ventas].sort((a, b) => a.fecha.localeCompare(b.fecha))
const rnd = seeded(11)
const chile = []
const estado = []
todos.forEach((f, i) => {
  const offset = 2 + Math.floor(rnd() * 5)
  const pago = { ...f, fecha: addDaysMismoMes(f.fecha, offset) }
  if (i % 2 === 0) chile.push(pago)
  else estado.push(pago)
})

function filasCartola(pagos, saldoInicial) {
  const ordenados = pagos.sort((a, b) => a.fecha.localeCompare(b.fecha))
  let saldo = saldoInicial
  return ordenados.map((p) => {
    if (p.tipo === 'egreso') {
      saldo -= p.monto
      return { Fecha: p.fecha, Descripción: p.glosa, RUT: p.rut, Cargo: p.monto, Abono: 0, Saldo: saldo }
    }
    saldo += p.monto
    return { Fecha: p.fecha, Descripción: p.glosa, RUT: p.rut, Cargo: 0, Abono: p.monto, Saldo: saldo }
  })
}

function escribir(path, filas, nombreHoja) {
  const ws = utils.json_to_sheet(filas, {
    header: ['Fecha', 'Descripción', 'RUT', 'Cargo', 'Abono', 'Saldo'],
  })
  ws['!cols'] = [{ wch: 12 }, { wch: 45 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, nombreHoja)
  const buf = write(wb, { bookType: 'xlsx', type: 'buffer' })
  writeFileSync(path, buf)
  const porMes = {}
  for (const r of filas) {
    const m = r.Fecha.slice(0, 7)
    porMes[m] = (porMes[m] || 0) + 1
  }
  console.log(`  ✓ ${path} — ${filas.length} pagos | por mes: ${JSON.stringify(porMes)}`)
}

console.log('\nGenerando cartolas bancarias ene-may 2026…')
escribir('extracto-banco-chile-ene-may-2026.xlsx', filasCartola(chile, 800_000_000), 'Cartola Banco Chile')
escribir('extracto-bancoestado-ene-may-2026.xlsx', filasCartola(estado, 600_000_000), 'Cartola BancoEstado')
console.log(`\nTotal: ${chile.length + estado.length} pagos (de ${todos.length} facturas).`)
