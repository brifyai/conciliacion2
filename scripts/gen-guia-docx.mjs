/**
 * Genera `docs/Guia-conciliacion-y-calidad-de-datos.docx`: diagnóstico completo
 * de la conciliación, por qué los archivos cargados pueden estar incorrectos y
 * el plan operativo para subir el porcentaje. Regenerable:
 *   node scripts/gen-guia-docx.mjs
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
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 }, children: [T(t, { b: true })] })

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
    children: [T('Diagnóstico y guía práctica para aumentar las conciliaciones bancarias', { b: true, s: 30 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [T('Por qué los archivos cargados no concilian, qué se corrigió y qué falta hacer', { s: 24, c: '595959' })],
  }),
  TABLA(
    ['Documento', 'Detalle'],
    [
      ['Alcance', 'Motor de conciliación, calidad de los archivos cargados y plan operativo'],
      ['Período analizado', 'Enero a julio 2026 (4.397 movimientos reales)'],
      ['Fuente de los números', 'Base de datos (Supabase) + simulaciones del motor sobre datos reales'],
      ['Herramientas', 'scripts/auditar-resueltas.mjs · recodificar-traspasos.mjs · revertir-resueltas-banco.mjs'],
    ],
  ),
  SALTO(),
)

// ---------- 1. Resumen ejecutivo ----------
AGREGAR(
  H1('1. Resumen ejecutivo'),
  P([
    T('Tras aplicar las correcciones, enero 2026 muestra un '),
    T('4,1% de conciliación real (13 de 317 movimientos)', { b: true }),
    T(', 217 movimientos explicados por código de tesorería y 70 sin conciliar. Antes de las '
      + 'correcciones el dashboard mostraba un 100% de avance: ese número era falso, porque 292 '
      + 'movimientos habían sido marcados como "resueltos" con un clic y el motor dejaba de '
      + 'intentar emparejarlos con sus documentos.'),
  ]),
  P('El diagnóstico sobre los datos reales identificó cinco causas, en orden de peso:'),
  TABLA(
    ['#', 'Causa raíz', 'Magnitud medida', 'Estado'],
    [
      ['1', '1.000 movimientos del año son TRASPASOS entre cuentas y 267 estaban codificados como compras (COVE) o ventas (IVEN)', '$1.194.924.110 · enero: 117 movs, $608.817.454', '✅ Corregido (recodificados a TRFC/TRFA)'],
      ['2', 'La ventana de fechas del matching era de 60 días y los plazos reales son de 60 a 90', '24 pagos de abril con factura exacta a 62-77 días', '✅ Corregido (90 días, +56 pares)'],
      ['3', 'Los libros cargados empiezan el 2026-01-01; los cobros y pagos de enero liquidan facturas de noviembre y diciembre', 'Cobros IVEN de enero $1.089M vs facturas de venta de enero $518M', '⏳ Falta cargar los libros anteriores'],
      ['4', 'La cuenta destino de los traspasos no tiene cartola cargada ("Bancos cargados: 2")', '136 de los 317 movimientos de enero son TRASPASO a otro banco', '⏳ Falta cargar esa cartola'],
      ['5', 'Los montos del banco no calzan 1:1 con los documentos (probado con grupo de control)', '261 de 292 sin ninguna combinación posible (1, 2 o 3 documentos, o con IVA)', 'ℹ️ Es consecuencia de las causas 3 y 4'],
    ],
  ),
  P([
    T('Conclusión central: '),
    T('el motor no es el cuello de botella; los datos sí', { b: true }),
    T('. Se verificó que el motor no pierde ningún par disponible (0 candidatos libres sin usar) y '
      + 'que ampliar la tolerancia de monto solo fabricaría pares falsos. Para subir el porcentaje hay '
      + 'que cargar los datos que faltan (secciones 5 y 6).'),
  ]),
  SALTO(),
)

// ---------- 2. Cómo funciona la conciliación ----------
AGREGAR(
  H1('2. Cómo concilia la aplicación'),
  P('El motor no busca "parecidos" a ciegas: recorre una cadena de pasos y exige evidencia. '
    + 'Entender esta cadena es clave para saber por qué un movimiento queda o no conciliado.'),
  H2('2.1 La cadena que se ejecuta con el botón "Conciliar"'),
  TABLA(
    ['Paso', 'Qué hace', 'Archivo'],
    [
      ['1. Códigos', 'Asigna el código contable a cada movimiento: primero la columna de código del archivo, luego el RUT, luego el ID, los alias y el nombre del catálogo', 'services/categoriesEngine.ts'],
      ['2. Propagación por RUT', 'Un mismo RUT siempre lleva el mismo código: lo propaga desde los documentos ya clasificados hacia el resto', 'services/categoriesEngine.ts'],
      ['3. Reglas', 'Las reglas del usuario solo asignan CATEGORÍA; nunca concilian', 'services/rulesEngine.ts'],
      ['4. Matching', 'Empareja banco ↔ contabilidad según los niveles de evidencia (2.2)', 'services/matching.ts'],
      ['5. Propagación del código', 'El código del documento se propaga a su contraparte bancaria', 'services/categoriesEngine.ts'],
      ['6. Resolución', 'Los movimientos de banco sin contraparte, explicados por su código de tesorería, quedan "resueltos"', 'services/categoriesEngine.ts'],
    ],
  ),
  H2('2.2 Niveles de evidencia del matching'),
  P('Cada par candidato se clasifica por la fuerza de su evidencia. Los niveles altos concilian solos; '
    + 'los bajos quedan a la vista para decisión humana. Esta regla protege la exactitud: el motor '
    + 'prefiere dejar un movimiento a la vista antes que afirmar algo que no puede demostrar.'),
  TABLA(
    ['Nivel', 'Evidencia exigida', 'Estado resultante', 'Confianza'],
    [
      ['Llave dura', 'Mismo RUT (o mismo N° de documento) + monto exacto (±$1)', 'Conciliada', '1,00 / 0,99'],
      ['Fuerte', 'Monto exacto + fecha dentro de 90 días + glosa similar (≥0,72)', 'Conciliada', '≥0,90'],
      ['Sugerido', 'Monto exacto + fecha en ventana, glosa distinta. Solo se concilia si no hay otra factura compitiendo por el monto', 'Conciliada o Sugerida', '0,60-0,72'],
      ['Propuesta', 'Mismo RUT + monto dentro del 0,5% (pago parcial o diferencia menor)', 'Sugerida', '0,70'],
      ['Solo monto', 'Solo el monto (la fecha queda fuera de la ventana)', 'Pendiente', '—'],
      ['Nada', 'Sin compatibilidad de monto y signo', 'No conciliada', '—'],
    ],
  ),
)

AGREGAR(
  H2('2.3 Reglas que protegen la exactitud'),
  VINETA('Monto exacto ±$1: la cifra se exige al peso. La prueba con grupo de control (sección 4.3) demostró que admitir diferencias de monto fabrica pares falsos.'),
  VINETA('RUT en conflicto: si el banco y el libro traen RUT y son distintos, el par se rechaza aunque el monto sea idéntico.'),
  VINETA('Signo compatible: un cargo (egreso) jamás calza con un abono (ingreso).'),
  VINETA('Montos $0 excluidos: no son pagos reales y "coinciden" con todo.'),
  VINETA('Ambigüedad degrada: si dos facturas compiten por el mismo pago, el par queda "sugerido" para revisión humana en vez de conciliarse.'),
  VINETA('Unicidad 1 a 1: cada banco y cada documento se usan una sola vez por corrida; los duplicados reales encuentran pareja porque los pares se ordenan por calidad.'),
  H2('2.4 Configuración actual y cómo ajustarla'),
  TABLA(
    ['Parámetro', 'Valor', 'Para qué sirve'],
    [
      ['toleranciaMonto', '±$1', 'Diferencia máxima de monto (redondeos). Subirla sin llave dura genera pares falsos'],
      ['toleranciaDias', '90 días', 'Ventana fecha de emisión/vencimiento ↔ pago. Medido: los plazos reales son 60-90 días'],
      ['umbralSimilitud', '0,72', 'Similitud de glosa necesaria para el nivel "fuerte"'],
    ],
  ),
  P([
    T('Estos valores viven en '),
    T('services/matching.ts (MATCHING_DEFAULT)', { b: true }),
    T(' y la aplicación ya expone setMatchingConfig para ajustarlos sin tocar código. Si se cambia, '
      + 'basta pulsar "Conciliar" para re-ejecutar.'),
  ]),
  SALTO(),
)

// ---------- 3. Estados ----------
AGREGAR(
  H1('3. Qué significa cada estado del dashboard'),
  P('Los cinco estados responden preguntas distintas. Confundirlos es lo que produjo el 100% falso de enero.'),
  TABLA(
    ['Estado', 'Qué significa', 'Qué hacer con él'],
    [
      ['Conciliada', 'Existe contraparte real: el movimiento bancario calza con un documento del libro. Exige match_id', 'Nada: está cerrada'],
      ['Resuelta (sin contraparte)', 'No hay documento y NO debe haberlo: traspasos entre cuentas, impuestos, comisiones, tarjetas, línea de crédito. Queda explicada por su código de tesorería', 'Nada, si el código es correcto. Revisar solo si el código es de compra/venta'],
      ['Sugerida', 'Monto exacto y fecha calzan, pero hay facturas compitiendo por el pago o la glosa no concluye', 'Revisar y confirmar o rechazar: cada una aceptada suma al porcentaje'],
      ['Pendiente', 'Solo el monto calza; la fecha queda fuera de la ventana', 'Revisar fecha y documento'],
      ['No conciliada', 'No se encontró contraparte válida', 'Es la brecha real: buscar el documento (comprobante 📎) o confirmar que falta cargarlo'],
    ],
  ),
  H2('3.1 Operación vs tesorería: la lectura correcta del porcentaje'),
  P([
    T('El porcentaje de "conciliado real" se calcula sobre '),
    T('todo el universo del banco', { b: true }),
    T(', y ahí entran movimientos que no deben conciliar. En abril 2026, de $918M movidos: '
      + '$308M son traspasos entre cuentas, $45M impuestos, $56M tarjetas de redes extranjeras, '
      + '$166M factoring y $18M línea de crédito. Es decir, cerca de dos tercios del movimiento de '
      + 'la cuenta son tesorería, no pagos de documentos.'),
  ]),
  P([
    T('Por eso el dashboard ahora muestra el desglose: '),
    T('operación', { b: true }),
    T(' (movimientos con código COVE/IVEN/MER/FACT, que deben calzar con un documento) frente a '),
    T('tesorería', { b: true }),
    T(' (traspasos, impuestos, comisiones, tarjetas). El porcentaje que un contador debe perseguir '
      + 'es la conciliación sobre el universo de operación, no sobre el total.'),
  ]),
  SALTO(),
)

// ---------- 4. Diagnóstico con cifras ----------
AGREGAR(
  H1('4. Diagnóstico de los datos reales'),
  H2('4.1 Cobertura mensual: el banco mueve entre 2 y 4 veces lo que registran los libros'),
  TABLA(
    ['Mes', 'Banco: movs / suma', 'Libro: docs / suma', 'Libro COVE', 'Libro IVEN'],
    [
      ['2026-01', '317 / $1.947.827.480', '245 / $968.403.685', '$427.275.879', '$518.127.949'],
      ['2026-02', '272 / $1.065.799.372', '175 / $488.202.305', '$245.807.297', '$205.926.164'],
      ['2026-03', '353 / $1.363.227.306', '230 / $814.940.499', '$176.436.598', '$470.874.288'],
      ['2026-04', '296 / $915.042.457', '207 / $663.031.095', '$248.699.961', '$401.598.746'],
      ['2026-05', '435 / $719.460.231', '213 / $461.352.922', '$205.519.406', '$243.845.830'],
      ['2026-06', '587 / $1.442.155.120', '269 / $1.144.180.068', '$484.267.016', '$590.197.063'],
      ['2026-07', '442 / $1.488.751.117', '318 / $847.691.878', '$228.715.477', '$497.335.682'],
    ],
  ),
  P([
    T('Lectura: en enero el banco mueve $1.947M y el libro registra $968M. La diferencia no es error '
      + 'de conciliación: es '),
    T('tesorería (traspasos, impuestos, tarjetas) más documentos de meses que no están cargados', { b: true }),
    T('.'),
  ]),
)

AGREGAR(
  H2('4.2 Los traspasos estaban codificados como compras y ventas'),
  P([
    T('1.000 de los 2.702 movimientos del año (37%) tienen glosa de traspaso entre cuentas '
      + '($3.083.483.448). 725 estaban correctamente codificados como TRFC/TRFA, pero '),
    T('264 como COVE y 3 como IVEN ($1.194.924.110)', { b: true }),
    T(' — compras y ventas que no existen. Un traspaso entre cuentas propias no tiene factura.'),
  ]),
  TABLA(
    ['Mes', 'Traspasos mal codificados', 'Monto'],
    [
      ['2026-01', '117', '$608.817.454'],
      ['2026-02', '87', '$319.347.847'],
      ['2026-03', '19', '$96.087.598'],
      ['2026-04', '7', '$16.555.894'],
      ['2026-05', '14', '$28.657.371'],
      ['2026-06', '14', '$67.131.116'],
      ['2026-07', '9', '$58.326.830'],
      ['Total', '267', '$1.194.924.110'],
    ],
  ),
  P([
    T('Corregido: 200 cargos → TRFC y 67 abonos → TRFA, con respaldo en '),
    T('backups/traspasos-recodificados-*.json', { b: true }),
    T('. Efecto en enero: las no conciliadas bajan de 166 a 70.'),
  ]),
  H2('4.3 La prueba que descarta el "matching por monto parecido"'),
  P('Con 1.686 documentos en los libros, el documento más cercano por monto queda cerca POR AZAR. '
    + 'Se comprobó con un grupo de control: los movimientos de tesorería, que por definición no '
    + 'tienen factura, muestran la misma cercanía que los que sí deberían calzar.'),
  TABLA(
    ['Grupo', 'documento más cercano ≤0,5%', '≤1%'],
    [
      ['Tesorería (control, sin contraparte real)', '50%', '72%'],
      ['COVE/IVEN/FACT (deberían calzar)', '45%', '61%'],
    ],
  ),
  P('Conclusión: admitir diferencias de monto sin una llave dura (RUT o N° de documento) fabricaría '
    + 'pares falsos. Por eso la tolerancia de monto solo se aplica cuando el RUT coincide.'),
)

AGREGAR(
  H2('4.4 El motor no pierde pares que existan'),
  P('De los 290 movimientos de enero sin contraparte, solo 9 tienen un documento del libro con el '
    + 'mismo monto (±$1): 2 con la fecha fuera de la ventana, 7 con el documento ya usado por otro '
    + 'pago y 0 con documento libre sin usar. Es decir, no hay ningún par disponible que el motor '
    + 'esté dejando pasar.'),
  H2('4.5 El efecto de la ventana de fechas (60 → 90 días)'),
  P('En abril, 24 pagos sin contraparte tenían su factura con el mismo monto a 62-77 días: facturas '
    + 'de enero pagadas a 60-90 días. Con 60 días esos pares se perdían. Subir la ventana a 90 días '
    + 'agregó 56 pares en el año (316 → 372): marzo +33 y abril +10. Los pares nuevos son '
    + 'verificables: mismo monto al peso y el nombre de la contraparte coincide.'),
  SALTO(),
)

// ---------- 5. Por qué los archivos cargados pueden estar incorrectos ----------
AGREGAR(
  H1('5. Por qué los archivos que se suben pueden estar incorrectos'),
  P('Esta sección es la más importante: describe, una por una, las razones por las que un archivo '
    + 'cargado produce menos conciliaciones de las esperadas. Cada punto indica cómo se nota en la '
    + 'aplicación y cómo corregirlo. Casi todas se previenen al momento de la carga, en la pestaña '
    + '"Carga masiva", revisando el mapeo de columnas antes de importar.'),
  H2('5.1 Se mapeó "Monto Neto" en lugar de "Monto Total"'),
  P('Es el error de mapeo más grave. El libro de compras trae columnas de Monto Neto, Monto IVA y '
    + 'Monto Total. Si la columna mapeada como monto es la del neto, el movimiento queda por el IVA '
    + '(19%) por debajo del pago bancario y jamás calzará al peso.'),
  VINETA('Cómo se nota: ninguna factura calza por monto; el monto del libro siempre es menor que el pago.'),
  VINETA('Corrección: remapear "monto" hacia la columna del TOTAL. La aplicación ahora advierte al '
    + 'cargar cuando el monto no cuadra con neto + IVA + exento.'),
  H2('5.2 La cartola no trae columna de RUT ni de N° de documento'),
  P('Sin RUT o N° de documento no existe llave dura para emparejar: solo queda el monto, y la prueba '
    + 'del grupo de control (4.3) demostró que el monto cercano es azar.'),
  VINETA('Cómo se nota: la columna RUT de la tabla queda vacía ("—") para los movimientos del banco.'),
  VINETA('Corrección: al cargar, mapear la columna RUT y/o N° de documento del extracto. La '
    + 'aplicación además recupera el RUT cuando viene dentro de la glosa '
    + '("PAGO RECIBIDO PRV 078187230-K BCO CHILE").'),
)

AGREGAR(
  H2('5.3 Los libros cargados empiezan tarde'),
  P('Los libros cargados parten el 2026-01-01. Los cobros de enero liquidan facturas emitidas en '
    + 'noviembre y diciembre de 2025, que no existen en la base: no hay contraparte posible.'),
  VINETA('Cómo se nota: los "PAGO RECIBIDO PRV…" de enero quedan no conciliados aunque el cliente '
    + 'sea el correcto y el monto sea idéntico a una factura de un mes anterior.'),
  VINETA('Corrección: cargar los libros de los meses anteriores (al menos 3 meses hacia atrás, por '
    + 'los plazos de 30/60/90 días).'),
  H2('5.4 Falta la cartola de la cuenta destino de los traspasos'),
  P('136 de los 317 movimientos de enero son "TRASPASO FONDOS OTRO BANCO". El dinero sale de BCI '
    + 'hacia otra cuenta y los pagos reales a proveedores ocurren desde esa otra cuenta. Con solo 2 '
    + 'bancos cargados, esa cartola no existe en la aplicación.'),
  VINETA('Cómo se nota: montos redondos y grandes ($6.750.000, $7.000.000) sin contraparte posible.'),
  VINETA('Corrección: cargar la cartola de la cuenta destino. Ahí aparecen los pagos reales a '
    + 'proveedores, que sí calzan con el libro de compras; y los traspasos se concilian entre sí '
    + '(cargo en una cuenta ↔ abono en la otra).'),
)

AGREGAR(
  H2('5.5 Glosas genéricas sin referencia'),
  P('"TRASPASO FONDOS OTRO BANCO EN LINEA" no dice a quién ni por qué. Con una glosa así solo '
    + 'quedan dos vías: el monto (insuficiente, ver 4.3) o el comprobante.'),
  VINETA('Corrección: usar el botón 📎 de la tabla de conciliación para adjuntar el comprobante de '
    + 'la transferencia (PDF o imagen); el modelo de visión extrae beneficiario, RUT y motivo, '
    + 'propone el código y busca la contraparte.'),
  H2('5.6 Pagos parciales sin mapear (P1..P4)'),
  P('Cuando un cliente paga una factura en cuotas, el pago no calza con el TOTAL del documento. La '
    + 'aplicación soporta esto con la columna "Pago del documento (cuota)": sus valores se guardan '
    + 'en metadatos y el matching los usa. En los datos reales, 1.193 de 1.686 documentos del año '
    + 'la tienen mapeada.'),
  VINETA('Cómo se nota: pagos menores que el total de la factura que no calzan con nada.'),
  VINETA('Corrección: mapear las columnas de cuotas (P1..P4, "TOTAL PAGOS", "PAGO ABONO") al campo '
    + '"Pago del documento (cuota)".'),
)

AGREGAR(
  H2('5.7 Fechas sin vencimiento y fechas futuras'),
  P('El matching usa la fecha de VENCIMIENTO como principal y la de emisión solo como respaldo. Si '
    + 'el libro no trae vencimiento (o no se mapea), la ventana se mide contra la emisión y se '
    + 'pierde precisión. Además, la carga rechaza fechas futuras: un cierre con pagos del día 31 '
    + 'cargados antes de que el banco los publique los omite.'),
  VINETA('Corrección: mapear "fecha_vencimiento" y cargar la cartola completa del mes cerrado.'),
  H2('5.8 Formatos de archivo'),
  VINETA('XLS antiguo no soportado: guardar como XLSX.'),
  VINETA('Libros con varias hojas: elegir la hoja correcta en la carga.'),
  VINETA('Encabezados repetidos dentro del cuerpo: la aplicación los omite, pero desalinean el mapeo '
    + 'si la fila de títulos cambia a mitad del archivo.'),
  VINETA('Montos con símbolo de moneda o en USD: verificar el campo moneda (los montos CLP son enteros).'),
  H2('5.9 Duplicados y reimportaciones'),
  P('Cada fila lleva una huella (fingerprint) validada por la base. Reimportar el mismo archivo no '
    + 'duplica filas: el modo "Agregar" las omite y el modo "Reemplazar" borra y recarga. Si un '
    + 'archivo se cargó con mapeo incorrecto, hay que reemplazarlo, no agregarlo.'),
  H2('5.10 Códigos contables asignados aguas arriba'),
  P('La cartola trae una columna de código contable (confianza 1,00 al importar). Si el sistema que '
    + 'la exporta asignó COVE a un traspaso entre cuentas, la app lo replica tal cual. Es el caso '
    + 'de los 267 corregidos (4.2): el error nace en el origen, no en la conciliación.'),
  H2('5.11 Archivos corruptos al transferirlos'),
  P('El comprobante adjuntado por chat llegó con los bytes binarios reemplazados (U+FFFD) y la '
    + 'aplicación no pudo leerlo. Subir los archivos directamente en la aplicación, nunca '
    + 'reenviados por canales que los conviertan a texto.'),
  H2('5.12 Códigos sin alias o desactivados'),
  P('La detección automática depende de los alias del catálogo. Un código sin alias solo se detecta '
    + 'si su ID aparece literal en la glosa. Revisar /codigos y agregar alias por cada glosa frecuente.'),
)

// ---------- 6. Cómo conciliar más ----------
AGREGAR(
  H1('6. Cómo conciliar más: palancas en orden de impacto'),
  TABLA(
    ['#', 'Palanca', 'Impacto', 'Esfuerzo', 'Quién'],
    [
      ['1', 'Revisar las SUGERIDAS/PENDIENTES del período en Conciliación (filtro "Sugeridas"): confirmar o rechazar cada par', 'Cada confirmada suma directo', 'Minutos', 'Analista'],
      ['2', 'Cargar los libros de compras y ventas de los MESES ANTERIORES (nov-dic 2025 y atrás)', 'Alto: desbloquea los cobros y pagos que liquidan facturas anteriores', 'Bajo', 'Contabilidad'],
      ['3', 'Cargar la CARTOLA de la cuenta destino de los traspasos', 'Alto: ahí están los pagos reales a proveedores; y los traspasos se concilian entre sí', 'Bajo', 'Contabilidad'],
      ['4', 'Verificar el MAPEO de columnas en cada carga (monto=total, RUT, vencimiento, cuotas)', 'Alto: evita repetir los errores de origen', 'Bajo', 'Analista'],
    ],
  ),
)

AGREGAR(
  H2('6.1 Continuación de las palancas'),
  TABLA(
    ['#', 'Palanca', 'Impacto', 'Esfuerzo', 'Quién'],
    [
      ['5', 'Usar el COMPROBANTE 📎 en los no conciliados', 'Medio-alto: aporta RUT y motivo, propone código y contraparte', 'Por movimiento', 'Analista'],
      ['6', 'Mantener los ALIAS del catálogo al día (cada glosa frecuente debe tener uno)', 'Medio: sube la detección automática', 'Bajo', 'Analista'],
      ['7', 'Recodificar traspasos codificados como COVE/IVEN (script: 267 aplicados)', 'Limpia el informe: baja las no conciliadas', 'Bajo', 'Hecho'],
      ['8', 'Matching 1:N (un pago = suma de varias facturas del mismo RUT)', 'Medio: cubre pagos consolidados', 'Alto', 'Desarrollo'],
    ],
  ),
  P([
    T('Regla de oro: '),
    T('el motor no inventa pares', { b: true }),
    T('. Si un movimiento no concilia, o falta el documento en la base, o falta la llave que los '
      + 'conecta (RUT, N° de documento). En ambos casos la solución es de datos, no de algoritmo.'),
  ]),
  SALTO(),
)

// ---------- 7. Checklist de cierre mensual ----------
AGREGAR(
  H1('7. Checklist operativo de cierre mensual'),
  VINETA('1. Antes de cargar: revisar /codigos (que exista alias para cada glosa frecuente) y /reglas.'),
  VINETA('2. Cargar los LIBROS del período y los de los 2-3 meses anteriores si faltan. El primer archivo inicia; los siguientes en modo "Agregar".'),
  VINETA('3. En el mapeo de columnas verificar: monto = MONTO TOTAL (no el neto), RUT, folio, tipo de documento, vencimiento y cuotas de pago.'),
  VINETA('4. Atender los avisos de la carga: montos que no cuadran con neto+IVA+exento, RUT inválidos, fechas futuras.'),
  VINETA('5. Cargar las CARTOLAS del mes (todas las cuentas, incluida la destino de los traspasos).'),
  VINETA('6. Pulsar "Conciliar". Revisar el desglose operación/tesorería del dashboard.'),
  VINETA('7. Filtro "Sugeridas": confirmar o rechazar cada par.'),
  VINETA('8. Filtro "No conciliadas": para cada una, buscar contraparte, usar el comprobante 📎, o asignar código de tesorería y marcar resuelta.'),
  VINETA('9. Exportar el reporte (Excel/PDF) y verificar que la brecha explicada cierre.'),
  VINETA('10. Auditoría mensual: node scripts/auditar-resueltas.mjs AAAA-MM (agrupados por código y origen).'),
)

AGREGAR(
  H1('8. Metas realistas'),
  TABLA(
    ['Métrica', 'Enero hoy', 'Objetivo', 'Cómo se logra'],
    [
      ['Conciliadas (pares reales)', '13', '60-75% del universo de OPERACIÓN', 'Cargar libros anteriores y la cartola destino; revisar sugeridas; comprobantes'],
      ['Explicado (conciliadas + resueltas)', '73%', '≥ 90%', 'Con los datos anteriores más la auditoría de códigos'],
      ['No conciliadas', '70', '< 15', 'Comprobantes y carga de datos faltantes'],
      ['Sugeridas pendientes de revisión', '14', '0 al cierre', 'Revisión en Conciliación'],
    ],
  ),
  P([
    T('Importante: el porcentaje de conciliación sobre '),
    T('todo el banco', { b: true }),
    T(' no debe apuntar a 90% ni 100%. En esta empresa cerca de dos tercios del movimiento de la '
      + 'cuenta son tesorería (traspasos, impuestos, tarjetas) que no tienen documento contable. '
      + 'El número a gestionar es la conciliación sobre los movimientos de operación.'),
  ]),
)

// ---------- 9. Herramientas ----------
AGREGAR(
  H1('9. Herramientas incluidas en el repositorio'),
  TABLA(
    ['Script', 'Para qué', 'Uso'],
    [
      ['scripts/auditar-resueltas.mjs', 'Auditoría completa de un período: estados, KPIs, de qué están "resueltas" (código x origen), las de menor confianza y las conciliadas con su par', 'node scripts/auditar-resueltas.mjs 2026-01'],
      ['scripts/auditar-resueltas.sql', 'Las mismas consultas para pegar en el SQL Editor de Supabase (no necesita claves)', 'Pegar y ejecutar'],
      ['scripts/revertir-resueltas-banco.mjs', 'Devuelve a "no_conciliada" los movimientos en "resuelta" para que el motor los re-evalue. Con respaldo JSON y dry-run', 'node scripts/revertir-resueltas-banco.mjs --aplicar'],
      ['scripts/recodificar-traspasos.mjs', 'Recodifica traspasos con código de compra/venta a TRFC/TRFA. Con respaldo y dry-run', 'node scripts/recodificar-traspasos.mjs --aplicar'],
    ],
  ),
  P('Todas parten en modo dry-run y escriben respaldo en backups/ antes de modificar. Requieren '
    + 'SUPABASE_SERVICE_ROLE_KEY en el entorno o en .env.'),
)

// ---------- 10. Conclusiones ----------
AGREGAR(
  H1('10. Conclusiones'),
  VINETA('El motor de conciliación está verificado: no pierde pares disponibles, exige monto exacto al peso, rechaza RUT en conflicto y degrada lo ambiguo a revisión humana.'),
  VINETA('El 100% falso de enero venía de un uso incorrecto de "Resolver banco codificado": hoy ese botón excluye los códigos que exigen documento y el store lo valida.'),
  VINETA('Dos correcciones de datos subieron la cobertura: 267 traspasos recodificados y la ventana de fechas de 90 días (+56 pares).'),
  VINETA('Para subir el porcentaje de forma sostenible hay que completar los datos: libros de los meses anteriores, cartola de la cuenta destino y cartolas completas por mes.'),
  VINETA('El flujo de comprobantes aporta la referencia que la cartola no trae (RUT, beneficiario, motivo) y concilia desde ahí.'),
  VINETA('La métrica a gestionar es la conciliación sobre los movimientos de OPERACIÓN; la tesorería se explica por código y no debe contar como brecha.'),
  P([
    T('Próximo paso recomendado: '),
    T('cargar los libros de noviembre y diciembre 2025 y la cartola de la cuenta destino, pulsar '
      + '"Conciliar" y medir con scripts/auditar-resueltas.mjs. Con esos datos la cobertura de '
      + 'operación debería superar el 60%.', { b: true }),
  ]),
)

// ---------- Generación del documento ----------
const destino = path.join(RAIZ, 'docs', 'Guia-conciliacion-y-calidad-de-datos.docx')
fs.mkdirSync(path.dirname(destino), { recursive: true })

const doc = new Document({
  creator: 'ConciliaBK',
  title: 'Diagnóstico y guía para aumentar las conciliaciones bancarias',
  description: 'Diagnóstico de la conciliación, calidad de los archivos cargados y plan operativo',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22 } },
      heading1: { run: { font: 'Calibri', size: 32, bold: true, color: '1F3864' } },
      heading2: { run: { font: 'Calibri', size: 26, bold: true, color: '2E5496' } },
      heading3: { run: { font: 'Calibri', size: 23, bold: true, color: '2E5496' } },
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
