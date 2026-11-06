# Plan de correcciones — ConciliaCL / conciliaBK

**Objetivo:** que la conciliación sea **certera** (pocos falsos positivos) y **auditable**, no solo "100% avance".

---

## 1. Línea base medida (datos reales, 4.397 filas)

| Indicador | Enero 2026 | Todo el año |
|---|---|---|
| Banco | 317 movs | 2.703 |
| Contabilidad | 245 docs | 1.694 |
| Conciliadas (pares reales) | **25 (7,9%)** | 5,8%–16,8% por mes |
| Resueltas (sin contraparte, con código) | **292 (92,1%)** | 71,7%–92,8% |
| "Avance" mostrado en el dashboard | **100,0%** | 88,1%–100% |
| Documentos del libro "pendientes de pago" | 195 · $488.399.873 | — |

**Pruebas de conexión sobre las 292 resueltas de enero:**

| Llave | Cruza |
|---|---|
| Monto exacto (±$1) con algún documento, toda la base | **11 / 292 (3,8%)** |
| Monto ×1,19 (hipótesis IVA, tolerancia 0,05%) | 16 — disperso en 1,17–1,21 → **descartado** |
| Monto = suma de 2 documentos | 14 / 292 |
| Monto = suma de 3 documentos | 11 / 292 |
| **Sin ninguna combinación (1, 2 ni 3)** | **261 / 292 (89,4%)** |
| Documentos sin pago con un movimiento de su monto | **0 / 192** |
| RUT embebido en la glosa del banco | **44 / 292**, y **38 cruzan** con el RUT del libro |

**Inventario de llaves (enero):**

| Campo | Cartola (banco) | Libro (contabilidad) |
|---|---|---|
| `rut` | **0 / 317** (pero 44 en la glosa) | **242 / 245** |
| `folio` | 0 / 317 | **245 / 245** |
| `tipo_doc` | 0 / 317 | **245 / 245** |
| `documento` | 278 / 317 (IDs de operación del banco, inútiles) | 0 / 245 |
| `neto` / `iva_total` | — | **0 / 245** |
| `fecha_vencimiento` | 0 / 317 | 0 / 245 |
| `external_id` | 0 / 317 | 0 / 245 |
| `codigo_id` | 317 / 317 | 245 / 245 |

**Conclusión:** el problema no es (solo) el estado `resuelta`. Es que **la llave de enlace no está en los datos**: la cartola describe el dinero pero no dice qué documento paga, y los montos no calzan ni 1:1 ni agrupados.

---

## 2. Principios de diseño (para ser certero)

1. **Nunca auto-conciliar con evidencia débil.** Hoy `matching.ts` marca `conciliada` con solo monto+fecha y glosa distinta (confianza 0,6) → falso positivo silencioso. Lo débil debe quedar **`sugerida`**.
2. **Llaves duras primero:** RUT → folio/documento → monto exacto → similitud de texto.
3. **Tolerancia de monto acotada:** ±$1 por defecto; tolerancia porcentual **solo** si hay RUT igual.
4. **1:N explícito y auditable:** un pago = suma exacta de N facturas **del mismo RUT**, con evidencia guardada.
5. **Sin estados pegajosos:** `resuelta` y los matches deben poder recalcularse desde cero. Separar `resuelta_por = 'auto' | 'manual'`.
6. **Toda decisión deja evidencia estructurada** (`match_evidencia` jsonb): llave usada, valores, diferencias, nivel.
7. **El KPI nunca debe llegar a un 100% engañoso:** "Conciliado real" y "Explicado por código" son métricas separadas.

---

## 3. Fases

### Fase 0 — Preparación (sin cambios de lógica)

| # | Tarea | Artefacto |
|---|---|---|
| 0.1 | Snapshot de `transacciones` antes de tocar nada | `create table transacciones_backup_YYYYMMDD as select * from transacciones;` |
| 0.2 | Congelar cargas/ediciones durante la migración | ventana acordada |
| 0.3 | Rotar `sb_secret_...` (se compartió en chat) | Supabase → API Keys |
| 0.4 | Línea base congelada por mes | `node scripts/auditar-resueltas.mjs YYYY-MM` |

### Fase 1 — Desbloqueo y blindaje (P0 · bajo riesgo · alto impacto)

| # | Tarea | Detalle | Archivo |
|---|---|---|---|
| 1.1 | Revertir `resuelta` de códigos con documento | `COVE`, `IVEN`, `MER`, `FACT` → `no_conciliada` | SQL |
| 1.2 | Columna `resuelta_por` (`auto`/`manual`) | distinguir decisión humana de automática | migración |
| 1.3 | Blindar "Resolver banco codificado" | excluir `CODIGOS_CON_DOCUMENTO` | `ConciliacionPage.tsx:90` |
| 1.4 | Validar en `marcarResueltas` | rechazar códigos con documento + exigir código | `useConciliacionStore.ts` |
| 1.5 | Verificar delta real | re-conciliar y medir | `scripts/auditar-resueltas.mjs` |

```sql
-- 1.1 (preview primero, luego aplicar)
select codigo_id, count(*), sum(abs(monto)) from public.transacciones
where fuente='banco' and estado='resuelta' and codigo_id in ('COVE','IVEN','MER','FACT')
group by 1;

update public.transacciones
set estado='no_conciliada', match_id=null, confianza=null
where fuente='banco' and estado='resuelta' and codigo_id in ('COVE','IVEN','MER','FACT');
```

### Fase 2 — Ingesta: traer las llaves que faltan (P1 · máximo impacto en certeza)

| # | Tarea | Detalle | Archivo |
|---|---|---|---|
| 2.1 | **Extraer RUT de la glosa del banco** | patrón `7-9 dígitos + guion opcional + DV`, validar con `validarRUT()`; prefijos `PRV`, `Transf`, `Transfer a`; normalizar a cuerpo numérico | `parseFiles.ts` |
| 2.2 | **Mapear RUT/N° documento del archivo de cartola** | revisar encabezados reales y mapear las columnas de referencia | `parseFiles.ts` + UI `/carga` |
| 2.3 | **Mapear `neto`, `iva_total`, `exento`, `fecha_vencimiento` del libro** | hoy 0/245; habilita comparar total vs neto y usar vencimiento | `parseFiles.ts` |
| 2.4 | Validación de coherencia del libro | `abs(monto − (neto + iva + exento)) ≤ 2`; si no cuadra, advertir en la carga | `CargaPage.tsx` |
| 2.5 | Normalizar RUT en ambos lados al importar | formato canónico único | `lib/rut.ts` + `parseFiles.ts` |
| 2.6 | Aviso de calidad de datos | si >30% de filas sin RUT en la cartola, advertir | `CargaPage.tsx` |

### Fase 3 — Motor de matching por niveles de evidencia (P2)

| # | Tarea | Detalle | Archivo |
|---|---|---|---|
| 3.1 | Redefinir niveles | ver tabla | `matching.ts` |
| 3.2 | Tolerancia de monto | ±$1 por defecto; % (≤0,5%) **solo con RUT igual** | `matching.ts` |
| 3.3 | Rechazos explícitos | RUT en conflicto → rechaza; fecha fuera de ventana → baja de nivel; monto 0 excluido | `matching.ts` |
| 3.4 | Evidencia estructurada | `match_evidencia jsonb`: llave, dif_monto, dif_dias, similitud, nivel | migración + `matching.ts` |
| 3.5 | Regla de unicidad | 1:1 greedy por nivel (ya existe) + rechazo si hay empate sin desempate claro | `matching.ts` |

| Nivel | Evidencia | Estado | Confianza |
|---|---|---|---|
| **N1** | RUT igual + monto ±$1 + fecha en ventana | `conciliada` | 1,00 |
| **N1b** | folio/documento igual + monto ±$1 | `conciliada` | 0,99 |
| **N2** | monto ±$1 + fecha + similitud glosa ≥ 0,72 | `conciliada` | ≥0,90 |
| **N3** | monto ±$1 + fecha, glosa distinta | **`sugerida`** | 0,60–0,72 |
| **N3b** | RUT igual + monto con tolerancia % | **`sugerida`** | 0,70 |
| **N4** | solo monto, o solo RUT | `pendiente` | — |
| **N5** | nada | `no_conciliada` | — |

> Cambio clave vs. hoy: **N3 deja de ser `conciliada`** y pasa a `sugerida` → elimina los falsos positivos de "mismo monto, otra cosa".

### Fase 4 — Pagos agrupados (1:N) y parciales (P3)

| # | Tarea | Detalle | Archivo |
|---|---|---|---|
| 4.1 | Detección dirigida de 1:N | para un pago sin par 1:1, buscar subconjunto de facturas **del mismo RUT** (o misma contraparte) cuya suma = monto ±$1, máx. 6 documentos, fecha ≤ pago + tolerancia | `matching.ts` |
| 4.2 | Modelo de datos del grupo | tabla `conciliacion_grupos` (`grupo_id`, `banco_id`, `doc_ids[]`, `monto_total`, `evidencia`) o campo `match_grupo_id` | migración |
| 4.3 | UI del grupo | mostrar "1 pago ↔ N facturas" y permitir aceptar/rechazar | `ConciliacionPage.tsx` |
| 4.4 | Pagos parciales | un pago cubre una cuota (`metadatos.montos_pago`) y varias cuotas se acumulan | `matching.ts` |

### Fase 5 — Estados, KPIs y cierre (P4)

| # | Tarea | Detalle | Archivo |
|---|---|---|---|
| 5.1 | Separar métricas | `tasaConciliacionReal` (N1+N2), `tasaSugerida`, `tasaExplicado`, `brechaReal` ($) | `lib/selectors.ts` |
| 5.2 | Renombrar el KPI | "Avance de conciliación" → **"Explicado"** + nuevo KPI **"Conciliado real"**; mostrar siempre la brecha en $ | `DashboardPage.tsx`, `Topbar.tsx` |
| 5.3 | Regla de cierre de período | no se puede cerrar si hay `no_conciliada` sin justificar o `sugerida` sin revisar | `lib/periodo.ts` + UI |
| 5.4 | Reporte de cierre con evidencia | pares con su evidencia, grupos 1:N y explicadas por código | `services/exportarReporte.ts` |
| 5.5 | Actualizar la Ayuda | reflejar los niveles reales (hoy dice "tolerancia de 5 días" cuando el código usa 60) | `AyudaPage.tsx` |

### Fase 6 — Operación y control continuo (P4)

| # | Tarea | Detalle | Archivo |
|---|---|---|---|
| 6.1 | Orden de carga obligatorio | contabilidad primero, cartolas después; avisar si se invierte | `CargaPage.tsx` |
| 6.2 | Botón **"Recalcular conciliación"** | resetea estados derivados (no los `manual`) y reconcializa desde cero → mata el problema de estados pegajosos | `useConciliacionStore.ts` |
| 6.3 | Auditoría programada | reporte de cobertura, precisión muestreada, movimientos sin llave y códigos que auto-resuelven demasiado | `scripts/auditar-resueltas.mjs` + cron |
| 6.4 | Tests | casos de RUT, 1:N, tolerancias, conflictos de RUT, glosa genérica | `matching.test.ts`, `parseFiles.test.ts` |
| 6.5 | Alerta de sobre-resolución | si >X% del universo queda `resuelta` automáticamente, advertir en el dashboard | `selectors.ts` |

---

## 4. Métricas de aceptación (cómo saber si quedó certero)

| Métrica | Hoy | Objetivo |
|---|---|---|
| Precisión de auto-conciliados (muestra auditada a mano) | desconocida | **≥ 99%** |
| Cobertura del banco con contraparte (N1+N2) | 7,9% (ene) | **≥ 60%** |
| Movimientos `resuelta` sin evidencia registrada | 100% sin evidencia | **0%** |
| Documentos del libro "sin pago" que sí tienen pago en la cartola | 0 detectados | **≥ 90% detectados** |
| Filas de cartola con RUT disponible | 0% (columna) · 8% (glosa) | **≥ 60%** |
| Pares con evidencia estructurada guardada | 0% | **100%** |
| Falsos "100% de avance" | ocurre | **imposible por diseño** |

---

## 5. Priorización

| Prioridad | Fase | Esfuerzo | Impacto |
|---|---|---|---|
| **P0** | 0 + 1 (snapshot, revertir, blindar) | Bajo | Alto — desbloquea y elimina el falso 100% |
| **P1** | 2.1 + 2.3 (RUT de glosa, neto/IVA/vencimiento) | Medio | **Muy alto** — crea la llave que hoy no existe |
| **P2** | 3 (niveles de evidencia + evidencia estructurada) | Medio | Alto — precisión real |
| **P3** | 4 (1:N) | Alto | Medio-alto — +9% medido y más con RUT |
| **P4** | 5 + 6 (KPIs, cierre, recalcular, auditoría) | Medio | Alto a largo plazo |

**Ruta crítica:** P0 → P1 → P2. Con eso solo, la precisión y la cobertura cambian de orden de magnitud.

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Revertir masivamente rompe un cierre que el usuario ya dio por bueno | Snapshot previo + `resuelta_por` + preview con `select` antes del `update` |
| Extraer RUT de glosas genera falsos RUT (IDs de operación de 10 dígitos) | Validar con `validarRUT()` (dígito verificador) y exigir separador, prefijo `PRV` o DV alfabético |
| 1:N explota combinatoriamente | Filtrar por RUT/contraparte, tope de 6 documentos, suma exacta, ventana de fecha |
| Cambiar niveles altera el dashboard | Recalcular KPIs en la misma fase y actualizar la Ayuda |
| Subir tolerancia de monto produce falsos positivos | Tolerancia % solo con RUT igual; nunca tolerancia % con evidencia solo-textual |
| Datos de origen incompletos (sin RUT ni N° documento) | Mapear más columnas del archivo + avisar de la calidad del dato en la carga (2.6) |

---

## 7. Orden de ejecución recomendado

1. **Semana 1 — P0:** snapshot, rotar key, revertir COVE/IVEN/MER/FACT, blindar el botón, medir delta.
2. **Semana 2 — P1:** extracción de RUT desde la glosa + mapeo de neto/IVA/vencimiento + normalización de RUT. Re-importar y medir cobertura.
3. **Semana 3 — P2:** niveles de evidencia, evidencia estructurada, tolerancias condicionadas. Tests.
4. **Semana 4 — P3:** 1:N con RUT. UI de grupos.
5. **Semana 5 — P4:** KPIs separados, regla de cierre, botón "Recalcular", auditoría programada.

---

## 8. Estado de implementación

### Implementado y verificado

| Fase | Qué se hizo | Archivos |
|---|---|---|
| **1.1** | 568 movimientos de banco en COVE/IVEN/MER/FACT revertidos de `resuelta` → `no_conciliada`, con respaldo JSON previo | `scripts/revertir-resueltas-banco.mjs`, `backups/` |
| **1.3** | "Resolver banco codificado" ya no incluye los códigos que exigen documento + chip "Esperan documento: N" | `features/conciliacion/ConciliacionPage.tsx` |
| **1.4** | `marcarResueltas` rechaza códigos con documento (defensa en profundidad) | `store/useConciliacionStore.ts` |
| **2.1** | Extracción del RUT desde la glosa de la cartola, validando el dígito verificador (módulo 11) | `lib/rut.ts`, `services/parseFiles.ts`, `services/conciliacionApi.ts` |
| **2.5** | `cuerpoRUT` normaliza ceros a la izquierda para que el RUT de la glosa cruce con el del libro | `lib/rut.ts` |
| **2.4** | Aviso al cargar el libro cuando `monto ≠ neto + IVA + exento` (mapeo de columna equivocada) | `services/parseFiles.ts` |
| **3.1-3.5** | Niveles de evidencia: llave dura (RUT/folio) → fuerte → sugerido → propuesta; tolerancia de monto % sólo con RUT; ambigüedad degrada a `sugerida` | `services/matching.ts` |
| **5.1-5.2** | KPI "Conciliado real" (dashboard y topbar); `universo` y `sugeridas` en el Kpi | `lib/selectors.ts`, `types/conciliacion.ts`, `DashboardPage.tsx`, `Topbar.tsx` |
| **6.2** | Botón "Recalcular" por período: descarta estados derivados y vuelve a correr el motor | `store/useConciliacionStore.ts`, `ConciliacionPage.tsx` |

**Verificación:** `tsc --noEmit` sin errores · `eslint .` sin problemas · **54 tests** pasan (7 archivos, +11 nuevos) · `npm run build` OK.

### Medición sobre datos reales (simulación en memoria, sin escribir)

| mes | antes (conciliadas) | después: conc / sug / res / pend / noC | tasa real |
|---|---|---|---|
| 2026-01 | 25 | **13 / 14 / 121 / 3 / 166** | 7,9% → 4,1% |
| 2026-02 | 46 | 36 / 11 / 115 / 6 / 105 | 16,8% → 13,2% |
| 2026-03 | 58 | 33 / 25 / 212 / 42 / 41 | 16,4% → 9,3% |
| 2026-04 | 34 | 21 / 12 / 218 / 11 / 34 | 11,5% → 7,1% |
| 2026-05 | 43 | 33 / 12 / 329 / 5 / 56 | 9,9% → 7,6% |
| 2026-06 | 34 | 18 / 16 / 446 / 7 / 100 | 5,8% → 3,1% |
| 2026-07 | 75 | 45 / 27 / 302 / 13 / 55 | 10,2% |

**RUT recuperado desde la glosa de la cartola: 309 movimientos** (antes 0).

### Lectura honesta del resultado

El motor nuevo **no sube la cobertura**, porque el cuello de botella son los datos: de las 292 resueltas de enero, **261 no tienen ninguna contraparte posible por monto** (ni 1:1, ni suma de 2 o 3 documentos, ni aplicando IVA). Lo que sí se logra es **precisión y transparencia**:

- 12 de los 25 pares que antes se daban por "conciliados" en enero pasan a **`sugerida`** (revisión humana): eran monto + fecha con glosa no concluyente y con facturas compitiendo.
- El dashboard ya no puede mostrar un 100% engañoso: el KPI principal es **"Conciliado real"**.
- Los 568 movimientos que estaban escondidos como "resueltos" ahora aparecen como brecha real (166 en enero).

### Pendiente

| Fase | Qué falta | Por qué |
|---|---|---|
| **2.2** | Mapear en `/carga` las columnas de RUT y N° de documento del archivo de cartola | Requiere ver los encabezados reales del extracto; es la palanca que más subiría la cobertura |
| **4** | Matching 1:N (un pago = suma de N facturas del mismo RUT) | Cambio mayor; hoy el motor es 1:1 |
| **6.1 / 6.3** | Orden de carga obligatorio y auditoría programada | Mejora operativa |

### Reparaciones del entorno (no son del código de la app)

`node_modules` tenía extracciones incompletas que rompían dev/build/lint: `react-dom`, `recharts`, `typescript`, `@types/d3-scale`, `html2canvas`, `css-line-break`, `eslint-scope`, `saxes`, `eslint` y 4 paquetes `@babel`/`@humanfs`. Se repararon con reinstalación forzada (`npm install --prefer-online` tras borrar la carpeta). Causa confirmada por npm: *"tarball data … seems to be corrupted. Trying again."*


---

## 9. Hallazgo clave: el motor no pierde pares (evidencia)

Tras aplicar las correcciones, el dashboard de enero mostró **3,8% de conciliación real y 52% no conciliado**, lo que naturalmente genera la duda de si el motor empeoró. Se verificó con dos experimentos sobre los datos reales:

### 9.1 ¿Se pierden pares que existen? **No.**

De los 290 movimientos de banco de enero sin contraparte, sólo **9** tienen un documento del libro con el **mismo monto (±$1)**:

| Motivo | Cantidad |
|---|---|
| El documento está fuera de la ventana de 60 días | 2 |
| El documento ya fue usado por otro pago | 7 |
| **Documento libre sin usar (pérdida real)** | **0** |
| Rechazados por RUT en conflicto | **0** |

**No hay ningún par disponible que el motor esté dejando pasar.**

### 9.2 ¿Serviría ampliar la tolerancia de monto? **No: sería inventar.**

Con 1.694 documentos en el libro, el "documento más cercano por monto" queda cerca **por azar**. Prueba con grupo de control (movimientos de tesorería, que por definición no tienen factura):

| Grupo | documento más cercano ≤ 0,5% | ≤ 1% |
|---|---|---|
| **Tesorería (control, sin contraparte real)** | **50%** | **72%** |
| COVE/IVEN/FACT (deberían tener contraparte) | 45% | 61% |

El grupo de control muestra **igual o mayor cercanía** que el grupo que sí debería calzar. Por lo tanto, admitir diferencias de monto sin una llave dura generaría **falsos positivos**, no conciliaciones. Esto valida el diseño implementado: la tolerancia porcentual sólo se aplica con **RUT coincidente**.

### 9.3 Conclusión

La caída del indicador **no es una regresión**: antes el 100% se sostenía sobre 292 movimientos marcados como "resueltos" con un clic. Lo que falta es la **llave de enlace en los datos**, y las palancas para conseguirla son:

1. **Mapear RUT / N° de documento del archivo real de cartola** (Fase 2.2) — la única llave que puede conectar.
2. **Verificar el alcance**: en enero el banco movió $1.947.827.480 y los libros registran $566.000.000 (3,4×). Hay que confirmar con contabilidad si esos pagos/cobros están en los libros cargados.
3. **Matching 1:N** (Fase 4) si los pagos son consolidados.



---

## 10. Función nueva: leer el comprobante de la transferencia

### Problema que resuelve

Las glosas de la cartola son genéricas (`TRASPASO FONDOS OTRO BANCO EN LINEA`) y no permiten deducir a qué corresponde el movimiento. El **comprobante de la transferencia sí lo dice**: beneficiario, RUT y, sobre todo, el motivo (p. ej. `REM SEPT` → Remuneraciones).

### Solución implementada

En la tabla de conciliación, cada movimiento de banco sin conciliar tiene un botón **📎**. Al pulsarlo:

1. Se sube el **comprobante (PDF o imagen)**.
2. Un **modelo de visión** extrae los datos.
3. El sistema **valida** el comprobante contra el movimiento.
4. Se **propone el código** contable del catálogo.
5. Se aplica con un clic, dejando la evidencia registrada.

### Detalles técnicos

| Aspecto | Implementación |
|---|---|
| Modelo | Reutiliza el proxy `/api/pdf` (el mismo proveedor de visión de "PDF a Excel"); la API key sigue del lado servidor |
| Renderizado | Reutiliza `renderizarPaginas` de `pdfAExcel` con **import dinámico**: pdfjs sólo se descarga si se sube un PDF |
| Campos extraídos | tipo, fecha, monto, moneda, ordenante, beneficiario, RUT, banco y cuenta destino, **detalle** (motivo), N° de operación y todo el texto visible |
| Validación | monto ±$1, fecha ≤5 días, RUT normalizado → veredicto **coincide / parcial / no coincide** + lista de diferencias |
| Propuesta de código | 1º el motor local (alias, RUT, nombre del catálogo: determinista y explicable); 2º la IA (`sugerirCodigosPorGlosa`) sólo si el primero no encuentra nada |
| Al aplicar | `codigoId`, `codigoOrigen = 'manual'`, `codigoConfianza` y **`codigoEvidencia`** con el resumen del comprobante |
| Base de datos | **No requiere migración**: usa columnas existentes |

Ejemplo del texto que queda como evidencia:

```
Comprobante adjunto: a Jennifher Alexandr · "REM SEPT" · 30-09-2026 · $1.250.000 · El comprobante calza con el movimiento
```

### Archivos

| Archivo | Rol |
|---|---|
| `src/services/comprobanteIA.ts` | Extracción con visión, validación y propuesta de código |
| `src/features/conciliacion/DialogComprobante.tsx` | Diálogo de carga y revisión |
| `src/features/conciliacion/ConciliacionPage.tsx` | Botón 📎 en la fila |
| `src/services/comprobanteIA.test.ts` | 9 tests de la lógica pura |

### Verificación

`tsc`, `eslint`, **63 tests** y `npm run build` OK. El comprobante adjuntado en el chat llegó **corrupto** (bytes binarios reemplazados por `U+FFFD`, lo que rompe también la cabecera zlib), así que la prueba end-to-end con ese archivo no fue posible: hay que subirlo desde la app, que lo lee localmente en el navegador.

### Contraparte sugerida desde el comprobante (agregado)

Con el **RUT** y el **monto** que extrae el comprobante, el diálogo busca en los libros los documentos
que podrían ser la contraparte del pago/cobro y los ofrece para conciliar con un clic:

| Señal | Peso en el puntaje (0..1) |
|---|---|
| Mismo RUT | +0,45 |
| Monto exacto (±$1; incluye cuotas vía `metadatos.montos_pago`) | +0,35 |
| Fecha a ≤60 días | +0,15 |
| Glosa similar (≥0,5) | hasta +0,15 |

Reglas de descarte (para no inventar pares):

- Documentos ya conciliados con otro movimiento → excluidos.
- Signo incompatible (cargo vs abono) → excluido.
- RUT distinto **y** monto no exacto → excluido.
- Sin RUT, sin monto exacto y sin monto similar → excluido.

Se muestran hasta 5 candidatos ordenados por evidencia. Al aceptar uno se usa la conciliación
manual existente (`conciliarManual`), que el backend valida como par recíproco antes de persistir.

Archivos: `comprobanteIA.ts` (`buscarContrapartes`), `DialogComprobante.tsx` (sección "Posibles
contrapartes en los libros") y `ConciliacionPage.tsx` (`onConciliar` → `conciliarManual`).


---

## 11. El bloqueo principal: la ventana de fechas (60 → 90 días)

### Hallazgo

En abril 2026, **24 pagos sin contraparte tenían su factura con el mismo monto a 62-77 días**,
apenas fuera de la ventana de 60 días que usaba el motor:

```
banco 2026-04-01  $3.570.000  TRASPASO   ↔  libro 2026-01-26  $3.570.000  COMERCIALIZADORA GC (65 días)
banco 2026-04-02  $6.872.250  TRASPASO   ↔  libro 2026-01-20  $6.872.250  PRISA MEDIA CHILE   (72 días)
banco 2026-04-06    $339.293  COVE · Transfer a ZANCO SPA
                                           ↔  libro 2026-01-22    $339.293  ZANCO SPA (74 días)
```

El ciclo real de pago de este negocio es **60-90 días** (factura en enero → pago a comienzos de
abril), el plazo habitual en Chile. Con 60 días esos pares se perdían.

### Corrección

`MATCHING_DEFAULT.toleranciaDias: 60 → 90` en `src/services/matching.ts` (configuración, una línea).
La Ayuda se actualizó (decía "tolerancia de 5 días", desactualizada).

### Impacto medido (simulación sobre los datos reales)

| mes | 60 días: conc/sug | 90 días: conc/sug | Ganancia |
|---|---|---|---|
| 2026-01 | 13/14 | 13/14 | 0 (faltan libros de nov/dic 2025) |
| 2026-02 | 36/11 | 36/12 | +1 |
| **2026-03** | 33/25 | **55/36** | **+33** |
| **2026-04** | 21/12 | **30/13** | **+10** |
| 2026-05 | 33/12 | 35/13 | +3 |
| 2026-06 | 18/16 | 20/19 | +5 |
| 2026-07 | 45/26 | 50/26 | +4 |
| **Total** | **316 pares** | **372 pares** | **+56 (+18%)** |

Los pares nuevos son reales: mismo monto al peso y el nombre de la contraparte coincide.

### Otro hallazgo por revisar

En abril, el banco registra **$166.475.879 codificados `FACT`** (glosas "ABONO …") mientras el libro
del año entero sólo tiene $356.613 en `FACT`. Esa brecha hay que revisarla con contabilidad: o el
código del banco está mal asignado, o faltan los documentos de factoring en el libro.

