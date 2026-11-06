/**
 * Endpoint de diagnóstico: confirma que Vercel está construyendo y sirviendo
 * las funciones de la carpeta `api/`. Si `/api/ping` responde 200 pero otra
 * función no, el problema está en esa función concreta (nombre del archivo o
 * enrutado), no en la configuración del proyecto.
 */
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    ruta: req.url,
    tieneApiKey: Boolean(process.env.CLINEPASS_API_KEY),
  })
}
