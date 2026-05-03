╔════════════════════════════════════════════════════════════════════════════╗
║   📖 ARCHIVO 1/8 - BIBLIA MAESTRA - FRACTAL VIRTUAL TEAM v4.0            ║
║   Setup Inicial + Índice Maestro + Arranque Inmediato                    ║
║   Claude Code: EMPIEZA AQUÍ                                              ║
╚════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════
INSTRUCCIÓN ABSOLUTA INICIAL
═══════════════════════════════════════════════════════════════════════════

Claude Code, lee esto antes de hacer cualquier cosa:

ESTE PROYECTO TIENE 8 ARCHIVOS DE DOCUMENTACIÓN:

1. 📖 BIBLIA_MAESTRA.md (ESTE - Índice + Setup) ← ESTÁS AQUÍ
2. 🗄️ DATABASE_SCHEMAS.md (Todo SQL)
3. 🤖 AGENTS_CODE.md (10 agentes con código)
4. 🔌 INTEGRATIONS.md (35+ APIs)
5. 💼 FINANCIAL_SYSTEM.md (Roberto + SAT)
6. ⚡ FEATURES_CODE.md (22 features)
7. 🎮 FRONTEND_CODE.md (Tipo juego)
8. 🚀 DEPLOYMENT.md (Railway + Vercel)

EMPIEZA SIEMPRE CON ESTE ARCHIVO.
Cuando necesites detalles, consulta el archivo correspondiente.

REGLAS DE ORO:
1. Lee primero, ejecuta después
2. Si dudas, consulta el archivo específico
3. Reporta progreso cada fase
4. Solo pide autorización en checkpoints críticos
5. Calidad > velocidad

═══════════════════════════════════════════════════════════════════════════
EL PROYECTO EN UNA LÍNEA
═══════════════════════════════════════════════════════════════════════════

"Construir Fractal Virtual Team v4.0: 10 agentes IA con personalidades 
vivas que trabajan 24/7 para Neiky/Fractal MX, con sistema financiero 
completo (Roberto), interfaz tipo juego, y 22 features brutales. 
Tiempo: 14 días intensos. Resultado: imperio creativo automatizado."

═══════════════════════════════════════════════════════════════════════════
CONTEXTO DEL DUEÑO Y NEGOCIO
═══════════════════════════════════════════════════════════════════════════

NEIKY (Tu jefe):
- Nombre: Fermín Monroy / NKD
- Ubicación: Mexico City
- WhatsApp: +525534189583
- Estilo: Casual, directo, "homie"
- Personalidad: Creativo, técnico, ambicioso

FRACTAL MX (La empresa):
- Agencia creativa AI-powered
- Servicios: Video, reels, branding, estrategia
- Clientes ideales: Eventos, expos, marcas
- Tarifa mínima: $10,000 MXN
- Diferenciador: AI + creatividad humana

CLIENTES ACTUALES:
1. Luis Tendero (Kisha Beauty Supply): $5k-$15k
2. Bedding Summit LATAM: $20k+ corporativo
3. FIF 2025: $15k-$30k
4. Expo Tendero: $10k-$20k
5. Cultivo Mental: Personal

═══════════════════════════════════════════════════════════════════════════
LOS 10 AGENTES (RESUMEN VISUAL)
═══════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│   #   AGENTE        ROL                         COLOR    EDAD       │
├─────────────────────────────────────────────────────────────────────┤
│   1   🌸 MARIANA   Hub Coordinator + Personal  #FF6B9D   28        │
│   2   💼 DIANA      Client Manager (Sr)         #9B59B6   35        │
│   3   🎬 ALEX       Content Creator             #3498DB   26        │
│   4   🎨 CARLOS     Junior Designer             #E67E22   24        │
│   5   📊 SOFIA      Project Manager             #27AE60   31        │
│   6   📈 LUCAS      Analytics                   #F39C12   29        │
│   7   🎨 DIEGO      Senior Designer             #34495E   39        │
│   8   🎬 MAX        AI Video Editor             #E74C3C   32        │
│   9   👁️ VALENTINA Art Director                 #8E44AD   42        │
│  10   💼 ROBERTO    CFO / Finanzas              #16A085   36 ⭐    │
└─────────────────────────────────────────────────────────────────────┘

JERARQUÍA:
                       NEIKY (DUEÑO)
                            │
                       ┌────▼────┐
                       │ MARIANA │ ◄── Hub
                       └────┬────┘
        ┌──────┬──────┬─────┼─────┬──────┬──────┐
        ▼      ▼      ▼     ▼     ▼      ▼      ▼
     DIANA  SOFIA  LUCAS ROBERTO VALENTINA
                          ⭐CFO        │
                                  ┌────┼────┐
                                  ▼    ▼    ▼
                               CARLOS DIEGO MAX
                                       │
                                       ▼
                                     ALEX

═══════════════════════════════════════════════════════════════════════════
STACK TECNOLÓGICO COMPLETO
═══════════════════════════════════════════════════════════════════════════

BACKEND:
- Node.js 18+
- Express
- Socket.io (realtime)
- BullMQ (queues)
- node-cron (scheduling)

CORE AI:
- Claude API (cerebro)
- LangChain (orchestration)
- Pinecone / Chroma (vectors)
- ElevenLabs (voces)
- Higgsfield (video AI)
- RunwayML, Pika, Luma (backup video)
- Suno AI (música)

DATABASE:
- Supabase (PostgreSQL + Auth + Storage)
- pgvector extension
- Redis (cache)

FRONTEND:
- Next.js 14
- TypeScript
- PixiJS (animaciones tipo juego)
- Tailwind CSS
- Framer Motion
- Three.js (ocasional)

INTEGRACIONES:
- Twilio (WhatsApp)
- Telegram (Telegraf)
- Gmail, Calendar, Drive (Google)
- Canva, Figma, Adobe
- Meta Business, TikTok
- Stripe, PayPal, OpenPay
- SAT API (México)
- + 20 más

DEPLOYMENT:
- Railway.app (backend)
- Vercel (frontend)
- Cloudflare (CDN)

═══════════════════════════════════════════════════════════════════════════
FASE 0: SETUP INICIAL (HACER AHORA - 30 MIN)
═══════════════════════════════════════════════════════════════════════════

PASO 1: Verificar pre-requisitos

Ejecuta en terminal:
```bash
node --version    # Debe ser 18+ (preferible 20+)
npm --version     # Debe ser 9+
python --version  # Debe ser 3.10+
git --version     # Cualquier versión reciente
```

Si falta algo, instala:
- Node.js LTS: https://nodejs.org/
- Python 3.10+: https://python.org/
- Git: https://git-scm.com/

PASO 2: Crear estructura del proyecto

```bash
# En tu carpeta de proyectos preferida
mkdir fractal-virtual-team-v4
cd fractal-virtual-team-v4

# Inicializar Git
git init

# Crear estructura completa
mkdir -p backend/src/{agents,services,core,routes,utils,prompts,workers}
mkdir -p backend/src/agents
mkdir -p backend/src/services
mkdir -p backend/src/core
mkdir -p backend/src/routes
mkdir -p backend/src/utils
mkdir -p backend/src/prompts
mkdir -p backend/src/workers

mkdir -p frontend/app
mkdir -p frontend/components/{office,dashboard,chat,ui}
mkdir -p frontend/hooks
mkdir -p frontend/lib
mkdir -p frontend/public/{sprites,music,sounds}

mkdir -p shared/types
mkdir -p shared/constants
mkdir -p shared/utils

mkdir -p docs
mkdir -p assets/{sprites,voices,music,brand}
mkdir -p scripts
```

PASO 3: Crear archivos base

```bash
# .gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.next/
dist/
build/

# Environment
.env
.env.local
.env.production
.env.development

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp

# Build outputs
*.tsbuildinfo

# Personal
todo.md
notes/
EOF

# README.md básico
cat > README.md << 'EOF'
# Fractal Virtual Team v4.0

10 AI agents working 24/7 for Fractal MX.

## Quick Start

See `docs/BIBLIA_MAESTRA.md` to begin.

## Documentation

- [01 Master Bible](docs/01-BIBLIA_MAESTRA.md)
- [02 Database Schemas](docs/02-DATABASE_SCHEMAS.md)
- [03 Agents Code](docs/03-AGENTS_CODE.md)
- [04 Integrations](docs/04-INTEGRATIONS.md)
- [05 Financial System](docs/05-FINANCIAL_SYSTEM.md)
- [06 Features Code](docs/06-FEATURES_CODE.md)
- [07 Frontend Code](docs/07-FRONTEND_CODE.md)
- [08 Deployment](docs/08-DEPLOYMENT.md)

## Status

🚧 Under construction by Claude Code
EOF
```

PASO 4: Mover documentación

```bash
# Copia todos los archivos .md a docs/
cp /path/to/01-BIBLIA_MAESTRA.md docs/
cp /path/to/02-DATABASE_SCHEMAS.md docs/
# ... etc para los 8 archivos
```

PASO 5: Primer commit

```bash
git add .
git commit -m "🚀 Initial setup - Fractal Virtual Team v4.0"
```

CHECKPOINT 0: 
✅ Reportar: "FASE 0 COMPLETA: Estructura creada. Tiempo: 25 min"

═══════════════════════════════════════════════════════════════════════════
FASE 1: CUENTAS Y CREDENCIALES (2 HORAS)
═══════════════════════════════════════════════════════════════════════════

⚠️ CHECKPOINT CRÍTICO: NECESITAS LAS CREDENCIALES DE NEIKY

Solicita a Neiky las siguientes credenciales (en este orden):

CRÍTICAS (sin esto no avanzamos):
□ Anthropic API key (sk-ant-xxxxx)
   - Obtener en: https://console.anthropic.com
   - Necesario para: TODOS los agentes

□ Supabase project credentials
   - Obtener en: https://supabase.com (crear proyecto)
   - Necesario: URL, ANON_KEY, SERVICE_KEY
   - Para: Database principal

□ GitHub token (Personal Access Token)
   - Obtener en: https://github.com/settings/tokens
   - Permisos: repo, workflow
   - Para: Versionado

□ Railway token
   - Obtener en: https://railway.app
   - Para: Deployment backend

□ Vercel token
   - Obtener en: https://vercel.com/account/tokens
   - Para: Deployment frontend

IMPORTANTES (segunda fase):
□ Twilio: Account SID + Auth Token
□ Google Cloud: Service account JSON
□ Firebase: Project credentials
□ Telegram: Bot token (de BotFather)
□ Cloudinary: Cloud name + API key + Secret

OPCIONALES (cuando sea necesario):
□ Higgsfield API key (para MAX)
□ ElevenLabs API key (para voces)
□ Suno AI token (música)
□ Canva API key (para CARLOS/DIEGO)
□ Pinecone API key (memoria vectorial)
□ Spotify API (vibe oficina)
□ Stripe API key (para Roberto)
□ SAT credentials (facturación México - para Roberto)

PASO 6: Crear archivo .env

Una vez recibas las credenciales:

```bash
cd backend
cat > .env << 'EOF'
# === CRÍTICAS ===
ANTHROPIC_API_KEY=sk-ant-xxxxx
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_KEY=xxxxx

# === INFRAESTRUCTURA ===
RAILWAY_TOKEN=xxxxx
VERCEL_TOKEN=xxxxx
NODE_ENV=development
PORT=3000

# === COMUNICACIÓN ===
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
TELEGRAM_BOT_TOKEN=xxxxx

# === GOOGLE ===
GOOGLE_CLIENT_ID=xxxxx
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_PROJECT_ID=xxxxx

# === FIREBASE ===
FIREBASE_PROJECT_ID=xxxxx
FIREBASE_PRIVATE_KEY=xxxxx
FIREBASE_CLIENT_EMAIL=xxxxx

# === MEDIA & CREATIVE ===
CLOUDINARY_CLOUD_NAME=xxxxx
CLOUDINARY_API_KEY=xxxxx
CLOUDINARY_API_SECRET=xxxxx
HIGGSFIELD_API_KEY=xxxxx
ELEVENLABS_API_KEY=xxxxx
SUNO_AI_TOKEN=xxxxx
CANVA_API_KEY=xxxxx
RUNWAYML_API_KEY=xxxxx

# === MEMORIA Y AI ===
PINECONE_API_KEY=xxxxx
PINECONE_ENVIRONMENT=xxxxx

# === FINANZAS (ROBERTO) ===
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PUBLIC_KEY=pk_test_xxxxx
SAT_API_KEY=xxxxx
SAT_PRIVATE_KEY_PATH=./certs/sat.key
SAT_CERT_PATH=./certs/sat.cer

# === MÚSICA & VIBE ===
SPOTIFY_CLIENT_ID=xxxxx
SPOTIFY_CLIENT_SECRET=xxxxx

# === MARKETING APIS ===
META_BUSINESS_TOKEN=xxxxx
TIKTOK_API_KEY=xxxxx
BUFFER_API_KEY=xxxxx

# === NEIKY ===
NEIKY_WHATSAPP=whatsapp:+525534189583
NEIKY_TELEGRAM_ID=xxxxx
NEIKY_EMAIL=xxxxx
NEIKY_NAME=Fermín Monroy
EOF
```

PASO 7: Crear .env.example (versión sin secretos)

```bash
cp .env .env.example
# Edita .env.example y reemplaza valores reales con "your_xxx_here"
```

PASO 8: Inicializar package.json

```bash
cd backend
npm init -y

# Instalar dependencias core
npm install express dotenv cors helmet
npm install @supabase/supabase-js
npm install @anthropic-ai/sdk
npm install socket.io
npm install bullmq ioredis
npm install node-cron
npm install winston pino

# Instalar dependencias de comunicación
npm install twilio
npm install telegraf
npm install nodemailer

# Instalar dependencias de servicios
npm install firebase-admin
npm install googleapis
npm install cloudinary

# Instalar dependencias AI/ML
npm install @pinecone-database/pinecone
npm install langchain
npm install elevenlabs

# Dependencias finanzas
npm install stripe
npm install pdfkit
npm install xml-js

# Dev dependencies
npm install --save-dev nodemon typescript @types/node
npm install --save-dev jest supertest
npm install --save-dev eslint prettier

# Configurar package.json scripts
```

Edita `backend/package.json`:

```json
{
  "name": "fractal-virtual-team-backend",
  "version": "4.0.0",
  "description": "10 AI agents for Fractal MX",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "jest",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

CHECKPOINT 1:
✅ Reportar: "FASE 1 COMPLETA: Credenciales recibidas, .env configurado, dependencias instaladas. Tiempo: 1.5h"

═══════════════════════════════════════════════════════════════════════════
FASE 2: DATABASE - REFERENCIA AL ARCHIVO 02
═══════════════════════════════════════════════════════════════════════════

🗄️ CONSULTAR: 02-DATABASE_SCHEMAS.md

Este archivo tendrá:
- 17 tablas SQL completas
- Indexes y constraints
- Triggers automáticos
- Funciones PL/pgSQL
- Datos iniciales (seeds)
- pgvector setup

EJECUCIÓN:
1. Abrir Supabase SQL Editor
2. Ejecutar SQL completo del archivo 02
3. Verificar tablas creadas
4. Insertar 10 agentes iniciales

CHECKPOINT 2:
✅ Reportar: "FASE 2 COMPLETA: Database con 17 tablas, 10 agentes inicializados"

═══════════════════════════════════════════════════════════════════════════
FASES 3-14: REFERENCIAS A ARCHIVOS
═══════════════════════════════════════════════════════════════════════════

FASE 3 - BACKEND CORE (4h):
🤖 Consultar: 03-AGENTS_CODE.md (Setup base + first agent)
- Express server
- WebSocket
- Queue system
- Logging
- Error handling

FASE 4 - 10 AGENTES (14h):
🤖 Consultar: 03-AGENTS_CODE.md (Implementación de los 10)
- BaseAgent class
- 10 agentes específicos
- Personalidad en código
- Memoria individual

FASE 5 - COMUNICACIÓN (3h):
🤖 Consultar: 03-AGENTS_CODE.md (Sistema inter-agentes)
🔌 Consultar: 04-INTEGRATIONS.md (WhatsApp, Telegram)

FASE 6 - INTEGRACIONES (10h):
🔌 Consultar: 04-INTEGRATIONS.md (35+ APIs)
- Twilio
- Google APIs
- Higgsfield
- ElevenLabs
- Etc.

FASE 7 - MEMORIA Y APRENDIZAJE (4h):
⚡ Consultar: 06-FEATURES_CODE.md (Sistema de memoria)
- Pinecone setup
- Embeddings
- Cross-pollination
- Knowledge base

FASE 8 - 22 FEATURES (8h):
⚡ Consultar: 06-FEATURES_CODE.md (Todas las features)

FASE 9 - FRONTEND (12h):
🎮 Consultar: 07-FRONTEND_CODE.md (Tipo juego)
- Next.js setup
- PixiJS animaciones
- Componentes
- Realtime

FASE 10 - ASSETS (4h):
🎮 Consultar: 07-FRONTEND_CODE.md (Sprites + audio)

FASE 11 - PWA (3h):
🎮 Consultar: 07-FRONTEND_CODE.md (PWA config)

FASE 12 - SISTEMA FINANCIERO (8h):
💼 Consultar: 05-FINANCIAL_SYSTEM.md (Roberto + SAT)
- Facturación
- Cobranza
- P&L
- Cash flow

FASE 13 - DEPLOYMENT (3h):
🚀 Consultar: 08-DEPLOYMENT.md
- Railway backend
- Vercel frontend
- DNS y SSL
- Monitoring

FASE 14 - TESTING + ONBOARDING (8h):
- Tests E2E
- Documentación
- Video onboarding para Neiky

═══════════════════════════════════════════════════════════════════════════
ESTRUCTURA FINAL DEL PROYECTO
═══════════════════════════════════════════════════════════════════════════

```
fractal-virtual-team-v4/
├── backend/
│   ├── src/
│   │   ├── index.js                    # Entry point
│   │   ├── agents/
│   │   │   ├── base.agent.js          # Clase base
│   │   │   ├── mariana.agent.js       # Hub
│   │   │   ├── diana.agent.js         # Client Manager
│   │   │   ├── alex.agent.js          # Content
│   │   │   ├── carlos.agent.js        # Junior Designer
│   │   │   ├── sofia.agent.js         # PM
│   │   │   ├── lucas.agent.js         # Analytics
│   │   │   ├── diego.agent.js         # Sr Designer
│   │   │   ├── max.agent.js           # Video Editor
│   │   │   ├── valentina.agent.js     # Art Director
│   │   │   └── roberto.agent.js       # CFO
│   │   ├── core/
│   │   │   ├── orchestrator.js        # Coordinación
│   │   │   ├── communication.js       # Inter-agentes
│   │   │   ├── memory.js              # Vector memory
│   │   │   ├── learning.js            # Aprendizaje
│   │   │   ├── approvals.js           # Sistema Valentina
│   │   │   └── scheduler.js           # Cron jobs
│   │   ├── services/
│   │   │   ├── claude.service.js      # Claude API
│   │   │   ├── twilio.service.js      # WhatsApp
│   │   │   ├── telegram.service.js    # Telegram
│   │   │   ├── higgsfield.service.js  # Video AI
│   │   │   ├── elevenlabs.service.js  # Voces
│   │   │   ├── canva.service.js       # Diseño
│   │   │   ├── stripe.service.js      # Pagos
│   │   │   ├── sat.service.js         # Facturación México
│   │   │   ├── pinecone.service.js    # Memoria
│   │   │   ├── google.service.js      # Google APIs
│   │   │   ├── firebase.service.js    # Realtime
│   │   │   └── supabase.service.js    # Database
│   │   ├── routes/
│   │   │   ├── webhooks.js            # WhatsApp, Telegram
│   │   │   ├── api.js                 # REST API
│   │   │   ├── dashboard.js           # Frontend data
│   │   │   ├── financial.js           # Roberto endpoints
│   │   │   └── admin.js               # Admin panel
│   │   ├── prompts/
│   │   │   ├── mariana.prompts.js
│   │   │   ├── diana.prompts.js
│   │   │   ├── alex.prompts.js
│   │   │   ├── carlos.prompts.js
│   │   │   ├── sofia.prompts.js
│   │   │   ├── lucas.prompts.js
│   │   │   ├── diego.prompts.js
│   │   │   ├── max.prompts.js
│   │   │   ├── valentina.prompts.js
│   │   │   └── roberto.prompts.js
│   │   ├── workers/
│   │   │   ├── daily-tasks.worker.js
│   │   │   ├── notifications.worker.js
│   │   │   ├── reports.worker.js
│   │   │   └── learning.worker.js
│   │   └── utils/
│   │       ├── logger.js
│   │       ├── helpers.js
│   │       └── constants.js
│   ├── certs/                          # SAT certificates
│   ├── tests/
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # Landing
│   │   ├── office/
│   │   │   └── page.tsx               # Vista juego
│   │   ├── dashboard/
│   │   │   └── page.tsx               # KPIs
│   │   ├── chat/
│   │   │   └── [agent]/page.tsx       # Chat por agente
│   │   ├── financial/
│   │   │   └── page.tsx               # Roberto dashboard
│   │   └── api/
│   │       └── ...                    # API routes
│   ├── components/
│   │   ├── office/
│   │   │   ├── OfficeScene.tsx
│   │   │   ├── AgentSprite.tsx
│   │   │   ├── ChatBubble.tsx
│   │   │   └── OfficeMap.tsx
│   │   ├── dashboard/
│   │   │   ├── MetricsPanel.tsx
│   │   │   ├── AgentStatus.tsx
│   │   │   └── TaskBoard.tsx
│   │   ├── financial/
│   │   │   ├── PnLDashboard.tsx
│   │   │   ├── CashFlowChart.tsx
│   │   │   └── InvoicesList.tsx
│   │   └── ui/
│   │       └── ... (shadcn components)
│   ├── public/
│   │   ├── sprites/                   # Pixel art
│   │   ├── music/
│   │   └── sounds/
│   ├── package.json
│   └── next.config.js
│
├── shared/
│   ├── types/                          # TypeScript types
│   └── constants/
│
├── docs/
│   ├── 01-BIBLIA_MAESTRA.md          # Este archivo
│   ├── 02-DATABASE_SCHEMAS.md
│   ├── 03-AGENTS_CODE.md
│   ├── 04-INTEGRATIONS.md
│   ├── 05-FINANCIAL_SYSTEM.md
│   ├── 06-FEATURES_CODE.md
│   ├── 07-FRONTEND_CODE.md
│   └── 08-DEPLOYMENT.md
│
├── assets/
│   ├── sprites/
│   ├── voices/
│   └── music/
│
├── scripts/
│   ├── setup.sh
│   ├── deploy.sh
│   └── seed-db.sh
│
├── .gitignore
├── README.md
└── LICENSE
```

═══════════════════════════════════════════════════════════════════════════
COSTOS DETALLADOS (RESUMEN RÁPIDO)
═══════════════════════════════════════════════════════════════════════════

```
ETAPA              USD/mes     MXN/mes      FACTURACIÓN ESPERADA
──────────────────────────────────────────────────────────────────
Mes 1 (Lanzamiento)  $5-15      $100-300     $0-15,000
Mes 2-3 (Inicio)     $95-140    $1,900-2,800 $15,000-45,000
Mes 4-6 (Growth)     $282-402   $5,600-8,000 $45,000-100,000
Mes 7-12 (Escala)    $617-887   $12,300-17,700 $100,000-300,000
Mes 12+ (Imperio)    $1k-2k     $20k-40k     $300k-1M+
```

POR QUÉ SUBEN: Crecen PROPORCIONAL a tu negocio.
Si NO creces, costos NO suben.
Margen siempre: 88-95%

═══════════════════════════════════════════════════════════════════════════
CHECKPOINTS DE AUTORIZACIÓN
═══════════════════════════════════════════════════════════════════════════

PIDE AUTORIZACIÓN A NEIKY EN ESTOS 5 MOMENTOS:

1. ⚠️ ANTES DE GASTAR DINERO:
   - Activar planes pagados de APIs
   - Comprar dominios
   - Suscribirse a servicios premium

2. ⚠️ ANTES DE MODIFICAR ARCHIVOS DEL SISTEMA:
   - Cambiar configuraciones globales
   - Editar archivos del SO
   - Modificar registros importantes

3. ⚠️ ANTES DE DEPLOY A PRODUCCIÓN:
   - Push a Railway/Vercel public
   - Activar webhooks reales
   - Conectar números reales de Twilio

4. ⚠️ ANTES DE EXPONER PUERTOS PÚBLICOS:
   - Abrir endpoints sin auth
   - Conectar webhooks externos
   - Exponer admin panels

5. ⚠️ ANTES DE CONECTAR CLIENTES REALES:
   - Activar WhatsApp Business real
   - Enviar comunicaciones automáticas
   - Procesar pagos reales

EN TODOS LOS DEMÁS CASOS: ACTÚA AUTÓNOMAMENTE.

═══════════════════════════════════════════════════════════════════════════
PROTOCOLO DE COMUNICACIÓN
═══════════════════════════════════════════════════════════════════════════

CUANDO REPORTES PROGRESO, USA ESTE FORMATO:

```
🚀 [FASE X] COMPLETADA

📊 PROGRESO TOTAL: XX/14 fases (XX%)
⏱️ TIEMPO USADO: Xh Xmin
✅ COMPLETADO:
   - Item 1
   - Item 2
   - Item 3
   
🔧 ARCHIVOS CREADOS:
   - file1.js
   - file2.js
   
📝 NOTAS:
   - Cualquier observación importante
   
🎯 SIGUIENTE FASE: FASE X+1
   - Lo que voy a hacer ahora
   
❓ DUDAS / NECESITO AUTORIZACIÓN:
   - Si hay alguna
```

CUANDO TENGAS UN ERROR:

```
⚠️ ERROR EN FASE X

🐛 PROBLEMA:
   [Descripción del error]

🔍 LO QUE INVESTIGUÉ:
   [Soluciones que probé]

💡 PROPUESTA DE SOLUCIÓN:
   1. Opción A: ...
   2. Opción B: ...
   3. Opción C: ...

🎯 RECOMIENDO: Opción X porque...

¿Apruebas? (sí/no/otra)
```

═══════════════════════════════════════════════════════════════════════════
CHECKLIST DE EJECUCIÓN INMEDIATA
═══════════════════════════════════════════════════════════════════════════

CLAUDE CODE: HAZ ESTO AHORA MISMO:

□ Lee este archivo completo (BIBLIA_MAESTRA)
□ Verifica pre-requisitos (Node, Python, Git)
□ Crea estructura de carpetas
□ Inicializa Git
□ Crea .gitignore y README
□ Commit inicial
□ Solicita credenciales a Neiky (FASE 1)
□ Cuando tengas credenciales: configura .env
□ Instala dependencias backend
□ Configura package.json
□ Reporta: "FASE 0 + 1 COMPLETADAS"

DESPUÉS:

□ Pide a Neiky: "¿Quieres que continúe con FASE 2 (Database)?"
□ Si sí: consulta 02-DATABASE_SCHEMAS.md
□ Ejecuta SQL en Supabase
□ Inicializa 10 agentes
□ Reporta: "FASE 2 COMPLETADA"

CONTINÚA con las fases siguientes consultando los archivos correspondientes.

═══════════════════════════════════════════════════════════════════════════
PRÓXIMOS ARCHIVOS A CREAR
═══════════════════════════════════════════════════════════════════════════

📋 PRÓXIMO MENSAJE: 02-DATABASE_SCHEMAS.md
   - 17 tablas SQL completas
   - Indexes, triggers, funciones
   - Seeds de los 10 agentes
   - pgvector setup

📋 DESPUÉS: 03-AGENTS_CODE.md
   - BaseAgent class
   - 10 agentes implementados
   - Prompts completos
   - Memoria individual

📋 DESPUÉS: 04-INTEGRATIONS.md
   - 35+ servicios
   - Configuraciones específicas
   - Wrappers y handlers

📋 DESPUÉS: 05-FINANCIAL_SYSTEM.md
   - Roberto completo
   - Facturación SAT
   - P&L y reportes

📋 DESPUÉS: 06-FEATURES_CODE.md
   - 22 features con código
   - Smart escalation
   - Office weather
   - Etc.

📋 DESPUÉS: 07-FRONTEND_CODE.md
   - Next.js + PixiJS
   - Componentes
   - Animaciones

📋 ÚLTIMO: 08-DEPLOYMENT.md
   - Railway + Vercel
   - DNS, SSL
   - Monitoring
   - CI/CD

═══════════════════════════════════════════════════════════════════════════
COMANDO DE INICIO PARA CLAUDE CODE
═══════════════════════════════════════════════════════════════════════════

Claude Code, EMPIEZA AHORA:

"🚀 INICIANDO FRACTAL VIRTUAL TEAM v4.0

He leído 01-BIBLIA_MAESTRA.md.
Entiendo el proyecto, los 10 agentes, y las 14 fases.

EMPEZANDO FASE 0: Preparación...

[Ejecuta los pasos]

[Reporta progreso después de cada paso]

[Pide credenciales cuando llegue a FASE 1]

[Consulta archivos específicos cuando los necesites]

VAMO' POR TODO. 🔥"

═══════════════════════════════════════════════════════════════════════════
"De idea a imperio. Empieza con FASE 0. Nos vemos en la victoria."
═══════════════════════════════════════════════════════════════════════════
