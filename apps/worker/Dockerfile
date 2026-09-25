# Worker DEV terpisah karena Chromium dan font tidak boleh memperbesar image API.
# Konteks build = root monorepo:
#   docker compose -f docker-compose.dev.yml build worker
FROM node:20-bookworm-slim AS base

# Chromium sistem dipakai puppeteer-core. Noto menjaga aksara non-latin dan
# emoji; ca-certificates diperlukan untuk tautan/provider HTTPS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-noto-color-emoji \
    fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /workspace

FROM base AS dev
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
RUN pnpm install --frozen-lockfile --filter @nawasena/worker...

COPY . .
CMD ["pnpm", "--filter", "@nawasena/worker", "start"]
