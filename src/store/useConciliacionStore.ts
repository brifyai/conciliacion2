import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  BancoCatalogo,
  Codigo,
  MatchingConfig,
  ProgresoImportacion,
  Regla,
  ResultadoImportacion,
  Transaccion,
} from '@/types/conciliacion'
import { conciliar, MATCHING_DEFAULT } from '@/services/matching'
import { aplicarReglas } from '@/services/rulesEngine'
import {
  aplicarCodigos,
  CODIGOS_CON_DOCUMENTO,
  propagarCodigosConciliados,
  propagarCodigosPorRut,
  resolverPorClasificacion,
} from '@/services/categoriesEngine'
import {
  asegurarSesion,
  clearTransacciones,
  deleteBanco,
  deleteCodigo,
  deleteRegla,
  errorSupabase,
  fetchBancos,
  fetchCodigos,
  fetchReglas,
  fetchTransacciones,
  fetchTransaccionesPeriodo,
  guardarCodigo,
  importarTransacciones,
  insertBanco,
  insertCodigos,
  insertRegla,
  reemplazarLote,
  syncTransaccion,
  syncTransacciones,
  updateCodigo,
  updateRegla,
} from '@/services/conciliacionApi'

/** Período (mes/año) seleccionado en la UI. Persistido en localStorage. */
export interface Periodo {
  mes: number // 1..12
  anio: number
}

/**
 * Texto legible para cualquier error. Los errores de PostgREST llegan como
 * objetos planos, así que un `String(e)` directo produciría `[object Object]`.
 */
function mensajeDeError(e: unknown, respaldo: string): string {
  if (e instanceof Error && e.message.trim() !== '') return e.message
  const detalle = errorSupabase(e, respaldo).message
  return detalle.trim() !== '' ? detalle : respaldo
}

/** Resultado de una operación sobre el catálogo de códigos. */
export type ResultadoCodigo =
  | { ok: true; accion: 'creado' | 'actualizado' | 'eliminado' }
  | { ok: false; error: string }

function periodoActual(): Periodo {
  const d = new Date()
  return { mes: d.getMonth() + 1, anio: d.getFullYear() }
}

/** Campos que `syncTransaccion` persiste; solo estos importan para decidir
 *  si una transacción realmente cambió tras conciliar. */
function estadoRelevanteCambio(a: Transaccion, b: Transaccion): boolean {
  return (
    a.estado !== b.estado ||
    a.matchId !== b.matchId ||
    a.confianza !== b.confianza ||
    a.categoria !== b.categoria ||
    a.codigoId !== b.codigoId ||
    a.codigoOrigen !== b.codigoOrigen ||
    a.codigoConfianza !== b.codigoConfianza ||
    a.codigoEvidencia !== b.codigoEvidencia
  )
}

/** Filtra solo las transacciones cuyo estado de conciliación/categoría
 *  cambió respecto al original, para no reenviar filas sin cambios. */
function soloModificadas(originales: Transaccion[], nuevas: Transaccion[]): Transaccion[] {
  const porId = new Map(originales.map((t) => [t.id, t]))
  return nuevas.filter((t) => {
    const original = porId.get(t.id)
    return !original || estadoRelevanteCambio(original, t)
  })
}

/**
 * Núcleo del motor de conciliación: aplica códigos → reglas de categoría →
 * matching. Es una función pura sobre el conjunto recibido.
 */
function conciliarConjunto(
  transacciones: Transaccion[],
  reglas: Regla[],
  codigos: Codigo[],
  matchingConfig: MatchingConfig,
): Transaccion[] {
  const conCodigos = aplicarCodigos(transacciones, codigos)
  // Un mismo RUT siempre lleva el mismo código: propaga desde los documentos ya
  // clasificados al resto del proveedor/cliente (rellena sólo los vacíos).
  const conRut = propagarCodigosPorRut(conCodigos, codigos)
  const conReglas = aplicarReglas(conRut, reglas)
  // Las reglas sólo categorizan. Una conciliación requiere contraparte real.
  const conciliadas = conciliar(conReglas, matchingConfig)
  const conCodigosPropagados = propagarCodigosConciliados(conciliadas, codigos)
  // Movimientos bancarios sin contraparte pero explicados por su código de
  // tesorería quedan 'resuelta' (no falsean la conciliación, pero cuentan como
  // explicados en el dashboard).
  return resolverPorClasificacion(conCodigosPropagados)
}

interface ConciliacionState {
  transacciones: Transaccion[]
  reglas: Regla[]
  codigos: Codigo[]
  bancos: BancoCatalogo[]
  matchingConfig: MatchingConfig
  /** Período (mes/año) seleccionado en la UI. */
  periodo: Periodo
  /** True mientras se ejecuta la conciliación automática. */
  procesando: boolean
  /** True mientras se cargan los datos desde Supabase. */
  cargando: boolean
  /** True mientras se completan en segundo plano los períodos restantes. */
  completandoCarga: boolean
  /** True cuando ya se cargaron los datos al menos una vez. */
  inicializado: boolean
  /** Mensaje de error si falló la carga inicial. */
  errorCarga: string | null
  /** Mensaje de error si falló la sincronización con Supabase. */
  errorSincronizacion: string | null

  // Carga desde Supabase
  cargarDatos: () => Promise<void>

  // Conciliación
  conciliarTodo: () => Promise<void>
  /**
   * Recalcula un período desde cero: descarta los estados derivados
   * (conciliada / resuelta / sugerida / pendiente) y vuelve a correr el motor.
   * Es la forma de deshacer el efecto de un 'resuelta' antiguo, que el matching
   * ya no reconsidera. No toca categorías ni códigos asignados.
   */
  recalcularPeriodo: (periodo: Periodo) => Promise<void>
  aplicarReglasActivas: () => void
  conciliarManual: (idA: string, idB: string) => Promise<void>
  desconciliar: (id: string) => Promise<void>
  /** Marca movimientos sin contraparte como resueltos por su clasificación. */
  marcarResueltas: (ids: string[], opciones?: { forzar?: boolean }) => Promise<void>
  /** Revierte una resolución manual a "no conciliada". */
  revertirResuelta: (id: string) => Promise<void>
  actualizarTransaccion: (
    id: string,
    patch: Pick<Partial<Transaccion>,
      'categoria' | 'codigoId' | 'codigoOrigen' | 'codigoConfianza' | 'codigoEvidencia'>,
  ) => void
  agregarTransacciones: (
    nuevas: Transaccion[],
    importId: string,
    nombreArchivo: string,
    onProgress?: (progreso: ProgresoImportacion) => void,
  ) => Promise<ResultadoImportacion>
  reemplazarTransacciones: (
    nuevas: Transaccion[],
    importId: string,
    nombreArchivo: string,
    onProgress?: (progreso: ProgresoImportacion) => void,
  ) => Promise<ResultadoImportacion>
  limpiarTransacciones: () => Promise<void>
  setMatchingConfig: (patch: Partial<MatchingConfig>) => void

  // CRUD reglas
  agregarRegla: (regla: Regla) => void
  actualizarRegla: (id: string, patch: Partial<Regla>) => void
  eliminarRegla: (id: string) => void

  // CRUD códigos
  agregarCodigo: (codigo: Codigo) => Promise<ResultadoCodigo>
  actualizarCodigo: (id: string, patch: Partial<Codigo>) => Promise<ResultadoCodigo>
  eliminarCodigo: (id: string) => Promise<ResultadoCodigo>
  importarCodigos: (codigos: Codigo[]) => Promise<void>
  /** Fusiona varios alias (uno o más por código) en una sola pasada y reclasifica. */
  agregarAliasesEnLote: (asignaciones: { codigoId: string; alias: string }[]) => void

  // Catálogo de bancos
  agregarBanco: (nombre: string) => Promise<void>
  eliminarBanco: (nombre: string) => Promise<void>

  reset: () => Promise<void>

  // Período
  setPeriodo: (patch: Partial<Periodo>) => void

  // Error de sincronización
  limpiarErrorSincronizacion: () => void
}

export const useConciliacionStore = create<ConciliacionState>()(
  persist(
    (set, get) => {
      /** Persistencia en background: no bloquea la UI, pero surfacea errores. */
      const persistir = (promise: Promise<unknown>): void => {
        promise.catch(async (e) => {
          console.error('[Supabase] sincronización falló:', e)
          // Descarta el estado optimista si el servidor rechazó el cambio.
          // De este modo la UI no muestra una conciliación que no existe en
          // la base de datos.
          try {
            await get().reset()
          } catch {
            // Conservamos el error original: la recarga puede fallar por la
            // misma indisponibilidad temporal que causó la sincronización.
          }
          set({
            errorSincronizacion: mensajeDeError(e, 'Error de sincronización con el servidor'),
          })
        })
      }

      /**
       * Revierte el catálogo de códigos tras un guardado fallido. A diferencia de
       * `persistir`, re-lee SOLO los códigos (barato) en vez de recargar todo el
       * dataset, y devuelve el error para que la pantalla lo muestre.
       */
      const revertirCodigos = async (error: string): Promise<ResultadoCodigo> => {
        try {
          set({ codigos: await fetchCodigos() })
        } catch {
          // Conservamos el error original: la recarga puede fallar por la misma
          // indisponibilidad temporal que causó el guardado.
        }
        set({ errorSincronizacion: error })
        return { ok: false, error }
      }

      const postprocesarImportacion = async (
        onProgress?: (progreso: ProgresoImportacion) => void,
      ): Promise<void> => {
        try {
          onProgress?.({
            etapa: 'recargando', actual: 1, total: 1,
            mensaje: 'Importación confirmada. Actualizando los datos…',
          })
          await get().reset()
          onProgress?.({
            etapa: 'conciliando', actual: 1, total: 1,
            mensaje: 'Aplicando códigos, reglas y conciliación automática…',
          })
          await get().conciliarTodo()
        } catch (e) {
          console.error('[Supabase] postproceso de importación falló:', e)
          const detalle = mensajeDeError(e, 'error desconocido')
          set({
            procesando: false,
            errorSincronizacion:
              `La importación se confirmó, pero el postproceso quedó pendiente: ${detalle}`,
          })
        }
      }

      /**
       * Fusiona los aliases leídos del archivo dentro del código correspondiente
       * del catálogo (unión sin duplicados). Mejora la detección automática en
       * cartolas bancarias. No falla la importación si el merge no se completa.
       */
      const fusionarAliasesEnCatalogo = async (nuevas: Transaccion[]): Promise<void> => {
        const porReferencia = new Map<string, Set<string>>()
        for (const tx of nuevas) {
          const ref = tx.codigoReferencia?.trim().toUpperCase()
          const aliases = tx.codigoAliasesArchivo
          if (!ref || !aliases || aliases.length === 0) continue
          const acumulado = porReferencia.get(ref) ?? new Set<string>()
          for (const alias of aliases) {
            const limpio = alias.trim()
            if (limpio) acumulado.add(limpio)
          }
          porReferencia.set(ref, acumulado)
        }
        if (porReferencia.size === 0) return

        const actualizados: Codigo[] = []
        for (const codigo of get().codigos) {
          const claves = [codigo.id, codigo.clave]
            .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
            .map((v) => v.trim().toUpperCase())
          const entrantes = new Set<string>()
          for (const clave of claves) {
            const set = porReferencia.get(clave)
            if (set) for (const alias of set) entrantes.add(alias)
          }
          if (entrantes.size === 0) continue

          const vistos = new Set(codigo.aliases.map((a) => a.trim().toLowerCase()))
          const fusion = [...codigo.aliases]
          let cambio = false
          for (const alias of entrantes) {
            if (!vistos.has(alias.toLowerCase())) {
              fusion.push(alias)
              vistos.add(alias.toLowerCase())
              cambio = true
            }
          }
          if (cambio) actualizados.push({ ...codigo, aliases: fusion })
        }
        if (actualizados.length === 0) return

        for (const codigo of actualizados) {
          await updateCodigo(codigo)
        }
      }

      return {
        transacciones: [],
        reglas: [],
        codigos: [],
        bancos: [],
        matchingConfig: MATCHING_DEFAULT,
        periodo: periodoActual(),
        procesando: false,
        cargando: false,
        completandoCarga: false,
        inicializado: false,
        errorCarga: null,
        errorSincronizacion: null,

        cargarDatos: async () => {
          if (get().inicializado || get().cargando) return
          set({ cargando: true, errorCarga: null })
          try {
            await asegurarSesion()
            // Carga incremental: primero solo el período visible + catálogos,
            // para que la primera pantalla aparezca casi de inmediato.
            const { mes, anio } = get().periodo
            const [txPeriodo, reglas, codigos, bancos] = await Promise.all([
              fetchTransaccionesPeriodo(mes, anio),
              fetchReglas(),
              fetchCodigos(),
              fetchBancos(),
            ])
            set({
              transacciones: txPeriodo,
              reglas,
              codigos,
              bancos,
              cargando: false,
              completandoCarga: true,
            })
          } catch (e) {
            set({
              cargando: false,
              inicializado: false,
              errorCarga: mensajeDeError(e, 'Error al cargar los datos'),
            })
            return
          }

          // En segundo plano trae el resto de períodos y, si es un seed fresco
          // (todas no_conciliadas), concilia globalmente una sola vez.
          try {
            const todas = await fetchTransacciones()
            set({ transacciones: todas, completandoCarga: false, inicializado: true })

            if (
              todas.length > 0 &&
              todas.every((t) => t.estado === 'no_conciliada')
            ) {
              set({ procesando: true })
              const { reglas: r, codigos: c, matchingConfig: mc } = get()
              const conciliadas = conciliarConjunto(todas, r, c, mc)
              set({ transacciones: conciliadas, procesando: false })
              const modificadas = soloModificadas(todas, conciliadas)
              if (modificadas.length > 50) {
                persistir(reemplazarLote(modificadas))
              } else if (modificadas.length > 0) {
                persistir(syncTransacciones(modificadas))
              }
            }
          } catch (e) {
            set({
              completandoCarga: false,
              errorSincronizacion: `No se pudo completar la carga del resto de períodos: ${
                mensajeDeError(e, 'error desconocido')
              }`,
            })
          }
        },

        conciliarTodo: async () => {
          const { transacciones, reglas, codigos, matchingConfig } = get()
          if (transacciones.length === 0) return
          set({ procesando: true, errorSincronizacion: null })
          const conciliadas = conciliarConjunto(transacciones, reglas, codigos, matchingConfig)
          const modificadas = soloModificadas(transacciones, conciliadas)
          try {
            if (modificadas.length > 0) await syncTransacciones(modificadas)
            set({ transacciones: conciliadas, procesando: false })
          } catch (e) {
            set({ procesando: false })
            throw e
          }
        },

        recalcularPeriodo: async (periodo) => {
          const { transacciones, reglas, codigos, matchingConfig } = get()
          if (transacciones.length === 0) return
          set({ procesando: true, errorSincronizacion: null })
          const enPeriodo = (t: Transaccion) => {
            const [anio, mes] = t.fecha.split('-').map(Number)
            return mes === periodo.mes && anio === periodo.anio
          }
          // Se limpian sólo los estados derivados del período: las categorías y
          // los códigos (incluso los manuales) se conservan.
          const reseteadas = transacciones.map((t) =>
            enPeriodo(t)
              ? {
                  ...t,
                  estado: 'no_conciliada' as const,
                  matchId: undefined,
                  confianza: undefined,
                }
              : t,
          )
          const recalculadas = conciliarConjunto(reseteadas, reglas, codigos, matchingConfig)
          const modificadas = soloModificadas(transacciones, recalculadas)
          try {
            if (modificadas.length > 0) await syncTransacciones(modificadas)
            set({ transacciones: recalculadas, procesando: false })
          } catch (e) {
            set({ procesando: false })
            throw e
          }
        },

        aplicarReglasActivas: () => {
          // Solo cambia categoria (no estado/matchId), seguro aplicar a todo.
          const { transacciones, reglas, codigos } = get()
          const conCodigos = aplicarCodigos(transacciones, codigos)
          const conRut = propagarCodigosPorRut(conCodigos, codigos)
          const conReglas = aplicarReglas(conRut, reglas)
          const propagadas = propagarCodigosConciliados(conReglas, codigos)
          set({ transacciones: propagadas })
          const modificadas = soloModificadas(transacciones, propagadas)
          if (modificadas.length > 50) {
            persistir(reemplazarLote(modificadas))
          } else if (modificadas.length > 0) {
            persistir(syncTransacciones(modificadas))
          }
        },

        conciliarManual: async (idA, idB) => {
          const anteriores = get().transacciones
          const a = anteriores.find((t) => t.id === idA)
          const b = anteriores.find((t) => t.id === idB)
          if (!a || !b || a.fuente === b.fuente || a.monto === 0 || b.monto === 0) {
            throw new Error('La selección no es una contraparte válida')
          }
          const huerfanos = [a.matchId, b.matchId].filter(
            (p): p is string => p !== undefined && p !== idA && p !== idB,
          )
          const nuevo = anteriores.map((t) => {
            if (t.id === idA) return { ...t, estado: 'conciliada' as const, matchId: idB, confianza: 1 }
            if (t.id === idB) return { ...t, estado: 'conciliada' as const, matchId: idA, confianza: 1 }
            if (huerfanos.includes(t.id)) {
              return { ...t, estado: 'no_conciliada' as const, matchId: undefined, confianza: undefined }
            }
            return t
          })
          const afectadas = nuevo.filter(
            (t) => t.id === idA || t.id === idB || huerfanos.includes(t.id),
          )
          await syncTransacciones(afectadas)
          set({ transacciones: nuevo })
        },

        desconciliar: async (id) => {
          const anteriores = get().transacciones
          const parejaId = anteriores.find((t) => t.id === id)?.matchId
          const nuevo = anteriores.map((t) => {
            if (t.id === id || t.matchId === id) {
              return {
                ...t,
                estado: 'no_conciliada' as const,
                matchId: undefined,
                confianza: undefined,
              }
            }
            return t
          })
          const afectadas = nuevo.filter(
            (t) => t.id === id || (parejaId !== undefined && t.id === parejaId),
          )
          await syncTransacciones(afectadas)
          set({ transacciones: nuevo })
        },

        marcarResueltas: async (ids, opciones) => {
          if (ids.length === 0) return
          const anteriores = get().transacciones
          const objetivo = new Set(ids)
          // Un código que exige contraparte documental (COVE/IVEN/MER/FACT) no
          // se resuelve por código en el flujo normal: marcarlo como 'resuelta'
          // lo saca del matching y esconde la brecha real. Sólo se permite con
          // `forzar`, que corresponde a una decisión manual y explícita (por
          // ejemplo una transferencia recibida que no tiene documento que la
          // respalde). Ese caso queda reconocible porque es un 'resuelta' con
          // un código de la lista CODIGOS_CON_DOCUMENTO, combinación que el
          // motor automático nunca produce.
          if (!opciones?.forzar) {
            const protegidos = anteriores.filter(
              (t) => objetivo.has(t.id) && t.codigoId && CODIGOS_CON_DOCUMENTO.has(t.codigoId),
            )
            if (protegidos.length > 0) {
              const codigos = [...new Set(protegidos.map((t) => t.codigoId))].join(', ')
              throw new Error(
                `No se pueden marcar como resueltos ${protegidos.length} movimiento(s): ` +
                  `su código (${codigos}) exige calzar con un documento del libro. ` +
                  'Búscales contraparte o reasígnales un código de tesorería.',
              )
            }
          }
          const nuevo = anteriores.map((t) => {
            if (objetivo.has(t.id)) {
              return {
                ...t,
                estado: 'resuelta' as const,
                matchId: undefined,
                confianza: undefined,
              }
            }
            // Si su contraparte pasa a resuelta, este movimiento queda sin conciliar.
            if (t.matchId && objetivo.has(t.matchId)) {
              return {
                ...t,
                estado: 'no_conciliada' as const,
                matchId: undefined,
                confianza: undefined,
              }
            }
            return t
          })
          const afectadas = nuevo.filter((t, i) => t !== anteriores[i])
          if (afectadas.length === 0) return
          await syncTransacciones(afectadas)
          set({ transacciones: nuevo })
        },

        revertirResuelta: async (id) => {
          const anteriores = get().transacciones
          const actual = anteriores.find((t) => t.id === id)
          if (!actual || actual.estado !== 'resuelta') return
          const revertida = { ...actual, estado: 'no_conciliada' as const }
          await syncTransacciones([revertida])
          set({ transacciones: anteriores.map((t) => (t.id === id ? revertida : t)) })
        },

        actualizarTransaccion: (id, patch) => {
          const actual = get().transacciones.find((t) => t.id === id)
          if (!actual) return
          const actualizada = { ...actual, ...patch }
          set((state) => ({
            transacciones: state.transacciones.map((t) => t.id === id ? actualizada : t),
          }))
          persistir(syncTransaccion(actualizada))
        },

        agregarTransacciones: async (nuevas, importId, nombreArchivo, onProgress) => {
          const resultado = await importarTransacciones(
            nuevas, 'agregar', importId, nombreArchivo, onProgress,
          )
          try {
            await fusionarAliasesEnCatalogo(nuevas)
          } catch (e) {
            console.error('[Supabase] no se pudieron fusionar los aliases:', e)
          }
          await postprocesarImportacion(onProgress)
          return resultado
        },

        reemplazarTransacciones: async (nuevas, importId, nombreArchivo, onProgress) => {
          const resultado = await importarTransacciones(
            nuevas, 'reemplazar', importId, nombreArchivo, onProgress,
          )
          try {
            await fusionarAliasesEnCatalogo(nuevas)
          } catch (e) {
            console.error('[Supabase] no se pudieron fusionar los aliases:', e)
          }
          await postprocesarImportacion(onProgress)
          return resultado
        },

        limpiarTransacciones: async () => {
          await clearTransacciones()
          set({ transacciones: [] })
        },

        setMatchingConfig: (patch) => {
          set((state) => ({
            matchingConfig: { ...state.matchingConfig, ...patch },
          }))
          persistir(get().conciliarTodo())
        },

        agregarRegla: (regla) => {
          set((state) => ({ reglas: [...state.reglas, regla] }))
          persistir(insertRegla(regla))
        },

        actualizarRegla: (id, patch) => {
          let actualizada: Regla | undefined
          set((state) => ({
            reglas: state.reglas.map((r) => {
              if (r.id === id) {
                actualizada = { ...r, ...patch }
                return actualizada
              }
              return r
            }),
          }))
          if (actualizada) persistir(updateRegla(actualizada))
        },

        eliminarRegla: (id) => {
          set((state) => ({ reglas: state.reglas.filter((r) => r.id !== id) }))
          persistir(deleteRegla(id))
        },

        agregarCodigo: async (codigo) => {
          const normalizado: Codigo = {
            ...codigo,
            id: codigo.id.toUpperCase(),
            aliases: codigo.aliases ?? [],
            prioridad: codigo.prioridad ?? 100,
          }
          set((state) => ({ codigos: [...state.codigos, normalizado] }))
          try {
            const accion = await guardarCodigo(normalizado)
            get().aplicarReglasActivas()
            return { ok: true, accion }
          } catch (e) {
            return await revertirCodigos(mensajeDeError(e, 'No se pudo crear el código'))
          }
        },

        actualizarCodigo: async (id, patch) => {
          const idUpper = id.toUpperCase()
          let actualizado: Codigo | undefined
          set((state) => ({
            codigos: state.codigos.map((c) => {
              if (c.id === idUpper) {
                actualizado = { ...c, ...patch, id: idUpper }
                return actualizado
              }
              return c
            }),
          }))
          if (!actualizado) {
            return { ok: false, error: `El código ${idUpper} no está en el catálogo.` }
          }
          try {
            await updateCodigo(actualizado)
            get().aplicarReglasActivas()
            return { ok: true, accion: 'actualizado' }
          } catch (e) {
            return await revertirCodigos(mensajeDeError(e, 'No se pudo actualizar el código'))
          }
        },

        eliminarCodigo: async (id) => {
          const idUpper = id.toUpperCase()
          const eliminado = get().codigos.find((c) => c.id === idUpper)
          set((state) => ({
            codigos: state.codigos.filter((c) => c.id !== idUpper),
            transacciones: state.transacciones.map((t) => {
              if (t.codigoId !== idUpper) return t
              return {
                ...t,
                categoria: eliminado?.categoria === t.categoria ? undefined : t.categoria,
                codigoId: undefined,
                codigoOrigen: undefined,
                codigoConfianza: undefined,
                codigoEvidencia: undefined,
              }
            }),
          }))
          try {
            await deleteCodigo(idUpper)
            get().aplicarReglasActivas()
            return { ok: true, accion: 'eliminado' }
          } catch (e) {
            return await revertirCodigos(mensajeDeError(e, 'No se pudo eliminar el código'))
          }
        },

        importarCodigos: async (codigos) => {
          const normalizados = codigos.map((c) => ({
            ...c,
            id: c.id.toUpperCase(),
            aliases: c.aliases ?? [],
            prioridad: c.prioridad ?? 100,
          }))
          const existentesIds = new Set(get().codigos.map((c) => c.id))
          const nuevos = normalizados.filter((c) => !existentesIds.has(c.id))
          const actualizar = normalizados.filter((c) => existentesIds.has(c.id))
          // Inserta los nuevos sin colisión de PK.
          if (nuevos.length > 0) {
            await insertCodigos(nuevos)
          }
          // Actualiza los existentes uno por uno.
          for (const c of actualizar) {
            await updateCodigo(c)
          }
          const actualizados = await fetchCodigos()
          set({ codigos: actualizados })
          get().aplicarReglasActivas()
        },

        agregarAliasesEnLote: (asignaciones) => {
          if (asignaciones.length === 0) return
          // Agrupa las frases nuevas por código (en mayúsculas), descartando vacías.
          const porCodigo = new Map<string, Set<string>>()
          for (const { codigoId, alias } of asignaciones) {
            const id = codigoId.toUpperCase()
            const frase = alias.trim()
            if (!frase) continue
            const acumulado = porCodigo.get(id) ?? new Set<string>()
            acumulado.add(frase)
            porCodigo.set(id, acumulado)
          }
          const cambiados: Codigo[] = []
          set((state) => ({
            codigos: state.codigos.map((c) => {
              const nuevos = porCodigo.get(c.id)
              if (!nuevos) return c
              const fusionados = [...new Set([...c.aliases, ...nuevos])]
              if (fusionados.length === c.aliases.length) return c
              const actualizado = { ...c, aliases: fusionados }
              cambiados.push(actualizado)
              return actualizado
            }),
          }))
          if (cambiados.length === 0) return
          cambiados.forEach((c) => persistir(updateCodigo(c)))
          // Una sola pasada de detección para todas las transacciones.
          get().aplicarReglasActivas()
        },

        agregarBanco: async (nombre) => {
          const limpio = nombre.trim().replace(/\s+/g, ' ')
          if (limpio.length < 2 || limpio.length > 80) {
            throw new Error('El nombre debe tener entre 2 y 80 caracteres')
          }
          await insertBanco(limpio)
          const bancos = await fetchBancos()
          set({ bancos })
        },

        eliminarBanco: async (nombre) => {
          await deleteBanco(nombre)
          const bancos = await fetchBancos()
          set({ bancos })
        },

        reset: async () => {
          await asegurarSesion()
          const [transacciones, reglas, codigos, bancos] = await Promise.all([
            fetchTransacciones(),
            fetchReglas(),
            fetchCodigos(),
            fetchBancos(),
          ])
          set({ transacciones, reglas, codigos, bancos, errorCarga: null })
        },

        setPeriodo: (patch) => {
          set((state) => ({ periodo: { ...state.periodo, ...patch } }))
        },

        limpiarErrorSincronizacion: () => set({ errorSincronizacion: null }),
      }
    },
    {
      name: 'conciliaBK-store',
      version: 5,
      partialize: (state) => ({
        reglas: state.reglas,
        codigos: state.codigos,
        periodo: state.periodo,
        // matchingConfig NO se persiste: es configuración interna del motor.
        // Si se persistiera, un cambio en MATCHING_DEFAULT (p.ej. ampliar
        // toleranciaDias de 5 a 8) no tendría efecto en navegadores que ya
        // tienen la config vieja cacheada en localStorage.
      }),
      // Al bumpear la versión se descartan las claves persistidas que ya no
      // existen (incluida la matchingConfig vieja).
      migrate: (persisted: unknown) => {
        const p = (persisted ?? {}) as Record<string, unknown>
        const { matchingConfig: _descartada, ...resto } = p
        return resto
      },
    },
  ),
)
