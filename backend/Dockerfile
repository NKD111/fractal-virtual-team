FROM node:20-alpine

WORKDIR /app

# Chromium + dependencies for Puppeteer (Vision Layer / Fase 6.5)
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      freetype-dev \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      udev

# Tell Puppeteer to skip downloading Chromium (we use the system one)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
RUN npm ci --only=production

# ─── Higgsfield CLI binary ─────────────────────────────────────────────────────
ARG HF_CLI_VERSION=0.1.29
RUN apk add --no-cache curl tar && \
    mkdir -p vendor && \
    curl -fsSL "https://github.com/higgsfield-ai/cli/releases/download/v${HF_CLI_VERSION}/hf_${HF_CLI_VERSION}_linux_amd64.tar.gz" \
      -o /tmp/hf.tar.gz && \
    tar -xzf /tmp/hf.tar.gz -C vendor hf && \
    chmod +x vendor/hf && \
    rm /tmp/hf.tar.gz && \
    echo "Higgsfield CLI v${HF_CLI_VERSION} installed"

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
