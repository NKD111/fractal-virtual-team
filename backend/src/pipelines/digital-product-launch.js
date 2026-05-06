// backend/src/pipelines/digital-product-launch.js
// BLOQUE J — Pipeline paralelo de productos digitales
// Insight Jesús Orozco: no esperar al PDF para hacer marketing.
// ALEX genera contenido de redes EN PARALELO mientras se diseña el PDF.

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');
const higgsfield = require('../core/higgsfield-client');
const { chat } = require('../core/anthropic');

// ─── Catálogo de productos ────────────────────────────────────────────────────
const PRODUCTOS = [
  {
    id: 'p1',
    nombre: 'Agentes IA para Agencias',
    descripcion: 'Cómo construir un equipo de IA que trabaja mientras duermes.',
    precio_pdf: 47,
    precio_bundle: 97,
    archivo_md: `${process.env.HOME || '/root'}/claude-eye/products/p1_agentes_ia/content.md`,
    nicho: 'agencias creativas, diseñadores, marketers LATAM',
    cta: 'Deja de hacer todo tú. Construye tu equipo IA.'
  },
  {
    id: 'p2',
    nombre: 'Prompts que Convierten',
    descripcion: '100 prompts probados para creativos, marketers y agencias.',
    precio_pdf: 37,
    precio_bundle: 77,
    archivo_md: `${process.env.HOME || '/root'}/claude-eye/products/p2_prompts/content.md`,
    nicho: 'freelancers, diseñadores, copywriters LATAM',
    cta: 'Deja de improvisar. Usa los prompts que ya funcionan.'
  },
  {
    id: 'p3',
    nombre: 'Propuesta Ganadora con IA',
    descripcion: 'Sistema para cerrar clientes premium usando IA.',
    precio_pdf: 47,
    precio_bundle: 97,
    archivo_md: `${process.env.HOME || '/root'}/claude-eye/products/p3_propuesta/content.md`,
    nicho: 'agencias, consultores, freelancers con clientes B2B',
    cta: 'La propuesta que cierra sola. Construida con IA.'
  },
  {
    id: 'p4',
    nombre: 'WhatsApp Business con IA',
    descripcion: 'Automatiza tu WhatsApp Business con agentes IA. Sin código.',
    precio_pdf: 37,
    precio_bundle: 77,
    archivo_md: `${process.env.HOME || '/root'}/claude-eye/products/p4_whatsapp/content.md`,
    nicho: 'dueños de negocio, agencias, ecommerce LATAM',
    cta: 'Tu WhatsApp trabaja solo. Tú cierras ventas.'
  },
  {
    id: 'p5',
    nombre: 'Kit Social Media con IA',
    descripcion: 'Genera un mes de contenido en 2 horas usando IA.',
    precio_pdf: 37,
    precio_bundle: 77,
    archivo_md: `${process.env.HOME || '/root'}/claude-eye/products/p5_social/content.md`,
    nicho: 'community managers, marcas personales, agencias',
    cta: 'Un mes de contenido. 2 horas. IA.'
  }
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateCover(producto) {
  const prompt = `Professional premium ebook cover for digital product.
Title concept: "${producto.nombre}".
Style: Fractal MX brand — navy #1B263B and institutional red #C8102E.
Clean, minimal, high contrast. Bold modern typography placeholder area.
Abstract geometric patterns suggesting AI/technology.
No photos of people. Professional gradient background.
Suitable for PDF ebook cover. Looks like a $50+ product.
Aspect ratio: 2:3 (portrait). Premium quality.`;

  try {
    const result = await higgsfield.generateImage(prompt, {
      model: 'gpt_image_2',
      aspectRatio: '2:3',
      quality: '2k'
    });
    return result.resultUrl;
  } catch (err) {
    console.warn(`[Pipeline] cover gpt_image_2 falló (${err.message}), usando nano_banana_2`);
    try {
      const fallback = await higgsfield.generateImage(prompt, {
        model: 'nano_banana_2',
        aspectRatio: '2:3',
        quality: '2k'
      });
      return fallback.resultUrl;
    } catch (_) {
      return null;
    }
  }
}

async function generatePreLaunchContent(producto, cantidad = 5) {
  const prompt = `Eres ALEX, el content creator de Fractal MX.
Genera ${cantidad} posts de pre-lanzamiento para el producto:

PRODUCTO: "${producto.nombre}"
DESCRIPCIÓN: ${producto.descripcion}
NICHO: ${producto.nicho}
CTA BASE: ${producto.cta}
PRECIO: $${producto.precio_pdf} USD

Estilo: educativo + aspiracional, NO venta directa todavía.
Es pre-lanzamiento — construir anticipación y lista.
Cada post máximo 200 palabras.
Tono: directo CDMX, sin relleno, útil.

Responde en JSON: { "posts": [ { "numero": 1, "tipo": "educativo|behind|dato|pregunta|gancho", "copy": "...", "hashtags": ["..."], "cta_leve": "..." } ] }`;

  try {
    const response = await chat({
      messages: [{ role: 'user', content: prompt }],
      model: 'claude-sonnet-4-6',
      max_tokens: 3000
    });
    const raw = (response.content || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(raw).posts || [];
  } catch (err) {
    console.warn('[Pipeline] generatePreLaunchContent error:', err.message);
    return [];
  }
}

async function generateEmailSequence(producto) {
  const prompt = `Eres ALEX. Genera secuencia de 5 emails de lanzamiento para:

PRODUCTO: "${producto.nombre}"
DESCRIPCIÓN: ${producto.descripcion}
PRECIO: $${producto.precio_pdf} USD

Email 1 (día 0): teaser / qué viene
Email 2 (día 2): el problema que resuelve
Email 3 (día 4): la solución + preview del contenido
Email 4 (día 6): apertura de ventas / urgencia
Email 5 (día 9): last call / bonus

Responde en JSON: { "emails": [ { "dia": 0, "asunto": "...", "preview": "...", "cuerpo": "..." } ] }`;

  try {
    const response = await chat({
      messages: [{ role: 'user', content: prompt }],
      model: 'claude-sonnet-4-6',
      max_tokens: 4000
    });
    const raw = (response.content || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(raw).emails || [];
  } catch (err) {
    console.warn('[Pipeline] generateEmailSequence error:', err.message);
    return [];
  }
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

/**
 * Lanza un producto digital con pipeline paralelo.
 * Pipeline A: portada + PDF spec (requiere NEIKY para el PDF final)
 * Pipeline B: contenido de marketing en paralelo desde el inicio
 *
 * @param {object|string} productoOrId - objeto producto o ID ('p1'-'p5')
 * @returns {object} resultados de ambos pipelines
 */
async function launchProducto(productoOrId) {
  const producto = typeof productoOrId === 'string'
    ? PRODUCTOS.find(p => p.id === productoOrId)
    : productoOrId;

  if (!producto) throw new Error(`Producto no encontrado: ${productoOrId}`);

  console.log(`🚀 [Pipeline] Iniciando lanzamiento: "${producto.nombre}"`);

  // ── Pipeline A: Assets visuales (portada + spec PDF) ──────────────────────
  const pipelineA = async () => {
    const cover = await generateCover(producto);

    // Guardar spec en Supabase para referencia
    const spec = {
      producto_id: producto.id,
      nombre: producto.nombre,
      precio_pdf: producto.precio_pdf,
      precio_bundle: producto.precio_bundle,
      cover_url: cover,
      archivo_md: producto.archivo_md,
      status: 'portada_lista',
      notas: 'PDF pendiente de diseño manual en Canva/PS. Cover generado con GPT Image 2.'
    };

    try {
      await supabase.from('digital_products_sales').upsert({
        producto: producto.nombre,
        tipo: 'ebook',
        precio_usd: 0, // se actualiza con ventas reales
        plataforma: 'gumroad',
        cliente_email: 'spec_pendiente@fractalmx.com'
      });
    } catch (_) {}

    return { cover_url: cover, spec };
  };

  // ── Pipeline B: Marketing (corre en paralelo) ──────────────────────────────
  const pipelineB = async () => {
    const [posts, emails] = await Promise.all([
      generatePreLaunchContent(producto, 5),
      generateEmailSequence(producto)
    ]);
    return { posts, emails };
  };

  // Ejecutar EN PARALELO
  const [resultA, resultB] = await Promise.allSettled([pipelineA(), pipelineB()]);

  const coverUrl = resultA.status === 'fulfilled' ? resultA.value?.cover_url : null;
  const posts = resultB.status === 'fulfilled' ? resultB.value?.posts : [];
  const emails = resultB.status === 'fulfilled' ? resultB.value?.emails : [];

  const report = `🎉 Pipeline Producto: ${producto.nombre}

📸 Portada: ${coverUrl ? '✅ generada' : '❌ falló'}
📱 Posts pre-lanzamiento: ${posts.length} posts listos
📧 Secuencia emails: ${emails.length} emails listos

💰 Precio: $${producto.precio_pdf} USD (PDF) / $${producto.precio_bundle} USD (Bundle)

⏭️ PRÓXIMOS PASOS:
1. Diseñar PDF final en Canva/PS usando la portada generada
2. Subir PDF a Gumroad + configurar Stripe
3. Publicar posts de pre-lanzamiento (uno por día)
4. Activar secuencia de emails
5. Configurar env var: GUMROAD_${producto.id.toUpperCase()}_URL`;

  try {
    await notifyNeiky(report);
  } catch (_) {}

  console.log(`✅ [Pipeline] "${producto.nombre}" lanzado — portada=${!!coverUrl}, posts=${posts.length}, emails=${emails.length}`);

  return {
    success: true,
    producto: producto.nombre,
    cover_url: coverUrl,
    posts,
    emails,
    precio_pdf: producto.precio_pdf,
    precio_bundle: producto.precio_bundle
  };
}

/**
 * Lanza todos los productos en paralelo.
 * Usar con cuidado — consume créditos de Higgsfield y tokens de Claude.
 */
async function launchAllProductos() {
  console.log('🚀 [Pipeline] Lanzando los 5 productos en paralelo...');
  const results = await Promise.allSettled(PRODUCTOS.map(p => launchProducto(p)));

  const summary = results.map((r, i) => ({
    producto: PRODUCTOS[i].nombre,
    success: r.status === 'fulfilled' ? r.value.success : false,
    error: r.status === 'rejected' ? r.reason?.message : null
  }));

  const ok = summary.filter(s => s.success).length;
  console.log(`✅ [Pipeline] ${ok}/${PRODUCTOS.length} productos procesados`);

  return { summary, total: PRODUCTOS.length, exitosos: ok };
}

module.exports = { launchProducto, launchAllProductos, PRODUCTOS };
