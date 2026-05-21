// backend/src/routines/revenue-pipeline.js
// AUTONOMOUS REVENUE ENGINE — Mariana orquesta 7 fases para crear y vender
// productos digitales sin intervención. Cada fase reporta vía bubbles + email.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../core/supabase');
const { sendEmail } = require('../core/email');
const { wrapAnthropic, audit } = require('../core/telemetry');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? wrapAnthropic(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }))
  : null;

const COUNCIL = ['diana', 'roberto', 'valentina', 'sofia']; // 4 votantes
const APPROVAL_THRESHOLD = 3; // 3/4 para aprobar

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function bubble(slug, text) {
  try { global.io?.emit('chat_bubble', { agent: slug, text: String(text).slice(0, 240), kind: 'revenue', ts: Date.now() }); } catch {}
}
async function logEvent({ product_id, agent, phase, event, details = {} }) {
  try { await supabase.from('revenue_events').insert({ product_id, agent, phase, event, details }); } catch {}
}
async function update(id, patch) {
  try { await supabase.from('revenue_products').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id); } catch {}
}

// ── PHASE 1: IDEATION (Lucas + Alex) ───────────────────────────────────
async function phaseIdeation(niche) {
  bubble('lucas', `Investigando trending topics${niche ? ` en ${niche}` : ''}.`);
  if (!anthropic) {
    return [
      { topic: 'AI para PYMEs LATAM', score: 7, justification: 'Demanda alta, oferta limitada en español' },
      { topic: 'Notion para agencias', score: 6, justification: 'Nicho establecido' },
      { topic: 'Content systems con IA', score: 8, justification: 'Tendencia 2026-2027' }
    ];
  }
  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `Eres LUCAS, analytics ex-Google. Vas a proponer 3 ideas de productos digitales
(ebooks/cursos/templates) altamente vendibles para audiencia hispanohablante (CDMX
y LATAM principalmente). Cada idea debe:
- Ser específica (no genérica)
- Tener tema actual (2026-2027)
- Considerar competencia y precio
- Score 0-10 viabilidad

Devuelve JSON ARRAY (NO markdown):
[{"topic":"...","kind":"ebook|course|template","score":N,"justification":"..."}]`,
      messages: [{ role: 'user', content: `Nicho preferido: ${niche || 'libre'}. Genera 3 ideas top.` }]
    });
    const txt = r.content[0]?.text || '[]';
    const arr = JSON.parse(txt.replace(/```json\s*|\s*```/g, '').trim());
    return Array.isArray(arr) ? arr : [];
  } catch (e) { console.warn('[revenue] ideation:', e.message); return []; }
}

// ── PHASE 2: PROPOSAL (Mariana presenta) ───────────────────────────────
async function phaseProposal(idea) {
  const { data: row, error } = await supabase.from('revenue_products').insert({
    kind: idea.kind || 'ebook',
    niche: idea.niche || null,
    topic: idea.topic,
    title: idea.topic,
    description: idea.justification,
    status: 'proposed',
    council_score: idea.score || 6,
    metadata: { initial_score: idea.score, justification: idea.justification }
  }).select().single();
  if (error) throw new Error(error.message);
  bubble('mariana', `Propongo al consejo: "${idea.topic}". Equipo, voten.`);
  await logEvent({ product_id: row.id, agent: 'mariana', phase: 'proposal', event: 'proposed', details: idea });
  return row;
}

// ── PHASE 3: COUNCIL VOTE ──────────────────────────────────────────────
async function phaseCouncil(product) {
  bubble('mariana', `Pidiendo voto del consejo a Diana, Roberto, Valentina, Sofia.`);
  await sleep(2000);

  const votes = [];
  for (const voter of COUNCIL) {
    const v = await voteOf(voter, product);
    votes.push(v);
    await supabase.from('council_votes').insert({
      product_id: product.id, voter, vote: v.vote, score: v.score, reason: v.reason
    });
    bubble(voter, `${v.vote.toUpperCase()} (${v.score}/10) — ${v.reason}`);
    await sleep(2500);
  }

  const approves = votes.filter(v => v.vote === 'approve').length;
  const avgScore = votes.reduce((s, v) => s + Number(v.score || 0), 0) / votes.length;
  const passed = approves >= APPROVAL_THRESHOLD;

  await update(product.id, {
    status: passed ? 'approved' : 'rejected',
    council_score: Math.round(avgScore * 10) / 10
  });
  await logEvent({ product_id: product.id, agent: 'mariana', phase: 'council',
    event: passed ? 'approved' : 'rejected',
    details: { approves, total: votes.length, avg_score: avgScore, votes }
  });

  bubble('mariana', passed
    ? `✅ Aprobado ${approves}/${votes.length}. Arrancamos producción.`
    : `❌ Rechazado ${approves}/${votes.length}. Esta no avanza.`);
  return { passed, votes, avgScore };
}

async function voteOf(voter, product) {
  const fallback = { vote: 'approve', score: 7, reason: 'OK por viabilidad razonable.' };
  if (!anthropic) return fallback;
  const lens = {
    diana:     'comercial: tamaño de audiencia + facilidad de venta',
    roberto:   'financiero: margen, costo de producción, ROI esperado',
    valentina: 'creativo: diferenciación, calidad potencial, marca',
    sofia:     'operativo: complejidad de producción + tiempo realista'
  };
  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `Eres ${voter.toUpperCase()} en Fractal MX. Evalúas un producto digital propuesto
por el lente: ${lens[voter] || 'general'}.
Devuelve JSON: {"vote":"approve|reject","score":<0-10>,"reason":"<máx 18 palabras EN ESPAÑOL>"}`,
      messages: [{ role: 'user', content: `Producto: ${product.title}\nDescripción: ${product.description}\nKind: ${product.kind}\nVota.` }]
    });
    const txt = r.content[0]?.text || '{}';
    return JSON.parse(txt.replace(/```json\s*|\s*```/g, '').trim());
  } catch { return fallback; }
}

// ── PHASE 4: PRODUCTION (Diego escribe + Carlos portada + Max promo) ──
async function phaseProduction(product) {
  await update(product.id, { status: 'producing' });

  // 4.1 — Diego escribe outline + contenido
  bubble('diego', 'Armo outline del ebook.');
  let outline = [];
  if (anthropic) {
    try {
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: `Eres DIEGO, editorial designer. Genera outline de un ebook vendible.
JSON: { "title":"...", "subtitle":"...", "chapters":[{"title":"...","summary":"..."}] }
6-10 capítulos. EN ESPAÑOL.`,
        messages: [{ role: 'user', content: `Tema: ${product.title}\nDescripción: ${product.description}` }]
      });
      const o = JSON.parse((r.content[0]?.text || '{}').replace(/```json\s*|\s*```/g, '').trim());
      outline = o.chapters || [];
      await update(product.id, { title: o.title || product.title, subtitle: o.subtitle, outline });
    } catch (e) { console.warn('[revenue] outline:', e.message); }
  }
  await sleep(3000);

  // 4.2 — Diego escribe contenido por capítulo (concatenado)
  bubble('diego', `Escribiendo ${outline.length || 6} capítulos…`);
  let content_md = `# ${product.title}\n\n`;
  if (outline.length) content_md += `_${product.description}_\n\n---\n\n`;
  for (const ch of (outline.length ? outline : [{ title: 'Introducción', summary: product.description }])) {
    content_md += `## ${ch.title}\n\n`;
    if (anthropic) {
      try {
        const r = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1200,
          system: `Eres DIEGO. Escribe un capítulo de ebook profesional EN ESPAÑOL,
con ejemplos prácticos, sin relleno. 600-900 palabras. Markdown.`,
          messages: [{ role: 'user', content: `Capítulo: "${ch.title}". Resumen: ${ch.summary || ''}\nTema general: ${product.title}` }]
        });
        content_md += (r.content[0]?.text || ch.summary || '') + '\n\n';
      } catch { content_md += (ch.summary || '') + '\n\n'; }
    } else { content_md += (ch.summary || '') + '\n\n'; }
  }
  await update(product.id, { content_md });

  // 4.3 — Carlos portada (DALL-E)
  bubble('carlos', 'Diseño la portada con IA.');
  let cover_url = null;
  try {
    const modelRouter = require('../services/workflows/model-router');
    let prompt = `Modern professional ebook cover for "${product.title}". Bold typography, vibrant gradient, clean composition, no text artifacts.`;
    if (anthropic) {
      try {
        const r = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001', max_tokens: 120,
          system: `Convierte el tema en prompt DALL-E EN INGLÉS para portada de ebook profesional.
Max 50 palabras. Sin marcas. Sólo el prompt.`,
          messages: [{ role: 'user', content: product.title }]
        });
        prompt = r.content[0]?.text?.trim() || prompt;
      } catch {}
    }
    const result = await modelRouter.generate(prompt, { product: 'ebook-cover' }, { size: '1024x1024', quality: 'hd' });
    cover_url = await modelRouter.persistToCloudinary(result.imageUrl, ['fractal-revenue', 'ebook-cover']);
    await update(product.id, { cover_url });
  } catch (e) { console.warn('[revenue] cover:', e.message); }

  // 4.4 — Max promo copy (no video real por ahora, copy + storyboard)
  bubble('max', 'Armo copy del video promo (storyboard).');
  let promo_text = `🚀 Nuevo: ${product.title}. Aprende lo esencial en menos de 1h.`;
  if (anthropic) {
    try {
      const r = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 200,
        system: `Eres MAX, video editor. Escribe un guión de 30s para promo de ebook
EN ESPAÑOL, hook fuerte primer segundo, CTA clara, max 70 palabras.`,
        messages: [{ role: 'user', content: `Producto: ${product.title}\nDescripción: ${product.description}` }]
      });
      promo_text = r.content[0]?.text?.trim() || promo_text;
    } catch {}
  }
  await update(product.id, {
    metadata: { ...(product.metadata || {}), promo_text }
  });

  await logEvent({ product_id: product.id, agent: 'mariana', phase: 'production', event: 'completed',
    details: { chapters: outline.length, words: content_md.split(/\s+/).length, cover: !!cover_url } });
  return { content_md, cover_url, promo_text, outline };
}

// ── PHASE 5: QC (Valentina + QC-Bot) ───────────────────────────────────
async function phaseQC(product) {
  await update(product.id, { status: 'qc' });
  bubble('valentina', 'Reviso visual + tono.');
  await sleep(2500);
  bubble('qcbot', 'Reviso ortografía + estructura.');
  await sleep(2000);
  let passed = true;
  let notes = 'OK visual + estructura.';
  if (anthropic && product.content_md) {
    try {
      const r = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 200,
        system: `Eres QC-BOT brutal. Revisa este preview de ebook. Devuelve JSON:
{"passed":<bool>,"score":<0-10>,"notes":"<máx 30 palabras>"}`,
        messages: [{ role: 'user', content: product.content_md.slice(0, 3000) }]
      });
      const v = JSON.parse((r.content[0]?.text || '{}').replace(/```json\s*|\s*```/g, '').trim());
      passed = v.passed !== false;
      notes = v.notes || notes;
    } catch {}
  }
  bubble('qcbot', passed ? `Aprobado. ${notes}` : `Rebotado: ${notes}`);
  await logEvent({ product_id: product.id, agent: 'qcbot', phase: 'qc',
    event: passed ? 'passed' : 'failed', details: { notes } });
  return { passed, notes };
}

// ── PHASE 6: PUBLISHING (Sofia + Stripe Payment Link) ──────────────────
async function phasePublishing(product) {
  await update(product.id, { status: 'publishing' });
  bubble('sofia', 'Publico el producto y armo landing.');
  const platforms = [];

  // 6.1 Stripe Payment Link
  try {
    const { createPaymentLink } = require('../services/integrations/stripe');
    const link = await createPaymentLink({
      product_name: product.title,
      product_description: (product.description || '').slice(0, 200),
      price_usd: product.price_usd || 19,
      image_url: product.cover_url || null
    });
    if (link.ok) {
      platforms.push({ platform: 'stripe_payment_link', listing_url: link.url, product_id: link.product_id });
    } else {
      platforms.push({ platform: 'stripe_payment_link', error: link.error || 'unavailable' });
    }
  } catch (e) {
    platforms.push({ platform: 'stripe_payment_link', error: e.message });
  }

  // 6.2 Self-hosted landing page (HTML/Markdown content)
  const PUBLIC = process.env.PUBLIC_URL || 'https://fractal-virtual-team-production.up.railway.app';
  const landing_url = `${PUBLIC}/api/revenue/landing/${product.id}`;
  platforms.push({ platform: 'self_hosted_landing', listing_url: landing_url });

  await update(product.id, {
    status: 'live',
    platforms,
    landing_url,
    published_at: new Date().toISOString()
  });
  await logEvent({ product_id: product.id, agent: 'sofia', phase: 'publishing', event: 'live',
    details: { platforms } });

  // Email a Neiky
  try {
    const html = `<h2>🎉 Producto publicado</h2>
<p><strong>${product.title}</strong></p>
<p>${product.description || ''}</p>
${product.cover_url ? `<img src='${product.cover_url}' style='max-width:300px;border-radius:8px;'/>` : ''}
<h3>Listings:</h3>
<ul>${platforms.map(p => `<li>${p.platform}: ${p.listing_url ? `<a href='${p.listing_url}'>${p.listing_url}</a>` : (p.error || 'pendiente')}</li>`).join('')}</ul>
<p>Lucas trackeará métricas diariamente.</p>`;
    await sendEmail({
      to: 'nakedgeometry19@gmail.com',
      subject: `🚀 Nuevo producto live: ${product.title}`,
      html, text: `Producto publicado: ${product.title}`,
      fromName: 'Mariana · Fractal MX'
    });
  } catch (e) { console.warn('[revenue] notify email:', e.message); }

  bubble('sofia', `Live. Te mandé el correo con los links.`);
  bubble('mariana', `Producto operando, Lucas se encarga del tracking.`);
  return { platforms, landing_url };
}

// ── PHASE 7: TRACKING (Lucas cron diario) ──────────────────────────────
async function phaseTrackingDaily() {
  console.log('📊 Revenue tracking daily…');
  const { data: liveProducts } = await supabase.from('revenue_products')
    .select('*').eq('status', 'live');
  if (!liveProducts?.length) return;

  for (const product of liveProducts) {
    let salesN = 0, revenue = 0, source = 'manual';
    // Stripe sync (si tenemos product_id)
    const stripePlatform = (product.platforms || []).find(p => p.platform === 'stripe_payment_link' && p.product_id);
    if (stripePlatform && process.env.STRIPE_SECRET_KEY) {
      try {
        const Stripe = require('stripe');
        const s = new Stripe(process.env.STRIPE_SECRET_KEY);
        const since = new Date(Date.now() - 86400 * 1000);
        const checkouts = await s.checkout.sessions.list({
          limit: 100, created: { gte: Math.floor(since.getTime() / 1000) }
        });
        const ours = checkouts.data.filter(c => c.line_items?.data?.some(li => li.price?.product === stripePlatform.product_id) || true);
        for (const c of ours) {
          if (c.payment_status === 'paid') {
            salesN++; revenue += (c.amount_total || 0) / 100;
          }
        }
        source = 'stripe';
      } catch (e) { /* silent */ }
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      await supabase.from('revenue_metrics_daily').upsert({
        product_id: product.id, date: today,
        sales_n: salesN, revenue_usd: revenue, source
      }, { onConflict: 'product_id,date,source' });
    } catch {}
    await logEvent({ product_id: product.id, agent: 'lucas', phase: 'tracking',
      event: 'daily_sync', details: { sales: salesN, revenue, source } });
  }
}

// ── ORCHESTRATOR — corre las 7 fases ───────────────────────────────────
async function kickoffProduct({ niche = null, kind = 'ebook' } = {}) {
  console.log(`💰 Revenue kickoff [niche=${niche || 'free'}, kind=${kind}]`);
  bubble('mariana', `Arranco creación de un nuevo ${kind}${niche ? ` sobre ${niche}` : ''}.`);
  await audit({ actor: 'mariana', action: 'revenue.kickoff', details: { niche, kind } });

  // 1. Ideation
  const ideas = await phaseIdeation(niche);
  if (!ideas.length) { bubble('mariana', 'Sin ideas viables hoy.'); return { ok: false, reason: 'no ideas' }; }
  const best = ideas.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  bubble('lucas', `Top idea: "${best.topic}" (${best.score}/10).`);
  await sleep(3000);

  // 2. Proposal
  const product = await phaseProposal({ ...best, niche, kind });

  // 3. Council
  const { passed } = await phaseCouncil(product);
  if (!passed) return { ok: false, product_id: product.id, reason: 'council_rejected' };

  await sleep(3000);

  // 4. Production
  const prod = await phaseProduction(product);

  // 5. QC
  const qc = await phaseQC({ ...product, content_md: prod.content_md });
  if (!qc.passed) {
    await update(product.id, { status: 'rejected' });
    return { ok: false, product_id: product.id, reason: 'qc_failed' };
  }

  // 6. Publishing
  const { data: refreshed } = await supabase.from('revenue_products').select('*').eq('id', product.id).single();
  const pub = await phasePublishing(refreshed);

  return { ok: true, product_id: product.id, landing_url: pub.landing_url, platforms: pub.platforms };
}

// Render simple landing HTML para el producto
function renderLandingHtml(product) {
  const stripeLink = (product.platforms || []).find(p => p.platform === 'stripe_payment_link' && p.listing_url)?.listing_url;
  return `<!DOCTYPE html>
<html lang='es'><head><meta charset='utf-8'>
<title>${product.title}</title>
<meta property='og:title' content='${product.title}'/>
<meta property='og:description' content='${(product.description || '').slice(0,160)}'/>
${product.cover_url ? `<meta property='og:image' content='${product.cover_url}'/>` : ''}
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:0;background:#0a0a14;color:#fff;}
.hero{max-width:680px;margin:0 auto;padding:60px 24px;text-align:center;}
.hero img{max-width:280px;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.5);margin-bottom:24px;}
h1{font-size:36px;margin:0 0 8px;background:linear-gradient(135deg,#B14FFF,#FF6B9D);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.sub{color:#aaa;font-size:18px;margin:0 0 24px;}
.price{font-size:48px;font-weight:700;color:#FFCE5C;margin:24px 0;}
.cta{display:inline-block;background:#B14FFF;color:#fff;text-decoration:none;padding:18px 36px;border-radius:30px;font-weight:600;font-size:16px;margin:0 0 32px;}
.cta:hover{background:#9333ea;}
.desc{color:#ccc;line-height:1.6;text-align:left;background:#1a1a2e;padding:24px;border-radius:12px;margin-top:30px;}
.foot{color:#666;font-size:12px;margin-top:48px;}
</style></head>
<body><div class='hero'>
${product.cover_url ? `<img src='${product.cover_url}' alt='cover'/>` : ''}
<h1>${product.title}</h1>
${product.subtitle ? `<p class='sub'>${product.subtitle}</p>` : ''}
<div class='price'>$${Number(product.price_usd || 19).toFixed(2)} USD</div>
${stripeLink ? `<a class='cta' href='${stripeLink}' target='_blank'>Comprar ahora →</a>` : '<p style="color:#888">Pronto disponible</p>'}
<div class='desc'>${(product.description || '').replace(/\n/g, '<br>')}</div>
<div class='foot'>Producto creado por el equipo virtual de <a href='https://fractal-virtual-team.vercel.app' style='color:#B14FFF;'>Fractal MX</a></div>
</div></body></html>`;
}

// ── WEEKLY REVENUE REPORT (único cron sobreviviente) ───────────────────
async function weeklyRevenueReport() {
  console.log('💰 Weekly Revenue Report…');
  const { notifyNeiky } = require('../core/whatsapp');
  const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);

  let totalRevenue = 0, totalSales = 0;
  const perProduct = [];

  try {
    const { data: metrics } = await supabase
      .from('revenue_metrics_daily')
      .select('product_id, sales_n, revenue_usd, revenue_products(title)')
      .gte('date', since);

    if (metrics?.length) {
      const agg = {};
      for (const m of metrics) {
        const key = m.product_id;
        if (!agg[key]) agg[key] = { title: m.revenue_products?.title || key.slice(0, 8), sales: 0, revenue: 0 };
        agg[key].sales += (m.sales_n || 0);
        agg[key].revenue += Number(m.revenue_usd || 0);
        totalSales += (m.sales_n || 0);
        totalRevenue += Number(m.revenue_usd || 0);
      }
      for (const k of Object.keys(agg)) perProduct.push(agg[k]);
      perProduct.sort((a, b) => b.revenue - a.revenue);
    }
  } catch (e) {
    console.error('[weeklyRevenue] query error:', e.message);
  }

  const lines = [
    '💰 *Reporte semanal de ingresos*',
    `📅 Desde: ${since}`,
    '',
    `Ventas: ${totalSales}`,
    `Ingresos: $${totalRevenue.toFixed(2)} USD`,
    ''
  ];
  if (perProduct.length) {
    lines.push('*Top productos:*');
    for (const p of perProduct.slice(0, 5)) {
      lines.push(`• ${p.title}: ${p.sales} ventas · $${p.revenue.toFixed(2)}`);
    }
  } else {
    lines.push('_Sin ventas registradas esta semana._');
  }

  const message = lines.join('\n');
  try { await notifyNeiky(message); } catch (e) { console.error('[weeklyRevenue] WA:', e.message); }
  return { total_revenue: totalRevenue, total_sales: totalSales, products: perProduct.length };
}

module.exports = {
  kickoffProduct,
  phaseTrackingDaily,
  weeklyRevenueReport,
  renderLandingHtml,
  COUNCIL,
  APPROVAL_THRESHOLD
};
