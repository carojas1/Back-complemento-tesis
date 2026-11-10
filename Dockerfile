# Imagen de la API y del worker (spec 114 FR-003): builder compila, development corre con el código montado y recarga
# sola, production lleva solo lo que corre (dist y dependencias de producción) con el usuario node.
FROM node:24-bookworm-slim AS builder

# Versiones fijas. build-essential, python3 y node-gyp: por si argon2 no trae binario para la plataforma y hay que
# compilarlo. openssl: el motor de migraciones de Prisma lo necesita (y sin él se baja el binario equivocado).
RUN npm i -g pnpm@11.10.0 node-gyp@13.1.0 --ignore-scripts && \
    apt-get update && apt-get install -y --no-install-recommends build-essential openssl python3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# prisma.config.ts exige DATABASE_URL aunque generar el cliente no se conecte. ARG: no queda en la imagen.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build

# El postinstall genera el cliente de Prisma: el esquema va antes. Los scripts de instalación solo corren para los
# paquetes de `allowBuilds` (pnpm-workspace.yaml).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ---------- Desarrollo: el código se monta como volumen ----------
FROM node:24-bookworm-slim AS development

# ffmpeg: convierte a m4a las grabaciones del navegador (src/common/audio). openssl: migraciones de las pruebas.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
RUN chown node:node /app

EXPOSE 3000
USER node
# Sin `pnpm run`: pnpm 11 revisa las dependencias antes de cada script y, sin terminal, aborta.
CMD ["sh", "-c", "node_modules/.bin/prisma generate && node_modules/.bin/nest start --watch"]

# ---------- Dependencias de producción (sin las de desarrollo) ----------
FROM builder AS prod-deps
RUN pnpm prune --prod

# ---------- Producción ----------
FROM node:24-bookworm-slim AS production

ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# De root y de solo lectura para node: el proceso no puede cambiar su propio código. El cliente de Prisma ya viene
# generado en node_modules. Las migraciones corren aparte (servicio `migrate` de compose.yaml).
COPY --from=builder /app/package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000
USER node
CMD ["node", "dist/main"]
