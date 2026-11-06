/**
 * Genera `docs/Informe-enero-2026.docx`: por qué enero 2026 cierra en 3,15% de
 * conciliación real y qué lo explica, con las cifras medidas sobre los datos
 * reales (base Supabase). Regenerable:
 *   node scripts/gen-informe-enero.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(RAIZ, 'package.json'))
const {
  AlignmentType, BorderStyle, Document, HeadingLevel, PageBreak, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} = require('docx')

// ---------- Ayudantes ----------
const T = (t, o = {}) =>
  new TextRun({ text: String(t), bold: !!o.b, italics: !!o.i, color: o.c, size: o.s })

const P = (t, o = {}) =>
  new Paragraph({
    children: Array.isArray(t) ? t : [T(t, o)],
    spacing: { after: o.espacio ?? 160, line: 300 },
    alignment: o.alineacion,
  })

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 }, children: [T(t, { b: true })] })
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 160 }, children: [T(t, { b: true })] })

const VINETA = (t, nivel = 0) =>
  new Paragraph({
    bullet: { level: nivel },
    spacing: { after: 100, line: 300 },
    children: Array.isArray(t) ? t : [T(t)],
  })

const BORDE = { style: BorderStyle.SINGLE, size: 4, color: 'B4C6E7' }
const CELDA = (t, o = {}) =>
  new TableCell({
    shading: o.fondo ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fondo } : undefined,
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    borders: { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE },
    children: [new Paragraph({ spacing: { after: 0 }, children: Array.isArray(t) ? t : [T(t, o)] })],
  })

const TABLA = (encabezados, filas) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: encabezados.map((h) => CELDA(h, { b: true, fondo: 'D9E2F3' })),
      }),
      ...filas.map((f) => new TableRow({ children: f.map((c) => CELDA(c)) })),
    ],
  })

const SALTO = () => new Paragraph({ children: [new PageBreak()] })

const contenido = []
const AGREGAR = (...bloques) => contenido.push(...bloques)

// ---------- Portada ----------
AGREGAR(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 2000, after: 300 },
    children: [T('ConciliaBK', { b: true, s: 56, c: '1F3864' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [T('Informe de conciliación · Enero 2026', { b: true, s: 30 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [T('Por qué el mes cierra en 3,15% de conciliación real y qué lo explica', { s: 24, c: '595959' })],
  }),
  TABLA(
    ['Documento', 'Detalle'],
    [
      ['Alcance', 'Movimientos del banco del período, su estado y la disponibilidad de contraparte en los libros'],
      ['Período', 'Enero 2026'],
      ['Universo', '317 movimientos del banco (monto distinto de $0)'],
      ['Fuente de los números', 'Base de datos (Supabase), medición directa sobre los registros del período'],
      ['Cierre del KPI', 'Conciliación real = 10 / 317 = 3,15%'],
    ],
  ),
  SALTO(),
)

// ---------- 1. Resumen ejecutivo ----------
AGREGAR(
  H1('1. Resumen ejecutivo'),
  P([
    T('Enero 2026 cierra con '),
    T('10 movimientos conciliados de 317 (3,15%)', { b: true }),
    T('. El número es bajo, pero no se explica por una falla del motor de matching: se explica por '
      + 'la composición del mes y por la disponibilidad de los datos. Tres hechos, medidos sobre la '
      + 'propia base, lo determinan:'),
  ]),
  TABLA(
    ['#', 'Hecho medido', 'Magnitud', 'Consecuencia'],
    [
      ['1', 'El 70% de los movimientos del mes son tesorería ya explicada por su código (comisiones, impuestos, traspasos, intereses)',
        '221 de 317 (69,7%)', 'No cuentan como "conciliado real" por diseño: el techo del KPI es 30,3%'],
      ['2', 'De los que quedan sin conciliar, casi 8 de cada 10 no tienen ninguna factura con su monto en el libro',
        '68 de 86 (79%)', 'No existe contraparte por monto: ninguna mejora de algoritmo los resuelve'],
      ['3', 'De los que traen RUT, el proveedor sí está en el libro, pero el pago no calza con ninguna factura 1:1',
        '42 proveedores en libro · solo 4 con monto igual', 'El pago es parcial o agrupa varias facturas: falta el modelo 1:N o el dato de pago'],
    ],
  ),
  P([
    T('Conclusión: '),
    T('enero no está en 3,15% porque el motor falle, sino porque el mes es mayoritariamente tesorería '
      + 'y porque los cobros de enero no calzan al peso con una factura del libro.', { b: true }),
  ]),
  SALTO(),
)

// ---------- 2. El universo de enero ----------
AGREGAR(
  H1('2. El universo de enero, movimiento por movimiento'),
  P('El KPI de "conciliación real" se calcula sobre todos los movimientos del banco del período con '
    + 'monto distinto de $0. Así se reparten los 317 de enero:'),
  TABLA(
    ['Estado', 'Movimientos', '%', 'Monto', '¿Cuenta en el KPI?'],
    [
      ['Conciliada', '10', '3,15%', '$24.564.688', 'Sí'],
      ['Resuelta (por código)', '221', '69,72%', '$956.362.415', 'No'],
      ['Sugerida', '13', '4,10%', '$17.825.663', 'No'],
      ['Pendiente', '0', '0,00%', '$0', 'No'],
      ['No conciliada', '73', '23,03%', '$949.074.714', 'No'],
      ['Total', '317', '100%', '$1.947.827.480', '—'],
    ],
  ),
  P([
    T('Los tres estados que "no cuentan" suman 307 de 317 movimientos. El foco del análisis está en '
      + 'los 86 que no están ni conciliados ni resueltos (13 sugeridas + 73 no conciliadas): '),
    T('ahí está la brecha que sí se puede trabajar', { b: true }),
    T('.'),
  ]),
)

AGREGAR(
  H2('2.1 Qué es cada estado'),
  TABLA(
    ['Estado', 'Qué significa'],
    [
      ['Conciliada', 'El movimiento bancario calza con un documento del libro (existe contraparte real)'],
      ['Resuelta', 'No hay documento y no debe haberlo; queda explicado por su código de tesorería'],
      ['Sugerida', 'Monto y fecha calzan, pero hay facturas compitiendo o la glosa no concluye: requiere revisión'],
      ['Pendiente', 'Solo el monto calza; la fecha queda fuera de la ventana'],
      ['No conciliada', 'No se encontró contraparte válida: es la brecha real'],
    ],
  ),
)

// ---------- 3. Las tres razones ----------
AGREGAR(
  H1('3. Las tres razones del 3,15%'),
  H2('3.1 Razón 1: el 70% del mes es tesorería que no debe conciliar'),
  P([
    T('221 de los 317 movimientos (69,7%) están en estado '),
    T('resuelta', { b: true }),
    T(': son comisiones, impuestos, traspasos entre cuentas, intereses y cargos de tarjeta. Por '
      + 'definición no tienen factura que los respalde, y el KPI de "conciliación real" no los cuenta. '
      + 'Eso pone un techo aritmético: aunque se conciliara todo lo demás, el máximo sería '),
    T('96 / 317 = 30,3%', { b: true }),
    T('.'),
  ]),
  P('Por eso el tablero separa dos métricas: "Conciliado real" (con contraparte) y "Explicado" '
    + '(conciliadas + resueltas). Enero tiene un 3,15% de conciliado real, pero cerca de un 73% de '
    + 'explicado. El número a gestionar dependiendo del objetivo es el segundo.'),

  H2('3.2 Razón 2: 68 de los 86 sin conciliar no tienen contraparte por monto'),
  P([
    T('De los 86 movimientos que no están conciliados ni resueltos, '),
    T('68 (79%) no tienen ninguna factura con su monto en todo el libro', { b: true }),
    T(' — ni siquiera ignorando la ventana de fechas. Solo 16 tienen una factura de su monto dentro '
      + 'de los 90 días.'),
  ]),
  P('Esto es determinante: no es que el motor esté dejando pasar pares. La contraparte por monto no '
    + 'existe en los datos cargados. Las causas típicas son dos: el documento pertenece a un mes no '
    + 'cargado (los cobros de enero liquidan facturas de noviembre y diciembre), o el pago no es 1:1 '
    + 'con un documento (parcial o consolidado).'),

  H2('3.3 Razón 3: el proveedor está en el libro, pero el monto no calza'),
  P('Esta es la prueba más reveladora. De los 86 movimientos sin conciliar, 47 traen RUT en la glosa '
    + '(del tipo "PAGO RECIBIDO PRV 078187230-K BCO CHILE"). De esos 47:'),
  TABLA(
    ['Situación', 'Movimientos'],
    [
      ['El proveedor está en el libro', '42'],
      ['…y tiene una factura con el monto exacto (±$1)', '4'],
      ['…y el monto equivale a la suma de 2 facturas', '1'],
      ['El proveedor no está en el libro', '5'],
    ],
  ),
  P([
    T('Lectura: en 42 de 47 casos '),
    T('el proveedor sí está cargado', { b: true }),
    T(', pero solo en 4 el pago calza con una factura. Es decir, el problema no es que falte el '
      + 'proveedor: es que '),
    T('el pago no corresponde al total de una factura', { b: true }),
    T(' — son cobros parciales o que cubren varias facturas. Eso no lo resuelve la precisión de '
      + 'monto; lo resuelve el matching 1:N o el dato de cuánto paga cada cuota.'),
  ]),
  SALTO(),
)

// ---------- 4. Qué son los movimientos ----------
AGREGAR(
  H1('4. Qué son los 86 movimientos sin conciliar'),
  H2('4.1 Por código contable'),
  TABLA(
    ['Código', 'Movimientos', 'Lectura'],
    [
      ['IVEN', '69', 'Ingreso por ventas: cobros de clientes. Deben calzar con una factura de venta'],
      ['COVE', '13', 'Compra/venta: pagos a proveedores. Deben calzar con una factura de compra'],
      ['TRFC / PADD / HPRO', '4', 'Códigos de tesorería mal asignados a movimientos que no cierran'],
    ],
  ),
  P('69 + 13 = 82 de los 86 son códigos de operación (exigen documento). Son exactamente los '
    + 'movimientos que no pueden auto-resolverse por código: deben encontrar su factura.'),

  H2('4.2 Por signo'),
  TABLA(
    ['Signo', 'Movimientos', 'Interpretación'],
    [
      ['Abono (ingreso)', '62', 'Cobros de clientes: plata que entra'],
      ['Cargo (egreso)', '24', 'Pagos a proveedores y cargos'],
    ],
  ),
  P('La mayoría son cobros. Eso explica por qué el problema se concentra en el cruce ventas ↔ '
    + 'transferencias recibidas.'),

  H2('4.3 Por glosa (las más repetidas)'),
  TABLA(
    ['Glosa (normalizada)', 'Movimientos'],
    [
      ['PAGO RECIBIDO PRV <rut> BCO CHILE', '26'],
      ['TRASPASO FONDOS OTRO BANCO EN LINEA', '10'],
      ['PAGO RECIBIDO MISMO BCO PMS <rut>', '7'],
      ['TRANSFER DE JORGE BRIONES', '5'],
      ['PAGO RECIBIDO PRV <rut> BCO SANTA', '5'],
      ['PAGO RECIBIDO PRV <rut>-K BCO CHILE', '3'],
      ['Transfer a CHILEVISION S', '3'],
      ['DEPOSITO CHEQUE/DOCUMENTO OTROS BANCOS', '2'],
    ],
  ),
  P([
    T('34 de los 86 son "PAGO RECIBIDO PRV…", es decir '),
    T('cobros identificables por RUT', { b: true }),
    T('. Y las 10 glosas "TRASPASO FONDOS OTRO BANCO EN LINEA" no dicen a quién ni por qué: para '
      + 'esas solo queda el comprobante o la cartola de la cuenta destino.'),
  ]),
  SALTO(),
)

// ---------- 5. Qué NO es el problema ----------
AGREGAR(
  H1('5. Qué ya se descartó como causa'),
  P('Para no atribuir el 3,15% al motor, se verificó lo siguiente:'),
  VINETA('El motor no pierde pares disponibles: los movimientos sin contraparte no tienen ningún documento libre con su monto que el motor esté ignorando.'),
  VINETA('La ventana de fechas es de 90 días, medida contra el vencimiento del documento cuando existe (cubre los plazos de 30/60/90 días habituales).'),
  VINETA('Ampliar la tolerancia de monto no ayuda: bajar la tolerancia de ±$1 a $0 deja el KPI igual (gana 1 par y pierde 1, ambos verificados), porque el costo real está en la falta de contraparte, no en el redondeo.'),
  VINETA('La regla de ambigüedad funciona: cuando dos facturas del mismo monto compiten por un pago, el par queda "sugerida" en vez de afirmarse (es lo que ocurre con la familia de $595.000).'),
  P([
    T('El único sesgo estructural del indicador es el de la razón 1: '),
    T('el denominador incluye la tesorería', { b: true }),
    T(', que no tiene contraparte posible.'),
  ]),
)

// ---------- 6. Palancas ----------
AGREGAR(
  H1('6. Cómo subir el número de enero'),
  TABLA(
    ['#', 'Palanca', 'Qué desbloquea', 'Esfuerzo'],
    [
      ['1', 'Cargar el libro de ventas de noviembre y diciembre 2025', 'Los cobros de enero que liquidan facturas de esos meses (razón 2)', 'Bajo'],
      ['2', 'Matching 1:N (un pago = suma de varias facturas del mismo RUT)', 'Los 42 casos donde el proveedor existe pero el pago no calza 1:1 (razón 3)', 'Alto'],
      ['3', 'Mapear el RUT / N° de documento de la cartola en la carga', 'Da llave dura a los cobros y corta la ambigüedad por monto idéntico', 'Bajo'],
      ['4', 'Revisar las 13 "sugeridas" del mes en la tabla de conciliación y confirmar o rechazar', 'Cada par confirmado suma directo al KPI', 'Minutos'],
      ['5', 'Usar el comprobante 📎 en los no conciliados con glosa genérica', 'Aporta RUT, beneficiario y motivo (las 10 "TRASPASO FONDOS…")', 'Por movimiento'],
      ['6', 'Recodificar los códigos de tesorería mal asignados (TRFC/PADD/HPRO)', 'Limpia el informe: deja de contar como operación lo que no lo es', 'Bajo'],
    ],
  ),
  P([
    T('Regla de oro: '),
    T('el motor no inventa pares', { b: true }),
    T('. Si un movimiento no concilia, o falta el documento en la base, o falta la llave que los une '
      + '(RUT o N° de documento). En ambos casos la solución es de datos.'),
  ]),
  SALTO(),
)

// ---------- 7. Metas y medición ----------
AGREGAR(
  H1('7. Metas y cómo medir'),
  TABLA(
    ['Métrica', 'Enero hoy', 'Objetivo', 'Cómo se logra'],
    [
      ['Conciliadas (pares reales)', '10 (3,15%)', '60-75% del universo de OPERACIÓN', 'Libros anteriores + 1:N + llave dura en la cartola'],
      ['Explicado (conciliadas + resueltas)', '231 (72,9%)', '≥ 90%', 'Auditoría de códigos y cierre de no conciliadas'],
      ['No conciliadas', '73', '< 15', 'Comprobantes, libros faltantes y 1:N'],
      ['Sugeridas por revisar', '13', '0 al cierre', 'Revisión manual en la tabla de conciliación'],
    ],
  ),
  P([
    T('Advertencia: el porcentaje sobre '),
    T('todo el banco', { b: true }),
    T(' no debe apuntar a 90-100%. En esta cuenta cerca de dos tercios del movimiento es tesorería '
      + '(traspasos, impuestos, comisiones, tarjetas), que no tiene documento contable. El número a '
      + 'gestionar es la conciliación sobre los movimientos de '),
    T('operación', { b: true }),
    T(' (los códigos IVEN y COVE).'),
  ]),
  H2('7.1 Cómo reproducir esta medición'),
  VINETA('Los estados por mes están en la base; el detalle por código, signo y disponibilidad de contraparte se obtiene cruzando los movimientos del banco del período contra los documentos del libro.'),
  VINETA('El script scripts/auditar-resueltas.mjs resume estados y KPIs de un período; las consultas equivalentes para el SQL Editor están en scripts/auditar-resueltas.sql.'),
)

// ---------- 8. Anexo ----------
AGREGAR(
  H1('8. Anexo: glosario'),
  TABLA(
    ['Término', 'Significado'],
    [
      ['Llave dura', 'RUT o N° de documento igual en ambos lados: evidencia que permite afirmar el par'],
      ['Ventana', 'Margen de días entre la fecha del documento y el pago; actualmente 90 días'],
      ['Operación', 'Movimiento con código que exige documento (IVEN, COVE, MER, FACT)'],
      ['Tesorería', 'Movimiento sin documento por naturaleza (traspasos, impuestos, comisiones, tarjetas)'],
      ['1:N', 'Un pago cubre varias facturas; requiere sumar documentos del mismo RUT'],
    ],
  ),
)

// ---------- Generación ----------
const destino = path.join(RAIZ, 'docs', 'Informe-enero-2026.docx')
fs.mkdirSync(path.dirname(destino), { recursive: true })

const doc = new Document({
  creator: 'ConciliaBK',
  title: 'Informe de conciliación · Enero 2026',
  description: 'Por qué enero 2026 cierra en 3,15% de conciliación real',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22 } },
      heading1: { run: { font: 'Calibri', size: 32, bold: true, color: '1F3864' } },
      heading2: { run: { font: 'Calibri', size: 26, bold: true, color: '2E5496' } },
    },
  },
  sections: [
    {
      properties: { page: { margin: { top: 1000, right: 850, bottom: 1000, left: 850 } } },
      children: contenido,
    },
  ],
})

const buffer = await Packer.toBuffer(doc)
fs.writeFileSync(destino, buffer)
console.log(`Documento generado: ${destino}`)
console.log(`Tamaño: ${(buffer.length / 1024).toFixed(1)} KB · bloques: ${contenido.length}`)
