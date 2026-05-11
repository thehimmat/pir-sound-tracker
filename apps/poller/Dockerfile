FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY apps/poller/package.json ./apps/poller/

# Install all workspace deps (sharp pre-built Linux binary is included via npm)
RUN npm install

# Copy source
COPY packages/types/ ./packages/types/
COPY packages/db/ ./packages/db/
COPY apps/poller/ ./apps/poller/

# Build
RUN npm run build --workspace=packages/types && \
    npm run build --workspace=packages/db && \
    npm run build --workspace=apps/poller

# Pre-bake the Tesseract English model so the container starts instantly
# without needing to download 5 MB on every cold start
ENV TESSDATA_DIR=/app/tessdata
RUN mkdir -p /app/tessdata && \
    curl -fsSL "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz" \
      | gunzip -c > /app/tessdata/eng.traineddata

CMD ["node", "apps/poller/dist/index.js"]
