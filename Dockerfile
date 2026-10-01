FROM docker.io/library/node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git chromium ca-certificates curl fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/* \
 && git config --system safe.directory '*'
COPY --from=docker.io/library/docker:cli /usr/local/bin/docker /usr/local/bin/docker

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

ENV NODE_ENV=production \
    CONTAINER_CLI=docker \
    CHROME_PATH=/usr/bin/chromium \
    DATA_DIR=/data \
    PORT=8787 \
    PREVIEW_PORT=8788
EXPOSE 8787 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD curl -fsS http://127.0.0.1:8787/ >/dev/null || exit 1
CMD ["npm", "start"]
