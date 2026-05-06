// backend/src/scripts/rollback-to-twilio.js
// Forzar canal de vuelta a Twilio si Meta tiene problemas en producción.
//
// Uso: node backend/src/scripts/rollback-to-twilio.js "razón opcional"

const ChannelAdapter = require('../core/channel-adapter');
const { supabase } = require('../core/supabase');
const axios = require('axios');

(async () => {
  const reason = process.argv[2] || 'manual_rollback';
  console.log('[rollback] Initiating rollback to Twilio. Reason:', reason);

  // 1. Flip in-memory
  await ChannelAdapter.switchToTwilio();

  // 2. Persistir en Railway si tenemos token
  const railwayToken = process.env.RAILWAY_API_TOKEN;
  if (railwayToken && process.env.RAILWAY_PROJECT_ID) {
    try {
      await axios.post('https://backboard.railway.app/graphql/v2', {
        query: 'mutation Upsert($input: VariableUpsertInput!) { variableUpsert(input: $input) }',
        variables: {
          input: {
            projectId: process.env.RAILWAY_PROJECT_ID,
            environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
            serviceId: process.env.RAILWAY_SERVICE_ID,
            name: 'ACTIVE_CHANNEL',
            value: 'twilio'
          }
        }
      }, { headers: { Authorization: `Bearer ${railwayToken}` } });
      console.log('[rollback] ACTIVE_CHANNEL=twilio persisted in Railway.');
    } catch (e) {
      console.warn('[rollback] Railway persist failed:', e.message);
    }
  }

  // 3. Log + notify NKD
  await supabase.rpc('log_action', {
    p_actor: 'system',
    p_action: 'rollback_to_twilio',
    p_service: 'channel_adapter',
    p_status: 'success',
    p_details: { reason, at: new Date().toISOString() }
  }).catch(() => {});

  // Notificar a NKD del rollback (Twilio asegurado)
  try {
    const neikyPhone = (process.env.NEIKY_WHATSAPP || '+5215534189583').replace('whatsapp:', '');
    await ChannelAdapter.sendViaTwilio(
      neikyPhone,
      `⚠️ Sistema rolled back a Twilio. Razón: ${reason}\n\nTwilio sigue funcional. Revisa logs cuando puedas.`
    );
  } catch (e) {
    console.warn('[rollback] Could not notify NKD:', e.message);
  }

  console.log('[rollback] DONE. Twilio is the active channel.');
  process.exit(0);
})();
