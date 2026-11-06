import { useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import { useSnackbar } from 'notistack'
import Papa from 'papaparse'
import { PageHeader } from '@/components/common/PageHeader'
import { useConciliacionStore } from '@/store/useConciliacionStore'
import type { Codigo } from '@/types/conciliacion'
import { PanelGlosasSinCodigo } from './PanelGlosasSinCodigo'

const VACIO: Codigo = {
  id: '',
  nombre: '',
  categoria: '',
  descripcion: '',
  aliases: [],
  prioridad: 100,
  activo: true,
}

export function CodigosPage() {
  const { enqueueSnackbar } = useSnackbar()
  const codigos = useConciliacionStore((s) => s.codigos)
  const transacciones = useConciliacionStore((s) => s.transacciones)
  const agregarCodigo = useConciliacionStore((s) => s.agregarCodigo)
  const actualizarCodigo = useConciliacionStore((s) => s.actualizarCodigo)
  const eliminarCodigo = useConciliacionStore((s) => s.eliminarCodigo)
  const importarCodigos = useConciliacionStore((s) => s.importarCodigos)

  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Codigo | null>(null)
  const [importando, setImportando] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return codigos
    return codigos.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.nombre.toLowerCase().includes(q) ||
        (c.clave ?? '').toLowerCase().includes(q) ||
        (c.categoria ?? '').toLowerCase().includes(q) ||
        c.aliases.some((alias) => alias.toLowerCase().includes(q)),
    )
  }, [codigos, busqueda])

  // Cuántas transacciones usan cada código, en una sola pasada (antes se
  // recorría toda la lista de transacciones por cada fila de la tabla).
  const usoPorCodigo = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const t of transacciones) {
      if (!t.codigoId) continue
      mapa.set(t.codigoId, (mapa.get(t.codigoId) ?? 0) + 1)
    }
    return mapa
  }, [transacciones])

  const guardar = async (c: Codigo) => {
    const limpio: Codigo = {
      ...c,
      id: c.id.trim().toUpperCase(),
      nombre: c.nombre.trim(),
      categoria: c.categoria?.trim() || undefined,
      descripcion: c.descripcion?.trim() || undefined,
      clave: c.clave?.trim() || undefined,
      aliases: [...new Set(c.aliases.map((alias) => alias.trim()).filter(Boolean))],
      prioridad: Math.max(0, Math.trunc(Number(c.prioridad) || 0)),
    }
    if (!limpio.id || !limpio.nombre) {
      enqueueSnackbar('Código y nombre son obligatorios.', { variant: 'warning' })
      return
    }
    if (limpio.id.length < 2 || limpio.id.length > 12) {
      enqueueSnackbar('El código debe tener entre 2 y 12 caracteres.', { variant: 'warning' })
      return
    }
    // El catálogo en memoria decide si es alta o edición. Si el id ya existe en
    // la base pero no aquí, el guardado lo detecta y lo actualiza igualmente.
    const existiaEnCatalogo = codigos.some((x) => x.id === limpio.id)
    const resultado = existiaEnCatalogo
      ? await actualizarCodigo(limpio.id, limpio)
      : await agregarCodigo(limpio)

    if (!resultado.ok) {
      // Se deja el diálogo abierto para corregir y reintentar.
      enqueueSnackbar(resultado.error, { variant: 'error' })
      return
    }
    if (!existiaEnCatalogo && resultado.accion === 'actualizado') {
      enqueueSnackbar(
        `El código ${limpio.id} ya existía en la base; se actualizó con estos datos.`,
        { variant: 'warning' },
      )
    } else {
      enqueueSnackbar(
        resultado.accion === 'creado' ? 'Código creado.' : 'Código actualizado.',
        { variant: 'success' },
      )
    }
    setEditando(null)
  }

  const handleEliminar = async (c: Codigo) => {
    const resultado = await eliminarCodigo(c.id)
    if (!resultado.ok) {
      enqueueSnackbar(resultado.error, { variant: 'error' })
      return
    }
    enqueueSnackbar(`Código ${c.id} eliminado.`, { variant: 'info' })
  }

  const exportarCSV = () => {
    const filas = codigos.map((c) => ({
      codigo: c.id,
      nombre: c.nombre,
      categoria: c.categoria ?? '',
      clave: c.clave ?? '',
      descripcion: c.descripcion ?? '',
      aliases: c.aliases.join(' | '),
      prioridad: c.prioridad,
      activo: c.activo ? 'true' : 'false',
    }))
    const csv = Papa.unparse(filas)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `codigos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Normaliza un encabezado: quita BOM, tildes, espacios y pasa a minúsculas.
  const normalizarHeader = (h: string): string =>
    (h ?? '')
      .replace(/^\ufeff/, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()

  type CampoCSV = 'id' | 'nombre' | 'categoria' | 'descripcion' | 'clave' | 'aliases' | 'prioridad'

  // Alias aceptados para cada campo del catálogo, en orden de prioridad.
  const ALIAS: Record<CampoCSV, string[]> = {
    id: ['codigo', 'code', 'cod', 'id'],
    nombre: ['nombre', 'name', 'descripcion', 'description', 'glosa', 'detalle', 'concepto'],
    categoria: ['categoria', 'category', 'cat', 'tipo', 'clasificacion'],
    descripcion: ['descripcion', 'description', 'detalle', 'comentario', 'observacion'],
    clave: ['clave', 'key', 'identificador'],
    aliases: ['aliases', 'alias', 'sinonimos', 'frases'],
    prioridad: ['prioridad', 'priority', 'orden'],
  }

  // Construye un getter que busca el primer alias presente en la fila,
  // sin reutilizar una columna ya consumida por otro campo.
  function hacerGetter(fila: Record<string, string>) {
    const usadas = new Set<string>()
    return (campo: CampoCSV): string => {
      for (const alias of ALIAS[campo]) {
        if (usadas.has(alias)) continue
        const v = fila[alias]
        if (v != null && v !== '') {
          usadas.add(alias)
          return v
        }
      }
      return ''
    }
  }

  // Lee un File a string decodificando UTF-8; si aparecen caracteres de
  // reemplazo (\uFFFD) asume Windows-1252 (latin1, típico de Excel CL) y
  // re-decodifica con esa tabla para recuperar tildes/ñ.
  async function leerTexto(file: File): Promise<string> {
    const buf = await file.arrayBuffer()
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
    if (!utf8.includes('\uFFFD')) return utf8
    return new TextDecoder('windows-1252').decode(buf)
  }

  const handleArchivo = (file: File) => {
    setImportando(true)
    leerTexto(file)
      .then((texto) =>
        Papa.parse<Record<string, string>>(texto, {
          header: true,
          skipEmptyLines: true,
          transformHeader: normalizarHeader,
          complete: async (res) => {
        try {
          const porId = new Map<string, Codigo>()
          const errores: string[] = []
          for (const fila of res.data) {
            const get = hacerGetter(fila)
            const id = get('id').trim().toUpperCase()
            const nombre = get('nombre').trim()
            if (!/^[A-Z0-9_-]{2,12}$/.test(id) || !nombre) {
              errores.push(`Fila inválida: ${JSON.stringify(fila)}`)
              continue
            }
            const categoria = get('categoria').trim() || undefined
            const descripcion = get('descripcion').trim() || undefined
            const clave = get('clave').trim() || undefined
            const aliases = [...new Set(
              get('aliases').split(/[|;]/).map((alias) => alias.trim()).filter(Boolean),
            )]
            const prioridad = Math.max(0, Math.trunc(Number(get('prioridad')) || 100))
            const activoRaw = (fila.activo ?? 'true').trim().toLowerCase()
            const activo = activoRaw !== 'false' && activoRaw !== '0' && activoRaw !== 'no'
            porId.set(id, {
              id, nombre, categoria, descripcion, clave, aliases, prioridad, activo,
            })
          }
          const nuevos = [...porId.values()]
          if (errores.length) {
            enqueueSnackbar(
              `${errores.length} fila(s) omitida(s) por datos incompletos (código o nombre vacíos).`,
              { variant: 'warning' },
            )
          }
          if (nuevos.length === 0) {
            const heads = res.meta.fields ?? []
            enqueueSnackbar(
              `No se importó nada. Encabezados detectados: ${heads.join(', ') || '(ninguno)'}. ` +
                `Se aceptan alias: codigo/código, nombre/clave/descripción, categoria (opcional), descripcion, activo.`,
              { variant: 'error' },
            )
            return
          }
          await importarCodigos(nuevos)
          enqueueSnackbar(
            `Importación completa: ${nuevos.length} códigos procesados.`,
            { variant: 'success' },
          )
        } catch (e) {
          enqueueSnackbar(
            `Error al importar: ${e instanceof Error ? e.message : 'desconocido'}`,
            { variant: 'error' },
          )
        } finally {
          setImportando(false)
          if (fileRef.current) fileRef.current.value = ''
        }
      },
      error: () => {
        enqueueSnackbar('No se pudo leer el archivo CSV.', { variant: 'error' })
        setImportando(false)
      },
    }),
      )
      .catch((e) => {
        enqueueSnackbar(
          `No se pudo leer el archivo: ${e instanceof Error ? e.message : 'desconocido'}`,
          { variant: 'error' },
        )
        setImportando(false)
      })
  }

  return (
    <Box>
      <PageHeader
        title="Códigos contables"
        subtitle="Código y clave identifican el ítem; nombre lo desglosa y categoría lo agrupa opcionalmente."
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<DownloadRoundedIcon />}
              onClick={exportarCSV}
              disabled={codigos.length === 0}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Exportar CSV
            </Button>
            <Button
              variant="outlined"
              component="label"
              startIcon={<FileUploadRoundedIcon />}
              disabled={importando}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Importar CSV
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleArchivo(file)
                }}
              />
            </Button>
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={() => setEditando({ ...VACIO })}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Nuevo código
            </Button>
          </Stack>
        }
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          Formato del archivo a importar (.csv)
        </Typography>
        <Typography variant="body2" component="div" color="text.secondary">
          El archivo debe tener una fila de encabezados y estas columnas:
          <Box component="ul" sx={{ pl: 2.5, mt: 0.5, mb: 0 }}>
            <li>
              <strong>codigo</strong> (obligatorio, 2–12 caracteres, se guarda en mayúsculas)
            </li>
            <li><strong>nombre</strong> (obligatorio, desglose humano)</li>
            <li><strong>clave</strong> (opcional, identificador del cliente)</li>
            <li><strong>categoria</strong> (opcional, agrupador padre)</li>
            <li><strong>aliases</strong> (opcional, frases separadas por <code>|</code>)</li>
            <li><strong>prioridad</strong> (opcional, menor número gana; por defecto 100)</li>
            <li><strong>descripcion</strong> (opcional)</li>
            <li>
              <strong>activo</strong> (opcional, <code>true</code> / <code>false</code>, por defecto <code>true</code>)
            </li>
          </Box>
        </Typography>
      </Alert>

      <PanelGlosasSinCodigo />

      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Buscar por código, clave, nombre, alias o categoría…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          sx={{ flex: 1, maxWidth: 480 }}
        />
        <Chip
          label={`${codigos.length} códigos · ${codigos.filter((c) => c.activo).length} activos`}
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
      </Stack>

      {codigos.length === 0 ? (
        <Card>
          <CardContent>
            <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Sin códigos
              </Typography>
              <Typography variant="body2" color="text.secondary" align="center">
                Crea códigos manualmente o importa un CSV con la columna
                <strong> codigo,nombre,categoria,descripcion,activo</strong>.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <TableContainer sx={{ maxHeight: 'calc(100vh - 280px)' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F7FB', width: 110 }}>Código</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F7FB' }}>Nombre / desglose</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F7FB', width: 100 }}>Clave cliente</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F7FB' }}>Categoría padre</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F7FB' }}>Aliases</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F7FB', width: 70 }}>Uso</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F7FB', width: 80 }}>Activo</TableCell>
                  <TableCell sx={{ fontWeight: 700, bgcolor: '#F5F7FB', width: 100 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {filtrados.map((c) => (
                  <TableRow
                    key={c.id}
                    hover
                    sx={{ opacity: c.activo ? 1 : 0.55 }}
                  >
                    <TableCell>
                      <Chip
                        label={c.id}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ fontWeight: 700, fontFamily: 'monospace' }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{c.nombre}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                      {c.clave ?? '—'}
                    </TableCell>
                    <TableCell>{c.categoria ?? '—'}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      {c.aliases.length ? c.aliases.join(' · ') : '—'}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {usoPorCodigo.get(c.id) ?? 0}
                    </TableCell>
                    <TableCell>
                      <Switch
                        size="small"
                        checked={c.activo}
                        onChange={(e) =>
                          void actualizarCodigo(c.id, { activo: e.target.checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => setEditando({ ...c })}>
                            <EditRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => void handleEliminar(c)}
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {filtrados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Alert severity="info">No hay códigos que coincidan con la búsqueda.</Alert>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {editando && (
        <DialogCodigo
          codigo={editando}
          ids={codigos.map((c) => c.id)}
          onClose={() => setEditando(null)}
          onGuardar={guardar}
        />
      )}
    </Box>
  )
}

function DialogCodigo({
  codigo,
  ids,
  onClose,
  onGuardar,
}: {
  codigo: Codigo
  /** Códigos que ya existen en el catálogo, para avisar de duplicados. */
  ids: string[]
  onClose: () => void
  onGuardar: (c: Codigo) => Promise<void>
}) {
  const [draft, setDraft] = useState<Codigo>(codigo)
  const [guardando, setGuardando] = useState(false)
  const set = (patch: Partial<Codigo>) => setDraft((d) => ({ ...d, ...patch }))
  // Se evalúa sobre el borrador en vivo (no sobre el estado del padre) para que
  // el aviso de "ya existe" aparezca a medida que se escribe el código.
  const idLimpio = draft.id.trim().toUpperCase()
  const existe = idLimpio !== '' && ids.includes(idLimpio)
  const esElMismo = codigo.id.trim().toUpperCase() === idLimpio

  const guardarAhora = async () => {
    setGuardando(true)
    try {
      await onGuardar(draft)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{existe ? 'Editar código' : 'Nuevo código'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {existe && !esElMismo && (
            <Alert severity="warning">
              Ya existe el código {idLimpio}. Al guardar se actualizará ese código existente.
            </Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Código"
              value={draft.id}
              onChange={(e) => set({ id: e.target.value.toUpperCase() })}
              fullWidth
              inputProps={{ maxLength: 12, style: { textTransform: 'uppercase', fontFamily: 'monospace' } }}
              helperText="2-12 caracteres, se guarda en mayúsculas"
            />
            <TextField
              label="Clave"
              value={draft.clave ?? ''}
              onChange={(e) => set({ clave: e.target.value })}
              fullWidth
              helperText="Se usa por igualdad exacta desde una columna Código/Clave contable; no se busca como número suelto en glosas."
            />
          </Stack>
          <TextField
            label="Nombre"
            value={draft.nombre}
            onChange={(e) => set({ nombre: e.target.value })}
            fullWidth
            required
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Categoría padre"
              value={draft.categoria ?? ''}
              onChange={(e) => set({ categoria: e.target.value })}
              fullWidth
              helperText="Agrupador opcional; el código sigue siendo la clasificación principal"
            />
            <TextField
              label="Prioridad"
              type="number"
              value={draft.prioridad}
              onChange={(e) => set({ prioridad: Math.max(0, Number(e.target.value)) })}
              inputProps={{ min: 0, step: 1 }}
              sx={{ width: { xs: '100%', sm: 150 } }}
              helperText="Menor gana"
            />
          </Stack>
          <TextField
            label="Aliases / frases de detección"
            value={draft.aliases.join(' | ')}
            onChange={(e) => set({
              aliases: e.target.value.split('|').map((alias) => alias.trim()),
            })}
            fullWidth
            helperText="Separa frases completas con |. No se buscan substrings libres."
          />
          <TextField
            label="Descripción"
            value={draft.descripcion ?? ''}
            onChange={(e) => set({ descripcion: e.target.value })}
            fullWidth
            multiline
            minRows={2}
          />
          <Stack direction="row" alignItems="center" spacing={1}>
            <Switch
              checked={draft.activo}
              onChange={(e) => set({ activo: e.target.checked })}
            />
            <Typography variant="body2">Activo (se usa para clasificar)</Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button variant="contained" onClick={() => void guardarAhora()} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}