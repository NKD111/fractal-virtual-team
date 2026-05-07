// backend/test-oracle.js
// Test de los 3 niveles del ORACLE Decision Engine
//
// Uso:
//   ANTHROPIC_API_KEY=sk-... node backend/test-oracle.js
//
// O con el .env en el repo:
//   node -r dotenv/config backend/test-oracle.js

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { oracleDecide, decideArteRechazado, decideBriefVago, decideProspectoCaliente } = require('./src/core/oracle-decision');

const SEP = '─'.repeat(60);

async function testNivel1_ArteRechazado() {
  console.log(`\n${SEP}`);
  console.log('TEST NIVEL 1 — Arte rechazado por QA (autónomo)');
  console.log(SEP);

  const brief = {
    id: 'test-brief-001',
    concepto: 'Post FIF 2025 — Convocatoria sede virtual',
    tipo_pieza: 'post_informativo',
    headline: 'Sede Virtual FIF 2025',
    publico_objetivo: 'Franquiciatarios, socios potenciales',
    cliente: 'FIF'
  };

  const decision = await decideArteRechazado(
    brief,
    'consistency',
    [
      'Logo FIF no visible en área de seguridad',
      'Tipografía usa Montserrat Light, brand guide requiere Montserrat Bold para headlines',
      'Paleta de color: fondo azul marino (#0A1A3B) incorrecto, debe ser (#0D2257)'
    ]
  );

  console.log('\n📋 DECISIÓN ORACLE:');
  console.log(`   Acción: ${decision.accion}`);
  console.log(`   Razón: ${decision.razon}`);
  console.log(`\n🎨 INSTRUCCIONES CARLOS:`);
  console.log(decision.mensaje_carlos || decision.instrucciones_agente || '(ninguna)');
  console.log(`\n📊 Meta: confianza=${decision.confianza}%, urgencia=${decision.urgencia}`);
  console.log(`   NKD notificada: ${decision.nkd_notificado || false}`);

  return decision;
}

async function testNivel1_BriefVago() {
  console.log(`\n${SEP}`);
  console.log('TEST NIVEL 1 — Brief vago de DIANA (autónomo)');
  console.log(SEP);

  const decision = await decideBriefVago(
    'Quiero algo chido para el evento de junio',
    'FIF',
    40
  );

  console.log('\n📋 DECISIÓN ORACLE:');
  console.log(`   Acción: ${decision.accion}`);
  console.log(`   Razón: ${decision.razon}`);
  if (decision.preguntas_cliente?.length) {
    console.log(`\n❓ Preguntas para el cliente:`);
    decision.preguntas_cliente.forEach((q, i) => console.log(`   ${i+1}. ${q}`));
  }
  if (decision.instrucciones_agente) {
    console.log(`\n🤖 Instrucciones agente:`);
    console.log(decision.instrucciones_agente);
  }
  console.log(`\n📊 Meta: confianza=${decision.confianza}%, nivel=${decision.nivel_usado}`);

  return decision;
}

async function testNivel2_ProspectoCaliente() {
  console.log(`\n${SEP}`);
  console.log('TEST NIVEL 2 — Prospecto caliente AXIOM (propone + notifica NKD)');
  console.log(SEP);

  const decision = await decideProspectoCaliente({
    nombre_empresa: 'TaqueriaHermanos CDMX',
    website: 'taqueriaHermanos.com.mx',
    industria: 'Restaurantes / Franquicias',
    score: 82,
    servicio_sugerido: 'Parrilla mensual de contenido',
    precio_sugerido: 800,
    mensaje_propuesto: 'Hola Hermanos 🌮, vi su cuenta y tienen presencia increíble...',
    timing: 'Próximo Día de Muertos — temporada alta para franquicias',
    puntos_debiles: ['Sin estrategia Instagram', 'No usan reels', 'Sin CTA en bio']
  });

  console.log('\n📋 DECISIÓN ORACLE:');
  console.log(`   Acción: ${decision.accion}`);
  console.log(`   Razón: ${decision.razon}`);
  console.log(`\n📱 Nota para NKD: ${decision.nota_para_nkd || '(ninguna)'}`);
  console.log(`   Requiere aprobación NKD: ${decision.requiere_aprobacion_nkd}`);
  console.log(`   NKD notificada: ${decision.nkd_notificado || false}`);
  if (decision.nkd_error) console.log(`   ⚠️  Error WhatsApp: ${decision.nkd_error}`);
  console.log(`\n📊 Meta: confianza=${decision.confianza}%, nivel=${decision.nivel_usado}`);

  return decision;
}

async function testNivel3_CambioAlcance() {
  console.log(`\n${SEP}`);
  console.log('TEST NIVEL 3 — Cambio de alcance (siempre escala a NKD)');
  console.log(SEP);

  const decision = await oracleDecide('cambio_alcance', {
    cliente: 'Luis Tendero / FIF',
    solicitud_original: 'Parrilla mensual 12 piezas a $600 USD/mes',
    solicitud_nueva: 'Agregar video reel mensual + stories diarias + gestión community manager',
    incremento_estimado: '$400-600 USD adicionales',
    motivo_cliente: 'Tienen evento grande en agosto y quieren más presencia'
  }, 3);

  console.log('\n📋 DECISIÓN ORACLE:');
  console.log(`   Acción: ${decision.accion}`);
  console.log(`   Razón: ${decision.razon}`);
  console.log(`\n👁 Nota para NKD: ${decision.nota_para_nkd || '(ninguna)'}`);
  console.log(`   Requiere aprobación NKD: ${decision.requiere_aprobacion_nkd}`);
  console.log(`   NKD notificada: ${decision.nkd_notificado || false}`);
  if (decision.nkd_error) console.log(`   ⚠️  Error WhatsApp: ${decision.nkd_error}`);
  console.log(`\n📊 Meta: confianza=${decision.confianza}%, urgencia=${decision.urgencia}`);
  if (decision.metricas_seguimiento?.length) {
    console.log(`\n📈 Métricas seguimiento:`);
    decision.metricas_seguimiento.forEach(m => console.log(`   • ${m}`));
  }

  return decision;
}

async function runAllTests() {
  console.log('🧠 ORACLE DECISION ENGINE — Test Suite v4.0');
  console.log('Fecha:', new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));

  const results = {};

  try {
    results.nivel1_arte = await testNivel1_ArteRechazado();
    console.log('\n✅ Nivel 1 (arte rechazado): OK');
  } catch (e) {
    console.error('\n❌ Nivel 1 (arte rechazado):', e.message);
  }

  try {
    results.nivel1_brief = await testNivel1_BriefVago();
    console.log('\n✅ Nivel 1 (brief vago): OK');
  } catch (e) {
    console.error('\n❌ Nivel 1 (brief vago):', e.message);
  }

  try {
    results.nivel2_prospecto = await testNivel2_ProspectoCaliente();
    console.log('\n✅ Nivel 2 (prospecto caliente): OK');
  } catch (e) {
    console.error('\n❌ Nivel 2 (prospecto caliente):', e.message);
  }

  try {
    results.nivel3_alcance = await testNivel3_CambioAlcance();
    console.log('\n✅ Nivel 3 (cambio alcance): OK');
  } catch (e) {
    console.error('\n❌ Nivel 3 (cambio alcance):', e.message);
  }

  console.log(`\n${SEP}`);
  console.log('RESUMEN');
  console.log(SEP);
  Object.entries(results).forEach(([k, v]) => {
    if (v) console.log(`✅ ${k} — confianza: ${v.confianza}%, nivel: ${v.nivel_usado}`);
    else    console.log(`❌ ${k} — falló`);
  });
  console.log('\n🏁 Tests completados');
}

runAllTests().catch(console.error);
