FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY web/package.json ./web/
COPY server/package.json ./server/

RUN npm ci

COPY web ./web
COPY server ./server

RUN npm run build -w web

FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    EXPORT_DIR=/exports

WORKDIR /app

COPY package.json package-lock.json ./
COPY web/package.json ./web/
COPY server/package.json ./server/

RUN npm ci --omit=dev

COPY server ./server
COPY --from=build /app/web/dist ./web/dist

RUN mkdir -p /exports \
    && useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app /exports

USER appuser

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
