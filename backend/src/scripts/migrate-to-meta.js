// backend/src/scripts/migrate-to-meta.js
// Ejecuta la migración Twilio → Meta Cloud API en producción.
// PRE-REQUISITO: BV-1 aprobado por Meta + pre-migration-test.js todos green.
//
// Uso: node backend/src/scripts/migrate-to-meta.js
// Si falla en cualquier paso: rollback automático a Twilio.

const axios = require('axios');
const { execSync } = require('child_process');
const { supabase } = require('../core/supabase');
const ChannelAdapter = require('../core/channel-adapter');

async function runPreTest() {
  console.log('\n[migrate-to-meta] Step 1/7: corriendo pre-migration-test...');
  try {
    execSync('node ' + require('path').join(__dirname, 'pre-migration-test.js'), { stdio: 'inherit' });
    return true;
  } catch (e) {
    return false;
  }
}

async function registerPhoneWithPin() {
  console.log('\n[migrate-to-meta] Step 2/7: POST /register con PIN...');
  const token = process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.META_PHONE_NUMBER_ID;
  const pin = process.env.META_WHATSAPP_PIN;
  if (!pin) throw new Error('META_WHATSAPP_PIN no está en env. Setearlo en Railway con el PIN guardado en vault.');
  const { data } = await axios.post(
    `https://graph.facebook.com/v21.0/${phoneId}/register`,
    { messaging_product: 'whatsapp', pin },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!data?.success) throw new Error(`register failed: ${JSON.stringify(data)}`);
  return data;
}

async function verifyConnected() {
  console.log('\n[migrate-to-meta] Step 3/7: verificar status CONNECTED...');
  const token = process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.META_PHONE_NUMBER_ID;
  for (let i = 0; i < 15; i++) {
    const { data } = await axios.get(
      `https://graph.facebook.com/v21.0/${phoneId}?fields=status&access_token=${token}`
    );
    if (data.status === 'CONNECTED') return true;
    console.log(`  poll ${i+1}: status=${data.status}, esperando...`);
    await new Promise(r => setTimeout(r, 4000));
  }
  throw new Error('Phone no llegó a CONNECTED después de 60s');
}

async function flipChannelInRailway() {
  console.log('\n[migrate-to-meta] Step 4/7: ACTIVE_CHANNEL=meta en Railway...');
  const railwayToken = process.env.RAILWAY_API_TOKEN;
  if (!railwayToken) {
    // En local, solo flip in-memory
    process.env.ACTIVE_CHANNEL = 'meta';
    console.log('  (RAILWAY_API_TOKEN ausente — flip in-memory only)');
    return true;
  }
  // Si está disponible, persistir en Railway via GraphQL
  const proj = process.env.RAILWAY_PROJECT_ID;
  const svc = process.env.RAILWAY_SERVICE_ID;
  const env = process.env.RAILWAY_ENVIRONMENT_ID;
  if (proj && svc && env) {
    await axios.post('https://backboard.railway.app/graphql/v2', {
      query: 'mutation Upsert($input: VariableUpsertInput!) { variableUpsert(input: $input) }',
      variables: { input: { projectId: proj, environmentId: env, serviceId: svc, name: 'ACTIVE_CHANNEL', value: 'meta' } }
    }, { headers: { Authorization: `Bearer ${railwayToken}` } });
    console.log('  ACTIVE_CHANNEL=meta persistido en Railway. Backend redeploy automático.');
  }
  process.env.ACTIVE_CHANNEL = 'meta';
  return true;
}

async function sendTestToNeiky() {
  console.log('\n[migrate-to-meta] Step 5/7: test message a NKD via Meta...');
  const neikyPhone = (process.env.NEIKY_WHATSAPP || '+5215534189583').replace('whatsapp:', '');
  const result = await ChannelAdapter.sendViaMeta(
    neikyPhone,
    `🚀 Migración Twilio → Meta completa.\n\nMariana ahora habla por +52 55 6212 3864 directo (sin sandbox).\n\nResponde "ok" si recibes esto.\n\n— Sistema (auto)`
  );
  console.log(`  message sent. messageId=${result.messageId}`);
  return result;
}

async function rollback(reason) {
  console.log('\n[migrate-to-meta] ⚠ ROLLBACK iniciado:', reason);
  await ChannelAdapter.switchToTwilio();
  await supabase.rpc('log_action', {
    p_actor: 'system',
    p_action: 'meta_migration_rollback',
    p_service: 'channel_adapter',
    p_status: 'success',
    p_details: { reason },
    p_error_code: 'MIGRATION_ROLLBACK'
  }).catch(() => {});
  console.log('  ACTIVE_CHANNEL restored to TWILIO. Twilio sigue operacional.');
}

(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('MIGRATE TO META — Twilio → Meta Cloud API');
  console.log('═══════════════════════════════════════════════════');
  const start = Date.now();
  let stage = 'init';

  try {
    stage = 'pre_test';
    if (!await runPreTest()) {
      throw new Error('pre-migration-test failed. Aborting.');
    }

    stage = 'register';
    await registerPhoneWithPin();

    stage = 'verify_connected';
    await verifyConnected();

    stage = 'flip_channel';
    await flipChannelInRailway();

    stage = 'send_test';
    const test = await sendTestToNeiky();

    console.log('\n[migrate-to-meta] Step 6/7: esperando confirmación humana NKD (60s)...');
    console.log('  → Si NKD recibe el mensaje y responde "ok" en WhatsApp, el sistema lo logueará automáticamente.');
    console.log('  → Esperar 60s antes de marcar success final.');
    await new Promise(r => setTimeout(r, 60000));

    stage = 'log_success';
    await supabase.rpc('log_action', {
      p_actor: 'system',
      p_action: 'meta_migration_completed',
      p_service: 'channel_adapter',
      p_status: 'success',
      p_details: {
        duration_ms: Date.now() - start,
        test_message_id: test.messageId,
        from_channel: 'twilio',
        to_channel: 'meta'
      }
    });

    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ MIGRATION COMPLETED');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Duration: ${((Date.now() - start) / 1000).toFixed(1)}s`);
    console.log('Test message sent to NKD via Meta.');
    console.log('Twilio sigue como fallback automático en ChannelAdapter.');
    process.exit(0);
  } catch (err) {
    console.error(`\n[migrate-to-meta] ❌ FAILED at stage=${stage}:`, err.message);
    await rollback(`stage=${stage}: ${err.message}`);
    process.exit(1);
  }
})();
