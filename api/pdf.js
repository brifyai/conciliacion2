/**
 * Proxy del modelo de visión para la conversión PDF a Excel.
 *
 * Va aparte de `api/clinepass.js` porque usa su propio modelo de visión y su
 * propia variable de API key (misma cuenta de Cline). Existe por dos motivos:
 *  1. Evitar CORS: el navegador no puede llamar al proveedor directamente.
 *  2. Mantener la API key en el servidor: se lee de `PDF_MODEL_API_KEY`
 *     (sin prefijo `VITE_`), de modo que nunca llega al bundle del cliente.
 *
 * En desarrollo la atiende el proxy de Vite (`vite.config.ts`); en producción
 * esta función. El frontend siempre llama a `/api/pdf`.
 */

const BASE_URL = process.env.PDF_MODEL_BASE_URL || 'https://api.cline.bot/api/v1'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Sólo se admite POST' } })
    return
  }

  const apiKey = process.env.PDF_MODEL_API_KEY
  if (!apiKey) {
    res.status(500).json({
      error: {
        message:
          'Falta la variable de entorno PDF_MODEL_API_KEY. Configúrala en ' +
          'Vercel (Settings → Environment Variables) y vuelve a desplegar.',
      },
    })
    return
  }

  const cuerpo = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})

  try {
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: cuerpo,
    })

    const texto = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json')
    res.send(texto)
  } catch (e) {
    res.status(502).json({
      error: {
        message: `No se pudo contactar a la API del modelo: ${
          e instanceof Error ? e.message : 'error desconocido'
        }`,
      },
    })
  }
}
