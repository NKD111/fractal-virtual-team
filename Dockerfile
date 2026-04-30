FROM node:20-alpine

WORKDIR /app

# Instalar deps primero (capa separada = cache eficiente)
COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund

# Copiar código
COPY . .

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "mariana-assistant-FORMAL.js"]
