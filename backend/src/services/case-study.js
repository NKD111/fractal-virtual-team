// backend/src/services/case-study.js
// Auto-genera un PDF case study cuando una task se entrega.
// Usa puppeteer si está disponible, si no genera HTML estático y persiste.

const { supabase } = require('../core/supabase');

async function tryPuppeteer() {
  try { return require('puppeteer'); } catch { return null; }
}

function buildHtml({ task, client = 'Cliente', metrics = {} }) {
  const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html>
<html><head><meta charset='utf-8'><title>Case Study · ${task.brief?.slice(0,60) || task.id}</title>
<style>
body{font-family:'Inter',-apple-system,sans-serif;background:#fafaf6;color:#1a1a14;margin:0;padding:0;}
.page{max-width:800px;margin:0 auto;background:#fff;padding:48px;}
.brand{color:#B14FFF;font-weight:700;letter-spacing:0.2em;font-size:11px;}
h1{font-size:36px;line-height:1.1;margin:8px 0 6px;}
.lead{color:#666;font-size:14px;}
.meta{display:flex;gap:24px;margin:24px 0;padding:16px 0;border-top:1px solid #eee;border-bottom:1px solid #eee;font-size:12px;color:#666;}
.meta strong{color:#1a1a14;display:block;font-size:14px;margin-bottom:2px;}
h2{margin-top:32px;font-size:20px;color:#1a1a14;border-bottom:2px solid #B14FFF;padding-bottom:6px;}
.brief-box{background:#fafaf6;border-left:3px solid #B14FFF;padding:14px 18px;margin:16px 0;font-size:14px;line-height:1.5;}
img.deliverable{max-width:100%;border:1px solid #eee;border-radius:6px;display:block;margin:12px 0;}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0;}
.metric{background:#fafaf6;padding:14px;border-radius:8px;text-align:center;}
.metric .v{font-size:24px;font-weight:700;color:#B14FFF;}
.metric .k{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.05em;}
.footer{margin-top:48px;padding-top:18px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;}
</style></head>
<body><div class='page'>
  <div class='brand'>FRACTAL MX · CASE STUDY</div>
  <h1>${task.brief?.slice(0, 80) || 'Entregable'}</h1>
  <p class='lead'>Cliente: ${client} · Entregado por ${task.agent_assigned?.toUpperCase() || ''} · ${date}</p>

  <div class='meta'>
    <div><strong>${task.agent_assigned || 'n/d'}</strong>Agente principal</div>
    <div><strong>${task.supervisor || 'n/d'}</strong>Supervisor</div>
    <div><strong>${task.status || 'delivered'}</strong>Status final</div>
  </div>

  <h2>Brief</h2>
  <div class='brief-box'>${task.brief || task.message || ''}</div>

  ${task.image_url ? `<h2>Resultado visual</h2><img class='deliverable' src='${task.image_url}' alt='deliverable' />` : ''}

  <h2>Lo que se entregó</h2>
  <ul>${(task.delivered || []).map(d => `<li>${d.type}: ${d.url ? `<a href='${d.url}'>archivo</a>` : (d.note || d.desc || '')}</li>`).join('')}</ul>

  <div class='metrics'>
    <div class='metric'><div class='v'>${metrics.duration_min || '—'}</div><div class='k'>Min de ejecución</div></div>
    <div class='metric'><div class='v'>${metrics.cost_usd != null ? '$' + Number(metrics.cost_usd).toFixed(3) : '—'}</div><div class='k'>Costo IA</div></div>
    <div class='metric'><div class='v'>${metrics.qc_score || '—'}</div><div class='k'>QC score</div></div>
  </div>

  <div class='footer'>Generado automáticamente por Fractal MX Virtual Team · v4.2</div>
</div></body></html>`;
}

async function generateCaseStudy({ task, client = null, metrics = {} }) {
  if (!task) return { ok: false, error: 'no task' };
  const html = buildHtml({ task, client: client || task.user_email?.split('@')[0] || 'Cliente', metrics });

  const pup = await tryPuppeteer();
  let pdf_url = null, preview_url = null;

  if (pup) {
    try {
      const browser = await pup.launch({ headless: 'new', args: ['--no-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buf = await page.pdf({ format: 'A4', printBackground: true });
      await browser.close();

      // Subir a Cloudinary si existe
      try {
        const cloudinary = require('cloudinary').v2;
        if (process.env.CLOUDINARY_URL) {
          const upload = await cloudinary.uploader.upload(`data:application/pdf;base64,${buf.toString('base64')}`, {
            resource_type: 'raw', folder: 'fractal-case-studies', public_id: task.id
          });
          pdf_url = upload.secure_url;
        } else {
          pdf_url = `data:application/pdf;base64,${buf.toString('base64')}`;
        }
      } catch (e) {
        pdf_url = `data:application/pdf;base64,${buf.toString('base64')}`;
      }
    } catch (err) {
      console.warn('[case-study] puppeteer failed:', err.message);
    }
  }

  // Si no hay PDF, guarda HTML como preview
  preview_url = pdf_url || null;

  try {
    const { data } = await supabase.from('case_studies').insert({
      task_id: task.id, client, agent: task.agent_assigned,
      title: task.brief?.slice(0, 100), pdf_url, preview_url, metrics
    }).select().single();
    return { ok: true, id: data?.id, pdf_url, html_preview: html };
  } catch (e) {
    return { ok: false, error: e.message, html_preview: html };
  }
}

module.exports = { generateCaseStudy, buildHtml };
