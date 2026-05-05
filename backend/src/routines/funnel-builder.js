// backend/src/routines/funnel-builder.js
// Funnel completo por nicho: lead magnet (free) → tripwire ($9) → core ($47)
// → upsell ($197) → subscription ($29/mo). Todos cross-promovidos, todos
// generados por agentes, publicados en landings hosteadas por nosotros.

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../core/supabase');
const { sendEmail } = require('../core/email');
const { wrapAnthropic, audit } = require('../core/telemetry');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? wrapAnthropic(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }))
  : null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const bubble = (slug, text) => {
  try { global.io?.emit('chat_bubble', { agent: slug, text: String(text).slice(0, 240), kind: 'funnel', ts: Date.now() }); } catch {}
};

// Plantilla de productos por funnel
const FUNNEL_RECIPE = [
  { role: 'lead_magnet',  kind: 'template',     price: 0,    title_pattern: 'Mini-template: {topic} (gratis)',     desc: 'Un PDF/Notion gratis a cambio del email.' },
  { role: 'tripwire',     kind: 'template',     price: 9,    title_pattern: '{topic} starter kit',                  desc: 'Tripwire low-friction tras lead magnet.' },
  { role: 'core',         kind: 'ebook',        price: 47,   title_pattern: '{topic}: Guía completa 2027',          desc: 'El producto principal del funnel.' },
  { role: 'upsell',       kind: 'mini_course',  price: 197,  title_pattern: 'Masterclass: dominar {topic}',          desc: 'Curso premium con módulos+videos.' },
  { role: 'subscription', kind: 'newsletter',   price: 29,   title_pattern: '{topic} weekly briefing',              recurring: 'month', desc: 'Newsletter semanal premium.' }
];

async function generateNicheStrategy(niche) {
  const fallback = {
    audience: `Profesionales del nicho ${niche || 'libre'}`,
    positioning: 'Solucionamos el problema más común con un sistema claro.',
    topics: ['estrategia', 'herramientas', 'casos de éxito']
  };
  if (!anthropic) return fallback;
  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `Eres un super estratega de productos digitales. Define la estrategia
de un funnel completo para un nicho. Devuelve JSON SOLO:
{
  "audience": "<descripción específica del avatar>",
  "positioning": "<frase ganadora 1 línea>",
  "core_topic": "<tema central que une los 5 productos>",
  "lead_magnet_topic": "<tema super específico del freebie>",
  "core_problem": "<el dolor que resolvemos>",
  "tone": "<voz: directa | educativa | provocadora | aspiracional>"
}`,
      messages: [{ role: 'user', content: `Nicho: ${niche || 'libre'}` }]
    });
    return JSON.parse((r.content[0]?.text || '{}').replace(/```json\s*|\s*```/g, '').trim());
  } catch { return fallback; }
}

async function generateProductTitle(strategy, role, kind) {
  const fallback = `${strategy.core_topic || 'Producto'} — ${role}`;
  if (!anthropic) return fallback;
  try {
    const r = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: `Genera un TÍTULO ganador para producto digital. Específico, atractivo,
con números o promesas concretas si aplica. EN ESPAÑOL. Sólo el título, sin comillas.`,
      messages: [{ role: 'user', content: `Tema: ${strategy.core_topic}\nTipo: ${kind} (${role})\nAudiencia: ${strategy.audience}` }]
    });
    return r.content[0]?.text?.trim().replace(/^["']|["']$/g, '') || fallback;
  } catch { return fallback; }
}

async function generateEmailDrip(funnel) {
  const fallback = [
    { step: 1, delay_hours: 0,  subject: '¡Aquí está tu descarga!', body: 'Gracias por unirte. Aquí va el material.' },
    { step: 2, delay_hours: 24, subject: 'Cómo aplicarlo HOY mismo', body: 'Tres pasos concretos para empezar.' },
    { step: 3, delay_hours: 72, subject: 'Caso de éxito real', body: 'Quien aplicó esto consiguió X.' },
    { step: 4, delay_hours: 144,subject: '20% off solo por ser parte', body: 'Te invito al próximo nivel con descuento.' }
  ];
  if (!anthropic) return fallback;
  try {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `Eres ALEX, master copywriter de funnels. Genera secuencia de 4 emails
de nurture (welcome → educativo → social proof → soft pitch).
EN ESPAÑOL, tono: ${funnel.tone || 'directo cálido'}.
JSON SOLO (NO markdown):
[{"step":1,"delay_hours":0,"subject":"...","body_md":"..."},...]`,
      messages: [{ role: 'user', content: `Funnel: ${funnel.core_topic}\nAudiencia: ${funnel.audience}\nProducto core: ${funnel.core_product_title} (\$${funnel.core_price})` }]
    });
    const arr = JSON.parse((r.content[0]?.text || '[]').replace(/```json\s*|\s*```/g, '').trim());
    return arr.length ? arr : fallback;
  } catch { return fallback; }
}

async function generateBlogPosts(funnel, count = 3) {
  const out = [];
  if (!anthropic) return out;
  for (let i = 0; i < count; i++) {
    try {
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: `Eres ALEX, content creator. Escribe artículo SEO de blog 800-1200 palabras
sobre el nicho. Incluye: H1, intro hook, 3-4 secciones H2, conclusión con CTA al producto principal.
JSON SOLO (NO markdown):
{"title":"...","slug":"...","meta_desc":"<160 chars max>","body_md":"<artículo completo en markdown>"}`,
        messages: [{ role: 'user', content: `Nicho: ${funnel.core_topic}\nAudiencia: ${funnel.audience}\nVariante #${i + 1}: enfoque distinto a artículos previos.` }]
      });
      const post = JSON.parse((r.content[0]?.text || '{}').replace(/```json\s*|\s*```/g, '').trim());
      if (post.title && post.body_md) out.push(post);
    } catch (e) { console.warn('[funnel] blog:', e.message); }
  }
  return out;
}

async function buildFunnel({ niche, fast = false }) {
  console.log(`🎯 Building funnel — niche: ${niche || 'auto'}`);
  bubble('mariana', `Arranco un funnel completo${niche ? ` de ${niche}` : ''} con 5 productos.`);
  await audit({ actor: 'mariana', action: 'funnel.kickoff', details: { niche, fast } });

  // 1. Estrategia
  bubble('lucas', 'Defino audiencia + positioning.');
  const strategy = await generateNicheStrategy(niche);
  await sleep(2500);

  // 2. Crear funnel row
  const { data: funnel, error: fErr } = await supabase.from('funnels').insert({
    niche, audience: strategy.audience, positioning: strategy.positioning, status: 'building'
  }).select().single();
  if (fErr) throw new Error(fErr.message);

  bubble('mariana', `Audiencia: ${(strategy.audience || '').slice(0, 60)}…`);
  await sleep(2500);

  // 3. Crear los 5 productos del funnel
  const products = [];
  for (const recipe of FUNNEL_RECIPE) {
    const title = await generateProductTitle(strategy, recipe.role, recipe.kind);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    const { data: prod } = await supabase.from('revenue_products').insert({
      kind: recipe.kind, niche, topic: strategy.core_topic,
      title, description: recipe.desc, price_usd: recipe.price,
      status: fast ? 'producing' : 'proposed',
      funnel_id: funnel.id, funnel_role: recipe.role, slug,
      recurring_interval: recipe.recurring || null
    }).select().single();
    if (prod) {
      products.push(prod);
      bubble(getOwner(recipe.role), `Creando "${title.slice(0, 40)}…" ($${recipe.price})`);
      await sleep(1500);
    }
  }

  // 4. Email drip de nurture
  bubble('alex', 'Escribo secuencia de email nurture (4 emails).');
  const drips = await generateEmailDrip({
    ...strategy,
    core_product_title: products.find(p => p.funnel_role === 'core')?.title,
    core_price: products.find(p => p.funnel_role === 'core')?.price_usd
  });
  for (const d of drips) {
    await supabase.from('email_drips').insert({
      funnel_id: funnel.id, step: d.step, delay_hours: d.delay_hours || 24,
      subject: d.subject, html: (d.body_md || d.body || '').replace(/\n/g, '<br>')
    });
  }
  bubble('alex', `Drip de ${drips.length} emails listo.`);
  await sleep(2000);

  // 5. Blog posts SEO (3 artículos)
  bubble('diego', 'Escribo 3 artículos SEO para atraer tráfico.');
  const posts = await generateBlogPosts(strategy, 3);
  for (const p of posts) {
    await supabase.from('blog_posts').insert({
      funnel_id: funnel.id,
      slug: p.slug || p.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80),
      title: p.title, meta_desc: p.meta_desc, body_md: p.body_md,
      status: 'published', published_at: new Date().toISOString()
    });
  }
  bubble('diego', `${posts.length} artículos publicados.`);

  // 6. Generar covers para los 5 productos (en paralelo)
  bubble('carlos', 'Diseño portadas IA para los 5 productos.');
  const modelRouter = (() => { try { return require('../services/workflows/model-router'); } catch { return null; } })();
  if (modelRouter) {
    await Promise.allSettled(products.map(async p => {
      try {
        const result = await modelRouter.generate(
          `Modern professional ${p.kind} cover, "${p.title}", bold typography, vibrant gradient, clean composition`,
          { product: p.id }, { size: '1024x1024', quality: 'hd' }
        );
        const url = await modelRouter.persistToCloudinary(result.imageUrl, ['fractal-funnel', funnel.id]);
        await supabase.from('revenue_products').update({ cover_url: url }).eq('id', p.id);
      } catch (e) { /* silent */ }
    }));
  }

  // 7. Marcar live + Stripe links para los pagados
  for (const p of products) {
    if (p.price_usd > 0) {
      try {
        const { createPaymentLink } = require('../services/integrations/stripe');
        const link = await createPaymentLink({
          product_name: p.title,
          product_description: p.description?.slice(0, 200),
          price_usd: p.price_usd,
          image_url: p.cover_url
        });
        if (link.ok) {
          await supabase.from('revenue_products').update({
            platforms: [{ platform: 'stripe_payment_link', listing_url: link.url, product_id: link.product_id }],
            status: 'live', published_at: new Date().toISOString(),
            landing_url: `${process.env.PUBLIC_URL || 'https://fractal-virtual-team-production.up.railway.app'}/api/revenue/landing/${p.id}`
          }).eq('id', p.id);
        }
      } catch (e) { /* silent */ }
    } else {
      // Lead magnet — landing page solo
      await supabase.from('revenue_products').update({
        status: 'live', published_at: new Date().toISOString(),
        landing_url: `${process.env.PUBLIC_URL || 'https://fractal-virtual-team-production.up.railway.app'}/api/revenue/landing/${p.id}`
      }).eq('id', p.id);
    }
  }

  await supabase.from('funnels').update({ status: 'live' }).eq('id', funnel.id);

  const PUBLIC = process.env.PUBLIC_URL || 'https://fractal-virtual-team-production.up.railway.app';
  const summary_html = `<h2>🎯 Funnel completo live</h2>
<p><strong>${strategy.core_topic}</strong></p>
<p>${strategy.audience}</p>
<h3>5 productos creados:</h3>
<ul>${products.map(p => `<li><strong>${p.funnel_role}</strong> — ${p.title} ($${p.price_usd})${p.recurring_interval ? '/' + p.recurring_interval : ''}<br/><a href='${PUBLIC}/api/revenue/landing/${p.id}'>${PUBLIC}/api/revenue/landing/${p.id}</a></li>`).join('')}</ul>
<h3>${drips.length} emails de nurture programados</h3>
<h3>${posts.length} artículos SEO publicados</h3>
<p>Lucas trackeará métricas diarias. Roberto te enviará P&L semanal.</p>`;
  try {
    await sendEmail({
      to: 'nakedgeometry19@gmail.com',
      subject: `🎯 Funnel live: ${strategy.core_topic}`,
      html: summary_html, text: `Funnel ${strategy.core_topic} live con ${products.length} productos`,
      fromName: 'Mariana · Fractal MX'
    });
  } catch {}

  bubble('mariana', `Funnel completo live. ${products.length} productos, ${drips.length} emails, ${posts.length} artículos.`);
  return {
    ok: true, funnel_id: funnel.id,
    products: products.map(p => ({ id: p.id, role: p.funnel_role, title: p.title, price: p.price_usd })),
    drips_count: drips.length, posts_count: posts.length
  };
}

function getOwner(role) {
  return ({
    lead_magnet: 'carlos', tripwire: 'diego', core: 'diego',
    upsell: 'valentina', subscription: 'alex'
  })[role] || 'mariana';
}

// Sender de email drip — corre cada hora vía cron
async function sendDueDrips() {
  // Buscar drips que aún no se enviaron a un suscriptor
  const { data: subs } = await supabase.from('subscribers').select('*').eq('status', 'active');
  if (!subs?.length) return { sent: 0 };
  let sent = 0;
  for (const sub of subs) {
    if (!sub.funnel_id) continue;
    const ageHours = (Date.now() - new Date(sub.created_at).getTime()) / 3_600_000;
    const { data: drips } = await supabase.from('email_drips')
      .select('*').eq('funnel_id', sub.funnel_id).eq('active', true).order('step');
    if (!drips?.length) continue;
    for (const d of drips) {
      if (ageHours < d.delay_hours) continue;
      const { data: alreadySent } = await supabase.from('email_drip_sent')
        .select('id').eq('subscriber_id', sub.id).eq('drip_id', d.id).maybeSingle();
      if (alreadySent) continue;
      try {
        await sendEmail({
          to: sub.email, subject: d.subject, html: d.html,
          text: (d.html || '').replace(/<[^>]+>/g, ''), fromName: 'Mariana · Fractal MX'
        });
        await supabase.from('email_drip_sent').insert({ subscriber_id: sub.id, drip_id: d.id });
        sent++;
      } catch (e) { /* silent */ }
    }
  }
  console.log(`📨 Drip sender: ${sent} emails enviados`);
  return { sent };
}

module.exports = { buildFunnel, sendDueDrips };
