// Mariana embeddable widget — Fractal MX
// Drop on any site:
//   <script src="https://fractal-virtual-team-production.up.railway.app/mariana-widget.js"
//           data-agency="fractal" defer></script>
// Aparece en bottom-right como botón flotante. Click → chat panel.
// Habla con /api/embed/message; los leads se notifican por correo desde el backend.
(function () {
  if (window.__marianaWidgetLoaded) return;
  window.__marianaWidgetLoaded = true;

  const SCRIPT = document.currentScript;
  const SRC = SCRIPT?.src || '';
  const API_ORIGIN = (SRC.replace(/\/[^/]+$/, '')) || 'https://fractal-virtual-team-production.up.railway.app';
  const AGENCY = SCRIPT?.dataset?.agency || 'fractal';

  // Paleta Fractal: lima #C3DD2E sobre obsidiana #0A0A0A
  const LIME = '#C3DD2E';
  const INK  = '#0A0A0A';

  const VISITOR_ID = (() => {
    let v = localStorage.getItem('fractal-visitor');
    if (!v) { v = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); localStorage.setItem('fractal-visitor', v); }
    return v;
  })();

  const css = `
    .fmx-fab{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;
      background:${LIME};box-shadow:0 8px 24px rgba(195,221,46,0.35);
      display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:99999;
      transition:transform .2s;font-size:26px;color:${INK};border:none;}
    .fmx-fab:hover{transform:scale(1.08);}
    .fmx-pulse{position:absolute;inset:0;border-radius:50%;background:${LIME};opacity:.4;
      animation:fmxPulse 2s infinite;}
    @keyframes fmxPulse{0%{transform:scale(1);opacity:.4}80%,100%{transform:scale(1.5);opacity:0}}
    .fmx-panel{position:fixed;bottom:90px;right:20px;width:350px;max-height:560px;
      background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,0.3);
      display:none;flex-direction:column;overflow:hidden;z-index:99999;
      font-family:system-ui,-apple-system,sans-serif;}
    .fmx-panel.open{display:flex;}
    .fmx-head{background:${INK};color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;
      border-bottom:2px solid ${LIME};}
    .fmx-avatar{width:34px;height:34px;border-radius:50%;background:${LIME};color:${INK};
      display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;}
    .fmx-title{font-weight:600;font-size:14px;line-height:1.2;}
    .fmx-status{font-size:11px;opacity:.7;}
    .fmx-status b{color:${LIME};font-weight:600;}
    .fmx-close{margin-left:auto;background:none;border:none;color:#fff;font-size:20px;cursor:pointer;}
    .fmx-msgs{flex:1;overflow-y:auto;padding:14px;background:#f7f7f5;display:flex;flex-direction:column;gap:8px;}
    .fmx-msg{max-width:82%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;}
    .fmx-msg.user{align-self:flex-end;background:${INK};color:#fff;}
    .fmx-msg.bot{align-self:flex-start;background:#fff;color:#1a1a14;border:1px solid #eee;}
    .fmx-cta{align-self:flex-start;display:inline-flex;align-items:center;gap:7px;
      background:${LIME};color:${INK};font-weight:600;font-size:13px;text-decoration:none;
      padding:9px 16px;border-radius:10px;box-shadow:0 4px 14px rgba(195,221,46,0.4);}
    .fmx-input{display:flex;gap:6px;padding:10px;border-top:1px solid #eee;background:#fff;}
    .fmx-input input{flex:1;padding:10px 12px;border:1px solid #ddd;border-radius:20px;
      font-size:13px;outline:none;font-family:inherit;}
    .fmx-input input:focus{border-color:${LIME};}
    .fmx-input button{background:${LIME};color:${INK};border:none;width:38px;height:38px;
      border-radius:50%;cursor:pointer;font-size:15px;font-weight:700;}
    .fmx-typing{align-self:flex-start;color:${LIME};padding:6px 10px;font-size:18px;letter-spacing:2px;}
    .fmx-fp{text-align:center;font-size:9px;color:#999;padding:6px;background:#fafafa;}
    .fmx-fp a{color:#8a9a2e;text-decoration:none;}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const fab = document.createElement('button');
  fab.className = 'fmx-fab';
  fab.title = 'Habla con Mariana';
  fab.innerHTML = '<span class="fmx-pulse"></span>💬';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.className = 'fmx-panel';
  panel.innerHTML = `
    <div class="fmx-head">
      <div class="fmx-avatar">M</div>
      <div>
        <div class="fmx-title">Mariana · Fractal MX</div>
        <div class="fmx-status"><b>en línea</b> · responde en segundos</div>
      </div>
      <button class="fmx-close">×</button>
    </div>
    <div class="fmx-msgs" id="fmx-msgs"></div>
    <form class="fmx-input">
      <input type="text" placeholder="Cuéntame qué quieres crear…" autocomplete="off" required />
      <button type="submit">➤</button>
    </form>
    <div class="fmx-fp">Powered by <a href="https://fractalstudio.com.mx" target="_blank">Fractal MX</a></div>
  `;
  document.body.appendChild(panel);

  const msgsEl  = panel.querySelector('#fmx-msgs');
  const formEl  = panel.querySelector('.fmx-input');
  const inputEl = formEl.querySelector('input');
  const closeEl = panel.querySelector('.fmx-close');

  const conversation = [];
  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = 'fmx-msg ' + role;
    div.textContent = text;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    conversation.push({ role, text, ts: Date.now() });
  }
  function addCta(label, url) {
    const a = document.createElement('a');
    a.className = 'fmx-cta';
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = (label || 'Conversar con un humano') + ' →';
    msgsEl.appendChild(a);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function showTyping() {
    const t = document.createElement('div');
    t.className = 'fmx-typing'; t.id = 'fmx-typing'; t.textContent = '● ● ●';
    msgsEl.appendChild(t); msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function hideTyping() { document.getElementById('fmx-typing')?.remove(); }

  function open() {
    panel.classList.add('open');
    fab.style.display = 'none';
    if (msgsEl.children.length === 0) {
      addMsg('bot', 'Hola, soy Mariana de Fractal MX. Damos forma visual a tus ideas con video, foto, diseño, branding y contenido potenciado con IA. Para darte seguimiento personalizado, ¿me compartes tu nombre, empresa y correo? Y cuéntame, ¿qué te gustaría crear?');
    }
    setTimeout(() => inputEl.focus(), 100);
  }
  function close() { panel.classList.remove('open'); fab.style.display = 'flex'; }

  fab.addEventListener('click', open);
  closeEl.addEventListener('click', close);

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    addMsg('user', text);
    showTyping();
    try {
      const r = await fetch(`${API_ORIGIN}/api/embed/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: VISITOR_ID,
          agency: AGENCY,
          source_url: window.location.href,
          message: text,
          conversation
        })
      });
      const j = await r.json();
      hideTyping();
      addMsg('bot', j.reply || 'Listo, el equipo de Fractal te contactará pronto.');
      if (j.cta) addCta(j.cta_label, j.cta_url || 'https://wa.me/5215534189583');
    } catch (err) {
      hideTyping();
      addMsg('bot', 'Hubo un detalle conectando. ¿Me dejas tu correo y el equipo de Fractal te escribe en un rato?');
    }
  });
})();
