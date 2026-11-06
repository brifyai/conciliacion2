import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import { PageHeader } from '@/components/common/PageHeader'
import { Dropzone } from '@/components/common/Dropzone'
import { useConciliacionStore } from '@/store/useConciliacionStore'
import {
  analizarFilas,
  calcularHashArchivo,
  contarFechasFuturas,
  crearIdImportacion,
  detectarPerfilArchivo,
  leerArchivo,
  leerHoja,
  sugerirMapeo,
  type CampoMapeado,
  type Fila,
  type MapeoColumnas,
  type PerfilArchivo,
  type Progreso,
} from '@/services/parseFiles'
import { aplicarCodigos, resumenCodigosDetectados } from '@/services/categoriesEngine'
import type { BancoChileno, FuenteDatos, ProgresoImportacion } from '@/types/conciliacion'

function detectarBancoPorNombre(nombreArchivo: string, bancos: string[]): string | null {
  const normalizar = (texto: string) => texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const archivo = normalizar(nombreArchivo)
  const palabrasArchivo = new Set(archivo.split(/\s+/))
  const candidatos = bancos
    .filter((nombre) => normalizar(nombre) !== 'otro')
    .map((nombre) => {
      const normalizado = normalizar(nombre)
      const palabras = normalizado
        .split(/\s+/)
        .filter((palabra) => !['banco', 'de', 'del'].includes(palabra))
      const coincide = archivo.includes(normalizado) ||
        (palabras.length > 0 && palabras.every((palabra) => palabrasArchivo.has(palabra)))
      return { nombre, coincide, peso: palabras.join('').length }
    })
    .filter((item) => item.coincide)
    .sort((a, b) => b.peso - a.peso)
  return candidatos[0]?.nombre ?? null
}

const PERFILES_CONTABLES: { value: Exclude<PerfilArchivo, 'banco'>; label: string }[] = [
  { value: 'compras', label: 'Compras' },
  { value: 'ventas', label: 'Ventas' },
  { value: 'nota_credito', label: 'Nota Crédito' },
  { value: 'nota_debito', label: 'Nota Débito' },
  { value: 'factoring', label: 'Factoring' },
]

const CAMPOS: { value: CampoMapeado; label: string }[] = [
  { value: 'fecha', label: 'Fecha' },
  { value: 'monto', label: 'Monto / Total' },
  { value: 'cargo', label: 'Cargo (egreso)' },
  { value: 'abono', label: 'Abono (ingreso)' },
  { value: 'descripcion', label: 'Descripción / Glosa' },
  { value: 'rut', label: 'RUT' },
  { value: 'saldo', label: 'Saldo bancario' },
  { value: 'saldo_documento', label: 'Saldo documento' },
  { value: 'pago_parcial', label: 'Pago del documento (cuota)' },
  { value: 'documento', label: 'Documento / referencia' },
  { value: 'external_id', label: 'ID externo / UUID' },
  { value: 'contraparte', label: 'Contraparte' },
  { value: 'codigo_contable', label: 'Código contable / clave cliente' },
  { value: 'codigo_aliases', label: 'Aliases (fusionar al catálogo)' },
  { value: 'codigo_tipo_doc', label: 'Código tipo doc. SII' },
  { value: 'proveedor', label: 'Proveedor (legado)' },
  { value: 'tipo_doc', label: 'Tipo Doc.' },
  { value: 'folio', label: 'Folio / Factura' },
  { value: 'folio_referencia', label: 'Folio referencia' },
  { value: 'tipo_doc_referencia', label: 'Tipo doc. referencia' },
  { value: 'subtipo_documento', label: 'Subtipo documento' },
  { value: 'exento', label: 'Exento' },
  { value: 'neto', label: 'Neto' },
  { value: 'iva_total', label: 'IVA total' },
  { value: 'iva_debito', label: 'IVA débito' },
  { value: 'iva_recup', label: 'IVA Recup.' },
  { value: 'iva_nr', label: 'IVA NR' },
  { value: 'fecha_vencimiento', label: 'Fecha Venc.' },
  { value: 'estado_pago', label: 'Estado Pago' },
  { value: 'ignorar', label: 'Ignorar (a metadatos)' },
]

export function CargaPage() {
  const navigate = useNavigate()
  const agregarTransacciones = useConciliacionStore((s) => s.agregarTransacciones)
  const reemplazarTransacciones = useConciliacionStore((s) => s.reemplazarTransacciones)
  const limpiarTransacciones = useConciliacionStore((s) => s.limpiarTransacciones)
  const transaccionesExistentes = useConciliacionStore((s) => s.transacciones)
  const codigos = useConciliacionStore((s) => s.codigos)
  const bancosCatalogo = useConciliacionStore((s) => s.bancos)
  const agregarBanco = useConciliacionStore((s) => s.agregarBanco)
  const eliminarBanco = useConciliacionStore((s) => s.eliminarBanco)
  const bancos = useMemo(() => bancosCatalogo.map((item) => item.nombre), [bancosCatalogo])

  const [fuente, setFuente] = useState<FuenteDatos>('banco')
  const [banco, setBanco] = useState<BancoChileno>('')
  const [perfil, setPerfil] = useState<PerfilArchivo>('banco')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filas, setFilas] = useState<Fila[]>([])
  const [encabezados, setEncabezados] = useState<string[]>([])
  const [mapeo, setMapeo] = useState<MapeoColumnas>({})
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [hojas, setHojas] = useState<string[]>([])
  const [hojaActiva, setHojaActiva] = useState('')
  const [dialogoReemplazo, setDialogoReemplazo] = useState(false)
  const [limpiando, setLimpiando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [progresoImportacion, setProgresoImportacion] = useState<ProgresoImportacion | null>(null)
  const [hashArchivo, setHashArchivo] = useState('')
  const [administrandoBancos, setAdministrandoBancos] = useState(false)
  const [nuevoBanco, setNuevoBanco] = useState('')
  const [guardandoBanco, setGuardandoBanco] = useState(false)
  const [errorBanco, setErrorBanco] = useState<string | null>(null)
  const fileRef = useRef<File | null>(null)
  const importandoRef = useRef(false)

  useEffect(() => {
    if (bancos.length === 0) {
      setBanco('')
    } else if (!bancos.includes(banco)) {
      setBanco(bancos[0])
    }
  }, [banco, bancos])

  const handleAgregarBanco = async () => {
    const limpio = nuevoBanco.trim().replace(/\s+/g, ' ')
    if (!limpio) return
    setGuardandoBanco(true)
    setErrorBanco(null)
    try {
      await agregarBanco(limpio)
      setNuevoBanco('')
      setBanco(limpio)
    } catch (e) {
      setErrorBanco(e instanceof Error ? e.message : 'No se pudo agregar el banco.')
    } finally {
      setGuardandoBanco(false)
    }
  }

  const handleEliminarBanco = async (nombre: string) => {
    setGuardandoBanco(true)
    setErrorBanco(null)
    try {
      await eliminarBanco(nombre)
    } catch (e) {
      setErrorBanco(e instanceof Error ? e.message : 'No se pudo eliminar el banco.')
    } finally {
      setGuardandoBanco(false)
    }
  }

  const handleFiles = async (files: File[]) => {
    const file = files[0]
    fileRef.current = file
    setParsing(true)
    setError(null)
    setProgreso({ etapa: 'Iniciando…' })
    try {
      const [res, hash] = await Promise.all([
        leerArchivo(file, (p) => setProgreso(p)),
        calcularHashArchivo(file),
      ])
      setHashArchivo(hash)
      if (res.filas.length === 0) {
        setError('El archivo no contiene filas legibles.')
      } else {
        setFilas(res.filas)
        setEncabezados(res.encabezados)
        const perfilDetectado = detectarPerfilArchivo(file.name, res.encabezados)
        setPerfil(perfilDetectado)
        setFuente(perfilDetectado === 'banco' ? 'banco' : 'contabilidad')
        if (perfilDetectado === 'banco') {
          const bancoDetectado = detectarBancoPorNombre(file.name, bancos)
          if (bancoDetectado) setBanco(bancoDetectado)
        }
        setMapeo(sugerirMapeo(res.encabezados, perfilDetectado))
        setNombreArchivo(file.name)
        setHojas(res.hojas)
        setHojaActiva(res.hoja)
        if (res.erroresLectura.length > 0) {
          setError(`El CSV contiene ${res.erroresLectura.length} advertencia(s): ${res.erroresLectura[0]}`)
        }
      }
    } catch {
      setError('No se pudo leer el archivo. Verifica el formato (CSV/XLSX).')
    } finally {
      setParsing(false)
      setProgreso(null)
    }
  }

  const cambiarHoja = async (hoja: string) => {
    if (!fileRef.current || hoja === hojaActiva) return
    setParsing(true)
    setError(null)
    setProgreso({ etapa: 'Cargando hoja…' })
    try {
      const res = await leerHoja(fileRef.current, hoja, (p) => setProgreso(p))
      setFilas(res.filas)
      setEncabezados(res.encabezados)
      const perfilDetectado = detectarPerfilArchivo(fileRef.current.name, res.encabezados)
      setPerfil(perfilDetectado)
      setFuente(perfilDetectado === 'banco' ? 'banco' : 'contabilidad')
      setMapeo(sugerirMapeo(res.encabezados, perfilDetectado))
      setHojaActiva(hoja)
    } catch {
      setError('No se pudo leer la hoja seleccionada.')
    } finally {
      setParsing(false)
      setProgreso(null)
    }
  }

  const cambiarFuente = (nuevaFuente: FuenteDatos) => {
    const nuevoPerfil: PerfilArchivo = nuevaFuente === 'banco'
      ? 'banco'
      : perfil === 'banco' ? 'compras' : perfil
    setFuente(nuevaFuente)
    setPerfil(nuevoPerfil)
    if (encabezados.length > 0) setMapeo(sugerirMapeo(encabezados, nuevoPerfil))
  }

  const cambiarPerfil = (nuevoPerfil: Exclude<PerfilArchivo, 'banco'>) => {
    setPerfil(nuevoPerfil)
    setFuente('contabilidad')
    if (encabezados.length > 0) setMapeo(sugerirMapeo(encabezados, nuevoPerfil))
  }

  const convertir = () => analizarFilas(
    filas,
    mapeo,
    fuente,
    fuente === 'banco' ? banco : undefined,
    perfil,
  )

  const camposDuplicados = useMemo(() => {
    const conteo = new Map<CampoMapeado, number>()
    // 'pago_parcial' admite varias columnas (P1..Pn), no es duplicado.
    const MULTI: ReadonlySet<CampoMapeado> = new Set(['ignorar', 'pago_parcial'])
    for (const campo of Object.values(mapeo)) {
      if (!MULTI.has(campo)) conteo.set(campo, (conteo.get(campo) ?? 0) + 1)
    }
    return [...conteo.entries()]
      .filter(([, cantidad]) => cantidad > 1)
      .map(([campo]) => CAMPOS.find((item) => item.value === campo)?.label ?? campo)
  }, [mapeo])

  const confirmar = () => {
    if (importandoRef.current) return
    if (fuente === 'banco' && !banco) {
      setError('Agrega y selecciona un banco antes de importar la cartola.')
      return
    }
    if (camposDuplicados.length > 0) {
      setError(`Cada campo escalar debe tener una sola columna. Revisa: ${camposDuplicados.join(', ')}.`)
      return
    }
    if (transaccionesExistentes.length > 0) {
      setDialogoReemplazo(true)
      return
    }
    void aplicarCarga('reemplazar')
  }

  const aplicarCarga = async (modo: 'reemplazar' | 'agregar') => {
    if (importandoRef.current) return
    if (camposDuplicados.length > 0) {
      setError(`No se puede importar con campos duplicados: ${camposDuplicados.join(', ')}.`)
      return
    }
    if (!hashArchivo) {
      setError('No se pudo calcular la huella del archivo. Vuelve a seleccionarlo.')
      return
    }

    // El ref bloquea dobles clics antes de que React alcance a renderizar el estado disabled.
    importandoRef.current = true
    setImportando(true)
    setProgresoImportacion({
      etapa: 'preparando', actual: 0, total: 1,
      mensaje: 'Validando y preparando las filas…',
    })
    setError(null)

    try {
      // Cede el control para que el navegador muestre el diálogo antes del trabajo síncrono.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))

      // El bloqueo por fecha futura solo aplica a cartolas bancarias: un
      // movimiento bancario futuro casi siempre indica un error de formato.
      // Los documentos contables (facturas, notas) sí pueden tener fechas
      // legítimas más adelante en el año, así que no se bloquean.
      if (fuente === 'banco') {
        const fechasFuturas = contarFechasFuturas(filas, mapeo)
        if (fechasFuturas > 0) {
          setError(
            `La cartola contiene ${fechasFuturas} fila(s) con fecha futura. Corrige esas fechas antes de importar.`,
          )
          return
        }
      }

      const conversion = convertir()
      const clasificadas = aplicarCodigos(conversion.transacciones, codigos)
      if (clasificadas.length === 0) {
        setError('No se reconocieron transacciones válidas. Revisa el mapeo de columnas.')
        return
      }

      const importId = crearIdImportacion(
        hashArchivo,
        JSON.stringify({ fuente, banco, perfil, hojaActiva, mapeo, modo }),
      )
      const resultado = modo === 'reemplazar'
        ? await reemplazarTransacciones(
            clasificadas, importId, nombreArchivo, setProgresoImportacion,
          )
        : await agregarTransacciones(
            clasificadas, importId, nombreArchivo, setProgresoImportacion,
          )
      if (resultado.yaImportado) {
        setError('Este archivo y mapeo ya fueron importados; no se crearon duplicados.')
        return
      }
      navigate('/conciliacion')
    } catch (e) {
      const mensaje = e instanceof Error
        ? e.message
        : e && typeof e === 'object' && 'message' in e
          ? String(e.message)
          : 'No se pudo completar la importación.'
      setError(mensaje)
    } finally {
      importandoRef.current = false
      setImportando(false)
      setProgresoImportacion(null)
    }
  }

  const handleLimpiarTodo = async () => {
    setLimpiando(true)
    try {
      await limpiarTransacciones()
      limpiar()
    } catch {
      setError('No se pudieron limpiar los datos. Intenta de nuevo.')
    } finally {
      setLimpiando(false)
    }
  }

  const limpiar = () => {
    setFilas([])
    setEncabezados([])
    setMapeo({})
    setNombreArchivo('')
    setHojas([])
    setHojaActiva('')
    setHashArchivo('')
    fileRef.current = null
    setError(null)
  }

  const diagnostico = useMemo(
    () => analizarFilas(
      filas,
      mapeo,
      fuente,
      fuente === 'banco' ? banco : undefined,
      perfil,
    ),
    [filas, mapeo, fuente, banco, perfil],
  )

  // Movimientos que traen en el archivo una referencia de código que no existe
  // en el catálogo (por ejemplo la marca "ASIGNAR MANUALMENTE"): se importan sin
  // código para asignarlo a mano, y conviene avisarlo aquí.
  const codigosDesconocidos = useMemo(() => {
    if (codigos.length === 0 || diagnostico.transacciones.length === 0) return 0
    const validos = new Set(
      codigos
        .filter((c) => c.activo)
        .flatMap((c) => [c.id.toUpperCase(), (c.clave ?? '').toUpperCase()])
        .filter(Boolean),
    )
    return diagnostico.transacciones.filter(
      (t) => t.codigoReferencia && !validos.has(t.codigoReferencia.trim().toUpperCase()),
    ).length
  }, [diagnostico, codigos])

  // Preview de clasificación por códigos sobre las filas realmente válidas.
  const previewClasificacion = useMemo(() => {
    if (diagnostico.transacciones.length === 0 || codigos.length === 0) return null
    return resumenCodigosDetectados(diagnostico.transacciones, codigos)
  }, [diagnostico, codigos])

  const totalClasificadas = previewClasificacion
    ? Object.values(previewClasificacion).reduce((acc, x) => acc + x.count, 0)
    : 0
  const porcentajeClasificado = diagnostico.transacciones.length > 0
    ? Math.round((totalClasificadas / diagnostico.transacciones.length) * 100)
    : 0

  const preview = filas.slice(0, 5)
  const tieneMonto =
    Object.values(mapeo).includes('monto') ||
    Object.values(mapeo).includes('cargo') ||
    Object.values(mapeo).includes('abono')
  const tieneFecha = Object.values(mapeo).includes('fecha')

  // Un libro cargado como "Banco" no concilia nunca: se detecta por las
  // columnas propias de un libro (tipo/folio/neto/IVA/exento/vencimiento) y se
  // bloquea la importación hasta corregir la Fuente.
  const pareceLibro =
    fuente === 'banco' &&
    Object.values(mapeo).some((campo) =>
      [
        'tipo_doc', 'folio', 'neto', 'iva_total', 'iva_recup', 'iva_nr', 'exento',
        'fecha_vencimiento', 'proveedor',
      ].includes(campo),
    )

  // Porcentaje de progreso para la barra (0–100).
  const pctProgreso =
    progreso && progreso.total
      ? Math.round(((progreso.actual ?? 0) / progreso.total) * 100)
      : progreso
        ? null // indeterminado
        : 0

  return (
    <Box>
      <PageHeader
        title="Carga masiva de datos"
        subtitle="Sube tu extracto bancario o libro contable para conciliar."
        actions={
          <Stack direction="row" spacing={1}>
            {transaccionesExistentes.length > 0 && (
              <Button
                startIcon={<DeleteOutlineRoundedIcon />}
                onClick={handleLimpiarTodo}
                variant="outlined"
                color="error"
                disabled={limpiando}
              >
                {limpiando ? 'Limpiando…' : `Borrar datos (${transaccionesExistentes.length.toLocaleString('es-CL')})`}
              </Button>
            )}
            {filas.length > 0 && (
              <Button startIcon={<ReplayRoundedIcon />} onClick={limpiar} variant="outlined">
                Limpiar
              </Button>
            )}
          </Stack>
        }
      />

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  1. Origen de los datos
                </Typography>
                <TextField
                  select
                  label="Tipo de archivo"
                  value={fuente}
                  onChange={(e) => cambiarFuente(e.target.value as FuenteDatos)}
                  fullWidth
                >
                  <MenuItem value="banco">Extracto bancario</MenuItem>
                  <MenuItem value="contabilidad">Libro contable</MenuItem>
                </TextField>
                {fuente === 'banco' && (
                  <Stack spacing={1}>
                    <TextField
                      select
                      label="Banco"
                      value={banco}
                      onChange={(e) => setBanco(e.target.value as BancoChileno)}
                      fullWidth
                      helperText={bancos.length === 0 ? 'Agrega al menos un banco para continuar.' : undefined}
                    >
                      {bancos.length === 0 && (
                        <MenuItem value="" disabled>Sin bancos configurados</MenuItem>
                      )}
                      {bancos.map((nombre) => (
                        <MenuItem key={nombre} value={nombre}>{nombre}</MenuItem>
                      ))}
                    </TextField>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AccountBalanceRoundedIcon />}
                      onClick={() => {
                        setErrorBanco(null)
                        setAdministrandoBancos(true)
                      }}
                    >
                      Administrar bancos
                    </Button>
                  </Stack>
                )}
                {fuente === 'contabilidad' && (
                  <TextField
                    select
                    label="Perfil contable"
                    value={perfil === 'banco' ? 'compras' : perfil}
                    onChange={(e) => cambiarPerfil(e.target.value as Exclude<PerfilArchivo, 'banco'>)}
                    fullWidth
                    helperText="Se autodetecta al cargar; puedes corregirlo manualmente."
                  >
                    {PERFILES_CONTABLES.map((opcion) => (
                      <MenuItem key={opcion.value} value={opcion.value}>{opcion.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                2. Selecciona tu archivo
              </Typography>
              {parsing ? (
                <Stack spacing={1.5} sx={{ py: 4 }}>
                  <LinearProgress
                    variant={pctProgreso === null ? 'indeterminate' : 'determinate'}
                    value={pctProgreso ?? 0}
                  />
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      {progreso?.etapa ?? 'Procesando…'}
                    </Typography>
                    {progreso?.total ? (
                      <Typography variant="caption" color="text.secondary">
                        {(progreso.actual ?? 0).toLocaleString('es-CL')} /{' '}
                        {progreso.total.toLocaleString('es-CL')} filas
                        {pctProgreso !== null ? ` · ${pctProgreso}%` : ''}
                      </Typography>
                    ) : null}
                  </Stack>
                </Stack>
              ) : (
                <Dropzone onFiles={handleFiles} disabled={filas.length > 0} />
              )}
              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
              )}
              {nombreArchivo && !parsing && (
                <Alert severity="success" icon={<CheckCircleRoundedIcon />} sx={{ mt: 2 }}>
                  <strong>{nombreArchivo}</strong> · {filas.length.toLocaleString('es-CL')} filas detectadas
                </Alert>
              )}
              {hojas.length > 1 && !parsing && (
                <TextField
                  select
                  size="small"
                  label="Hoja del Excel"
                  value={hojaActiva}
                  onChange={(e) => cambiarHoja(e.target.value)}
                  sx={{ mt: 2, minWidth: 260 }}
                >
                  {hojas.map((h) => (
                    <MenuItem key={h} value={h}>{h}</MenuItem>
                  ))}
                </TextField>
              )}
            </CardContent>
          </Card>
        </Grid>

        {filas.length > 0 && (
          <>
            <Grid item xs={12} md={5}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    3. Mapeo de columnas
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                    Confirma qué columna corresponde a cada campo (sugerencia automática aplicada).
                  </Typography>
                  <Stack spacing={1.5}>
                    {encabezados.map((head) => (
                      <Stack key={head} direction="row" spacing={1.5} alignItems="center">
                        <Typography
                          variant="body2"
                          sx={{ flex: 1, fontFamily: 'monospace', color: 'text.secondary' }}
                          noWrap
                        >
                          {head}
                        </Typography>
                        <TextField
                          select
                          size="small"
                          value={mapeo[head] ?? 'ignorar'}
                          onChange={(e) =>
                            setMapeo((m) => ({ ...m, [head]: e.target.value as CampoMapeado }))
                          }
                          sx={{ width: 200 }}
                        >
                          {CAMPOS.map((c) => (
                            <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                          ))}
                        </TextField>
                      </Stack>
                    ))}
                  </Stack>
                  {camposDuplicados.length > 0 && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      Hay campos escalares asignados más de una vez: {camposDuplicados.join(', ')}.
                      Deja una sola columna por campo antes de importar.
                    </Alert>
                  )}
                  {pareceLibro && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      Este archivo parece un <strong>libro de compras o ventas</strong> (trae
                      tipo de documento, folio, neto o IVA), pero la Fuente está en{' '}
                      <strong>Banco</strong>. Cambia la Fuente a <strong>Contabilidad</strong> y
                      elige el perfil (Compras o Ventas): cargado como cartola no podrá conciliar
                      con nada.
                    </Alert>
                  )}
                  {(!tieneMonto || !tieneFecha) && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      Asigna la fecha y un monto, o las columnas separadas Cargo/Abono.
                    </Alert>
                  )}
                  {tieneMonto && tieneFecha && diagnostico.diagnosticos.length > 0 && (
                    <Alert
                      severity={diagnostico.omitidas > 0 ? 'warning' : 'info'}
                      sx={{ mt: 2 }}
                    >
                      {diagnostico.transacciones.length.toLocaleString('es-CL')} filas válidas ·{' '}
                      {diagnostico.omitidas.toLocaleString('es-CL')} omitidas ·{' '}
                      {diagnostico.advertencias.toLocaleString('es-CL')} advertencias.
                      {diagnostico.diagnosticos[0]
                        ? ` Primera observación: fila ${diagnostico.diagnosticos[0].fila}, ${diagnostico.diagnosticos[0].motivo}.`
                        : ''}
                    </Alert>
                  )}
                  {tieneMonto && tieneFecha && codigosDesconocidos > 0 && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      {codigosDesconocidos.toLocaleString('es-CL')} movimiento(s) traen un código que
                      no existe en el catálogo (por ejemplo «ASIGNAR MANUALMENTE»). Se importan{' '}
                      <strong>sin código</strong>, para asignarlo a mano en Conciliación.
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={7}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      4. Vista previa
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Primeras {preview.length} de {filas.length.toLocaleString('es-CL')} filas
                    </Typography>
                  </Stack>
                  <TableContainer sx={{ maxHeight: 320 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          {encabezados.map((h) => (
                            <TableCell key={h} sx={{ fontWeight: 700, bgcolor: '#F5F7FB' }}>{h}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {preview.map((fila, i) => (
                          <TableRow key={i} hover>
                            {encabezados.map((h) => (
                              <TableCell key={h}>{fila[h]}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    5. Clasificación automática por códigos
                  </Typography>
                  {previewClasificacion && totalClasificadas > 0 ? (
                    <>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        Se detectaron códigos en <strong>{totalClasificadas}</strong> de las{' '}
                        <strong>{diagnostico.transacciones.length}</strong> filas válidas{' '}
                        (<strong>{porcentajeClasificado}%</strong>). Al confirmar se guardarán
                        el código, origen, confianza y evidencia:
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {Object.entries(previewClasificacion).map(([id, info]) => {
                          const origenes = Object.entries(info.origenes)
                            .map(([origen, cantidad]) => `${origen}: ${cantidad}`)
                            .join(' · ')
                          return (
                            <Chip
                              key={id}
                              label={`${id} · ${info.nombre} (${info.count})`}
                              title={`${origenes}${info.evidencias.length ? ` · Evidencia: ${info.evidencias.join(', ')}` : ''}`}
                              color="primary"
                              variant="outlined"
                              sx={{ fontWeight: 600 }}
                            />
                          )
                        })}
                      </Stack>
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No se detectaron códigos en las filas válidas. Revisa el perfil, mapea
                      una columna Código contable / clave cliente o configura aliases específicos;
                      las filas se cargarán sin forzar una clasificación dudosa.
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
                <Button onClick={limpiar} variant="text">Cancelar</Button>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={importando
                    ? <CircularProgress size={18} color="inherit" />
                    : <CheckCircleRoundedIcon />}
                  onClick={confirmar}
                  disabled={!tieneMonto || !tieneFecha || camposDuplicados.length > 0 || pareceLibro || importando}
                  aria-busy={importando}
                >
                  {importando ? 'Importando y conciliando…' : 'Confirmar y conciliar'}
                </Button>
              </Stack>
            </Grid>
          </>
        )}
      </Grid>

      <Dialog open={importando} disableEscapeKeyDown maxWidth="xs" fullWidth>
        <DialogContent sx={{ py: 4 }}>
          <Stack spacing={2.5} alignItems="center">
            <CircularProgress size={52} thickness={4} />
            <Box sx={{ width: '100%', textAlign: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
                Importando y conciliando
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {progresoImportacion?.mensaje ?? 'Preparando la importación…'}
              </Typography>
            </Box>
            <Box sx={{ width: '100%' }}>
              <LinearProgress
                variant="determinate"
                value={progresoImportacion?.total
                  ? Math.round((progresoImportacion.actual / progresoImportacion.total) * 100)
                  : 0}
                sx={{ height: 8, borderRadius: 4 }}
              />
              {progresoImportacion?.etapa === 'subiendo' && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', textAlign: 'center', mt: 1 }}
                >
                  {progresoImportacion.actual} de {progresoImportacion.total} bloques
                </Typography>
              )}
            </Box>
            <Alert severity="info" sx={{ width: '100%' }}>
              No cierres ni recargues esta ventana. Los datos se confirmarán solo cuando
              termine el proceso completo.
            </Alert>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog
        open={administrandoBancos}
        onClose={() => !guardandoBanco && setAdministrandoBancos(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Administrar bancos</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Agrega bancos para usarlos en nuevas cartolas o elimina los que ya no
            necesites. Las transacciones históricas conservan el nombre con el que fueron cargadas.
          </DialogContentText>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
            <TextField
              label="Nombre del banco"
              value={nuevoBanco}
              onChange={(e) => setNuevoBanco(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleAgregarBanco()
                }
              }}
              inputProps={{ maxLength: 80 }}
              fullWidth
              size="small"
            />
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={() => void handleAgregarBanco()}
              disabled={guardandoBanco || nuevoBanco.trim().length < 2}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Agregar
            </Button>
          </Stack>
          {errorBanco && <Alert severity="error" sx={{ mb: 2 }}>{errorBanco}</Alert>}
          <TableContainer sx={{ maxHeight: 320, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Banco</TableCell>
                  <TableCell align="right" sx={{ width: 90 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {bancos.map((nombre) => (
                  <TableRow key={nombre} hover>
                    <TableCell>{nombre}</TableCell>
                    <TableCell align="right">
                      <Button
                        color="error"
                        size="small"
                        startIcon={<DeleteOutlineRoundedIcon />}
                        onClick={() => void handleEliminarBanco(nombre)}
                        disabled={guardandoBanco}
                      >
                        Eliminar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {bancos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} align="center">No hay bancos configurados.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdministrandoBancos(false)} disabled={guardandoBanco}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialogoReemplazo} onClose={() => setDialogoReemplazo(false)}>
        <DialogTitle>Ya hay datos cargados</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Actualmente tienes <strong>{transaccionesExistentes.length.toLocaleString('es-CL')}</strong>{' '}
            transacciones cargadas. ¿Qué deseas hacer con las{' '}
            <strong>{filas.length.toLocaleString('es-CL')}</strong> filas nuevas de este archivo?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDialogoReemplazo(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              setDialogoReemplazo(false)
              void aplicarCarga('agregar')
            }}
            variant="outlined"
          >
            Agregar a las existentes
          </Button>
          <Button
            onClick={() => {
              setDialogoReemplazo(false)
              void aplicarCarga('reemplazar')
            }}
            variant="contained"
            color="primary"
          >
            Reemplazar todo
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
