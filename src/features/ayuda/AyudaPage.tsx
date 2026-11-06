import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import LightbulbRoundedIcon from '@mui/icons-material/LightbulbRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded'
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded'
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded'
import RuleRoundedIcon from '@mui/icons-material/RuleRounded'
import EventRoundedIcon from '@mui/icons-material/EventRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import { PageHeader } from '@/components/common/PageHeader'

export function AyudaPage() {
  return (
    <Box>
      <PageHeader
        title="Ayuda"
        subtitle="Guía práctica para cargar, conciliar, clasificar y cerrar un período correctamente."
      />

      <Stack spacing={2.5}>
        <Seccion numero={1} icono={<LightbulbRoundedIcon />} titulo="Qué hace conciliaBK">
          <Typography variant="body1" sx={{ mb: 1.5 }}>
            La conciliación compara los movimientos del <strong>banco</strong> con los
            registros de <strong>contabilidad</strong>. La app busca contrapartes reales
            para detectar diferencias, duplicados u omisiones antes del cierre.
          </Typography>
          <Tip color="success">
            Conciliar responde “¿qué movimiento bancario corresponde a qué registro?”.
            Clasificar responde “¿qué es ese movimiento y a qué cuenta o concepto pertenece?”.
          </Tip>
        </Seccion>
        <Seccion numero={2} icono={<CompareArrowsRoundedIcon />} titulo="Estados y criterios de conciliación">
          <Grid container spacing={2}>
            <ConceptoCard titulo="Conciliada" descripcion="Existe una contraparte real banco–contabilidad. El vínculo puede ser automático o manual." />
            <ConceptoCard titulo="Sugerida" descripcion="Hay una pareja probable por monto y fecha, pero la evidencia textual requiere revisión." />
            <ConceptoCard titulo="Pendiente" descripcion="Hay una coincidencia débil, por ejemplo solo por monto o con fecha fuera del rango esperado." />
            <ConceptoCard titulo="No conciliada" descripcion="No se encontró una contraparte válida en la fuente opuesta." />
          </Grid>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 2, mb: 0.5 }}>
            Qué compara el motor
          </Typography>
          <List dense disablePadding>
            <BulletItem primary="Monto y signo" secondary="Admite hasta $1 de diferencia. Ingreso se compara con ingreso y egreso con egreso; los montos $0 no se concilian." />
            <BulletItem primary="Fecha" secondary="Usa vencimiento como fecha principal y emisión solo como respaldo, con una tolerancia de hasta 90 días (plazos 30/60/90 habituales en Chile)." />
            <BulletItem primary="RUT" secondary="Si ambos lados tienen RUT y son distintos, la pareja se rechaza." />
            <BulletItem primary="Texto" secondary="Compara glosa, contraparte, folio, documento y tipo de documento para calcular similitud." />
          </List>
        </Seccion>

        <Seccion numero={3} icono={<UploadFileRoundedIcon />} titulo="Orden recomendado de carga">
          <Step n={1} titulo="Prepara códigos y reglas">
            <Typography variant="body2">
              Revisa primero <strong>Códigos</strong> y <strong>Reglas</strong>. Si todavía no
              tienes aliases, podrás asignar códigos manualmente después.
            </Typography>
          </Step>
          <Step n={2} titulo="Carga toda la contabilidad del período">
            <Typography variant="body2">
              Carga Compras, Ventas, Notas de Crédito, Notas de Débito y Factoring.
              El primer archivo inicia el conjunto; en los siguientes elige
              <strong> Agregar a las existentes</strong>.
            </Typography>
          </Step>
          <Step n={3} titulo="Carga las cartolas bancarias">
            <Typography variant="body2">
              Agrega una cartola por banco. La app intenta reconocer el banco por el nombre
              del archivo, pero debes confirmarlo antes de importar. Usa
              <strong> Administrar bancos</strong> para agregar o eliminar opciones del selector.
            </Typography>
          </Step>
          <Step n={4} titulo="Confirma y revisa">
            <Typography variant="body2">
              El botón <strong>Confirmar y conciliar</strong> guarda el archivo, clasifica y
              ejecuta el matching. Después te lleva a la tabla de conciliación.
            </Typography>
          </Step>
          <Tip color="warning">
            Usa <strong>Reemplazar todo</strong> solo cuando quieras borrar el conjunto actual
            y comenzar nuevamente. Para completar un período usa <strong>Agregar</strong>.
          </Tip>
        </Seccion>
        <Seccion numero={4} icono={<UploadFileRoundedIcon />} titulo="Cómo revisar un archivo antes de importarlo">
          <List dense disablePadding>
            <BulletItem primary="Formato" secondary="Se admiten CSV y XLSX. Los archivos XLS antiguos deben guardarse como XLSX." />
            <BulletItem primary="Perfil y hoja" secondary="Confirma la hoja del Excel y el perfil: Compras, Ventas, NC/ND de compras o ventas, Factoring o Banco." />
            <BulletItem primary="Mapeo mínimo" secondary="Toda fila necesita fecha y monto, o bien Cargo y Abono. Cada campo escalar debe estar mapeado una sola vez." />
            <BulletItem primary="Diagnóstico" secondary="Revisa filas válidas, omitidas y advertencias. Las fechas futuras bloquean la importación." />
            <BulletItem primary="Duplicados" secondary="El archivo y su mapeo generan una huella; si ya fueron importados, no se vuelven a insertar." />
          </List>
          <Tip>
            <strong>Código contable / clave cliente</strong> y <strong>Código tipo doc. SII</strong>
            son campos diferentes. No los mapees a la misma columna.
          </Tip>
        </Seccion>

        <Seccion numero={5} icono={<CompareArrowsRoundedIcon />} titulo="Revisión y conciliación manual">
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Chip label="Conciliada" color="success" size="small" />
            <Chip label="Sugerida" color="info" size="small" />
            <Chip label="Pendiente" color="warning" variant="outlined" size="small" />
            <Chip label="No conciliada" color="error" size="small" />
          </Stack>
          <ol style={{ marginTop: 0, marginBottom: 12, paddingLeft: 20 }}>
            <li>Filtra por sugeridas, pendientes o no conciliadas.</li>
            <li>Selecciona exactamente una fila bancaria y una contable.</li>
            <li>Presiona <strong>Conciliar selección (2)</strong>.</li>
            <li>Usa la lupa o doble clic para buscar candidatos de la fuente opuesta.</li>
            <li>Usa el eslabón cortado para liberar ambas filas de una conciliación.</li>
          </ol>
          <Tip color="warning">
            El flujo actual es <strong>1:1</strong>. No agrupa automáticamente varias facturas
            en un depósito ni divide un pago entre varios documentos. Esos casos deben
            revisarse y documentarse fuera del match automático.
          </Tip>
        </Seccion>

        <Seccion numero={6} icono={<DashboardRoundedIcon />} titulo="Dashboard y meta del 98%">
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            La tasa se calcula por cantidad de filas conciliadas sobre filas conciliables.
            Los movimientos de monto $0 se excluyen. Como cada match 1:1 vincula dos filas,
            ambas cuentan como conciliadas.
          </Typography>
          <List dense disablePadding>
            <BulletItem primary="Objetivo automático realista" secondary="Entre 90% y 95% con archivos completos, fechas, montos y RUT consistentes." />
            <BulletItem primary="Objetivo final" secondary="98% o más después de revisar sugerencias, pendientes y casos manuales." />
            <BulletItem primary="Monto no conciliado" secondary="Se calcula usando la fuente bancaria cuando existen movimientos bancarios, evitando duplicar banco y contabilidad." />
          </List>
          <Tip>
            Para acercarte al 98% carga todas las fuentes del mismo período, configura aliases
            y resuelve pagos parciales, comisiones, documentos faltantes y movimientos agrupados.
          </Tip>
        </Seccion>
        <Seccion numero={7} icono={<QrCode2RoundedIcon />} titulo="Códigos, claves, categorías y aliases">
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <ConceptoCard titulo="Código contable" descripcion="Mnemónico específico del catálogo, por ejemplo GABA o IVEN." />
            <ConceptoCard titulo="Clave cliente" descripcion="Identificador asociado al código, por ejemplo 2700. También puede venir en el archivo." />
            <ConceptoCard titulo="Nombre / desglose" descripcion="Explica qué representa el código, por ejemplo Gastos Bancarios." />
            <ConceptoCard titulo="Categoría padre" descripcion="Agrupador opcional. El código sigue siendo la clasificación principal." />
            <ConceptoCard titulo="Código tipo doc. SII" descripcion="Dato tributario de una factura o nota; no pertenece al catálogo contable." />
            <ConceptoCard titulo="Alias" descripcion="Frase completa que permite detectar el código, por ejemplo comisión bancaria." />
          </Grid>
          <Typography variant="body2" sx={{ mb: 1 }}>
            La detección intenta, en orden: columna explícita, código delimitado, aliases,
            nombre completo y perfil documental. Las claves numéricas solo se aceptan desde
            una columna explícita para no confundirlas con folios o códigos SII. Si hay un
            empate equivalente, no asigna automáticamente. La prioridad más baja gana cuando
            dos evidencias tienen la misma fuerza y especificidad.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Ventas y sus notas de crédito se clasifican como IVEN; factoring se marca como
            FACT. Además, la detección revisa descripción, contraparte, proveedor y aliases.
            Cuando una transacción codificada queda conciliada 1:1, su código se copia a la
            contraparte que todavía no tenga uno; nunca se reemplaza un código existente.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            En <strong>Conciliación</strong> puedes asignar o quitar un código manualmente.
            El tooltip muestra origen, confianza y evidencia. En <strong>Códigos</strong> puedes
            ver uso, activar/desactivar, importar o exportar el catálogo.
          </Typography>
          <Tip>
            CSV del catálogo: <code>codigo</code> y <code>nombre</code> son obligatorios;
            <code> clave</code>, <code>categoria</code>, <code>aliases</code>,
            <code> prioridad</code>, <code>descripcion</code> y <code>activo</code> son opcionales.
            Separa aliases con <code>|</code>.
          </Tip>
        </Seccion>

        <Seccion numero={8} icono={<RuleRoundedIcon />} titulo="Reglas y tratamiento de Factoring">
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Reglas</Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Las reglas completan categorías vacías; no crean conciliaciones ni eliminan el código.
            Pueden evaluar descripción, monto, RUT, categoría o banco con operadores de texto,
            comparación numérica y signo. Menor prioridad se evalúa primero.
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Factoring</Typography>
          <Typography variant="body2">
            Usa el perfil Factoring: fecha de cesión, monto recibido, folio de factura,
            RUT y entidad factoring. El movimiento busca una contraparte bancaria 1:1 por
            el efectivo recibido. La comisión queda como información del archivo; la app no
            relaciona automáticamente la cesión con la factura original.
          </Typography>
        </Seccion>
        <Seccion numero={9} icono={<PictureAsPdfRoundedIcon />} titulo="Período, reportes y manejo de datos">
          <List dense disablePadding>
            <BulletItem primary="Período" secondary="Mes y año filtran Dashboard, Conciliación y Reportes. Si aparece “Mes sin data”, cambia el período o carga los archivos correspondientes." />
            <BulletItem primary="Excel" secondary="Incluye resumen, no conciliadas, todas las transacciones, códigos, categorías, confianza y reglas." />
            <BulletItem primary="PDF" secondary="Incluye KPIs y tablas de conciliadas y pendientes con su código contable." />
            <BulletItem primary="Persistencia" secondary="Las importaciones y conciliaciones confirmadas se guardan en el backend y quedan aisladas por organización." />
          </List>
          <Tip color="warning">
            <strong>Borrar datos</strong> elimina las transacciones e historial de importaciones
            de la organización actual. Exporta el reporte antes de reiniciar un período si necesitas respaldo operativo.
          </Tip>
        </Seccion>

        <Seccion numero={10} icono={<EventRoundedIcon />} titulo="Solución de problemas frecuentes">
          <List disablePadding>
            <FaqItem pregunta="El archivo no contiene filas legibles" respuesta="Comprueba que sea CSV o XLSX, que la primera fila tenga encabezados y que hayas elegido la hoja correcta. Guarda los XLS antiguos como XLSX." />
            <FaqItem pregunta="No se reconocieron transacciones válidas" respuesta="Mapea Fecha y Monto, o Fecha con Cargo/Abono. Revisa el diagnóstico: las filas sin fecha o monto válido se omiten." />
            <FaqItem pregunta="Hay campos asignados más de una vez" respuesta="Deja una sola columna para cada campo escalar. Marca las columnas sobrantes como Ignorar." />
            <FaqItem pregunta="El archivo contiene fechas futuras" respuesta="Corrige las fechas del archivo. La app bloquea la importación para evitar movimientos en períodos incorrectos." />
            <FaqItem pregunta="Este archivo y mapeo ya fueron importados" respuesta="No es un error de pérdida: la protección de duplicados evitó insertar el mismo contenido nuevamente." />
            <FaqItem pregunta="No hay candidatos disponibles" respuesta="Carga la fuente opuesta, revisa el período y confirma que la contraparte no esté ya conciliada." />
            <FaqItem pregunta="Un código no se detecta" respuesta="Verifica que esté activo, agrega un alias específico o mapea una columna como Código contable / clave cliente. También puedes asignarlo manualmente." />
            <FaqItem pregunta="¿Por qué no llego al 98%?" respuesta="Busca archivos faltantes, RUT o signos incompatibles, fechas fuera de rango, pagos parciales, agrupaciones, comisiones y documentos duplicados." />
          </List>
        </Seccion>
      </Stack>
    </Box>
  )
}

function Seccion({ numero, icono, titulo, children }: {
  numero: number
  icono: React.ReactNode
  titulo: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: 2, bgcolor: 'primary.main', color: '#fff',
            display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 700,
          }}>
            {numero}
          </Box>
          <Box sx={{ color: 'primary.main', display: 'flex' }}>{icono}</Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{titulo}</Typography>
        </Stack>
        <Box>{children}</Box>
      </CardContent>
    </Card>
  )
}
function Step({ n, titulo, children }: {
  n: number
  titulo: string
  children: React.ReactNode
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Box sx={{
          width: 26, height: 26, borderRadius: '50%', bgcolor: 'warning.main', color: '#fff',
          display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0,
        }}>
          {n}
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{titulo}</Typography>
      </Stack>
      <Box sx={{ pl: 4.5 }}>{children}</Box>
    </Box>
  )
}

function Tip({ children, color = 'info' }: {
  children: React.ReactNode
  color?: 'info' | 'warning' | 'success' | 'error'
}) {
  return (
    <Alert severity={color} icon={<LightbulbRoundedIcon fontSize="small" />} sx={{ my: 1 }}>
      <Typography variant="body2">{children}</Typography>
    </Alert>
  )
}

function ConceptoCard({ titulo, descripcion }: {
  titulo: string
  descripcion: string
}) {
  return (
    <Grid item xs={12} sm={6}>
      <Box sx={{
        p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%',
      }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>{titulo}</Typography>
        <Typography variant="body2" color="text.secondary">{descripcion}</Typography>
      </Box>
    </Grid>
  )
}

function BulletItem({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <ListItem disableGutters sx={{ alignItems: 'flex-start', py: 0.5 }}>
      <ListItemIcon sx={{ minWidth: 28, mt: '2px' }}>
        <CheckCircleRoundedIcon fontSize="small" color="success" />
      </ListItemIcon>
      <ListItemText
        primary={primary}
        secondary={secondary}
        primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
        secondaryTypographyProps={{ variant: 'body2' }}
      />
    </ListItem>
  )
}

function FaqItem({ pregunta, respuesta }: { pregunta: string; respuesta: string }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <WarningAmberRoundedIcon fontSize="small" sx={{ color: 'warning.main', mt: '2px' }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>{pregunta}</Typography>
          <Typography variant="body2" color="text.secondary">{respuesta}</Typography>
        </Box>
      </Stack>
      <Divider sx={{ mt: 1.5 }} />
    </Box>
  )
}
