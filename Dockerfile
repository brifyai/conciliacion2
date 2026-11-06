# syntax=docker/dockerfile:1

# =====================================================================
# 1) BUILD: compila el SPA (Vite) con las variables públicas VITE_*
# =====================================================================
FROM node:20-alpine AS build
WORKDIR /app

# Instala dependencias aprovechando la cache de capas
COPY package.json package-lock.json ./
RUN npm ci

# Copia el resto del código fuente
COPY . .

# ---------------------------------------------------------------------
# Variables PÚBLICAS (VITE_*): se necesitan EN TIEMPO DE BUILD porque
# Vite las incrusta en el bundle del navegador. En Coolify/Dokploy se
# definen como "Build Variables" / build args.
#   - NO pongas aquí claves de API: esas van como variables de RUNTIME
#     (CLINEPASS_API_KEY, PDF_MODEL_API_KEY), nunca en el bundle.
# ---------------------------------------------------------------------
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_CLINEPASS_MODEL=deepseek-flash
ARG VITE_MODELO_PDF
ARG VITE_CLINEPASS_ENDPOINT=/api/clinepass

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_CLINEPASS_MODEL=$VITE_CLINEPASS_MODEL \
    VITE_MODELO_PDF=$VITE_MODELO_PDF \
    VITE_CLINEPASS_ENDPOINT=$VITE_CLINEPASS_ENDPOINT

RUN npm run build

# =====================================================================
# 2) RUNTIME: servidor Node sin dependencias que sirve dist/ y /api/*
# =====================================================================
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# package.json aporta "type":"module" para que los handlers api/*.js
# se carguen como ESM. No se instala nada: el servidor no tiene deps.
COPY package.json ./package.json
COPY --from=build /app/dist ./dist
COPY api ./api
COPY server.mjs ./server.mjs

EXPOSE 3000

# Healthcheck opcional (la ruta /api/ping responde 200)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/ping || exit 1

CMD ["node", "server.mjs"]
