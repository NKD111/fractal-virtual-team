// backend/src/services/auditoria-digital.js
// BLOQUE O — Auditoría Digital Fractal MX
// Precio: $300 USD (básica) / $800 USD (completa con estrategia)
// Entrega: 72h básica / 5 días completa

const { chat } = require('../core/anthropic');
const { supabase } = require('../core/supabase');

/**
 * Genera análisis completo de la presencia digital de una empresa.
 *
 * @param {string} empresa_url - URL o nombre de la empresa
 * @param {object} opts - opciones adicionales
 * @param {string} opts.tipo - 'basica' | 'completa' (default: 'basica')
 * @param {string} opts.industria - industria o nicho
 * @param {string} opts.ciudad - ciudad (default: CDMX)
 * @returns {object} { auditoria: JSON, reporte_md: string }
 */
async function generarAuditoria(empresa_url, opts = {}) {
  const { tipo = 'basica', industria = 'no especificada', ciudad = 'CDMX' } = opts;

  console.log(`📊 [Auditoría] ${tipo}: ${empresa_url}`);

  const analysisPrompt = `Eres AXIOM + LUCAS de Fractal MX haciendo una auditoría digital profesional.

EMPRESA/URL: ${empresa_url}
INDUSTRIA: ${industria}
CIUDAD: ${ciudad}
TIPO DE AUDITORÍA: ${tipo.toUpperCase()} ($${tipo === 'basica' ? 300 : 800} USD)

ANALIZA:
1. Sitio web: velocidad (estimada), SEO básico, copy, CTA, diseño, mobile. Puntúa 1-10.
2. Redes sociales: Instagram (actividad, engagement estimado, calidad visual, frecuencia). Puntúa 1-10.
3. Facebook: actividad, ads activos en Meta Ads Library (estima si tiene). Puntúa 1-10.
4. Google My Business: reseñas, fotos, información completa. Puntúa 1-10.
5. Análisis vs competencia en ${ciudad}: menciona 2-3 competidores directos hipotéticos y cómo se comparan.
6. Puntuación global 0-100.
7. Top 5 problemas críticos (en orden de impacto).
8. Quick Wins: 3 acciones que pueden implementar en 2 semanas sin Fractal.
${tipo === 'completa' ? `9. Estrategia de contenido 3 meses (temas por mes, mix de formatos, frecuencia recomendada).
10. Roadmap de crecimiento digital 6 meses.
11. Proyección de resultados si contratan Fractal MX.` : ''}
12. Propuesta de servicio Fractal MX más apropiado con precio y justificación.

Responde SOLO en JSON válido:
{
  "empresa": "...",
  "url": "...",
  "puntuacion_global": 0,
  "areas": {
    "web": { "score": 0, "hallazgos": "...", "problemas": [] },
    "instagram": { "score": 0, "hallazgos": "...", "problemas": [] },
    "facebook": { "score": 0, "hallazgos": "...", "problemas": [] },
    "google_mybusiness": { "score": 0, "hallazgos": "...", "problemas": [] },
    "competencia": { "comparativa": "...", "posicion": "..." }
  },
  "top5_problemas": ["..."],
  "quick_wins": ["..."],
  ${tipo === 'completa' ? '"estrategia_3_meses": "...", "roadmap_6_meses": "...", "proyeccion": "...",' : ''}
  "propuesta_fractal": {
    "servicio": "...",
    "precio_usd": 0,
    "justificacion": "...",
    "resultado_esperado": "...",
    "tiempo_resultados": "..."
  },
  "semaforo": {
    "web": "rojo|amarillo|verde",
    "redes": "rojo|amarillo|verde",
    "seo": "rojo|amarillo|verde",
    "ads": "rojo|amarillo|verde"
  }
}`;

  let auditoria;
  try {
    const response = await chat({
      messages: [{ role: 'user', content: analysisPrompt }],
      model: 'claude-sonnet-4-6',
      max_tokens: 4000
    });
    const raw = (response.content || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    auditoria = JSON.parse(raw);
  } catch (err) {
    console.error('[Auditoría] análisis error:', err.message);
    throw new Error(`Auditoría falló: ${err.message}`);
  }

  // Generar reporte en Markdown para PDF
  const reporte_md = `# Auditoría Digital — ${auditoria.empresa}
## Fractal MX | ${new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}

---

## Puntuación Global: ${auditoria.puntuacion_global}/100

### Semáforo de Areas
| Area | Puntuación | Estado |
|------|-----------|--------|
| Sitio Web | ${auditoria.areas?.web?.score || '?'}/10 | ${auditoria.semaforo?.web || '?'} |
| Instagram | ${auditoria.areas?.instagram?.score || '?'}/10 | ${auditoria.semaforo?.redes || '?'} |
| Facebook | ${auditoria.areas?.facebook?.score || '?'}/10 | — |
| Google My Business | ${auditoria.areas?.google_mybusiness?.score || '?'}/10 | — |

---

## Top 5 Problemas Críticos
${(auditoria.top5_problemas || []).map((p, i) => `${i + 1}. ${p}`).join('\n')}

---

## Quick Wins (implementables en 2 semanas)
${(auditoria.quick_wins || []).map((w, i) => `${i + 1}. ${w}`).join('\n')}

${tipo === 'completa' && auditoria.estrategia_3_meses ? `
---

## Estrategia de Contenido 3 Meses
${auditoria.estrategia_3_meses}

## Roadmap de Crecimiento 6 Meses
${auditoria.roadmap_6_meses || ''}
` : ''}

---

## Propuesta Fractal MX
**Servicio recomendado:** ${auditoria.propuesta_fractal?.servicio}
**Precio:** $${auditoria.propuesta_fractal?.precio_usd} USD
**Resultados esperados:** ${auditoria.propuesta_fractal?.resultado_esperado}
**Tiempo de resultados:** ${auditoria.propuesta_fractal?.tiempo_resultados}

---

*Auditoría generada por Fractal MX — fractalmx.com*`;

  // Guardar como prospecto si URL parece ser una empresa real
  try {
    await supabase.from('prospects').upsert({
      nombre_empresa: auditoria.empresa || empresa_url,
      website: empresa_url,
      industria,
      ciudad,
      score: auditoria.propuesta_fractal?.precio_usd > 500 ? 60 : 40,
      analisis_web: String(auditoria.areas?.web?.score || 0) + '/10',
      puntos_debiles: (auditoria.top5_problemas || []).slice(0, 3).join(' | '),
      servicio_sugerido: auditoria.propuesta_fractal?.servicio,
      precio_sugerido: auditoria.propuesta_fractal?.precio_usd,
      status: 'auditoria_generada'
    }, { onConflict: 'website' });
  } catch (_) {}

  console.log(`✅ [Auditoría] ${tipo} completada: ${auditoria.empresa} — score=${auditoria.puntuacion_global}`);
  return { auditoria, reporte_md, tipo };
}

module.exports = { generarAuditoria };
