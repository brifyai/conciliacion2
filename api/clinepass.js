/**
 * Proxy de la API de ClinePass para la inspección con IA.
 *
 * Existe por dos motivos:
 *  1. La API de Cline no debe llamarse desde el navegador: conviene no exponer
 *     la key y evitar depender de CORS.
 *  2. La API key debe quedarse en el servidor. Se lee de la variable de entorno
 *     `CLINEPASS_API_KEY` (sin prefijo `VITE_`), de modo que nunca se incrusta
 *     en el bundle del cliente.
 *
 * Es una ruta única y fija —no una catch-all— porque sólo se usa un endpoint
 * del modelo. En desarrollo la atiende el proxy de Vite (`vite.config.ts`) y en
 * producción esta función; el frontend llama siempre a `/api/clinepass`.
 *
 * Va en JavaScript a propósito: el `tsconfig.json` del proyecto usa
 * `noEmit: true` e `include: ["src"]`, lo que complica compilar TypeScript aquí.
 */

const BASE_URL = process.env.CLINEPASS_BASE_URL || 'https://api.deepseek.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Sólo se admite POST' } })
    return
  }

  const apiKey = process.env.CLINEPASS_API_KEY
  if (!apiKey) {
    res.status(500).json({
      error: {
        message:
          'Falta la variable de entorno CLINEPASS_API_KEY. Configúrala en ' +
          'Vercel (Settings → Environment Variables) y vuelve a desplegar.',
      },
    })
    return
  }

  // Vercel entrega el cuerpo ya parseado cuando el content-type es JSON.
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

    // Se reenvía el cuerpo tal cual: el cliente ya sabe interpretar tanto la
    // respuesta correcta como el error que entrega la API.
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
