import type ExcelJS from 'exceljs'
import type { Codigo, Regla, Transaccion } from '@/types/conciliacion'
import { calcularKpis } from '@/lib/selectors'
import { formatCLP, formatDateCL, formatPercent } from '@/lib/format'
import { formatRUT } from '@/lib/rut'

interface DatosReporte {
  transacciones: Transaccion[]
  reglas: Regla[]
  codigos: Codigo[]
}

function detalleCodigo(t: Transaccion, codigos: Codigo[]): string {
  const codigo = codigos.find((item) => item.id === t.codigoId)
  if (!codigo) return t.codigoId ?? '—'
  return `${codigo.clave ? `${codigo.clave} · ` : ''}${codigo.id} · ${codigo.nombre}`
}

/** Exporta un informe en Excel con resumen, no conciliadas y reglas. */
export async function exportarExcel({ transacciones, codigos }: DatosReporte): Promise<void> {
  const kpis = calcularKpis(transacciones)
  const noConciliadas = transacciones.filter((t) => t.estado !== 'conciliada')
  const { default: ExcelJSRuntime } = await import('exceljs')
  const wb = new ExcelJSRuntime.Workbook()
  wb.creator = 'Conciliación bancaria'
  wb.created = new Date()

  agregarHoja(wb, 'Resumen', [
    ['Conciliación bancaria — Informe ejecutivo'],
    ['Generado', new Date().toLocaleString('es-CL')],
    [],
    ['Métrica', 'Valor'],
    ['Total de transacciones', kpis.totalTransacciones],
    ['Monto total (CLP)', kpis.montoTotal],
    ['Monto no conciliado (CLP)', kpis.montoNoConciliado],
    ['Tasa de conciliación', `${kpis.tasaConciliacion.toFixed(1)}%`],
  ])

  agregarObjetos(wb, 'No conciliadas', noConciliadas.map((t) => ({
    Fecha: formatDateCL(t.fecha),
    Origen: t.fuente,
    Banco: t.banco ?? '—',
    Descripción: t.descripcion,
    Contraparte: t.contraparte ?? '—',
    RUT: t.rut ? formatRUT(t.rut) : '—',
    Monto: t.monto,
    Código: detalleCodigo(t, codigos),
    Categoría: t.categoria ?? '—',
    Estado: t.estado,
  })))

  agregarObjetos(wb, 'Todas', transacciones.map((t) => ({
    Fecha: formatDateCL(t.fecha),
    Origen: t.fuente,
    Banco: t.banco ?? '—',
    Descripción: t.descripcion,
    Contraparte: t.contraparte ?? '—',
    RUT: t.rut ? formatRUT(t.rut) : '—',
    Monto: t.monto,
    Código: detalleCodigo(t, codigos),
    'Origen código': t.codigoOrigen ?? '—',
    'Confianza código': t.codigoConfianza != null ? formatPercent(t.codigoConfianza) : '—',
    Categoría: t.categoria ?? '—',
    Estado: t.estado,
    Confianza: t.confianza != null ? formatPercent(t.confianza) : '—',
  })))

  const buffer = await wb.xlsx.writeBuffer()
  descargarBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `informe-conciliacion-${hoy()}.xlsx`,
  )
}

function agregarHoja(
  wb: ExcelJS.Workbook,
  nombre: string,
  filas: Array<Array<string | number>>,
): void {
  const ws = wb.addWorksheet(nombre)
  ws.addRows(filas)
  // ExcelJS deja `columns` en null cuando la hoja no tiene celdas (p. ej. sin datos).
  ws.columns?.forEach((col) => { col.width = 24 })
}

function agregarObjetos(
  wb: ExcelJS.Workbook,
  nombre: string,
  filas: Array<Record<string, string | number>>,
): void {
  const headers = filas.length > 0 ? Object.keys(filas[0]) : []
  const valores = filas.map((fila) => headers.map((header) => fila[header]))
  agregarHoja(wb, nombre, [headers, ...valores])
  const ws = wb.getWorksheet(nombre)
  if (ws) ws.getRow(1).font = { bold: true }
}

function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

/** Exporta un informe en PDF con resumen ejecutivo y detalle de no conciliadas. */
export async function exportarPDF({ transacciones, reglas, codigos }: DatosReporte): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const kpis = calcularKpis(transacciones)
  const noConciliadas = transacciones.filter((t) => t.estado !== 'conciliada')
  const conciliadas = transacciones.filter((t) => t.estado === 'conciliada')
  // Horizontal: la tabla de detalle lleva 7 columnas al incluir la contraparte.
  const doc = new jsPDF({ orientation: 'landscape' })

  doc.setFontSize(18)
  doc.text('Informe de conciliación bancaria', 14, 20)
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text(`Generado el ${new Date().toLocaleString('es-CL')}`, 14, 27)

  autoTable(doc, {
    startY: 34,
    head: [['Métrica', 'Valor']],
    body: [
      ['Total de transacciones', String(kpis.totalTransacciones)],
      ['Monto total', formatCLP(kpis.montoTotal)],
      ['Monto no conciliado', formatCLP(kpis.montoNoConciliado)],
      ['Tasa de conciliación', formatPercent(kpis.tasaConciliacion, true)],
      ['Reglas aplicadas', String(reglas.filter((r) => r.activa).length)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [0, 51, 160] },
  })

  // Tabla de transacciones conciliadas (matches realizados).
  autoTable(doc, {
    head: [[`Transacciones conciliadas (${conciliadas.length})`]],
    body: [],
    theme: 'striped',
    headStyles: { fillColor: [0, 155, 119], textColor: 255 },
    margin: { top: 4 },
  })
  autoTable(doc, {
    head: [['Fecha', 'Origen', 'Descripción', 'Contraparte', 'Monto', 'Código', 'Categoría']],
    body: conciliadas.map((t) => [
      formatDateCL(t.fecha),
      t.fuente === 'banco' ? t.banco ?? 'Banco' : 'Contabilidad',
      t.descripcion,
      t.contraparte ?? '—',
      formatCLP(t.monto),
      detalleCodigo(t, codigos),
      t.categoria ?? '—',
    ]),
    theme: 'grid',
    headStyles: { fillColor: [0, 155, 119] },
    styles: { fontSize: 8 },
    columnStyles: { 2: { cellWidth: 80 }, 3: { cellWidth: 55 } },
  })

  // Tabla de transacciones no conciliadas (pendientes de revisión).
  autoTable(doc, {
    head: [[`Transacciones no conciliadas (${noConciliadas.length})`]],
    body: [],
    theme: 'striped',
    headStyles: { fillColor: [211, 47, 47], textColor: 255 },
    margin: { top: 4 },
  })
  autoTable(doc, {
    head: [['Fecha', 'Origen', 'Descripción', 'Contraparte', 'Monto', 'Código', 'Estado']],
    body: noConciliadas.map((t) => [
      formatDateCL(t.fecha),
      t.fuente === 'banco' ? t.banco ?? 'Banco' : 'Contabilidad',
      t.descripcion,
      t.contraparte ?? '—',
      formatCLP(t.monto),
      detalleCodigo(t, codigos),
      t.estado,
    ]),
    theme: 'grid',
    headStyles: { fillColor: [211, 47, 47] },
    styles: { fontSize: 8 },
    columnStyles: { 2: { cellWidth: 80 }, 3: { cellWidth: 55 } },
  })

  doc.save(`informe-conciliacion-${hoy()}.pdf`)
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}
