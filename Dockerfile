FROM node:20-alpine

WORKDIR /app

# Instalar deps primero (capa separada = cache eficiente)
COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund

# ─── Higgsfield CLI binary (Linux amd64) ────────────────────────────────────
ARG HF_CLI_VERSION=0.1.29
RUN apk add --no-cache curl tar && \
    mkdir -p vendor && \
    curl -fsSL "https://github.com/higgsfield-ai/cli/releases/download/v${HF_CLI_VERSION}/hf_${HF_CLI_VERSION}_linux_amd64.tar.gz" \
      -o /tmp/hf.tar.gz && \
    tar -xzf /tmp/hf.tar.gz -C vendor hf && \
    chmod +x vendor/hf && \
    rm /tmp/hf.tar.gz && \
    echo "✅ Higgsfield CLI v${HF_CLI_VERSION} installed"

# Copiar código
COPY . .

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "mariana-assistant-FORMAL.js"]
