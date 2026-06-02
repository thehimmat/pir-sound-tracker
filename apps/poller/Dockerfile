FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

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

# Bake the Tesseract model. The CLI needs it uncompressed at TESSDATA_PREFIX.
# (No gzip step needed — tesseract.js is no longer used.)
ENV TESSDATA_PREFIX=/app/tessdata
RUN mkdir -p /app/tessdata
COPY apps/poller/eng.traineddata /app/tessdata/eng.traineddata

CMD ["node", "apps/poller/dist/index.js"]
