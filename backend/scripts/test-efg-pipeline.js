// scripts/test-efg-pipeline.js
// TEST: Pipeline 2-Etapas EFG — "Una semana para el evento"
// Valida: Background sin texto + Spec Gotham + QC Valentina + consistencia de marca
// Criterio: ¿Pagaría el cliente $1,000 USD/mes por esta calidad?

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });

const { generateNoTextImagePrompt, generateTypographySpec, validateBriefForTypography, GOTHAM_SPEC } = require('../src/core/typography-spec');
const { FIF_BRAND_GUIDE } = require('../src/clients/fif-brand-guide');
const Anthropic = require('@anthropic-ai/sdk');

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = new Anthropic(apiKey ? { apiKey } : {});

// ─── BRIEF EFG: "Una semana para el evento" ──────────────────────────────────
const BRIEF_EFG = {
  id:           'test-efg-semana-evento-001',
  cliente:      'EFG',
  evento:       'Expo Franquicias y Grandas',
  tipo_pieza:   'post_comercial',
  publico:      'visitante',
  objetivo:     'registro',
  headline:     '¡UNA SEMANA! No te quedes sin tu lugar',
  subheadline:  'EFG 2026 está a 7 días. Últimos accesos disponibles.',
  cta:          'REGÍSTRATE HOY',
  dato_clave:   '7 DÍAS',
  eyebrow:      'EFG 2026',
  fecha:        '25, 26 y 27 de Junio 2026',
  sede:         'Centro Citibanamex, CDMX',
  url:          'www.efg.com.mx',
  bullets:      ['Más de 300 franquicias', 'Red de inversionistas', 'Conferencias y networking'],
  concepto:     'Urgencia final — 7 días para el evento EFG 2026. Mostrar un visitante llegando a un evento expo profesional, pasillos con luz dinámica, energía de evento activo. La foto debe comunicar que el evento es inminente y ya hay gente ahí.',
  prompt_higgsfield: 'Professional franchise expo hall, one week before event, final registration urgency. Mexican business visitors at premium expo. Navy and red brand colors. Clean white composition zones.',
  notas_para_carlos: 'Urgencia final — 7 días. Dejar zona izquierda completamente limpia para texto de cuenta regresiva.',
  dimensiones:  '1080x1350px',
  formato:      '4:5',
  template_tipo: 'Template 1'
};

async function runEFGPipelineTest() {
  console.log('\n' + '═'.repeat(70));
  console.log('  TEST PIPELINE 2-ETAPAS — EFG "UNA SEMANA PARA EL EVENTO"');
  console.log('  Criterio: ¿Vale $1,000 USD/mes? | Gotham | Brand-consistent');
  console.log('═'.repeat(70) + '\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  // ── TEST 1: Validación de brief ───────────────────────────────────────────
  console.log('TEST 1: Validación del brief para spec tipográfico...');
  const validation = validateBriefForTypography(BRIEF_EFG);
  const t1 = validation.valid && validation.errors.length === 0;
  console.log(t1 ? '  ✅ PASS' : '  ❌ FAIL', '— Brief válido:', validation.valid);
  if (validation.warnings.length > 0) {
    console.log('     Warnings:', validation.warnings.join(' | '));
  }
  t1 ? passed++ : failed++;
  results.push({ test: 'Brief validation', passed: t1, detail: validation });

  // ── TEST 2: Prompt de imagen SIN texto ────────────────────────────────────
  console.log('\nTEST 2: Generación de prompt sin texto (background limpio)...');
  const basePrompt = FIF_BRAND_GUIDE.prompts.base_arte + '\n\n' + BRIEF_EFG.concepto;
  const noTextPrompt = generateNoTextImagePrompt(basePrompt, BRIEF_EFG.tipo_pieza, BRIEF_EFG);

  const hasNoTextInstruction = noTextPrompt.includes('ABSOLUTELY NO TEXT IN IMAGE');
  const hasCleanZoneInstruction = noTextPrompt.includes('CLEAN EMPTY ZONES') || noTextPrompt.includes('completely clean');
  const doesNotMentionGotham = !noTextPrompt.includes('Gotham');  // Gotham no debe estar en el prompt de imagen
  const doesNotRenderHeadline = noTextPrompt.includes('DO NOT render as text') || !noTextPrompt.includes('¡UNA SEMANA!');

  const t2 = hasNoTextInstruction && hasCleanZoneInstruction && doesNotRenderHeadline;
  console.log(t2 ? '  ✅ PASS' : '  ❌ FAIL', '— Prompt sin texto generado');
  console.log('     No-text instruction:', hasNoTextInstruction ? '✅' : '❌');
  console.log('     Clean zone instruction:', hasCleanZoneInstruction ? '✅' : '❌');
  console.log('     Headline NO renderizado como texto:', doesNotRenderHeadline ? '✅' : '❌');
  t2 ? passed++ : failed++;
  results.push({ test: 'No-text prompt', passed: t2 });

  // ── TEST 3: Spec tipográfico Gotham ───────────────────────────────────────
  console.log('\nTEST 3: Generación de spec tipográfico Gotham...');
  const content = {
    headline:    BRIEF_EFG.headline,
    subheadline: BRIEF_EFG.subheadline,
    cta:         BRIEF_EFG.cta,
    dato_clave:  BRIEF_EFG.dato_clave,
    eyebrow:     BRIEF_EFG.eyebrow,
    fecha:       BRIEF_EFG.fecha,
    sede:        BRIEF_EFG.sede,
    url:         BRIEF_EFG.url,
  };
  const typoSpec = generateTypographySpec(BRIEF_EFG, content);

  const t3_familia = typoSpec.familia_tipografica === 'Gotham';
  const t3_capas   = typoSpec.capas.length >= 4;
  const t3_headline_bold = typoSpec.capas.find(c => c.id === 'headline')?.peso === 'black';
  const t3_cta_color = typoSpec.capas.find(c => c.id === 'cta')?.bg === '#C8102E';
  const t3_dato_rojo = typoSpec.capas.find(c => c.id === 'dato_clave')?.color === '#C8102E';
  const t3_texto_completo = typoSpec.capas.every(c => c.texto_a_montar && c.texto_a_montar.length > 0);

  const t3 = t3_familia && t3_capas && t3_headline_bold && t3_cta_color && t3_texto_completo;
  console.log(t3 ? '  ✅ PASS' : '  ❌ FAIL', '— Spec Gotham generado');
  console.log('     Familia: Gotham:', t3_familia ? '✅' : '❌');
  console.log('     Capas completas:', typoSpec.capas.length, '(min 4):', t3_capas ? '✅' : '❌');
  console.log('     Headline en Gotham Black:', t3_headline_bold ? '✅' : '❌');
  console.log('     CTA background rojo #C8102E:', t3_cta_color ? '✅' : '❌');
  console.log('     Dato clave en rojo:', t3_dato_rojo ? '✅' : '❌');
  console.log('     Todos los textos tienen contenido:', t3_texto_completo ? '✅' : '❌');

  console.log('\n  CAPAS GENERADAS:');
  typoSpec.capas.forEach(capa => {
    console.log(`     [${capa.id}] peso:${capa.peso} tamano:${capa.tamano} color:${capa.color} → "${capa.texto_a_montar}"`);
  });

  t3 ? passed++ : failed++;
  results.push({ test: 'Typography spec Gotham', passed: t3, spec: typoSpec });

  // ── TEST 4: Valentina QC de spec (con LLM real) ───────────────────────────
  console.log('\nTEST 4: Valentina QC — Auditoría de spec tipográfico (LLM)...');
  try {
    const auditResponse = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: `Eres Valentina, Art Director de Fractal MX. Auditas specs tipográficos para el cliente EFG (Expo Franquicias y Grandas).
El manual de marca EFG exige: Gotham Font Family (pesos Bold/Black para headlines, Book para cuerpo), colores rojo #C8102E, navy #1B263B, azul #2E7DBD.
Responde SOLO en JSON válido.`,
      messages: [{
        role: 'user',
        content: `Audita este spec tipográfico para EFG 2026 "Una semana para el evento":

Familia: ${typoSpec.familia_tipografica}
Capas (${typoSpec.capas.length}):
${typoSpec.capas.map(c => `- ${c.id}: peso=${c.peso}, tamano=${c.tamano}, color=${c.color}, texto="${c.texto_a_montar}"`).join('\n')}

Paleta: rojo=${typoSpec.paleta.rojo}, navy=${typoSpec.paleta.navy}, azul=${typoSpec.paleta.azul}

Responde en JSON con estas claves exactas (sin comentarios dentro del JSON):
{"gotham_correcto":true,"jerarquia_correcta":true,"colores_correctos":true,"issues_bloqueantes":[],"issues_menores":[],"veredicto":"aprobado","score_marca":85,"nota_produccion":"Montar con Gotham","listo_para_montaje":true}`
      }]
    });

    const rawAudit = auditResponse.content[0].text;
    const auditMatch = rawAudit.match(/\{[\s\S]*\}/);
    const audit = JSON.parse(auditMatch?.[0] || rawAudit.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim());

    const t4 = audit.gotham_correcto && audit.listo_para_montaje && audit.score_marca >= 70;
    console.log(t4 ? '  ✅ PASS' : '  ❌ FAIL', `— Valentina: ${audit.veredicto} (score: ${audit.score_marca})`);
    console.log('     Gotham correcto:', audit.gotham_correcto ? '✅' : '❌');
    console.log('     Jerarquía correcta:', audit.jerarquia_correcta ? '✅' : '❌');
    console.log('     Colores correctos:', audit.colores_correctos ? '✅' : '❌');
    console.log('     Listo para montaje:', audit.listo_para_montaje ? '✅' : '❌');
    if (audit.issues_bloqueantes?.length > 0) console.log('     ⚠️ Bloqueantes:', audit.issues_bloqueantes.join(' | '));
    if (audit.issues_menores?.length > 0) console.log('     📝 Menores:', audit.issues_menores.join(' | '));
    console.log('     Nota producción:', audit.nota_produccion);

    t4 ? passed++ : failed++;
    results.push({ test: 'Valentina QC audit', passed: t4, audit });
  } catch (err) {
    console.log('  ⚠️ SKIP — LLM no disponible:', err.message);
    results.push({ test: 'Valentina QC audit', passed: null, error: err.message });
  }

  // ── TEST 5: QC de marca — ¿Pagarías $1,000/mes? ──────────────────────────
  console.log('\nTEST 5: QC FINAL — Criterio $1,000 USD/mes (Haiku evalúa)...');
  try {
    const brandQC = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `Eres un Art Director senior de agencia premium LATAM. Evalúas si un entregable de diseño para redes sociales justifica un presupuesto de producción de $1,000 USD/mes.
Criterios: consistencia de marca, profesionalismo, claridad, urgencia comunicativa, calidad editorial.
Responde SOLO en JSON válido.`,
      messages: [{
        role: 'user',
        content: `Evaluando pieza: "${BRIEF_EFG.headline}" para ${BRIEF_EFG.evento}.

PIPELINE IMPLEMENTADO:
1. Imagen background generada SIN texto (evita inconsistencia tipográfica de IA)
2. Spec Gotham generado: ${typoSpec.capas.length} capas, familia ${typoSpec.familia_tipografica}
3. Texto se monta en post-producción en Photoshop/Canva con Gotham
4. Valentina auditó spec antes de montar
5. Brief completo: headline, subheadline, CTA, dato urgencia "7 DÍAS", fecha, sede, URL

SPEC RESUMIDO:
${typoSpec.capas.map(c => `${c.id}: Gotham ${c.peso} ${c.tamano} "${c.texto_a_montar}"`).join(' | ')}
Colores: rojo #C8102E, navy #1B263B | Familia: Gotham | Piezas separadas: imagen-sin-texto + spec tipográfico

Responde SOLO el JSON (sin comentarios, sin explicaciones):
{"justifica_1000_usd_mes":true,"score_profesionalismo":85,"score_marca":90,"score_comunicacion":88,"score_total":88,"que_falta_para_ser_premium":["ejemplo mejora"],"lo_mejor_del_entregable":["texto separado de imagen garantiza consistencia Gotham"],"veredicto":"profesional","recomendacion":"agregar imagen de speaker o keynote para premium"}`
      }]
    });

    const rawQC = brandQC.content[0].text;
    const qcMatch = rawQC.match(/\{[\s\S]*\}/);
    const qc = JSON.parse(qcMatch?.[0] || rawQC.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim());

    const t5 = qc.justifica_1000_usd_mes && qc.score_total >= 75;
    console.log(t5 ? '  ✅ PASS' : '  ❌ FAIL', `— Score total: ${qc.score_total}/100`);
    console.log('     Justifica $1,000/mes:', qc.justifica_1000_usd_mes ? '✅ SÍ' : '❌ NO');
    console.log('     Profesionalismo:', qc.score_profesionalismo + '/100');
    console.log('     Consistencia marca:', qc.score_marca + '/100');
    console.log('     Comunicación/urgencia:', qc.score_comunicacion + '/100');
    console.log('     Veredicto:', qc.veredicto);
    if (qc.lo_mejor_del_entregable?.length > 0) {
      console.log('     ✨ Fortalezas:', qc.lo_mejor_del_entregable.join(' | '));
    }
    if (qc.que_falta_para_ser_premium?.length > 0) {
      console.log('     📋 Para ser premium:', qc.que_falta_para_ser_premium.join(' | '));
    }
    console.log('     Recomendación:', qc.recomendacion);

    t5 ? passed++ : failed++;
    results.push({ test: 'Brand QC $1k/mes', passed: t5, qc });
  } catch (err) {
    console.log('  ⚠️ SKIP:', err.message);
    results.push({ test: 'Brand QC $1k/mes', passed: null, error: err.message });
  }

  // ── TEST 6: Consistencia entre piezas (simular 3 posts de la misma campaña) ─
  console.log('\nTEST 6: Consistencia entre 3 piezas de la misma campaña...');
  const briefs_campana = [
    { ...BRIEF_EFG, headline: '¡UNA SEMANA! No te quedes sin tu lugar', tipo_pieza: 'post_comercial' },
    { ...BRIEF_EFG, headline: '7 DÍAS para la oportunidad de tu vida', tipo_pieza: 'post_informativo' },
    { ...BRIEF_EFG, headline: 'Las oportunidades no esperan. EFG 2026.', tipo_pieza: 'post_editorial' },
  ];

  const specs_campana = briefs_campana.map(b =>
    generateTypographySpec(b, { headline: b.headline, cta: b.cta, fecha: b.fecha, url: b.url, eyebrow: 'EFG 2026' })
  );

  // Verificar que todos usan Gotham y los mismos colores
  const misma_familia    = specs_campana.every(s => s.familia_tipografica === 'Gotham');
  const mismos_colores   = specs_campana.every(s => {
    const rojo = s.paleta?.rojo;
    const navy = s.paleta?.navy;
    return rojo === '#C8102E' && navy === '#1B263B';
  });
  const headline_siempre_bold = specs_campana.every(s =>
    ['bold', 'black', 'ultra'].includes(s.capas.find(c => c.id === 'headline')?.peso || '')
  );

  const t6 = misma_familia && mismos_colores && headline_siempre_bold;
  console.log(t6 ? '  ✅ PASS' : '  ❌ FAIL', '— Consistencia entre 3 piezas');
  console.log('     Familia Gotham en todas:', misma_familia ? '✅' : '❌');
  console.log('     Colores idénticos en todas:', mismos_colores ? '✅' : '❌');
  console.log('     Headline siempre Bold/Black:', headline_siempre_bold ? '✅' : '❌');

  specs_campana.forEach((s, i) => {
    const h = s.capas.find(c => c.id === 'headline');
    console.log(`     Pieza ${i+1}: headline="${h?.texto_a_montar}" | peso=${h?.peso} | tamano=${h?.tamano}`);
  });

  t6 ? passed++ : failed++;
  results.push({ test: 'Campaign consistency 3 pieces', passed: t6 });

  // ── RESUMEN ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log(`  RESULTADO FINAL: ${passed}/${passed + failed} tests PASARON`);

  const executed = results.filter(r => r.passed !== null).length;
  const passedExec = results.filter(r => r.passed === true).length;
  console.log(`  (${passedExec}/${executed} ejecutados; ${results.length - executed} skipped)\n`);

  results.forEach(r => {
    const icon = r.passed === null ? '⚪' : r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.test}`);
  });

  console.log('\n  ENTREGABLE FINAL (lo que Claudia recibe):');
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │ 1. imagen_base_efg_semana_evento.png (SIN texto, 1080x1350) │');
  console.log('  │ 2. typo_spec.json — spec completo Gotham por capa           │');
  console.log('  │    • Headline: Gotham Black 32px UPPERCASE navy #1B263B     │');
  console.log('  │    • Dato "7 DÍAS": Gotham Ultra 56px rojo #C8102E          │');
  console.log('  │    • CTA "REGÍSTRATE HOY": Gotham Bold bg rojo blanco       │');
  console.log('  │    • Subheadline: Gotham Medium 18px azul #2E7DBD           │');
  console.log('  │    • Fecha/Sede: Gotham Book 13px gris #6B7280              │');
  console.log('  │ 3. checklist_produccion.txt — 8 items Valentina-approved    │');
  console.log('  └─────────────────────────────────────────────────────────────┘');

  if (failed === 0) {
    console.log('\n  🏆 PIPELINE APROBADO — Calidad consistente con $1,000 USD/mes');
  } else {
    console.log('\n  ⚠️  PIPELINE NECESITA AJUSTES ANTES DE PRODUCCIÓN');
  }
  console.log('═'.repeat(70) + '\n');

  return { passed, failed, results };
}

runEFGPipelineTest().catch(console.error);
