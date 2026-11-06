/**
 * Regenera el set de datos de demostración de `exdatos/`.
 *
 * Los libros (ventas, compras, factoring) son la fuente de verdad: el script
 * les reasigna fechas y estados coherentes, los clasifica contablemente y
 * luego DERIVA las cartolas bancarias, de modo que cada movimiento del banco
 * nazca de un documento real y concilie con él.
 *
 * El motor de conciliación (src/services/matching.ts) exige, para un match
 * exacto: monto igual (±$1), mismo signo, RUT igual y fecha dentro de 5 días
 * del vencimiento. La app además bloquea cartolas con fecha futura, así que
 * ningún movimiento supera TOPE.
 *
 * La "tasa de conciliación" de la app (src/lib/selectors.ts) es global:
 * conciliadas ÷ (banco + contabilidad). Con muchas más facturas que pagos el
 * indicador baja, así que la mayoría de los documentos se marcan pagados y con
 * su movimiento bancario para acercar el combinado al objetivo.
 *
 * Uso:  node scripts/generar-demo.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(RAIZ, 'exdatos')

// Fecha de corte: la demo simula el cierre al último día de junio de 2026.
// Ningún movimiento bancario puede superarla (la app rechaza fechas futuras).
const TOPE = new Date(Date.UTC(2026, 5, 30))   // 2026-06-30
const INICIO = new Date(Date.UTC(2026, 0, 2))  // 2026-01-02

// Mezcla de destinos sobre los documentos "pagables" (los que pueden recibir
// un movimiento bancario). El grueso concilia exacto; el resto deja pantallas
// de revisión con datos: una vista de pendientes/sugeridas vacía no demuestra
// para qué sirve la aplicación.
const MEZCLA = { exacto: 0.975, sugerida: 0.013, pendiente: 0.007 } // resto: impago
const PROPORCION_PROPIOS = 0.013 // movimientos propios del banco vs. conciliados

// Cuántas operaciones de factoring conservar. Cada venta cedida a factoring se
// cobra por la entidad, no por depósito directo, así que queda sin conciliar en
// el lado contable. Un exceso de factoring hunde la tasa combinada; ~1000 (≈8%
// de las ventas) es realista y deja el resto de facturas para conciliar normal.
const FACTORING_MAX = 500

const BANCOS = [
  { archivo: 'Cartola_Banco_Chile.xlsx', hoja: 'Cartola Banco de Chile', saldo: 48_500_000 },
  { archivo: 'Cartola_BCI.xlsx', hoja: 'Cartola BCI', saldo: 31_200_000 },
  { archivo: 'Cartola_Estado.xlsx', hoja: 'Cartola Banco Estado', saldo: 22_750_000 },
  { archivo: 'Cartola_Itau.xlsx', hoja: 'Cartola Banco Itaú', saldo: 18_400_000 },
  { archivo: 'Cartola_Santander.xlsx', hoja: 'Cartola Banco Santander', saldo: 26_900_000 },
]

// --------------------------------------------------------------- utilidades

/** PRNG determinista: el set se puede reproducir byte a byte. */
function mulberry32(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260630)
const entre = (min, max) => min + Math.floor(rnd() * (max - min + 1))
const elegir = (arr) => arr[Math.floor(rnd() * arr.length)]

/** Hash estable para decisiones que deben repetirse por clave (RUT, folio). */
function hash(texto) {
  let h = 2166136261
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0)
}

const celda = (c) => {
  const v = c && typeof c === 'object' && 'result' in c ? c.result : c
  if (v instanceof Date) {
    return `${String(v.getUTCDate()).padStart(2, '0')}/${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`
  }
  return v === null || v === undefined ? '' : String(v).trim()
}

async function leer(archivo) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(DIR, archivo))
  const ws = wb.worksheets[0]
  const encabezados = ws.getRow(1).values.slice(1).map((v) => String(v ?? '').trim())
  const filas = []
  ws.eachRow((row, n) => {
    if (n === 1) return
    const o = {}
    encabezados.forEach((h, i) => { o[h] = celda(row.getCell(i + 1).value) })
    if (encabezados.every((h) => o[h] === h || o[h] === '')) return
    filas.push(o)
  })
  return { encabezados, filas, hoja: ws.name }
}

const NUMERICAS = new Set([
  'Neto', 'IVA', 'Exento', 'Total', 'Saldo', 'UF', 'Folio', 'Cód. Tipo',
  'Monto Neto', 'Monto IVA', 'Monto Exento', 'Monto Total',
  'Factura Folio', 'Factura Total', 'Monto Cedido', 'Comisión Factoring',
  'Monto Recibido', 'Saldo por Cobrar', 'Cargo (CLP)', 'Abono (CLP)',
  'Saldo (CLP)', 'N° Referencia', 'Factura Referencia (Folio)',
])

async function escribir(archivo, hoja, encabezados, filas) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(hoja)
  ws.addRow(encabezados)
  ws.getRow(1).font = { bold: true }
  for (const f of filas) {
    ws.addRow(encabezados.map((h) => {
      const v = f[h]
      if (v === '' || v === undefined || v === null) return null
      if (NUMERICAS.has(h) && v !== '' && !Number.isNaN(Number(v))) return Number(v)
      return v
    }))
  }
  encabezados.forEach((h, i) => {
    ws.getColumn(i + 1).width = Math.min(42, Math.max(11, h.length + 4))
  })
  await wb.xlsx.writeFile(path.join(DIR, archivo))
}

// ------------------------------------------------------------------ fechas

const aTexto = (d) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
const sumarDias = (d, n) => new Date(d.getTime() + n * 86400000)
const diaAl = (fin) => sumarDias(INICIO, entre(0, Math.round((fin - INICIO) / 86400000)))

// ---------------------------------------------- catálogo contable (demo)
// Los alias deben coincidir con los del catálogo de códigos de la aplicación
// (supabase/migrations/20260722205000_reset_codigos_insforge.sql).

const ALIAS = {
  IVEN: 'Cobro Cliente', VMEX: 'Venta moneda extranjera', OING: 'Otros ingresos',
  FACT: 'Factoring', COVE: 'Costo de ventas', OGDI: 'Otros gastos directos',
  GOFI: 'Insumos de oficina', HPRO: 'Honorarios profesionales externos',
  GAME: 'Pago arriendo oficina', GCOM: 'Pago gastos comunes',
  SECO: 'Pago de seguros', RSEX: 'Google Ads', TOCK: 'Pago Entel',
  PADD: 'Plataforma Padd', GABA: 'Cargo mantención cuenta',
  ICRE: 'Interés crédito bancario', INRI: 'Interés línea de crédito',
  LLSS: 'Previred', REMU: 'Pago remuneraciones', MIVE: 'Pago F29',
  TRFA: 'Transferencia entre cuentas abono', TRFC: 'Transferencia entre cuentas cargo',
  DAP: 'Depósito a plazo', COUS: 'Compra USD', PALC: 'Amortización línea de crédito',
}
const NOMBRE = {
  IVEN: 'Ingreso Ventas', VMEX: 'Venta En Moneda Extranjera', OING: 'Otros Ingresos',
  FACT: 'Operación de Factoring', COVE: 'Costo De Ventas', OGDI: 'Otros Gastos Directos',
  GOFI: 'Gastos De Oficina', HPRO: 'Honorarios Profesionales- Externos',
  GAME: 'Arriendo Oficina', GCOM: 'Gastos Comunes', SECO: 'Seguros Contratados',
  RSEX: 'Gasto Redes Sociales Extranjeras', TOCK: 'Gasto Pago Facts Entel',
  PADD: 'Gastos Plataforma Padd', GABA: 'Gastos Bancarios',
  ICRE: 'Intereses En Creditos', INRI: 'Intereses Linea Cr', LLSS: 'Leyes Sociales',
  REMU: 'Remuneraciones', MIVE: 'Impuestos Iva Ventas Y Otros',
  TRFA: 'Transferencias Entre Ctas Y Empresas-Abono',
  TRFC: 'Transferencias Entre Ctas Y Empresas- Cargo',
  DAP: 'Depositos Aplazo', COUS: 'Cargo Compra Usd', PALC: 'Amortiza Linea Cr',
}

/** Aplica un código y deja Comentario/Aliases coherentes con él. */
function clasificar(fila, codigo) {
  fila['Código Contable'] = codigo
  if ('Aliases' in fila) fila['Aliases'] = ALIAS[codigo] ?? ''
  if ('Comentario' in fila) fila['Comentario'] = NOMBRE[codigo] ?? ''
}

/** Un gasto se deduce del rubro del proveedor; si no hay pista, es estable por RUT. */
const GASTOS = ['COVE', 'COVE', 'COVE', 'OGDI', 'OGDI', 'GOFI', 'HPRO', 'GAME', 'GCOM', 'SECO']
function codigoProveedor(rut, razonSocial) {
  const n = (razonSocial ?? '').toLowerCase()
  if (/seguro/.test(n)) return 'SECO'
  if (/entel/.test(n)) return 'TOCK'
  if (/padd/.test(n)) return 'PADD'
  if (/consultor|asesor|abogad|contab|auditor/.test(n)) return 'HPRO'
  if (/tecnolog|software|sistemas|digital/.test(n)) return 'GOFI'
  if (/logistic|logíst|transporte|distribu|supply/.test(n)) return 'OGDI'
  if (/comercial|trading|store|shop|mayorista|import/.test(n)) return 'COVE'
  return GASTOS[hash(rut) % GASTOS.length]
}

const esNotaCredito = (codTipo) => codTipo === '61'

// ------------------------------------------------------------------- inicio

console.log('Leyendo libros…')
const ventas = await leer('Libro_Ventas.xlsx')
const compras = await leer('Libro_Compras.xlsx')
const notasCredito = await leer('Notas_Credito.xlsx')
const notasDebito = await leer('Notas_Debito.xlsx')
const factoring = await leer('Factoring.xlsx')
// Recorta el factoring a un nivel realista (ver FACTORING_MAX). Las ventas ya
// no cedidas vuelven al flujo normal y concilian con su depósito.
factoring.filas = factoring.filas.slice(0, FACTORING_MAX)

// 1) Clasificación contable coherente ---------------------------------------

for (const v of ventas.filas) {
  const cod = v['Cód. Tipo']
  if (cod === '34') clasificar(v, hash('x' + v['Folio']) % 100 < 18 ? 'VMEX' : 'IVEN')
  else if (cod === '56') clasificar(v, hash('d' + v['Folio']) % 100 < 25 ? 'OING' : 'IVEN')
  else clasificar(v, 'IVEN')
}
for (const c of compras.filas) {
  clasificar(c, codigoProveedor(c['RUT Proveedor'], c['Razón Social Proveedor']))
}
for (const n of notasCredito.filas) clasificar(n, 'IVEN')
for (const n of notasDebito.filas) clasificar(n, 'IVEN')
for (const f of factoring.filas) clasificar(f, 'FACT')

// 2) Factoring coherente ------------------------------------------------------
// Una entidad de factoring es una empresa: tiene UN RUT, no uno por operación.
// La venta cedida se cobra vía factoring, así que NO genera además un cobro
// directo del cliente (lo produce la operación de factoring).

const ENTIDADES = [
  ['Itaú Factoring', '96.489.000-3'], ['Foco Factoring', '76.412.330-5'],
  ['Intesa Factoring', '76.885.211-K'], ['Zinc Factoring', '77.204.918-2'],
  ['FactorLine', '96.655.860-1'], ['Credito Factoring', '76.331.470-4'],
  ['Banco de Chile Factoring', '97.004.000-5'], ['Prima Factoring', '76.998.442-9'],
  ['Factor Chile', '76.120.550-8'], ['Confactor', '76.553.881-6'],
  ['BCI Factoring', '97.006.000-6'], ['Santander Factoring', '97.036.000-K'],
]
const rutEntidad = new Map(ENTIDADES)
const ventaPorFolio = new Map(ventas.filas.map((v) => [v['Folio'], v]))
const folioCedido = new Set()

for (const v of ventas.filas) { v['Factoring'] = 'No'; v['Entidad Factoring'] = '' }

for (const f of factoring.filas) {
  if (!rutEntidad.has(f['Entidad Factoring'])) {
    f['Entidad Factoring'] = ENTIDADES[hash(f['Factura Folio']) % ENTIDADES.length][0]
  }
  f['RUT Factoring'] = rutEntidad.get(f['Entidad Factoring'])

  const venta = ventaPorFolio.get(f['Factura Folio'])
  if (!venta) continue
  const total = Number(venta['Total'] || 0)
  f['Factura Total'] = total
  f['Monto Cedido'] = total
  const tasa = Number(f['Tasa Descuento'] || 0) || 2.5
  const comision = Math.round(total * (tasa / 100))
  f['Comisión Factoring'] = comision
  f['Monto Recibido'] = total - comision
  venta['Factoring'] = 'Sí'
  venta['Entidad Factoring'] = f['Entidad Factoring']
  folioCedido.add(venta['Folio'])
}

// 3) Unidades pagables: cada una puede recibir un movimiento bancario --------
// Signo de acuerdo a cómo la app firma cada documento (aplicarSignoContable):
// ventas +Total (NC −), compras −Total (NC +), factoring +Monto Recibido.

const unidades = []

for (const v of ventas.filas) {
  if (v['Factoring'] === 'Sí') continue // se cobra por factoring, no directo
  const total = Math.abs(Number(v['Total'] || 0))
  if (total === 0) continue
  unidades.push({
    doc: v, libro: 'ventas', clase: 'cobro',
    monto: (esNotaCredito(v['Cód. Tipo']) ? -1 : 1) * total,
    rut: v['RUT Cliente'], nombre: v['Razón Social Cliente'],
    folio: v['Folio'], codTipo: v['Cód. Tipo'],
  })
}
for (const c of compras.filas) {
  const total = Math.abs(Number(c['Total'] || 0))
  if (total === 0) continue
  unidades.push({
    doc: c, libro: 'compras', clase: 'pago',
    monto: (esNotaCredito(c['Cód. Tipo']) ? 1 : -1) * total,
    rut: c['RUT Proveedor'], nombre: c['Razón Social Proveedor'],
    folio: c['Folio'], codTipo: c['Cód. Tipo'],
  })
}
for (const f of factoring.filas) {
  const monto = Math.abs(Number(f['Monto Recibido'] || 0))
  if (monto === 0) continue
  unidades.push({
    doc: f, libro: 'factoring', clase: 'factoring',
    monto, rut: f['RUT Factoring'], nombre: f['Entidad Factoring'],
    folio: f['Factura Folio'], codTipo: '33',
  })
}

// Barajado determinista antes de repartir destinos.
for (let i = unidades.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rnd() * (i + 1))
  ;[unidades[i], unidades[j]] = [unidades[j], unidades[i]]
}

const nExacto = Math.round(unidades.length * MEZCLA.exacto)
const nSugerida = Math.round(unidades.length * MEZCLA.sugerida)
const nPendiente = Math.round(unidades.length * MEZCLA.pendiente)
unidades.forEach((u, i) => {
  if (i < nExacto) u.destino = 'exacto'
  else if (i < nExacto + nSugerida) u.destino = 'sugerida'
  else if (i < nExacto + nSugerida + nPendiente) u.destino = 'pendiente'
  else u.destino = 'impago'
})

// 4) Fechas y estado por unidad ----------------------------------------------
// El pago cae dentro de los 5 días del vencimiento (exacto/sugerida) o lejos
// (pendiente), siempre ≤ TOPE. Los impagos no generan movimiento y quedan con
// un estado abierto y, a veces, vencimiento posterior al corte.

const TERMINOS = [0, 15, 30, 30, 45]
const ESTADOS_IMPAGO = ['Pendiente', 'Vencida', 'Parcial']
const eventos = []

function fijarFechas(u) {
  const doc = u.doc
  if (u.destino === 'impago') {
    const emision = diaAl(TOPE)
    const venc = sumarDias(emision, elegir(TERMINOS) + entre(0, 20))
    doc['Fecha Emisión'] = aTexto(emision)
    if ('Fecha Vencimiento' in doc) doc['Fecha Vencimiento'] = aTexto(venc)
    if ('Fecha Cesión' in doc) doc['Fecha Cesión'] = aTexto(emision)
    doc['Estado'] = elegir(ESTADOS_IMPAGO)
    if (u.libro === 'ventas') doc['Saldo'] = Math.abs(u.monto)
    if (u.libro === 'factoring') doc['Saldo por Cobrar'] = Math.abs(Number(doc['Factura Total'] || 0))
    return null
  }

  // Vencimiento que permita pagar dentro del rango:
  //  - pendiente: pago = venc + 20..32 → venc ≤ TOPE − 32
  //  - exacto/sugerida: pago = venc + 0..4 → venc ≤ TOPE − 4
  const holgura = u.destino === 'pendiente' ? 34 : 5
  const vencMax = sumarDias(TOPE, -holgura)
  const venc = diaAl(vencMax)
  const emision = sumarDias(venc, -elegir(TERMINOS))
  const pago = u.destino === 'pendiente'
    ? sumarDias(venc, entre(20, 32))
    : sumarDias(venc, entre(0, 4))

  doc['Fecha Emisión'] = aTexto(emision < INICIO ? INICIO : emision)
  if ('Fecha Vencimiento' in doc) doc['Fecha Vencimiento'] = aTexto(venc)
  if ('Fecha Cesión' in doc) doc['Fecha Cesión'] = aTexto(venc)
  doc['Estado'] = 'Pagada'
  if (u.libro === 'ventas') doc['Saldo'] = 0
  if (u.libro === 'factoring') doc['Saldo por Cobrar'] = 0
  return pago
}

for (const u of unidades) {
  const pago = fijarFechas(u)
  if (pago) eventos.push({ ...u, fecha: pago })
}

// Las ventas cedidas quedan pagadas (vía factoring) pero sin cobro directo.
for (const v of ventas.filas) {
  if (v['Factoring'] !== 'Sí') continue
  const venc = sumarDias(diaAl(sumarDias(TOPE, -5)), 0)
  const emision = sumarDias(venc, -elegir(TERMINOS))
  v['Fecha Emisión'] = aTexto(emision < INICIO ? INICIO : emision)
  v['Fecha Vencimiento'] = aTexto(venc)
  v['Estado'] = 'Pagada'
  v['Saldo'] = 0
}

// 5) Movimientos propios del banco (sin contraparte contable) ----------------

const totalesDocumento = new Set()
for (const e of eventos) totalesDocumento.add(Math.round(Math.abs(e.monto)))

const PROPIOS = [
  { cod: 'GABA', tipo: 'PAC', signo: -1, min: 3500, max: 12000, glosa: 'Cargo mantención cuenta' },
  { cod: 'GABA', tipo: 'PAC', signo: -1, min: 1200, max: 6000, glosa: 'Comisión mantención' },
  { cod: 'ICRE', tipo: 'PAT', signo: -1, min: 45000, max: 380000, glosa: 'Interés crédito bancario' },
  { cod: 'INRI', tipo: 'PAT', signo: -1, min: 22000, max: 210000, glosa: 'Interés línea de crédito' },
  { cod: 'TOCK', tipo: 'PAC', signo: -1, min: 28000, max: 95000, glosa: 'Pago Entel' },
  { cod: 'PADD', tipo: 'PAC', signo: -1, min: 39000, max: 149000, glosa: 'Plataforma Padd' },
  { cod: 'RSEX', tipo: 'PAT', signo: -1, min: 85000, max: 720000, glosa: 'Google Ads' },
  { cod: 'LLSS', tipo: 'PAC', signo: -1, min: 480000, max: 2900000, glosa: 'Previred' },
  { cod: 'REMU', tipo: 'PAT', signo: -1, min: 3200000, max: 9800000, glosa: 'Pago remuneraciones' },
  { cod: 'MIVE', tipo: 'PAT', signo: -1, min: 900000, max: 5400000, glosa: 'Pago F29' },
  { cod: 'SECO', tipo: 'PAC', signo: -1, min: 65000, max: 410000, glosa: 'Pago de seguros' },
  { cod: 'GAME', tipo: 'PAT', signo: -1, min: 780000, max: 2400000, glosa: 'Pago arriendo oficina' },
  { cod: 'GCOM', tipo: 'PAC', signo: -1, min: 90000, max: 380000, glosa: 'Pago gastos comunes' },
  { cod: 'PALC', tipo: 'PAT', signo: -1, min: 500000, max: 3600000, glosa: 'Amortización línea de crédito' },
  { cod: 'DAP', tipo: 'Vale Vista', signo: 1, min: 2000000, max: 12000000, glosa: 'Depósito a plazo' },
  { cod: 'TRFA', tipo: 'Vale Vista', signo: 1, min: 300000, max: 4200000, glosa: 'Transferencia entre cuentas abono' },
  { cod: 'TRFC', tipo: 'Vale Vista', signo: -1, min: 300000, max: 4200000, glosa: 'Transferencia entre cuentas cargo' },
  { cod: 'COUS', tipo: 'PAT', signo: -1, min: 450000, max: 3100000, glosa: 'Compra USD' },
]

const propios = []
const nPropios = Math.round(eventos.length * PROPORCION_PROPIOS)
for (let i = 0; i < nPropios; i += 1) {
  const p = PROPIOS[i % PROPIOS.length]
  let monto = entre(p.min, p.max)
  while (totalesDocumento.has(monto) || totalesDocumento.has(monto - 1) || totalesDocumento.has(monto + 1)) {
    monto = entre(p.min, p.max)
  }
  propios.push({
    fecha: diaAl(TOPE), monto, signo: p.signo, tipo: p.tipo, glosa: p.glosa, cod: p.cod,
  })
}

// 6) Convertir eventos y propios en filas de cartola -------------------------

const TIPO_COBRO = ['Cobro Cliente', 'Cobro Cliente', 'Cobro Cliente', 'Vale Vista', 'Cheque']
const TIPO_PAGO = ['Pago Proveedor', 'Pago Proveedor', 'Pago Proveedor', 'Cheque', 'Vale Vista']
const DOC = { 33: 'Factura', 34: 'Factura Exenta', 46: 'Factura de Compra', 61: 'Nota de Crédito', 56: 'Nota de Débito' }

function filaDesdeEvento(e) {
  const abono = e.monto > 0
  const doc = DOC[e.codTipo] ?? 'Factura'
  let tipo, descripcion, rut = e.rut, nombre = e.nombre

  if (e.clase === 'factoring') {
    // No puede decir "Cobro Cliente": ese texto es alias de IVEN y empataría
    // con FACT; ante un empate el motor descarta ambos códigos.
    tipo = 'Transferencia'
    descripcion = `Anticipo factoring - ${e.nombre} - ${doc} ${e.codTipo} N° ${e.folio}`
  } else {
    tipo = abono ? elegir(TIPO_COBRO) : elegir(TIPO_PAGO)
    descripcion = `Transferencia ${abono ? 'recibida' : 'enviada'} - ${e.nombre} - ${doc} ${e.codTipo} N° ${e.folio}`
  }

  // Una sugerida es un movimiento sin identificar: monto y fecha calzan, pero
  // el banco no informa contraparte y la glosa no se parece a la del documento.
  if (e.destino === 'sugerida') {
    rut = ''
    nombre = ''
    descripcion = abono ? 'Depósito en efectivo' : 'Giro por caja'
    tipo = abono ? 'Vale Vista' : 'Cheque'
  }

  const monto = Math.round(Math.abs(e.monto))
  return {
    Fecha: aTexto(e.fecha),
    _orden: e.fecha,
    'Descripción': descripcion,
    'Tipo Movimiento': tipo,
    'Glosa Detalle': e.destino === 'sugerida' ? `${tipo} - Sin referencia` : `${tipo} - Ref: ${e.folio}`,
    'N° Referencia': e.destino === 'sugerida' ? '' : e.folio,
    'RUT Contraparte': rut,
    'Nombre Contraparte': nombre,
    'Cargo (CLP)': abono ? '' : monto,
    'Abono (CLP)': abono ? monto : '',
  }
}

function filaDesdePropio(p) {
  const abono = p.signo > 0
  return {
    Fecha: aTexto(p.fecha),
    _orden: p.fecha,
    'Descripción': `${p.glosa} - ${p.tipo}`,
    'Tipo Movimiento': p.tipo,
    'Glosa Detalle': `${p.glosa} - Sin referencia`,
    'N° Referencia': '',
    'RUT Contraparte': '',
    'Nombre Contraparte': '',
    'Cargo (CLP)': abono ? '' : p.monto,
    'Abono (CLP)': abono ? p.monto : '',
  }
}

const filasBanco = [
  ...eventos.map(filaDesdeEvento),
  ...propios.map(filaDesdePropio),
]

// Repartir entre bancos y ordenar cronológicamente dentro de cada cartola.
const porBanco = BANCOS.map(() => [])
filasBanco.forEach((f, i) => porBanco[i % BANCOS.length].push(f))

const ENC_BANCO = ['Fecha', 'Descripción', 'Tipo Movimiento', 'Glosa Detalle',
  'N° Referencia', 'RUT Contraparte', 'Nombre Contraparte',
  'Cargo (CLP)', 'Abono (CLP)', 'Saldo (CLP)']

console.log('Escribiendo cartolas…')
for (let i = 0; i < BANCOS.length; i += 1) {
  const banco = BANCOS[i]
  const filas = porBanco[i].sort((a, z) => a._orden - z._orden)
  let saldo = banco.saldo
  for (const f of filas) {
    saldo += Number(f['Abono (CLP)'] || 0) - Number(f['Cargo (CLP)'] || 0)
    f['Saldo (CLP)'] = saldo
    delete f._orden
  }
  await escribir(banco.archivo, banco.hoja, ENC_BANCO, filas)
  console.log(`  ${banco.archivo.padEnd(26)} ${String(filas.length).padStart(6)} movimientos`)
}

console.log('Escribiendo libros corregidos…')
await escribir('Libro_Ventas.xlsx', ventas.hoja, ventas.encabezados, ventas.filas)
await escribir('Libro_Compras.xlsx', compras.hoja, compras.encabezados, compras.filas)
await escribir('Notas_Credito.xlsx', notasCredito.hoja, notasCredito.encabezados, notasCredito.filas)
await escribir('Notas_Debito.xlsx', notasDebito.hoja, notasDebito.encabezados, notasDebito.filas)
await escribir('Factoring.xlsx', factoring.hoja, factoring.encabezados, factoring.filas)

const cuenta = (destino) => unidades.filter((u) => u.destino === destino).length
const totalContab = ventas.filas.length + compras.filas.length + factoring.filas.length
const conciliadas = cuenta('exacto')
const bancoTotal = filasBanco.length
const tasa = (2 * conciliadas / (totalContab + bancoTotal) * 100).toFixed(1)
console.log(`
Resumen
  documentos contables      : ${totalContab} (ventas ${ventas.filas.length} · compras ${compras.filas.length} · factoring ${factoring.filas.length})
  unidades pagables         : ${unidades.length}
    exacto (concilian)      : ${cuenta('exacto')}
    sugerida                : ${cuenta('sugerida')}
    pendiente               : ${cuenta('pendiente')}
    impago (sin movimiento) : ${cuenta('impago')}
  ventas cedidas a factoring: ${folioCedido.size}
  movimientos propios banco : ${propios.length}
  total filas de cartola    : ${bancoTotal}
  tasa combinada estimada   : ${tasa}%  (fecha tope ${aTexto(TOPE)})`)
