# ============================================================================
# Sof-Expo · Ads Command Center — Fly.io (yoki istalgan Docker host) uchun
#
# Nega Docker/Fly: ilovaga UZOQ MUDDATLI process kerak — SSE (live), sync
# scheduler (har SYNC_INTERVAL_SEC), fs.watch va snapshot'ga yozish.
# Vercel serverless'da bularning hech biri ishlamaydi (funksiya so'rov orasida
# o'chadi), shuning uchun real-time rejim uchun Fly/Railway/VPS to'g'ri tanlov.
#
# Ikki bosqich:
#   1) build   — pnpm install + pnpm build (client → dist/public, server → dist/index.js)
#   2) runtime — faqat dist/ + node_modules (kichik obraz)
#
# Ma'lumotlar /data volume'da saqlanadi:
#   /data/snapshots/*.json  — tortilgan ma'lumotlar (SNAPSHOTS_DIR)
#   /data/store.json        — app kalitlari, tokenlar, kanallar (dirname(SNAPSHOTS_DIR))
# ============================================================================

# ---------- 1) Build ----------
FROM node:22-slim AS build
WORKDIR /app

# pnpm — package.json'dagi packageManager versiyasi avtomatik ishlatiladi
RUN corepack enable

# Avval faqat manifestlar — dependency layer keshda qolishi uchun
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Qolgan kod (scripts/, server/, client/, shared/, vite.config.ts …)
COPY . .

# client/public/data/bootstrap.json + dist/public + dist/index.js
RUN pnpm build

# ---------- 2) Runtime ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Runtime dependency'lar (express va h.k.) — build bosqichidan
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Boshlang'ich snapshotlar (repo'dagi eksportlar) — volume bo'sh bo'lsa
# entrypoint ularni /data/snapshots ga ko'chiradi (dashboard bo'sh qolmasligi uchun)
COPY --from=build /app/server/data/snapshots ./seed/snapshots
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Fly internal_port (fly.toml) shu portga ulanadi
ENV API_PORT=8080 \
    SNAPSHOTS_DIR=/data/snapshots
EXPOSE 8080

# Fly machine disk'i vaqtinchalik — ma'lumot volume'da yashaydi
VOLUME ["/data"]

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
