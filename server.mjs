/**
 * Servidor de producción para despliegue en VPS con Docker.
 *
 * Reemplaza a Vercel: sirve el SPA ya compilado (carpeta `dist/`) y atiende las
 * mismas rutas `/api/*` reutilizando los handlers de `api/` (que tienen la firma
 * estilo Vercel `(req, res)`). Así las API keys siguen viviendo SÓLO en el
 * servidor (variables sin prefijo `VITE_`) y nunca llegan al bundle del cliente.
 *
 * No tiene dependencias externas: usa el módulo `http` nativo y el `fetch`
 * global de Node 18+. Escucha en el puerto `PORT` (3000 por defecto).
 */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import ping from './api/ping.js'
import clinepass from './api/clinepass.js'
import pdf from './api/pdf.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST = join(__dirname, 'dist')
const PORT = Number(process.env.PORT) || 3000

/** Rutas de API: mismas que en Vercel. */
const API = {
  '/api/ping': ping,
  '/api/clinepass': clinepass,
  '/api/pdf': pdf,
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Adapta la respuesta nativa de Node a la API estilo Express/Vercel que esperan
 * los handlers (`res.status().json()`, `res.send()`).
 */
function adaptarRes(res) {
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (obj) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    res.end(JSON.stringify(obj))
    return res
  }
  res.send = (data) => {
    res.end(data)
    return res
  }
  return res
}

/** Lee el cuerpo de la petición y lo parsea como JSON cuando corresponde. */
async function leerCuerpo(req) {
  const partes = []
  for await (const parte of req) partes.push(parte)
  if (partes.length === 0) return undefined
  const crudo = Buffer.concat(partes).toString('utf8')
  const tipo = req.headers['content-type'] || ''
  if (tipo.includes('application/json')) {
    try {
      return JSON.parse(crudo)
    } catch {
      return crudo
    }
  }
  return crudo
}

/** Sirve un archivo estático de `dist/`, con fallback al SPA (index.html). */
async function servirEstatico(ruta, res) {
  let rel = decodeURIComponent(ruta)
  if (rel.endsWith('/')) rel += 'index.html'

  let archivo = normalize(join(DIST, rel))
  // Protección contra path traversal: debe quedar dentro de DIST.
  if (archivo !== DIST && !archivo.startsWith(DIST + sep)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  try {
    const info = await stat(archivo)
    if (info.isDirectory()) archivo = join(archivo, 'index.html')
  } catch {
    // No existe: si la ruta no parece un archivo (sin extensión), es una ruta
    // del router del SPA -> servimos index.html. Si tiene extensión, es 404.
    if (extname(rel) === '') {
      archivo = join(DIST, 'index.html')
    } else {
      res.statusCode = 404
      res.end('Not found')
      return
    }
  }

  try {
    const datos = await readFile(archivo)
    res.setHeader('Content-Type', MIME[extname(archivo)] || 'application/octet-stream')
    res.end(datos)
  } catch {
    res.statusCode = 404
    res.end('Not found')
  }
}

const server = createServer(async (req, res) => {
  let ruta = '/'
  try {
    ruta = new URL(req.url, 'http://localhost').pathname
  } catch {
    ruta = req.url || '/'
  }

  const handler = API[ruta]
  if (handler) {
    adaptarRes(res)
    try {
      req.body = await leerCuerpo(req)
      await handler(req, res)
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({
          error: { message: `Error interno: ${e instanceof Error ? e.message : 'desconocido'}` },
        })
      }
    }
    return
  }

  await servirEstatico(ruta, res)
})

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`)
})
