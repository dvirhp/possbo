# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS client-build
WORKDIR /workspace/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-bookworm-slim AS server-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
COPY server/prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
# Browser binaries depend only on locked server dependencies. Keeping this
# before application source and migrations preserves the expensive layer cache.
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY server/package.json ./package.json
COPY server/prisma ./prisma
COPY server/src ./src
COPY --from=client-build /workspace/client/dist /client/dist
RUN mkdir -p /app/uploads && chown -R node:node /app /client
USER node
EXPOSE 8000
CMD ["node", "src/index.js"]
