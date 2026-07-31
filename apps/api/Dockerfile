# Dockerfile apps/api — target dev (PR-008). Target prod/build = PR-099.
# Konteks build = ROOT monorepo (butuh lockfile workspace):
#   docker compose -f docker-compose.dev.yml build api

FROM node:20-alpine AS base
# corepack membaca packageManager (pnpm@9.15.0) dari package.json — satu sumber versi.
RUN corepack enable
WORKDIR /workspace

FROM base AS dev
# Manifest workspace dulu (layer cache: install tidak diulang bila source berubah).
# Seluruh package.json workspace wajib ada agar pnpm bisa memetakan graph lockfile.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/config/package.json packages/config/
COPY packages/schemas/package.json packages/schemas/
COPY packages/api-client/package.json packages/api-client/
COPY packages/ui/package.json packages/ui/
COPY packages/a11y/package.json packages/a11y/
# api DAN worker: satu image, entry berbeda (worker dep ke @incasif/api).
RUN pnpm install --frozen-lockfile --filter @incasif/api... --filter @incasif/worker...
# Source di-overlay volume mount saat runtime (hot-reload tsx watch);
# COPY di bawah hanya agar image bisa jalan tanpa mount.
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "@incasif/api", "dev"]
