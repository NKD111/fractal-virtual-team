# Claude Eye — Fase 1 MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el MVP funcional de Claude Eye — una app desktop Electron en Windows 11 con widget flotante always-on-top, drag-to-window para capturar ventanas específicas, hotkey global, integración con Claude API (vision), modo GUÍA con respuestas en lenguaje simple, privacy blocklist y overlay de pre-clic. La app es instalable vía `.exe` y ejecutable como herramienta de uso personal.

**Architecture:** Electron con dos procesos: Main (gestión de ventanas, hotkeys, captura nativa, IPC) y Renderer (UI del widget en HTML/CSS/JS vanilla). El proceso principal expone APIs via `contextBridge` al renderer. La captura usa `desktopCapturer` y `screen.getCursorScreenPoint()` para drag-to-window. Imágenes se comprimen con `sharp` antes de ir a `@anthropic-ai/sdk`. Persistencia local con `electron-store`.

**Tech Stack:** Electron 28+, @anthropic-ai/sdk, sharp, electron-store, electron-builder, vanilla JS/HTML/CSS (sin framework para mantener el bundle ligero)

**Project location:** `C:\Users\naked\Downloads\claude-eye\` (carpeta nueva, fuera del repo Mariana)

---

## Estructura de archivos a crear

```
claude-eye/
├── package.json                       ← Dependencies, scripts, electron-builder config
├── electron-builder.json              ← Config del instalador NSIS
├── .gitignore                         ← node_modules, dist, .env
├── .env.example                       ← ANTHROPIC_API_KEY placeholder
├── main.js                            ← Proceso principal Electron
├── preload.js                         ← Bridge contextBridge IPC
├── src/
│   ├── renderer/
│   │   ├── index.html                 ← UI del widget
│   │   ├── app.js                     ← Lógica de UI
│   │   └── style.css                  ← Dark glassmorphism
│   ├── overlay/
│   │   ├── overlay.html               ← Ventana transparente para círculo pre-clic
│   │   └── overlay.js                 ← Animación del círculo
│   ├── capture.js                     ← desktopCapturer + drag-to-window logic
│   ├── compress.js                    ← Resize de imágenes con sharp
│   ├── claude-api.js                  ← Llamadas a Anthropic API con visión
│   ├── privacy.js                     ← Lista negra de apps
│   ├── settings.js                    ← Wrapper de electron-store
│   └── tray.js                        ← System tray icon + menú
├── assets/
│   ├── icon.ico                       ← Ícono de escritorio/tray (256x256)
│   └── icon.png                       ← Versión PNG para builds
└── tests/
    ├── compress.test.js               ← Tests de redimensionado
    └── privacy.test.js                ← Tests de blocklist matching
```

---

## Task 1: Inicialización del proyecto

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\package.json`
- Create: `C:\Users\naked\Downloads\claude-eye\.gitignore`
- Create: `C:\Users\naked\Downloads\claude-eye\.env.example`

- [ ] **Step 1: Crear directorio del proyecto e iniciar git**

```bash
mkdir -p /c/Users/naked/Downloads/claude-eye
cd /c/Users/naked/Downloads/claude-eye
git init
```

- [ ] **Step 2: Crear package.json**

Escribir en `C:\Users\naked\Downloads\claude-eye\package.json`:

```json
{
  "name": "claude-eye",
  "version": "0.1.0",
  "description": "Floating desktop widget that gives Claude Code vision and direct UI assistance",
  "main": "main.js",
  "author": "Fractal MX",
  "license": "MIT",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "test": "jest",
    "build:win": "electron-builder --win",
    "postinstall": "electron-builder install-app-deps"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.91.1",
    "dotenv": "^16.3.1",
    "electron-store": "^8.2.0",
    "sharp": "^0.34.5"
  },
  "devDependencies": {
    "electron": "^28.3.0",
    "electron-builder": "^24.13.3",
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 3: Crear .gitignore**

Escribir en `C:\Users\naked\Downloads\claude-eye\.gitignore`:

```
node_modules/
dist/
.env
*.log
.DS_Store
Thumbs.db
```

- [ ] **Step 4: Crear .env.example**

Escribir en `C:\Users\naked\Downloads\claude-eye\.env.example`:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

- [ ] **Step 5: Instalar dependencias**

```bash
cd /c/Users/naked/Downloads/claude-eye
npm install
```

Expected: Sin errores. Sharp puede tomar 1-2 min por descarga de binarios prebuilt para Windows.

- [ ] **Step 6: Commit inicial**

```bash
git add .
git commit -m "chore: scaffolding inicial del proyecto Claude Eye"
```

---

## Task 2: Compresión de imágenes (lógica pura — TDD)

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\src\compress.js`
- Test: `C:\Users\naked\Downloads\claude-eye\tests\compress.test.js`
- Modify: `C:\Users\naked\Downloads\claude-eye\package.json` (jest config)

- [ ] **Step 1: Agregar config de Jest a package.json**

Editar `package.json`, agregar después de `"devDependencies"`:

```json
  "jest": {
    "testEnvironment": "node",
    "testPathIgnorePatterns": ["/node_modules/", "/dist/"]
  }
```

- [ ] **Step 2: Escribir el test fallido**

Crear `tests/compress.test.js`:

```javascript
const sharp = require('sharp');
const { compressImage } = require('../src/compress');

describe('compressImage', () => {
  it('should resize images wider than 1280px to max 1280px width', async () => {
    const input = await sharp({
      create: { width: 2560, height: 1440, channels: 3, background: '#888' }
    }).jpeg().toBuffer();

    const compressed = await compressImage(input);
    const meta = await sharp(compressed).metadata();

    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(720);
  });

  it('should preserve images smaller than 1280px width', async () => {
    const input = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#888' }
    }).jpeg().toBuffer();

    const compressed = await compressImage(input);
    const meta = await sharp(compressed).metadata();

    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  it('should output JPEG format', async () => {
    const input = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: '#fff' }
    }).png().toBuffer();

    const compressed = await compressImage(input);
    const meta = await sharp(compressed).metadata();

    expect(meta.format).toBe('jpeg');
  });
});
```

- [ ] **Step 3: Correr test para confirmar que falla**

```bash
cd /c/Users/naked/Downloads/claude-eye
npm test
```

Expected: FAIL — "Cannot find module '../src/compress'"

- [ ] **Step 4: Implementar compress.js**

Crear `src/compress.js`:

```javascript
const sharp = require('sharp');

const MAX_WIDTH = 1280;

async function compressImage(buffer) {
  const meta = await sharp(buffer).metadata();
  const pipeline = sharp(buffer);

  if (meta.width > MAX_WIDTH) {
    pipeline.resize({ width: MAX_WIDTH });
  }

  return pipeline.jpeg({ quality: 85 }).toBuffer();
}

module.exports = { compressImage, MAX_WIDTH };
```

- [ ] **Step 5: Correr test para confirmar que pasa**

```bash
npm test
```

Expected: PASS — los 3 tests verdes.

- [ ] **Step 6: Commit**

```bash
git add src/compress.js tests/compress.test.js package.json
git commit -m "feat: compresión de imágenes con resize a 1280px max"
```

---

## Task 3: Privacy blocklist (lógica pura — TDD)

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\src\privacy.js`
- Test: `C:\Users\naked\Downloads\claude-eye\tests\privacy.test.js`

- [ ] **Step 1: Escribir el test fallido**

Crear `tests/privacy.test.js`:

```javascript
const { isBlocked, DEFAULT_BLOCKLIST } = require('../src/privacy');

describe('isBlocked', () => {
  it('returns false for an empty blocklist', () => {
    expect(isBlocked('Chrome - github.com', [])).toBe(false);
  });

  it('matches case-insensitive substring', () => {
    expect(isBlocked('1Password Desktop', ['1password'])).toBe(true);
    expect(isBlocked('My Bank Login', ['bank'])).toBe(true);
  });

  it('returns false when no pattern matches', () => {
    expect(isBlocked('VS Code', ['1password', 'bank'])).toBe(false);
  });

  it('exposes a sensible default blocklist', () => {
    expect(DEFAULT_BLOCKLIST).toEqual(
      expect.arrayContaining(['1password', 'keepass', 'bitwarden'])
    );
  });
});
```

- [ ] **Step 2: Correr test para confirmar que falla**

```bash
npm test -- privacy
```

Expected: FAIL — "Cannot find module '../src/privacy'"

- [ ] **Step 3: Implementar privacy.js**

Crear `src/privacy.js`:

```javascript
const DEFAULT_BLOCKLIST = [
  '1password',
  'keepass',
  'bitwarden',
  'lastpass',
  'banking',
  'wallet'
];

function isBlocked(windowName, patterns = DEFAULT_BLOCKLIST) {
  if (!windowName || patterns.length === 0) return false;
  const lower = windowName.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

module.exports = { isBlocked, DEFAULT_BLOCKLIST };
```

- [ ] **Step 4: Correr test**

```bash
npm test -- privacy
```

Expected: PASS — 4 tests verdes.

- [ ] **Step 5: Commit**

```bash
git add src/privacy.js tests/privacy.test.js
git commit -m "feat: privacy blocklist con matching case-insensitive"
```

---

## Task 4: Settings persistente

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\src\settings.js`

- [ ] **Step 1: Implementar wrapper de electron-store**

Crear `src/settings.js`:

```javascript
const Store = require('electron-store');
const { DEFAULT_BLOCKLIST } = require('./privacy');

const schema = {
  apiKey: { type: 'string', default: '' },
  mode: { type: 'string', enum: ['guide', 'auto', 'direct'], default: 'guide' },
  blocklist: { type: 'array', items: { type: 'string' }, default: DEFAULT_BLOCKLIST },
  windowPosition: {
    type: 'object',
    properties: { x: { type: 'number' }, y: { type: 'number' } },
    default: { x: 100, y: 100 }
  },
  hotkey: { type: 'string', default: 'Control+Shift+V' },
  firstRun: { type: 'boolean', default: true }
};

const store = new Store({ schema, name: 'claude-eye-settings' });

module.exports = {
  get: (key) => store.get(key),
  set: (key, value) => store.set(key, value),
  has: (key) => store.has(key),
  getAll: () => store.store,
  store
};
```

- [ ] **Step 2: Smoke test rápido**

Crear `tests/settings.smoke.test.js`:

```javascript
jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => {
    const data = {};
    return {
      get: (k) => data[k],
      set: (k, v) => { data[k] = v; },
      has: (k) => k in data,
      get store() { return data; }
    };
  });
});

const settings = require('../src/settings');

test('set + get persiste el valor', () => {
  settings.set('mode', 'auto');
  expect(settings.get('mode')).toBe('auto');
});
```

- [ ] **Step 3: Correr test**

```bash
npm test -- settings
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/settings.js tests/settings.smoke.test.js
git commit -m "feat: settings persistente con electron-store"
```

---

## Task 5: Cliente Claude API con visión

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\src\claude-api.js`

- [ ] **Step 1: Implementar cliente**

Crear `src/claude-api.js`:

```javascript
require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const settings = require('./settings');

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT_GUIDE = `Eres Claude Eye, un asistente visual de escritorio que ayuda al usuario a completar tareas en interfaces de software.
Cuando el usuario te muestra una pantalla, tu trabajo es:
1. Identificar exactamente qué aplicación o página está viendo
2. Entender el contexto de su tarea
3. Darle instrucciones claras y simples en lenguaje no técnico
4. Indicar visualmente dónde hacer clic, qué escribir, qué buscar

Responde siempre en español, en máximo 4 líneas, con tono amable y directo. Cuando indiques un elemento de la UI usa comillas y descríbelo por su texto visible o ubicación (ej: "el botón azul 'Deploy' arriba a la derecha").`;

function getApiKey() {
  return process.env.ANTHROPIC_API_KEY || settings.get('apiKey');
}

function makeClient() {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY no configurada. Agrégala en .env o en Settings.');
  }
  return new Anthropic({ apiKey });
}

async function analyzeScreenshot({ imageBase64, userMessage, history = [] }) {
  const client = makeClient();

  const messages = [
    ...history,
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 }
        },
        { type: 'text', text: userMessage || '¿Qué ves y qué debería hacer?' }
      ]
    }
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT_GUIDE,
    messages
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return {
    text: textBlock ? textBlock.text : '',
    usage: response.usage,
    raw: response
  };
}

module.exports = { analyzeScreenshot, getApiKey, MODEL };
```

- [ ] **Step 2: Commit**

```bash
git add src/claude-api.js
git commit -m "feat: cliente Claude API con visión y system prompt en español"
```

---

## Task 6: Captura de pantalla y drag-to-window

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\src\capture.js`

- [ ] **Step 1: Implementar capture.js**

Crear `src/capture.js`:

```javascript
const { desktopCapturer, screen } = require('electron');
const { compressImage } = require('./compress');
const { isBlocked } = require('./privacy');
const settings = require('./settings');

async function listWindows() {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: false
  });
  return sources;
}

async function findWindowAtCursor() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);

  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1, height: 1 }
  });

  const named = sources.find((s) => s.name && s.name.length > 0);
  return {
    source: named || null,
    cursor,
    display
  };
}

async function captureSourceById(sourceId) {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  });

  const target = sources.find((s) => s.id === sourceId);
  if (!target) throw new Error(`Ventana no encontrada: ${sourceId}`);

  const blocklist = settings.get('blocklist');
  if (isBlocked(target.name, blocklist)) {
    throw new Error(`Ventana bloqueada por privacy blocklist: ${target.name}`);
  }

  const pngBuffer = target.thumbnail.toPNG();
  const compressed = await compressImage(pngBuffer);

  return {
    name: target.name,
    sourceId: target.id,
    imageBase64: compressed.toString('base64'),
    sizeBytes: compressed.length
  };
}

async function captureActiveScreen() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  });
  if (sources.length === 0) throw new Error('No screens available');

  const primary = sources[0];
  const pngBuffer = primary.thumbnail.toPNG();
  const compressed = await compressImage(pngBuffer);

  return {
    name: primary.name,
    sourceId: primary.id,
    imageBase64: compressed.toString('base64'),
    sizeBytes: compressed.length
  };
}

module.exports = {
  listWindows,
  findWindowAtCursor,
  captureSourceById,
  captureActiveScreen
};
```

- [ ] **Step 2: Commit**

```bash
git add src/capture.js
git commit -m "feat: captura via desktopCapturer con compresión y privacy check"
```

---

## Task 7: Tray icon

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\src\tray.js`
- Create: `C:\Users\naked\Downloads\claude-eye\assets\icon.png` (placeholder)

- [ ] **Step 1: Crear ícono placeholder**

Para Phase 1 podemos usar un ícono PNG simple. Crear con sharp en un script una sola vez:

```bash
cd /c/Users/naked/Downloads/claude-eye
mkdir -p assets
node -e "const sharp = require('sharp'); sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 99, g: 102, b: 241, alpha: 1 } } }).png().toFile('assets/icon.png').then(() => console.log('icon created'));"
```

Expected: archivo `assets/icon.png` creado (azul indigo sólido — placeholder).

Para Windows necesitamos también `.ico`. Crear conversión:

```bash
node -e "const sharp = require('sharp'); sharp('assets/icon.png').resize(256,256).toFile('assets/icon.ico').then(() => console.log('ico created')).catch(e => console.log('sharp no genera .ico nativo, usaremos .png:', e.message));"
```

Si falla (sharp no genera .ico), copiar el png como fallback temporal:

```bash
cp assets/icon.png assets/icon.ico
```

- [ ] **Step 2: Implementar tray.js**

Crear `src/tray.js`:

```javascript
const { Tray, Menu, app } = require('electron');
const path = require('path');

let trayInstance = null;

function createTray({ onShow, onHide, onQuit }) {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  trayInstance = new Tray(iconPath);
  trayInstance.setToolTip('Claude Eye');

  const menu = Menu.buildFromTemplate([
    { label: 'Mostrar widget', click: () => onShow && onShow() },
    { label: 'Ocultar widget', click: () => onHide && onHide() },
    { type: 'separator' },
    { label: 'Salir', click: () => { onQuit && onQuit(); app.quit(); } }
  ]);

  trayInstance.setContextMenu(menu);
  trayInstance.on('click', () => onShow && onShow());

  return trayInstance;
}

function destroyTray() {
  if (trayInstance) {
    trayInstance.destroy();
    trayInstance = null;
  }
}

module.exports = { createTray, destroyTray };
```

- [ ] **Step 3: Commit**

```bash
git add src/tray.js assets/icon.png assets/icon.ico
git commit -m "feat: tray icon con menú show/hide/quit + ícono placeholder"
```

---

## Task 8: Main process (Electron entry point)

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\main.js`
- Create: `C:\Users\naked\Downloads\claude-eye\preload.js`

- [ ] **Step 1: Implementar preload.js**

Crear `preload.js`:

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeEye', {
  // Captura
  captureAtCursor: () => ipcRenderer.invoke('capture:at-cursor'),
  captureActive: () => ipcRenderer.invoke('capture:active'),
  listWindows: () => ipcRenderer.invoke('capture:list-windows'),
  captureWindow: (id) => ipcRenderer.invoke('capture:window', id),

  // Claude API
  analyze: (payload) => ipcRenderer.invoke('claude:analyze', payload),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),

  // Window control
  hideWidget: () => ipcRenderer.send('widget:hide'),
  showWidget: () => ipcRenderer.send('widget:show'),
  showOverlayCircle: (x, y) => ipcRenderer.send('overlay:circle', { x, y }),

  // Eventos del main hacia el renderer
  onHotkey: (callback) => ipcRenderer.on('hotkey:capture', callback),
  onModeChange: (callback) => ipcRenderer.on('mode:changed', callback)
});
```

- [ ] **Step 2: Implementar main.js**

Crear `main.js`:

```javascript
require('dotenv').config();

const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');

const settings = require('./src/settings');
const capture = require('./src/capture');
const claudeApi = require('./src/claude-api');
const { createTray, destroyTray } = require('./src/tray');

let widgetWindow = null;
let overlayWindow = null;

const WIDGET_WIDTH = 340;
const WIDGET_HEIGHT = 460;

function createWidgetWindow() {
  const pos = settings.get('windowPosition');
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;

  const x = pos.x ?? (workArea.x + workArea.width - WIDGET_WIDTH - 24);
  const y = pos.y ?? (workArea.y + 60);

  widgetWindow = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  widgetWindow.setAlwaysOnTop(true, 'floating');
  widgetWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  widgetWindow.once('ready-to-show', () => widgetWindow.show());

  widgetWindow.on('moved', () => {
    const [nx, ny] = widgetWindow.getPosition();
    settings.set('windowPosition', { x: nx, y: ny });
  });

  widgetWindow.on('closed', () => { widgetWindow = null; });

  if (process.argv.includes('--dev')) {
    widgetWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  overlayWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'src', 'overlay', 'overlay.html'));
}

function showWidget() {
  if (widgetWindow) {
    widgetWindow.show();
    widgetWindow.focus();
  }
}

function hideWidget() {
  if (widgetWindow) widgetWindow.hide();
}

function registerIpc() {
  ipcMain.handle('capture:at-cursor', async () => {
    const { source, cursor } = await capture.findWindowAtCursor();
    if (!source) return null;
    const result = await capture.captureSourceById(source.id);
    return { ...result, cursor };
  });

  ipcMain.handle('capture:active', async () => {
    return capture.captureActiveScreen();
  });

  ipcMain.handle('capture:list-windows', async () => {
    const windows = await capture.listWindows();
    return windows.map((w) => ({
      id: w.id,
      name: w.name,
      thumbnail: w.thumbnail.toDataURL()
    }));
  });

  ipcMain.handle('capture:window', async (_evt, id) => {
    return capture.captureSourceById(id);
  });

  ipcMain.handle('claude:analyze', async (_evt, payload) => {
    return claudeApi.analyzeScreenshot(payload);
  });

  ipcMain.handle('settings:get', (_evt, key) => settings.get(key));
  ipcMain.handle('settings:set', (_evt, { key, value }) => {
    settings.set(key, value);
    return true;
  });

  ipcMain.on('widget:hide', () => hideWidget());
  ipcMain.on('widget:show', () => showWidget());

  ipcMain.on('overlay:circle', (_evt, { x, y }) => {
    if (!overlayWindow) return;
    overlayWindow.show();
    overlayWindow.webContents.send('draw-circle', { x, y });
    setTimeout(() => overlayWindow && overlayWindow.hide(), 800);
  });
}

function registerHotkeys() {
  const hotkey = settings.get('hotkey') || 'Control+Shift+V';
  globalShortcut.register(hotkey, () => {
    showWidget();
    if (widgetWindow) widgetWindow.webContents.send('hotkey:capture');
  });
}

app.whenReady().then(() => {
  createWidgetWindow();
  createOverlayWindow();
  createTray({ onShow: showWidget, onHide: hideWidget });
  registerIpc();
  registerHotkeys();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  destroyTray();
});
```

- [ ] **Step 3: Commit**

```bash
git add main.js preload.js
git commit -m "feat: main process con widget, overlay, tray, IPC y hotkey global"
```

---

## Task 9: UI del widget — HTML/CSS

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\src\renderer\index.html`
- Create: `C:\Users\naked\Downloads\claude-eye\src\renderer\style.css`

- [ ] **Step 1: Crear style.css con dark glassmorphism**

Crear `src/renderer/style.css`:

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  color: #c7d2fe;
  background: transparent;
  user-select: none;
  overflow: hidden;
}

#widget {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 25, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(99, 102, 241, 0.4);
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(99, 102, 241, 0.3);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(99, 102, 241, 0.15);
  border-bottom: 1px solid #312e81;
  -webkit-app-region: drag;
  cursor: move;
}

.header .eye-btn {
  -webkit-app-region: no-drag;
  cursor: grab;
  font-size: 16px;
  background: none;
  border: none;
  color: inherit;
}

.header .eye-btn:active { cursor: grabbing; }

.title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #a5b4fc;
}

.status-dot {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  color: #4ade80;
  -webkit-app-region: no-drag;
}

.status-dot .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

.status-dot.busy .dot { background: #f59e0b; box-shadow: 0 0 6px #f59e0b; }
.status-dot.error .dot { background: #ef4444; box-shadow: 0 0 6px #ef4444; }

.close-btn {
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
}
.close-btn:hover { color: #ef4444; }

.tabs {
  display: flex;
  border-bottom: 1px solid #1e1b4b;
  background: #0a0a18;
}

.tab {
  flex: 1;
  padding: 8px 4px;
  text-align: center;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.tab.active {
  opacity: 1;
  background: #312e81;
  border-bottom: 2px solid #6366f1;
}

.tab .name {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #a5b4fc;
}

.tab .desc {
  font-size: 8px;
  color: #6366f1;
  margin-top: 2px;
}

.target-bar {
  padding: 8px 14px;
  background: rgba(15, 15, 30, 0.6);
  border-bottom: 1px solid #1e1b4b;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  color: #94a3b8;
}

.target-bar .thumb {
  width: 36px;
  height: 24px;
  background: #1e293b;
  border-radius: 3px;
  border: 1px solid #334155;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
}

.target-bar .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.chat {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat::-webkit-scrollbar { width: 6px; }
.chat::-webkit-scrollbar-thumb { background: #312e81; border-radius: 3px; }

.msg {
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 11px;
  line-height: 1.55;
  max-width: 95%;
}

.msg.user {
  background: #1e3a8a;
  align-self: flex-end;
  border-radius: 8px 8px 2px 8px;
  color: #dbeafe;
}

.msg.assistant {
  background: #1e1b4b;
  border-left: 2px solid #6366f1;
  border-radius: 8px 8px 8px 2px;
  color: #c7d2fe;
}

.msg.error {
  background: #7f1d1d;
  border-left: 2px solid #ef4444;
  color: #fecaca;
}

.input-bar {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid #1e1b4b;
  background: rgba(15, 15, 30, 0.6);
}

.input-bar input {
  flex: 1;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 8px 10px;
  color: #c7d2fe;
  font-size: 11px;
  outline: none;
}

.input-bar input:focus { border-color: #6366f1; }

.btn {
  background: #6366f1;
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  color: white;
  font-size: 12px;
  transition: background 0.15s;
}
.btn:hover { background: #4f46e5; }
.btn:disabled { background: #334155; cursor: not-allowed; }

.btn-secondary {
  background: transparent;
  border: 1px solid #312e81;
  color: #a5b4fc;
}
.btn-secondary:hover { background: #1e1b4b; }

.footer-hint {
  text-align: center;
  padding: 4px 0 6px;
  font-size: 8px;
  color: #334155;
  background: rgba(0,0,0,0.2);
}

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid #4f46e5;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.context-prompt {
  background: rgba(99, 102, 241, 0.1);
  border: 1px dashed #6366f1;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.context-prompt label {
  font-size: 10px;
  color: #a5b4fc;
  display: block;
  margin-bottom: 6px;
}

.context-prompt input {
  width: 100%;
  background: #0f172a;
  border: 1px solid #312e81;
  border-radius: 4px;
  padding: 6px 8px;
  color: #c7d2fe;
  font-size: 11px;
  outline: none;
}
```

- [ ] **Step 2: Crear index.html**

Crear `src/renderer/index.html`:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self';">
  <title>Claude Eye</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="widget">
    <div class="header">
      <button class="eye-btn" id="eye-btn" title="Arrástrame sobre una ventana">👁</button>
      <span class="title">CLAUDE EYE</span>
      <div class="status-dot" id="status">
        <span class="dot"></span>
        <span class="status-text">listo</span>
      </div>
      <button class="close-btn" id="hide-btn" title="Ocultar (sigue en bandeja)">×</button>
    </div>

    <div class="tabs">
      <div class="tab active" data-mode="guide">
        <div class="name">GUÍA</div>
        <div class="desc">te explico</div>
      </div>
      <div class="tab" data-mode="auto" title="Disponible en Fase 2">
        <div class="name">AUTO</div>
        <div class="desc">próximamente</div>
      </div>
      <div class="tab" data-mode="direct" title="Disponible en Fase 2">
        <div class="name">DIRECTO ⚡</div>
        <div class="desc">próximamente</div>
      </div>
    </div>

    <div class="target-bar" id="target-bar" style="display:none;">
      <div class="thumb" id="target-thumb"></div>
      <div class="name" id="target-name">Sin target</div>
    </div>

    <div class="chat" id="chat">
      <div class="msg assistant">
        Hola — soy Claude Eye 👁<br>
        Arrastra el ojo del header sobre cualquier ventana, o presiona <strong>Ctrl+Shift+V</strong> para que vea lo que estás viendo y te ayude.
      </div>
    </div>

    <div class="input-bar">
      <input type="text" id="input" placeholder="Pregunta o contexto...">
      <button class="btn" id="capture-btn" title="Capturar pantalla activa (Ctrl+Shift+V)">📸</button>
    </div>

    <div class="footer-hint">Ctrl+Shift+V · arrastra 👁 a una ventana · arrastra el header</div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html src/renderer/style.css
git commit -m "feat: UI del widget con dark glassmorphism y layout completo"
```

---

## Task 10: Lógica del renderer (app.js)

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\src\renderer\app.js`

- [ ] **Step 1: Implementar app.js**

Crear `src/renderer/app.js`:

```javascript
const chat = document.getElementById('chat');
const input = document.getElementById('input');
const captureBtn = document.getElementById('capture-btn');
const eyeBtn = document.getElementById('eye-btn');
const hideBtn = document.getElementById('hide-btn');
const status = document.getElementById('status');
const statusText = status.querySelector('.status-text');
const targetBar = document.getElementById('target-bar');
const targetThumb = document.getElementById('target-thumb');
const targetName = document.getElementById('target-name');
const tabs = document.querySelectorAll('.tab');

const state = {
  mode: 'guide',
  target: null,
  history: [],
  busy: false
};

function setStatus(kind, text) {
  status.className = 'status-dot ' + (kind || '');
  statusText.textContent = text;
}

function addMessage(role, content, isHtml = false) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  if (isHtml) div.innerHTML = content;
  else div.textContent = content;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function setTarget(target) {
  if (!target) {
    targetBar.style.display = 'none';
    state.target = null;
    return;
  }
  state.target = target;
  targetBar.style.display = 'flex';
  targetName.textContent = target.name || 'Pantalla activa';
  if (target.thumbnail) {
    targetThumb.style.backgroundImage = `url(${target.thumbnail})`;
  } else {
    targetThumb.style.backgroundImage = 'none';
  }
}

async function performCapture(useCursor = false) {
  if (state.busy) return;
  state.busy = true;
  setStatus('busy', 'capturando...');

  try {
    let capture;
    if (useCursor) {
      capture = await window.claudeEye.captureAtCursor();
      if (!capture) {
        capture = await window.claudeEye.captureActive();
      }
    } else {
      capture = await window.claudeEye.captureActive();
    }

    setTarget({
      name: capture.name,
      sourceId: capture.sourceId,
      thumbnail: `data:image/jpeg;base64,${capture.imageBase64}`
    });

    setStatus('busy', 'analizando...');

    const userText = input.value.trim() || '';
    if (userText) addMessage('user', userText);

    const result = await window.claudeEye.analyze({
      imageBase64: capture.imageBase64,
      userMessage: userText || '¿Qué ves en esta pantalla y qué me sugieres hacer?',
      history: state.history.slice(-6)
    });

    addMessage('assistant', result.text);

    state.history.push(
      {
        role: 'user',
        content: [{ type: 'text', text: userText || '¿Qué ves?' }]
      },
      { role: 'assistant', content: [{ type: 'text', text: result.text }] }
    );

    input.value = '';
    setStatus('', 'listo');
  } catch (err) {
    addMessage('error', '⚠️ ' + err.message);
    setStatus('error', 'error');
  } finally {
    state.busy = false;
  }
}

captureBtn.addEventListener('click', () => performCapture(false));

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    performCapture(false);
  }
});

hideBtn.addEventListener('click', () => window.claudeEye.hideWidget());

// Drag-to-window: cuando el usuario arrastra el ojo y suelta,
// el cursor está sobre la ventana destino. Capturamos al soltar.
let dragging = false;

eyeBtn.addEventListener('mousedown', (e) => {
  dragging = true;
  eyeBtn.style.opacity = '0.5';
  setStatus('busy', 'arrastra a una ventana...');
});

window.addEventListener('mouseup', async () => {
  if (!dragging) return;
  dragging = false;
  eyeBtn.style.opacity = '1';
  await performCapture(true);
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.mode;
    if (mode !== 'guide') {
      addMessage('assistant', `El modo <strong>${mode.toUpperCase()}</strong> estará disponible en Fase 2.`, true);
      return;
    }
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    state.mode = mode;
    window.claudeEye.setSetting('mode', mode);
  });
});

window.claudeEye.onHotkey(() => {
  performCapture(false);
});

window.claudeEye.getSetting('mode').then((m) => {
  if (m && m !== state.mode) state.mode = m;
});

(async function checkApiKey() {
  const stored = await window.claudeEye.getSetting('apiKey');
  if (!stored) {
    addMessage(
      'assistant',
      'Para empezar, configura tu <strong>ANTHROPIC_API_KEY</strong> en el archivo <code>.env</code> de la app o pégalo abajo y presiona Enter:',
      true
    );
    input.placeholder = 'pega tu sk-ant-... y enter';
    const handler = async (e) => {
      if (e.key === 'Enter') {
        const v = input.value.trim();
        if (v.startsWith('sk-ant-')) {
          await window.claudeEye.setSetting('apiKey', v);
          input.value = '';
          input.placeholder = 'Pregunta o contexto...';
          input.removeEventListener('keydown', handler);
          addMessage('assistant', '✅ API key guardada. Ya puedes capturar pantalla.');
        }
      }
    };
    input.addEventListener('keydown', handler);
  }
})();
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat: lógica del renderer con drag-to-window, captura, chat y configuración inicial de API key"
```

---

## Task 11: Overlay de pre-clic

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\src\overlay\overlay.html`
- Create: `C:\Users\naked\Downloads\claude-eye\src\overlay\overlay.js`

- [ ] **Step 1: Crear overlay.html**

Crear `src/overlay/overlay.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; background: transparent; overflow: hidden; pointer-events: none; }
    .ring {
      position: absolute;
      width: 60px;
      height: 60px;
      margin-left: -30px;
      margin-top: -30px;
      border: 3px solid #6366f1;
      border-radius: 50%;
      box-shadow: 0 0 30px rgba(99,102,241,0.8), inset 0 0 20px rgba(99,102,241,0.4);
      animation: pulse 0.6s ease-out;
      pointer-events: none;
    }
    @keyframes pulse {
      0% { transform: scale(0.3); opacity: 0; }
      40% { transform: scale(1.2); opacity: 1; }
      100% { transform: scale(2.4); opacity: 0; }
    }
  </style>
</head>
<body>
  <script src="overlay.js"></script>
</body>
</html>
```

- [ ] **Step 2: Crear overlay.js**

Crear `src/overlay/overlay.js`:

```javascript
const { ipcRenderer } = require('electron');

ipcRenderer.on('draw-circle', (_evt, { x, y }) => {
  const ring = document.createElement('div');
  ring.className = 'ring';
  ring.style.left = x + 'px';
  ring.style.top = y + 'px';
  document.body.appendChild(ring);
  setTimeout(() => ring.remove(), 700);
});
```

- [ ] **Step 3: Ajustar overlay.html para usar nodeIntegration**

El overlay necesita acceso a `ipcRenderer`. Modificar `main.js` (sección createOverlayWindow) — la propiedad `webPreferences.nodeIntegration` debe ser `true` para esta ventana específica. Editar la función `createOverlayWindow` en `main.js`:

Buscar:
```javascript
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
```
(en la función `createOverlayWindow`)

Reemplazar por:
```javascript
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
```

- [ ] **Step 4: Commit**

```bash
git add src/overlay/ main.js
git commit -m "feat: overlay transparente con animación de círculo pre-clic"
```

---

## Task 12: Smoke test manual del MVP

**Files:**
- Modify: ninguno
- Tests: validación manual

- [ ] **Step 1: Configurar API key**

Crear `.env`:

```bash
cd /c/Users/naked/Downloads/claude-eye
cp .env.example .env
```

Editar `.env` y agregar la API key real de Anthropic.

- [ ] **Step 2: Arrancar la app en modo dev**

```bash
cd /c/Users/naked/Downloads/claude-eye
npm run dev
```

Expected:
- Aparece widget flotante en la esquina superior derecha
- Aparece ícono en system tray
- Mensaje de bienvenida visible
- Si no hay API key, pide pegarla en el input

- [ ] **Step 3: Verificar hotkey**

Presionar `Ctrl+Shift+V` desde cualquier app.

Expected: el widget aparece (si estaba oculto) y captura la pantalla activa, envía a Claude y muestra una descripción en español.

- [ ] **Step 4: Verificar drag-to-window**

Hacer mousedown en el botón 👁 del header, mover sobre otra ventana visible (ej: VS Code, Chrome), soltar.

Expected:
- El widget muestra "arrastra a una ventana..." mientras dragging
- Al soltar, captura la ventana objetivo, muestra thumbnail en el target-bar
- Claude responde describiendo la ventana

- [ ] **Step 5: Verificar tray**

Click derecho en el ícono del tray.

Expected: menú con "Mostrar widget", "Ocultar widget", "Salir".

- [ ] **Step 6: Verificar privacy blocklist**

Abrir un programa cuyo título contenga "1Password" o renombrar mentalmente — alternativamente, agregar "chrome" temporalmente al blocklist via DevTools console:

```javascript
window.claudeEye.setSetting('blocklist', ['chrome'])
```

Capturar Chrome.

Expected: error en chat: "⚠️ Ventana bloqueada por privacy blocklist".

Después restaurar:

```javascript
window.claudeEye.setSetting('blocklist', ['1password','keepass','bitwarden','lastpass','banking','wallet'])
```

- [ ] **Step 7: Documentar resultados en commit**

```bash
git commit --allow-empty -m "test: smoke tests manuales del MVP - widget, hotkey, drag, tray, privacy validados"
```

---

## Task 13: Build del instalador Windows

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\electron-builder.json`

- [ ] **Step 1: Crear electron-builder.json**

Crear en raíz del proyecto:

```json
{
  "appId": "com.fractalmx.claude-eye",
  "productName": "Claude Eye",
  "directories": {
    "output": "dist"
  },
  "files": [
    "main.js",
    "preload.js",
    "src/**/*",
    "assets/**/*",
    "package.json",
    "node_modules/**/*",
    "!node_modules/**/{*.md,*.markdown,*.ts,*.map}",
    "!node_modules/**/{test,tests,__tests__,examples,docs}/**"
  ],
  "win": {
    "target": [{ "target": "nsis", "arch": ["x64"] }],
    "icon": "assets/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "Claude Eye"
  }
}
```

- [ ] **Step 2: Generar build**

```bash
cd /c/Users/naked/Downloads/claude-eye
npm run build:win
```

Expected: archivo `dist/Claude Eye Setup 0.1.0.exe` creado. Puede tomar 3-5 minutos primera vez.

Si falla por falta de `.ico` válido, el build mostrará un warning pero generará igualmente. Para producción se debe reemplazar `assets/icon.ico` por un ícono multi-resolución real.

- [ ] **Step 3: Smoke test del instalador**

Ejecutar el instalador `.exe`. Confirmar que:
- Crea shortcut en escritorio
- Crea entrada en menú de inicio
- Al lanzar, aparece widget flotante + tray icon
- App funciona igual que en modo dev

- [ ] **Step 4: Commit**

```bash
git add electron-builder.json
git commit -m "build: configuración de electron-builder para instalador Windows NSIS"
```

---

## Task 14: README del proyecto

**Files:**
- Create: `C:\Users\naked\Downloads\claude-eye\README.md`

- [ ] **Step 1: Crear README.md**

Crear `README.md`:

```markdown
# Claude Eye

Widget desktop flotante que dota a Claude de visión sobre tu pantalla. Arrastra el ojo sobre cualquier ventana, presiona `Ctrl+Shift+V` o haz clic en 📸 — Claude verá lo que estás viendo y te dará instrucciones claras en español.

## Quick start

1. Configura tu API key de Anthropic:

   ```bash
   cp .env.example .env
   # editar .env y poner ANTHROPIC_API_KEY=sk-ant-...
   ```

   También puedes pegarla directamente en el widget cuando arranque por primera vez.

2. Modo desarrollo:

   ```bash
   npm install
   npm run dev
   ```

3. Build instalador Windows:

   ```bash
   npm run build:win
   # genera dist/Claude Eye Setup x.x.x.exe
   ```

## Features Fase 1 (MVP)

- 👁 Widget flotante always-on-top, dark glassmorphism
- Drag-to-window: arrastra el ojo sobre cualquier ventana
- Hotkey global `Ctrl+Shift+V`
- Captura nativa via Electron `desktopCapturer`
- Compresión automática (max 1280px) antes de enviar
- Modo GUÍA: descripción visual + instrucciones en español
- Privacy blocklist (1Password, banking, etc. ignoradas)
- Tray icon con menú show/hide/quit
- Persistencia local (settings, API key, posición)

## Próximas fases

- **Fase 2:** Modos AUTO y DIRECTO con automatización (mouse/teclado), Smart Cards, Mission Mode, Escape to cancel
- **Fase 3:** Credential Vault, Smart Waiting, Error Radar, Video Intelligence (YouTube → MD), Page Narrator, Voice Input
- **Fase 4:** MCP server para Claude Code, Chrome extension para claude.ai, Cowork screen context

## Estructura

Ver `../mariana-fractal/docs/superpowers/specs/2026-05-05-claude-eye-design.md` para spec completo.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README con quick start y roadmap"
```

---

## Spec Coverage Check (Fase 1)

Sección del spec → tareas que la cubren:

| Spec § | Cubre |
|---|---|
| §1 Visión | Producto general — README + Tasks 8/9/10 |
| §2 Arquitectura | Tasks 1, 8 (estructura + procesos) |
| §3 UI Widget | Tasks 9, 10 |
| §3.3 Tabs (solo GUÍA en Fase 1) | Task 10 (tabs AUTO/DIRECTO marcados como Fase 2) |
| §4.1 Drag-to-window | Tasks 6, 10 |
| §4.2 Hotkey global | Task 8 |
| §4.3 Compresión | Task 2 |
| §4.4 Privacy blocklist | Tasks 3, 6 |
| §5.2 Overlay pre-clic | Task 11 (infraestructura lista; usado en Fase 2) |
| §6 Seguridad — local first, API key | Tasks 4, 5, 10 |
| §13 Instalador | Task 13 |
| §14 Fase 1 | Tasks 1-14 |

**Diferida a Fase 2:** §5.1 motor @nut-tree, §5.3 Escape cancel, §7 Mission Mode, §8 Smart Waiting/Error Radar, §9 Video Intelligence, §10 integraciones MCP/Chrome/Cowork, §11 Page Narrator, §12 Voice.

---

## Notas operativas para construcción

1. **Sharp en Windows:** Si `npm install` falla por sharp, correr `npm rebuild sharp` o `npm install --include=optional sharp`.
2. **Electron rebuild:** Si después de instalar dependencias nativas algo falla, correr `npx electron-rebuild`.
3. **API key fallback:** El cliente intenta `process.env.ANTHROPIC_API_KEY` primero, luego `settings.get('apiKey')`. La UI permite pegarla la primera vez sin tocar archivos.
4. **CSP:** El renderer usa CSP estricto. Si en futuras tareas se requiere fetch externo desde el renderer, ajustar el meta tag.
5. **Path absolute en el plan:** Las rutas usan estilo Windows pero los comandos bash usan `/c/Users/naked/...` por compatibilidad con Git Bash.
