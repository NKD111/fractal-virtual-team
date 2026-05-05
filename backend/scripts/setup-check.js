#!/usr/bin/env node
// scripts/setup-check.js
// Validates env vars + Supabase tables. Run with:
//   node scripts/setup-check.js
// or remotely:
//   curl -s https://<railway-url>/api/admin/setup-check?token=ADMIN_TOKEN
//
// Exits 0 if everything required is present, 1 otherwise.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const REQUIRED_ENVS = {
  // Core
  SUPABASE_URL: { required: true, why: 'DB connection' },
  SUPABASE_SERVICE_KEY: { required: true, why: 'DB writes' },
  ANTHROPIC_API_KEY: { required: true, why: 'Claude calls (agentes + Oracle)' },
  // WhatsApp paths (one of)
  TWILIO_ACCOUNT_SID: { required: false, why: 'WhatsApp via Twilio Sandbox' },
  TWILIO_AUTH_TOKEN: { required: false, why: 'WhatsApp via Twilio Sandbox' },
  WHATSAPP_PHONE_NUMBER_ID: { required: false, why: 'WhatsApp Business API directo' },
  WHATSAPP_ACCESS_TOKEN: { required: false, why: 'WhatsApp Business API directo' },
  NEIKY_PHONE: { required: true, why: 'Destino del morning digest' },
  // Monetization
  STRIPE_SECRET_KEY: { required: false, why: 'Cobros + Payment Links + Revenue tracking' },
  // Email
  RESEND_API_KEY: { required: false, why: 'Envío email entregables + reply loop' },
  // Voice / Image
  ELEVENLABS_API_KEY: { required: false, why: 'TTS por agente (voice synth)' },
  OPENAI_API_KEY: { required: false, why: 'DALL-E 3 covers + Whisper STT + GPT-4o QC' },
  // Other integrations
  GOOGLE_CLIENT_ID: { required: false, why: 'Google Calendar OAuth' },
  GOOGLE_CLIENT_SECRET: { required: false, why: 'Google Calendar OAuth' },
  FIGMA_TOKEN: { required: false, why: 'Lectura Figma para Carlos/Diego' },
  CLOUDINARY_URL: { required: false, why: 'Persistencia de assets' },
  // Internal
  ADMIN_TOKEN: { required: false, why: '/api/admin/* protección' },
  PUBLIC_URL: { required: false, why: 'Links absolutos en landings/emails' },
};

const REQUIRED_TABLES = [
  // 005 seed
  'clients', 'projects',
  // 004
  'daily_context',
  // 006 tasks pipeline
  'tasks', 'task_events',
  // 007 telemetry
  'audit_log', 'cost_log', 'qc_reviews', 'agent_state',
  // 008 unicorn (insights, embed, voice cache)
  'insights', 'embed_leads', 'voice_cache',
  // 009 growth (deal room, case studies, public api, self-improve)
  'deal_rooms', 'case_studies', 'api_keys', 'webhook_subs', 'agent_baseline',
  // 010 revenue
  'revenue_products', 'council_votes', 'revenue_campaigns',
  'revenue_metrics_daily', 'revenue_events',
  // 011 funnel
  'funnels', 'subscribers', 'email_drips', 'email_drip_sent',
  'blog_posts', 'product_subscriptions',
  // Existing core
  'pending_promises', 'system_events',
];

async function main() {
  console.log('\n🔍 FRACTAL MX — setup-check\n' + '─'.repeat(60));

  // 1. ENV VARS
  const envResults = { ok: [], warn: [], missing: [] };
  for (const [name, meta] of Object.entries(REQUIRED_ENVS)) {
    const val = process.env[name];
    if (val && val.length > 3) envResults.ok.push({ name, why: meta.why });
    else if (meta.required) envResults.missing.push({ name, why: meta.why });
    else envResults.warn.push({ name, why: meta.why });
  }

  console.log('\n📋 ENV VARS');
  console.log(`  ✅ Configuradas (${envResults.ok.length}):`);
  envResults.ok.forEach(e => console.log(`     ${e.name.padEnd(30)} ${e.why}`));
  if (envResults.missing.length) {
    console.log(`\n  ❌ FALTAN (${envResults.missing.length}) — REQUERIDAS:`);
    envResults.missing.forEach(e => console.log(`     ${e.name.padEnd(30)} ${e.why}`));
  }
  if (envResults.warn.length) {
    console.log(`\n  ⚠️  Opcionales sin configurar (${envResults.warn.length}):`);
    envResults.warn.forEach(e => console.log(`     ${e.name.padEnd(30)} ${e.why}`));
  }

  // 2. TABLES
  console.log('\n📊 SUPABASE TABLES');
  const tableResults = { exists: [], missing: [], errored: [] };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log('  ⛔ No puedo chequear tablas (faltan SUPABASE_URL / SUPABASE_SERVICE_KEY)');
  } else {
    let supabase;
    try {
      const { createClient } = require('@supabase/supabase-js');
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    } catch (e) {
      console.log('  ⛔ No pude crear cliente Supabase:', e.message);
    }

    if (supabase) {
      for (const table of REQUIRED_TABLES) {
        try {
          const { error, status } = await supabase.from(table).select('*', { count: 'exact', head: true }).limit(1);
          if (error) {
            // 42P01 = relation does not exist
            if (/does not exist|42P01/i.test(error.message || '') || status === 404) {
              tableResults.missing.push(table);
            } else {
              tableResults.errored.push({ table, err: error.message });
            }
          } else {
            tableResults.exists.push(table);
          }
        } catch (e) {
          tableResults.errored.push({ table, err: e.message });
        }
      }

      console.log(`  ✅ Existen (${tableResults.exists.length}/${REQUIRED_TABLES.length})`);
      if (tableResults.missing.length) {
        console.log(`\n  ❌ FALTAN (${tableResults.missing.length}) — corre las migrations:`);
        tableResults.missing.forEach(t => console.log(`     ${t}`));
        console.log('\n     → Pega backend/supabase-migrations/ALL_PENDING.sql en Supabase SQL Editor');
      }
      if (tableResults.errored.length) {
        console.log(`\n  ⚠️  Tablas con errores (no son "missing"):`);
        tableResults.errored.forEach(e => console.log(`     ${e.table}: ${e.err}`));
      }
    }
  }

  // 3. RESUMEN + EXIT
  const okEnv = envResults.missing.length === 0;
  const okTables = tableResults.missing.length === 0 && tableResults.errored.length === 0;

  console.log('\n' + '─'.repeat(60));
  console.log('📈 RESUMEN');
  console.log(`   ENV requeridas: ${okEnv ? '✅' : '❌'} (${envResults.ok.length} ok / ${envResults.missing.length} faltan)`);
  console.log(`   Tablas DB:      ${okTables ? '✅' : '❌'} (${tableResults.exists.length} ok / ${tableResults.missing.length} faltan)`);
  console.log(`   Listo para producir: ${okEnv && okTables ? '✅ SÍ' : '❌ NO'}\n`);

  process.exit(okEnv && okTables ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
