# Claude Eye — Spec de Diseño
**Fecha:** 2026-05-05  
**Autor:** Fractal MX / NKD  
**Stack:** Electron + Node.js + Claude API (vision) + @nut-tree/nut-js  
**Plataforma objetivo:** Windows 11  

---

## 1. Visión del producto

Claude Eye elimina la barrera entre Claude Code y las interfaces de usuario reales. Cuando Claude Code ejecuta una tarea que requiere interacción con un browser, panel de configuración o cualquier UI, el usuario ya no necesita entender el contexto técnico para avanzar: Claude Eye ve lo que el usuario ve, toma las decisiones técnicas de navegación, y solo interrumpe al usuario para pedir autorización explícita (`Sí / No / Adelante`) o credenciales.

El usuario opera como supervisor, no como técnico.

---

## 2. Arquitectura del sistema

### 2.1 Estructura de carpetas

El proyecto vive en una carpeta independiente `claude-eye/`, separada del repo Mariana.

```
claude-eye/
├── main.js                    ← Proceso principal Electron
├── preload.js                 ← Bridge seguro IPC renderer↔main
├── electron-builder.json      ← Config instalador .exe
├── package.json
├── src/
│   ├── renderer/
│   │   ├── index.html         ← UI del widget
│   │   ├── app.js             ← Lógica de UI y modo
│   │   └── style.css          ← Dark glassmorphism
│   ├── capture.js             ← desktopCapturer + compresión
│   ├── claude-api.js          ← Anthropic SDK con visión
│   ├── mcp-server.js          ← Servidor MCP local (puerto 7788)
│   ├── actions.js             ← @nut-tree/nut-js (click/scroll/type)
│   ├── video-intel.js         ← Detección y análisis de video
│   ├── vault.js               ← Credential vault cifrado (electron-store)
│   └── privacy.js             ← Lista negra de apps
└── assets/
    ├── icon.ico               ← Ícono de escritorio / tray
    └── overlay.html           ← Ventana transparente para el círculo guía
```

### 2.2 Procesos Electron

| Proceso | Responsabilidad |
|---|---|
| **Main** | Ventanas, tray, hotkeys globales, IPC, MCP server, acciones nativas |
| **Renderer (widget)** | UI del chat, tabs de modo, drag del ojo, vault UI |
| **Renderer (overlay)** | Ventana 100% transparente always-on-top para dibujar el círculo de pre-clic |

---

## 3. UI del Widget

### 3.1 Características visuales
- Ventana frameless, always-on-top, arrastrable por el header
- Dimensiones default: 320×420px — redimensionable
- Estilo: dark glassmorphism con acentos en `#6366f1` (indigo)
- Ícono en system tray con menú contextual (Mostrar / Ocultar / Salir)
- Shortcut de escritorio (.lnk) generado por el instalador

### 3.2 Layout del widget

```
┌─────────────────────────────────────┐
│ 👁 CLAUDE EYE          🟢 listo  ≡ │  ← header draggable
├──────────┬──────────┬───────────────┤
│  GUÍA    │   AUTO   │   DIRECTO ⚡  │  ← tabs de modo
├──────────┴──────────┴───────────────┤
│  [thumbnail ventana target]         │  ← target activo
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Claude: Veo que estás en    │    │
│  │ Vercel → Domains. El botón  │    │
│  │ "Add Domain" está arriba    │    │
│  │ a la derecha.               │    │
│  └─────────────────────────────┘    │
│                                     │
│  [Smart Card de confirmación]       │
│  ┌─────────────────────────────┐    │
│  │ 🖱 Clic en "Add Domain"     │    │
│  │ [✅ Adelante] [❌ Cancelar] │    │
│  └─────────────────────────────┘    │
│                                     │
├─────────────────────────────────────┤
│ [input texto...]           [📸] [🎙]│  ← input + captura + voz
└─────────────────────────────────────┘
```

### 3.3 Tabs de modo

| Tab | Comportamiento de Claude |
|---|---|
| **GUÍA** | Describe en lenguaje simple dónde hacer clic/scroll. El usuario actúa manualmente. |
| **AUTO** | Mueve el cursor y ejecuta acciones, pero muestra Smart Card de confirmación antes de cada una. |
| **DIRECTO ⚡** | Ejecuta inmediatamente. Muestra overlay de círculo 500ms antes de cada clic. |

---

## 4. Captura de pantalla

### 4.1 Drag-to-window (interacción principal)

1. El botón 👁 en el header del widget es draggable (HTML5 drag API)
2. Al soltar sobre cualquier área del escritorio, Electron registra las coordenadas del cursor via `screen.getCursorScreenPoint()`
3. `desktopCapturer.getSources({types:['window']})` lista todas las ventanas abiertas con thumbnails
4. Se cruzan las coordenadas del cursor con los `bounds` de cada ventana → identifica el target
5. El widget muestra thumbnail de la ventana seleccionada como confirmación visual
6. Esa ventana queda como target hasta el próximo drag o cambio manual

### 4.2 Hotkey global

`Ctrl+Shift+V` registrado via `globalShortcut.register` — funciona aunque el widget no tenga foco. Captura el target activo y abre el contexto si es la primera captura de una sesión.

### 4.3 Compresión antes de enviar

`sharp` redimensiona el screenshot a máximo 1280px de ancho antes de enviarlo a la API. Reduce el tamaño promedio de 3-5MB a ~300KB. Reducción de costo ~70%, latencia ~50%.

### 4.4 Privacy blocklist

`src/privacy.js` mantiene una lista configurable de nombres de apps y ventanas que nunca se capturan (ej: `1Password`, `Chrome - Online Banking`, `Keychain`). Si el target del drag coincide con la lista, el widget rechaza la captura y notifica al usuario.

---

## 5. Ejecución de acciones

### 5.1 Motor de automatización

`@nut-tree/nut-js` ejecuta acciones nativas en Windows:

| Acción | Implementación |
|---|---|
| `click(x, y)` | `mouse.move(point) + mouse.leftClick()` |
| `scroll(dir, amount)` | `mouse.scrollDown/Up(amount)` |
| `type(text)` | `keyboard.type(text)` |
| `keyCombo(keys)` | `keyboard.pressKey(...keys)` |

### 5.2 Overlay de pre-clic

Antes de ejecutar cualquier clic (incluso en DIRECTO), una ventana Electron transparente fullscreen dibuja un círculo animado en las coordenadas destino durante 500ms. El usuario siempre ve visualmente qué va a suceder.

### 5.3 Cancel hotkey

`Escape` (global) cancela cualquier acción o secuencia en curso e interrumpe el loop de Claude. Disponible en cualquier modo.

---

## 6. Seguridad y privacidad

- **Credential Vault:** `electron-store` con cifrado AES-256. Claude Eye guarda credenciales solo con confirmación explícita del usuario. Las credenciales nunca se envían a la API — solo se usan localmente para inyectarlas en campos de formulario.
- **Local first:** historial de conversación, capturas y vault viven 100% en el dispositivo. Única llamada externa: Anthropic API.
- **Privacy blocklist:** apps bloqueadas nunca se capturan.
- **Modo DIRECTO bloqueado por default:** el usuario debe activarlo explícitamente en Settings la primera vez.

---

## 7. Mission Mode (pre-flight)

Cuando Claude Code inicia una tarea multi-paso, envía a Claude Eye un payload con el objetivo. Claude Eye muestra una tarjeta de briefing:

```
┌──────────────────────────────────────┐
│ 🚀 NUEVA TAREA                       │
│ Deploy de proyecto en Railway        │
│                                      │
│ Necesito:                            │
│ ☐ Login en Railway                   │
│ ☐ Confirmar nombre del proyecto      │
│ ☐ Seleccionar plan                   │
│                                      │
│ [✅ Empezamos] [⏸ Más tarde]        │
└──────────────────────────────────────┘
```

Claude recopila todo al inicio. Después ejecuta sin interrumpir hasta que aparezca un requisito imprevisto.

---

## 8. Smart Waiting y Error Radar

### 8.1 Smart Waiting
Después de una acción que dispara un proceso (deploy, build, upload), Claude Eye hace polling de capturas del target cada 5 segundos. Cuando detecta que el estado cambió (spinner desapareció, texto "Success" apareció), notifica: `"✅ Deploy completado en 47s"` y reanuda el flujo.

### 8.2 Error Radar
Claude Eye analiza cada captura en busca de patrones visuales de error (fondo rojo, texto "Error", "Failed", "401", "503"). Al detectar uno, captura automáticamente, envía el screenshot + contexto a Claude Code, y muestra al usuario una explicación en lenguaje simple con opciones de resolución.

---

## 9. Video Intelligence

### 9.1 Detección automática

Cuando el usuario hace drag del 👁 sobre una ventana del browser, Claude Eye detecta si es un contexto de video analizando el **título de la ventana** obtenido de `desktopCapturer.getSources()`. Si el título contiene patrones como `"YouTube"`, `"Instagram"`, `"Vimeo"`, o si la URL visible en la barra de título corresponde a un reproductor conocido, activa el pipeline de Video Intelligence.

Si detecta video → activa el pipeline de Video Intelligence en lugar del pipeline de UI navigation.

### 9.2 Pipeline de extracción

**Para YouTube:**
1. Extrae la URL del video del título de la ventana
2. `youtube-transcript` npm package obtiene la transcripción completa (auto-captions)
3. Captura 3-5 frames representativos del video en momentos clave
4. Combina: transcripción + frames → Claude API

**Para Instagram / otras plataformas (sin transcript disponible):**
1. Pausa el video automáticamente (simula tecla `K` o `Space`)
2. Toma frames cada 10% de la duración detectada (10 frames máx)
3. Resume el video
4. Envía frames + metadatos visibles (título, descripción) → Claude API

### 9.3 Output: archivo MD de conocimiento

Claude genera y guarda automáticamente un archivo `.md` en `~/claude-eye/knowledge/YYYY-MM-DD-[titulo].md` con esta estructura:

```markdown
# [Título del video]
**Fuente:** [URL]  
**Fecha de captura:** [fecha]  
**Duración:** [X min]  

## Resumen ejecutivo
[3-5 líneas — qué hace este video]

## Conceptos clave
- [concepto 1]
- [concepto 2]

## Instrucciones / Pasos detectados
1. [paso 1]
2. [paso 2]

## Información técnica relevante
[herramientas, versiones, comandos mencionados]

## Notas para Claude Code
[qué debería implementar Code a partir de este video]

## Integración con Mariana
[si aplica: cómo este conocimiento mejora el asistente]

## Integración con Fractal MX
[si aplica: cómo aplicar esto a proyectos de la agencia]

## Ruta de implementación sugerida
1. [paso 1]
2. [paso 2]

## Contexto listo para Code
> Copia este bloque y pégalo al inicio de tu sesión de Claude Code
[bloque de contexto compacto listo para usar]
```

Claude Eye notifica cuando el archivo está listo y ofrece enviarlo directamente a Claude Code via MCP.

---

## 10. Integraciones externas

### 10.1 Claude Code — MCP Server (Nivel 1)

Claude Eye incluye `mcp-bridge.js` — un proceso independiente que implementa el protocolo MCP sobre **stdio** (el estándar de Claude Code). Se agrega a `.claude/settings.json` del proyecto:

```json
{
  "mcpServers": {
    "claude-eye": {
      "command": "node",
      "args": ["C:/Users/naked/AppData/Local/claude-eye/mcp-bridge.js"]
    }
  }
}
```

`mcp-bridge.js` se comunica internamente con el proceso principal de Claude Eye via HTTP local (`localhost:7788`) para disparar capturas y acciones. Claude Code habla stdio con el bridge; el bridge habla HTTP con la app Electron.

**Herramientas expuestas:**

| Tool | Descripción |
|---|---|
| `take_screenshot` | Captura el target activo y devuelve imagen base64 |
| `click_at(x, y)` | Clic en coordenada real |
| `scroll(direction, amount)` | Scroll en ventana target |
| `type_text(text)` | Escribe en campo activo |
| `set_mode(mode)` | Cambia modo (guide/auto/direct) |
| `ask_user(question, options)` | Muestra pregunta al usuario en el widget |
| `start_mission(objective, steps)` | Activa Mission Mode con briefing |
| `open_knowledge_file(path)` | Abre un MD de conocimiento en Claude Code |

### 10.2 Claude.ai chat — Chrome Extension (Nivel 2)

Extensión Chrome ligera que:
- Agrega botón 📸 en el input de claude.ai
- Al presionarlo, llama `GET localhost:7788/screenshot` → obtiene screenshot del target activo
- Adjunta la imagen como archivo al mensaje actual
- El usuario escribe su pregunta con el contexto visual ya adjunto

### 10.3 Cowork — Screen Context (Nivel 3)

Claude Eye expone `GET localhost:7788/context-stream` (Server-Sent Events). Una sesión de Cowork puede suscribirse y recibir snapshots actualizados del target activo. Todos los participantes de la sesión ven el mismo estado visual en tiempo real.

---

## 11. Page Narrator

Botón rápido (ícono 🗣 en el widget) que, sin input de texto, captura el target activo y envía a Claude con el prompt: *"Descríbeme esta página en 3 líneas: qué es, qué opciones importantes tiene, y qué debería hacer a continuación según la tarea activa."* Respuesta en el widget en menos de 5 segundos. Ideal para páginas desconocidas.

---

## 12. Voice Input

Botón 🎙 en el input bar activa el micrófono. El audio se transcribe via Web Speech API (nativa del browser Electron — sin costo adicional). Permite decir "sí", "adelante", "para", o dictarle contexto a Claude sin tener que escribir. 

---

## 13. Instalador y distribución

`electron-builder` genera:
- `ClaudeEye-Setup-x.x.x.exe` — instalador NSIS para Windows 11
- Shortcut en escritorio y menú de inicio automático
- Actualización automática via GitHub Releases (electron-updater)
- Arranque con Windows (opcional, configurable en Settings)

---

## 14. Fases de construcción

### Fase 1 — MVP funcional
- Widget flotante con UI dark glassmorphism
- Drag-to-window + hotkey Ctrl+Shift+V
- Captura + compresión + envío a Claude API
- Modo GUÍA funcionando
- Privacy blocklist básica
- Overlay de pre-clic

### Fase 2 — Automatización
- Modos AUTO y DIRECTO con @nut-tree
- Smart Confirmation Cards
- Escape to cancel
- Mission Mode

### Fase 3 — Inteligencia avanzada
- Credential Vault
- Smart Waiting + Error Radar
- Video Intelligence (YouTube primero, luego otros)
- Page Narrator + Voice Input

### Fase 4 — Integraciones
- MCP server para Claude Code
- Chrome extension compañera
- Cowork screen context

---

## 15. Dependencias principales

| Paquete | Uso |
|---|---|
| `electron` | Framework desktop |
| `@anthropic-ai/sdk` | Claude API con visión |
| `@nut-tree/nut-js` | Mouse y teclado nativos |
| `sharp` | Compresión de screenshots |
| `electron-store` | Vault cifrado + settings |
| `electron-builder` | Instalador .exe |
| `youtube-transcript` | Transcripciones de YouTube |
| `ws` | WebSocket para MCP server |
