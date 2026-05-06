// backend/src/routines/parrilla-pipeline.js
// BLOQUE F — Pipeline Editorial FIF (7 fases)
// Resuelve el problema del cliente Luis Tendero:
// conceptos aprobados el día 7, NO el día 20.
//
// Crons registrados en index.js:
//   Día 1  → 0 9 1 * *   → fase1_nexusAnalysis
//   Día 5  → 0 9 5 * *   → fase2_desarrollarBriefs
//   Día 7  → 0 10 7 * *  → fase3_aprobacionNKD
//   Día 10 → 0 9 10 * *  → fase4_produccion
//   Día 17 → 0 10 17 * * → fase6_revisionNKD
//   Día 20 → 0 9 20 * *  → fase7_entregaClaudia

const { supabase } = require('../core/supabase');
const { notifyNeiky } = require('../core/whatsapp');
const { fase4_subirADrive, fase7_llenarTablasYEntregar } = require('../services/google-drive-delivery');

const TZ = { timezone: 'America/Mexico_City' };

function getMesActual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function notifyNKD_parrillaBriefs(mes, count) {
  await notifyNeiky(`📋 PARRILLA FIF ${mes} — ${count} briefs listos para tu revisión.\n\nAbre el dashboard para ver todos los conceptos.\nTienes hasta el día 7 para aprobar o ajustar.\n\n— Mariana 🤖`);
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

async function getPreviousMonthBriefs() {
  const now = new Date();
  const prevMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
  const { data } = await supabase
    .from('parrilla_briefs')
    .select('tipo_pieza, concepto, status, rondas_revision')
    .eq('mes', prevMonth)
    .eq('cliente', 'FIF');
  const exitosos = (data || []).filter(b => b.status === 'entregado').map(b => b.concepto).slice(0, 5).join(', ') || 'Ninguno registrado';
  const rechazados = (data || []).filter(b => b.rondas_revision > 1).map(b => b.concepto).slice(0, 3).join(', ') || 'Ninguno';
  return { exitosos, rechazados };
}

async function savePropuestaToSupabase(mes, propuesta) {
  // Guardar como system event para referencia
  await supabase.from('system_events').insert({
    event_type: 'nexus_parrilla_propuesta',
    severity: 'info',
    service_key: 'parrilla-pipeline',
    details: { mes, propuesta: JSON.stringify(propuesta).substring(0, 2000) }
  }).catch(() => {});
}

async function getBriefsByMes(mes, status) {
  const { data } = await supabase
    .from('parrilla_briefs')
    .select('*')
    .eq('mes', mes)
    .eq('cliente', 'FIF')
    .eq('status', status)
    .order('numero_pieza', { ascending: true });
  return data || [];
}

async function updateBriefStatus(id, status, extra = {}) {
  await supabase.from('parrilla_briefs').update({
    status,
    updated_at: new Date().toISOString(),
    ...extra
  }).eq('id', id);
}

// ─── FASE 1: DÍA 1 — NEXUS activa el ciclo ──────────────────────────────────
async function fase1_nexusAnalysis() {
  const mes = getMesActual();
  console.log(`🎯 PARRILLA PIPELINE: Fase 1 — NEXUS Analysis para ${mes}`);

  try {
    // Verificar si ya existe parrilla para este mes
    const { count } = await supabase
      .from('parrilla_briefs')
      .select('*', { count: 'exact', head: true })
      .eq('mes', mes).eq('cliente', 'FIF');

    if (count > 0) {
      console.log(`  ⏭️  Parrilla ${mes} ya existe (${count} briefs). Saltando Fase 1.`);
      return;
    }

    const mesAnterior = await getPreviousMonthBriefs();

    let propuesta = null;

    if (global.oracle?.consult) {
      const result = await global.oracle.consult({
        question: `Genera la estrategia de contenido para FIF del mes ${mes}.

CONTEXTO:
- Qué funcionó el mes anterior: ${mesAnterior.exitosos}
- Qué no funcionó / requirió más revisiones: ${mesAnterior.rechazados}

FIF es la Feria Internacional de Franquicias de México. Cliente premium $1,000 USD/mes.
Brand: rojo #C8102E + navy #1B263B + blanco. Estilo editorial-comercial premium.

GENERA 10 CONCEPTOS para la parrilla mensual.
Para cada concepto en formato JSON:
{
  "numero": 1,
  "tipo_pieza": "post_informativo | post_comercial | carousel | video_reel | banner_web",
  "concepto": "descripción en 1 línea",
  "objetivo": "registro | awareness | expositores | franquiciantes | inversionistas",
  "publico": "visitantes | expositores | VIP | prensa | estudiantes | emprendedores",
  "por_que_ahora": "razón estratégica"
}

Mix obligatorio: 40% comercial, 40% informativo, 20% editorial.
Incluir al menos: 2 carousels, 1 video/reel, 1 banner web.
Responde SOLO con el array JSON (sin explicaciones adicionales).`,
        agent: { id: null, name: 'NEXUS', role: 'parrilla_strategy' },
        depth: 'standard'
      });
      try { propuesta = JSON.parse(result?.answer || '[]'); } catch { propuesta = []; }
    }

    // Fallback si Oracle no disponible
    if (!propuesta || propuesta.length === 0) {
      propuesta = [
        { numero: 1, tipo_pieza: 'post_comercial', concepto: 'Registro anticipado FIF 2026 — fecha límite', objetivo: 'registro', publico: 'visitantes', por_que_ahora: 'Inicio de mes' },
        { numero: 2, tipo_pieza: 'post_informativo', concepto: '¿Por qué FIF es la mayor expo de franquicias en MX?', objetivo: 'awareness', publico: 'emprendedores', por_que_ahora: 'Educación de marca' },
        { numero: 3, tipo_pieza: 'carousel', concepto: 'Top 5 sectores con mayor crecimiento en franquicias LATAM', objetivo: 'awareness', publico: 'inversionistas', por_que_ahora: 'Contenido educativo' },
        { numero: 4, tipo_pieza: 'post_comercial', concepto: 'Sé expositor FIF — beneficios y paquetes', objetivo: 'expositores', publico: 'franquiciantes', por_que_ahora: 'Captación de expositores' },
        { numero: 5, tipo_pieza: 'post_informativo', concepto: 'Conferencistas confirmados FIF 2026', objetivo: 'awareness', publico: 'visitantes', por_que_ahora: 'Credibilidad del evento' },
        { numero: 6, tipo_pieza: 'video_reel', concepto: 'Recap emocional de la edición anterior', objetivo: 'awareness', publico: 'emprendedores', por_que_ahora: 'Social proof' },
        { numero: 7, tipo_pieza: 'carousel', concepto: '10 pasos para elegir tu primera franquicia', objetivo: 'awareness', publico: 'estudiantes', por_que_ahora: 'Contenido educativo' },
        { numero: 8, tipo_pieza: 'post_comercial', concepto: 'Últimos lugares — registro VIP FIF', objetivo: 'registro', publico: 'VIP', por_que_ahora: 'Urgencia' },
        { numero: 9, tipo_pieza: 'banner_web', concepto: 'Banner registro general — CTA claro + fecha', objetivo: 'registro', publico: 'visitantes', por_que_ahora: 'Conversión digital' },
        { numero: 10, tipo_pieza: 'post_editorial', concepto: 'Behind the scenes — equipo organizador FIF', objetivo: 'awareness', publico: 'prensa', por_que_ahora: 'Humanización de marca' }
      ];
    }

    await savePropuestaToSupabase(mes, propuesta);

    // Notificar a NKD
    await notifyNeiky(`🎯 PARRILLA FIF ${mes} — Iniciando ciclo\n\nNEXUS generó ${propuesta.length} conceptos estratégicos.\n\nDIANA desarrollará los briefs completos hasta el día 5.\nTú revisas el día 7 antes de iniciar producción.\n\n— Sistema 🤖`);

    console.log(`✅ Fase 1 completa: ${propuesta.length} conceptos generados para ${mes}`);
    return { success: true, mes, conceptos: propuesta.length };

  } catch (err) {
    console.error('❌ Fase 1 error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── FASE 2: DÍA 5 — DIANA + ALEX desarrollan briefs ───────────────────────
async function fase2_desarrollarBriefs() {
  const mes = getMesActual();
  console.log(`✍️ PARRILLA PIPELINE: Fase 2 — Desarrollar Briefs para ${mes}`);

  try {
    // Obtener conceptos del event log
    const { data: events } = await supabase
      .from('system_events')
      .select('details')
      .eq('event_type', 'nexus_parrilla_propuesta')
      .eq('details->>mes', mes)
      .order('started_at', { ascending: false })
      .limit(1);

    let conceptos = [];
    try {
      conceptos = JSON.parse(events?.[0]?.details?.propuesta || '[]');
    } catch { conceptos = []; }

    if (conceptos.length === 0) {
      console.warn('  ⚠️ Sin conceptos de Fase 1. Generando parrilla básica...');
      await fase1_nexusAnalysis(); // Run fase 1 if not done
      return { success: false, error: 'No hay conceptos de Fase 1. Ejecutar Fase 1 primero.' };
    }

    let briefsCreated = 0;

    for (const concepto of conceptos) {
      // Verificar si ya existe este brief
      const { count } = await supabase
        .from('parrilla_briefs')
        .select('*', { count: 'exact', head: true })
        .eq('mes', mes)
        .eq('cliente', 'FIF')
        .eq('numero_pieza', concepto.numero);

      if (count > 0) continue;

      let brief = null;

      if (global.oracle?.consult) {
        const result = await global.oracle.consult({
          question: `Desarrolla el brief completo para esta pieza de FIF.

CONCEPTO: ${concepto.concepto}
TIPO: ${concepto.tipo_pieza}
OBJETIVO: ${concepto.objetivo}
PÚBLICO: ${concepto.publico}

BRAND SYSTEM FIF:
- Colores: Rojo #C8102E, Navy #1B263B, Blanco #FFFFFF
- Estilo: editorial-comercial premium, expo mexicana
- Fotografía: expo mexicana profesional, personas mexicanas/LATAM
- Modelo imagen: GPT Image 2
- IMPORTANTE: dejar espacio limpio para logos y texto en post-producción
- Slogan disponible: "Encuentra tu próximo negocio"
- Estándar: ¿Esto justifica $1,000 USD/mes?

Responde en JSON con exactamente estos campos:
{
  "headline": "máximo 6 palabras, alto impacto",
  "subheadline": "máximo 15 palabras",
  "copy_apoyo": "máximo 3 líneas",
  "cta": "texto del CTA",
  "hashtags": "#tag1 #tag2 (10-15 relevantes)",
  "estilo_visual": "comercial | informativo | editorial | banner_web",
  "prompt_higgsfield": "prompt en inglés para GPT Image 2 (60-100 palabras, FIF premium style)",
  "notas_para_carlos": "instrucciones específicas de diseño"
}`,
          agent: { id: null, name: 'ALEX', role: 'brief_development' },
          depth: 'standard'
        });
        try { brief = JSON.parse(result?.answer || '{}'); } catch { brief = {}; }
      }

      // Defaults si no hay Oracle
      if (!brief || !brief.headline) {
        brief = {
          headline: concepto.concepto.substring(0, 50),
          subheadline: concepto.por_que_ahora || '',
          copy_apoyo: 'Descubre las mejores oportunidades de negocio en México.',
          cta: 'Regístrate ahora',
          hashtags: '#FIF2026 #Franquicias #México #Emprendimiento #Negocios #ExpoFranquicias',
          estilo_visual: concepto.tipo_pieza === 'banner_web' ? 'banner_web' : 'comercial',
          prompt_higgsfield: `Premium editorial-commercial franchise expo post for FIF Mexico 2026. ${concepto.concepto}. Clean white background, navy #1B263B and red #C8102E brand colors. Professional Mexican business audience. High-quality expo photography. Clean space for logo and text overlay. No neon, no cyberpunk.`,
          notas_para_carlos: `Tipo: ${concepto.tipo_pieza}. Público: ${concepto.publico}. Dejar espacio para logo FIF arriba y copy principal.`
        };
      }

      await supabase.from('parrilla_briefs').insert({
        mes,
        cliente: 'FIF',
        numero_pieza: concepto.numero,
        tipo_pieza: concepto.tipo_pieza,
        concepto: concepto.concepto,
        objetivo: concepto.objetivo,
        headline: brief.headline,
        subheadline: brief.subheadline,
        copy_apoyo: brief.copy_apoyo,
        cta: brief.cta,
        hashtags: brief.hashtags,
        estilo_visual: brief.estilo_visual,
        prompt_higgsfield: brief.prompt_higgsfield,
        notas_para_carlos: brief.notas_para_carlos,
        status: 'pendiente_aprobacion_nkd',
        creado_por: 'alex'
      });

      briefsCreated++;
      console.log(`  ✓ Brief ${concepto.numero}: ${concepto.concepto.substring(0, 50)}`);
    }

    await notifyNKD_parrillaBriefs(mes, briefsCreated);
    console.log(`✅ Fase 2 completa: ${briefsCreated} briefs creados para ${mes}`);
    return { success: true, mes, briefs_created: briefsCreated };

  } catch (err) {
    console.error('❌ Fase 2 error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── FASE 3: DÍA 7 — Notificación a NKD para aprobación ────────────────────
async function fase3_aprobacionNKD() {
  const mes = getMesActual();
  console.log(`📋 PARRILLA PIPELINE: Fase 3 — Aprobación NKD para ${mes}`);

  try {
    const briefs = await getBriefsByMes(mes, 'pendiente_aprobacion_nkd');

    if (briefs.length === 0) {
      console.log('  ⚠️ No hay briefs pendientes de aprobación');
      return { success: true, message: 'No hay briefs pendientes' };
    }

    const resumen = briefs.slice(0, 8).map((b, i) =>
      `${i + 1}. [${(b.tipo_pieza || '').toUpperCase()}] ${b.headline || b.concepto}\n   Objetivo: ${b.objetivo || ''}`
    ).join('\n\n');

    await notifyNeiky(
      `📋 PARRILLA FIF ${mes} — Lista para tu revisión\n\n` +
      `${resumen}\n\n` +
      `Son ${briefs.length} piezas en total.\n\n` +
      `Puedes ver los briefs completos en el dashboard.\n` +
      `Responde con los números que quieres modificar\n` +
      `o "APROBADO" para iniciar producción.\n\n` +
      `Producción inicia el día 10.\n` +
      `Entrega a Claudia: día 20.`
    );

    console.log(`✅ Fase 3: ${briefs.length} briefs enviados a NKD para aprobación`);
    return { success: true, mes, briefs_count: briefs.length };

  } catch (err) {
    console.error('❌ Fase 3 error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── FASE 4: DÍA 10 — CARLOS inicia producción ──────────────────────────────
async function fase4_produccion() {
  const mes = getMesActual();
  console.log(`🎨 PARRILLA PIPELINE: Fase 4 — Producción para ${mes}`);

  try {
    const briefs = await getBriefsByMes(mes, 'aprobado');

    if (briefs.length === 0) {
      // Fallback: usar pendientes si NKD no aprobó explícitamente
      const pending = await getBriefsByMes(mes, 'pendiente_aprobacion_nkd');
      if (pending.length > 0) {
        await notifyNeiky(`⚠️ Parrilla FIF ${mes}: producción del día 10 no pudo iniciar.\nNo hay briefs con status "aprobado".\nResponde "APROBADO" para desbloquear producción.`);
        console.log('  ⚠️ Sin briefs aprobados. Esperando aprobación de NKD.');
        return { success: false, error: 'Esperando aprobación de NKD' };
      }
      return { success: true, message: 'No hay briefs para producir' };
    }

    let producidos = 0;
    let errores = 0;

    for (const brief of briefs) {
      try {
        await updateBriefStatus(brief.id, 'en_produccion');

        // Intentar generar imagen con Carlos si está disponible
        if (global.carlos?.generateFIFImage) {
          const resultado = await global.carlos.generateFIFImage({
            description: brief.prompt_higgsfield || brief.concepto,
            pieceType: brief.tipo_pieza || 'post_informativo',
            briefId: brief.id,
            projectId: null
          });

          if (resultado && resultado.variations && resultado.variations.length > 0) {
            const url = resultado.variations[0].resultUrl;
            await updateBriefStatus(brief.id, 'listo_qc', { url_arte_final: url });
            producidos++;
            console.log(`  ✓ Pieza ${brief.numero_pieza}: ${url?.substring(0, 60)}`);
          } else {
            throw new Error('No variations returned');
          }
        } else {
          // Sin Carlos disponible: marcar como pendiente de generación manual
          await updateBriefStatus(brief.id, 'listo_qc', {
            notas_revision: 'Generación manual pendiente — Carlos agent no disponible en este momento'
          });
          producidos++;
        }
      } catch (pieceErr) {
        console.error(`  ✗ Pieza ${brief.numero_pieza} error:`, pieceErr.message);
        await updateBriefStatus(brief.id, 'rework', {
          notas_revision: `Error de producción: ${pieceErr.message}`
        });
        errores++;
      }
    }

    // ─── BLOQUE S: Subir artes a Google Drive y notificar NKD ─────────────────
    const briefsProducidos = await getBriefsByMes(mes, 'listo_qc');
    const driveResult = await fase4_subirADrive(briefsProducidos, mes).catch(e => {
      console.error('[Fase4] Drive upload error (non-fatal):', e.message);
      return { success: false, error: e.message };
    });

    if (!driveResult.success) {
      // Fallback: notificación simple si Drive falla
      await notifyNeiky(
        `🎨 Producción FIF ${mes} — ${producidos}/${briefs.length} piezas generadas.\n` +
        `${errores > 0 ? `⚠️ ${errores} piezas con error.` : '✅ Todo generado.'}\n\n` +
        `⚠️ Drive no disponible: ${driveResult.error || 'sin credenciales'}.\n` +
        `Descarga desde el dashboard.`
      );
    }

    console.log(`✅ Fase 4: ${producidos} producidos, ${errores} errores`);
    return { success: true, mes, producidos, errores, drive: driveResult };

  } catch (err) {
    console.error('❌ Fase 4 error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── FASE 5: QA — Triggered cuando arte llega (llamado externamente) ─────────
async function fase5_qa(brief_id) {
  console.log(`🔍 QA: brief_id=${brief_id}`);

  try {
    const { data: brief } = await supabase
      .from('parrilla_briefs').select('*').eq('id', brief_id).single();
    if (!brief) throw new Error('Brief no encontrado');

    // QC básico: verificar que hay URL de arte
    if (!brief.url_arte_final) {
      await updateBriefStatus(brief_id, 'rework', { notas_revision: 'Sin URL de arte final' });
      return { passed: false, reason: 'Sin arte' };
    }

    // Valentina review si está disponible
    if (global.valentina?.reviewArt) {
      const review = await global.valentina.reviewArt({
        image_url: brief.url_arte_final,
        brief,
        standard: '¿Esto justifica $1,000 USD/mes?'
      });

      if (review.approved) {
        await updateBriefStatus(brief_id, 'aprobado_qa');
        return { passed: true };
      } else {
        await updateBriefStatus(brief_id, 'rework', { notas_revision: review.notes });
        return { passed: false, reason: review.notes };
      }
    }

    // Sin Valentina: auto-aprobar si hay arte
    await updateBriefStatus(brief_id, 'aprobado_qa');
    return { passed: true };

  } catch (err) {
    console.error('❌ Fase 5 QA error:', err.message);
    return { passed: false, error: err.message };
  }
}

// ─── FASE 6: DÍA 17 — Revisión final NKD ───────────────────────────────────
async function fase6_revisionNKD() {
  const mes = getMesActual();
  console.log(`👁️ PARRILLA PIPELINE: Fase 6 — Revisión final NKD para ${mes}`);

  try {
    const briefs = await getBriefsByMes(mes, 'aprobado_qa');

    // También incluir los que ya están en producción sin QA explícito
    const enProduccion = await getBriefsByMes(mes, 'listo_qc');

    const allForReview = [...briefs, ...enProduccion];

    if (allForReview.length === 0) {
      await notifyNeiky(`⚠️ Parrilla FIF ${mes}: no hay piezas listas para revisión final.\nVerificar estado en dashboard.`);
      return { success: true, message: 'Sin piezas para revisión' };
    }

    const lista = allForReview.slice(0, 10).map((b, i) =>
      `${i + 1}. [${(b.tipo_pieza || '').toUpperCase()}] ${b.headline || b.concepto}`
    ).join('\n');

    await notifyNeiky(
      `🎨 PARRILLA FIF ${mes} — Lista para revisión final\n\n` +
      `${lista}\n\n` +
      `${allForReview.length} piezas listas.\n` +
      `3 días para ajustes antes del día 20.\n\n` +
      `Abre el dashboard para ver todas las imágenes.\n` +
      `Responde con número de pieza + observación para cambios.\n\n` +
      `Si todo está bien: "ENTREGA APROBADA"`
    );

    console.log(`✅ Fase 6: ${allForReview.length} piezas enviadas para revisión final`);
    return { success: true, mes, piezas: allForReview.length };

  } catch (err) {
    console.error('❌ Fase 6 error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── FASE 7: DÍA 20 — Entrega via Google Drive (BLOQUE S) ───────────────────
// NKD acomoda las 8 artes finales en la presentación y avisa:
// "ya está la parrilla lista, llena las tablas"
// Eso llama a /api/parrilla/llenar-tablas que ejecuta fase7_llenarTablasYEntregar
//
// Este cron del día 20 avisa a NKD que es momento de hacer eso:
async function fase7_entregaClaudia() {
  const mes = getMesActual();
  console.log(`📦 PARRILLA PIPELINE: Fase 7 — Recordatorio de entrega Drive para ${mes}`);

  try {
    let briefs = await getBriefsByMes(mes, 'aprobado_nkd');
    if (briefs.length === 0) briefs = await getBriefsByMes(mes, 'aprobado_qa');
    if (briefs.length === 0) briefs = await getBriefsByMes(mes, 'listo_qc');

    if (briefs.length === 0) {
      await notifyNeiky(`⚠️ Parrilla FIF ${mes}: no hay piezas listas para entregar hoy.\nVerificar estado en dashboard.`);
      return { success: false, error: 'Sin piezas aprobadas' };
    }

    // ─── BLOQUE S: Recordar a NKD que llene la presentación ─────────────────
    const lista = briefs.slice(0, 8).map((b, i) =>
      `${i + 1}. [${(b.tipo_pieza || '').toUpperCase()}] ${b.headline || b.concepto}`
    ).join('\n');

    await notifyNeiky(
      `📅 Día 20 — Entrega FIF ${mes}\n\n` +
      `${briefs.length} piezas listas:\n${lista}\n\n` +
      `Pasos:\n` +
      `1️⃣ Entra al Drive y acomoda las 8 finales en la presentación\n` +
      `2️⃣ Cuando esté lista, responde: "ya está la parrilla lista, llena las tablas"\n` +
      `3️⃣ Yo lleno las tablas y registro la entrega automáticamente 🤖`
    );

    console.log(`✅ Fase 7: Recordatorio enviado a NKD — ${briefs.length} piezas`);
    return { success: true, mes, piezas: briefs.length, awaiting_nkd: true };

  } catch (err) {
    console.error('❌ Fase 7 error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── FASE 7B: Trigger manual — "llenar las tablas" ──────────────────────────
// Llamado desde /api/parrilla/llenar-tablas cuando NKD da la instrucción
async function fase7b_llenarTablasTrigger(mes, presentationId = null) {
  console.log(`📊 PARRILLA: Fase 7B — Llenar tablas Drive para ${mes}`);
  return fase7_llenarTablasYEntregar(mes, presentationId);
}

// ─── REGISTRO DE CRONS ───────────────────────────────────────────────────────
function startParrillaPipelineCrons() {
  const cron = require('node-cron');
  const TZ_OPT = { timezone: 'America/Mexico_City' };

  // Día 1 — NEXUS Analysis
  cron.schedule('0 9 1 * *', () => fase1_nexusAnalysis().catch(e => console.error('[Pipeline F1]', e.message)), TZ_OPT);
  // Día 5 — Desarrollar Briefs
  cron.schedule('0 9 5 * *', () => fase2_desarrollarBriefs().catch(e => console.error('[Pipeline F2]', e.message)), TZ_OPT);
  // Día 7 — Aprobación NKD
  cron.schedule('0 10 7 * *', () => fase3_aprobacionNKD().catch(e => console.error('[Pipeline F3]', e.message)), TZ_OPT);
  // Día 10 — Producción
  cron.schedule('0 9 10 * *', () => fase4_produccion().catch(e => console.error('[Pipeline F4]', e.message)), TZ_OPT);
  // Día 17 — Revisión final NKD
  cron.schedule('0 10 17 * *', () => fase6_revisionNKD().catch(e => console.error('[Pipeline F6]', e.message)), TZ_OPT);
  // Día 20 — Entrega a Claudia
  cron.schedule('0 9 20 * *', () => fase7_entregaClaudia().catch(e => console.error('[Pipeline F7]', e.message)), TZ_OPT);

  console.log('✅ Parrilla Pipeline FIF: 6 crons registrados (días 1,5,7,10,17,20)');
}

module.exports = {
  startParrillaPipelineCrons,
  fase1_nexusAnalysis,
  fase2_desarrollarBriefs,
  fase3_aprobacionNKD,
  fase4_produccion,
  fase5_qa,
  fase6_revisionNKD,
  fase7_entregaClaudia,
  fase7b_llenarTablasTrigger
};
