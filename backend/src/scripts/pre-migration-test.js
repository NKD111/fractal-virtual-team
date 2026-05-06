// backend/src/scripts/pre-migration-test.js
// Verificación pre-vuelo antes de migrar Twilio → Meta.
// Solo ejecutar cuando BV-1 esté APROBADO por Meta.
//
// Uso: node backend/src/scripts/pre-migration-test.js
// Returns exit 0 si TODO pasa, exit 1 si algo falla.

const axios = require('axios');
const { supabase } = require('../core/supabase');

async function check(label, fn) {
  process.stdout.write(`▸ ${label}... `);
  try {
    const result = await fn();
    if (result === false) {
      console.log('❌');
      return false;
    }
    console.log(typeof result === 'string' ? `✅ ${result}` : '✅');
    return true;
  } catch (err) {
    console.log(`❌ ${err.message}`);
    return false;
  }
}

(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('PRE-MIGRATION TEST — Twilio → Meta Cloud API');
  console.log('═══════════════════════════════════════════════════\n');

  const results = [];

  // 1. Token Meta válido
  results.push(await check('Token Meta válido (debug_token)', async () => {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) throw new Error('META_ACCESS_TOKEN no está en env');
    const { data } = await axios.get(`https://graph.facebook.com/v21.0/debug_token?input_token=${token}&access_token=${token}`);
    if (!data?.data?.is_valid) throw new Error('Token inválido');
    return `valid, expires=${data.data.expires_at === 0 ? 'NEVER' : data.data.expires_at}`;
  }));

  // 2. Phone Number ID en env
  results.push(await check('META_PHONE_NUMBER_ID en env', async () => {
    const id = process.env.META_PHONE_NUMBER_ID;
    if (!id) throw new Error('falta');
    return id;
  }));

  // 3. WABA ID en env
  results.push(await check('META_WABA_ID en env', async () => {
    const id = process.env.META_WABA_ID;
    if (!id) throw new Error('falta');
    return id;
  }));

  // 4. Phone status — debe estar CONNECTED post-/register
  results.push(await check('Phone status CONNECTED (Cloud API)', async () => {
    const token = process.env.META_ACCESS_TOKEN;
    const phoneId = process.env.META_PHONE_NUMBER_ID;
    const { data } = await axios.get(
      `https://graph.facebook.com/v21.0/${phoneId}?fields=verified_name,code_verification_status,status,display_phone_number&access_token=${token}`
    );
    if (data.status !== 'CONNECTED') {
      throw new Error(`status=${data.status}, expected CONNECTED. Ejecutar /register con PIN primero.`);
    }
    return `${data.display_phone_number} (${data.verified_name})`;
  }));

  // 5. Webhook subscribed correctamente
  results.push(await check('Webhook callback URL apunta a fractal-virtual-team', async () => {
    const token = process.env.META_ACCESS_TOKEN;
    const wabaId = process.env.META_WABA_ID;
    const { data } = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${token}`);
    const phone = data?.data?.[0];
    const webhook = phone?.webhook_configuration?.application;
    const expected = 'fractal-virtual-team-production.up.railway.app/webhook/meta';
    if (!webhook || !webhook.includes(expected)) {
      throw new Error(`webhook=${webhook}, expected contains ${expected}`);
    }
    return webhook;
  }));

  // 6. Backend healthy
  results.push(await check('Backend /webhook/health OK', async () => {
    const { data } = await axios.get('https://fractal-virtual-team-production.up.railway.app/webhook/health', { timeout: 8000 });
    if (data.status !== 'ok') throw new Error('status != ok');
    return `${data.team}, ${data.agents} agents`;
  }));

  // 7. Supabase responsive
  results.push(await check('Supabase RPC log_action funciona', async () => {
    const { error } = await supabase.rpc('log_action', {
      p_actor: 'pre_migration_test',
      p_action: 'health_check',
      p_service: 'supabase',
      p_status: 'success'
    });
    if (error) throw new Error(error.message);
    return 'rpc OK';
  }));

  // 8. Mariana respondiendo en Twilio actual (smoke test pasivo)
  results.push(await check('TWILIO credentials presentes (rollback path)', async () => {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error('TWILIO env missing — rollback impossible');
    }
    return 'present';
  }));

  // 9. Channel adapter está en código
  results.push(await check('ChannelAdapter module loadable', async () => {
    const ChannelAdapter = require('../core/channel-adapter');
    if (!ChannelAdapter.send) throw new Error('send method missing');
    return `ACTIVE_CHANNEL=${ChannelAdapter.ACTIVE_CHANNEL}`;
  }));

  // Final
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`RESULT: ${passed}/${total} checks passed`);
  console.log('═══════════════════════════════════════════════════');

  // Save to Supabase
  await supabase.rpc('log_action', {
    p_actor: 'pre_migration_test',
    p_action: 'completed',
    p_service: 'channel_adapter',
    p_status: passed === total ? 'success' : 'failed',
    p_details: { passed, total, ready_to_migrate: passed === total }
  }).then(() => {}).catch(() => {});

  if (passed === total) {
    console.log('\n✅ LISTO PARA MIGRAR — ejecutar `node backend/src/scripts/migrate-to-meta.js`');
    process.exit(0);
  } else {
    console.log(`\n❌ NO MIGRAR — ${total - passed} check(s) fallaron arriba`);
    process.exit(1);
  }
})();
