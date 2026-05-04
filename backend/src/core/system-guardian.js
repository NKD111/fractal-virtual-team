// backend/src/core/system-guardian.js
// System Guardian — Top-level orchestrator for NEXUS + ATLAS.
// Singleton. Exposed as global.guardian.

const { NexusAgent } = require('../nexus/nexus-agent');
const { AtlasAgent } = require('../atlas/atlas-agent');
const { NexusAtlasCoordinator } = require('./nexus-atlas-coordinator');
const { notifyNeiky } = require('../core/whatsapp');
const { supabase } = require('../core/supabase');

class SystemGuardian {
  constructor() {
    this.nexus = new NexusAgent();
    this.atlas = new AtlasAgent();
    this.coordinator = new NexusAtlasCoordinator(this.nexus, this.atlas);
    this._initialized = false;
    this.startedAt = null;
  }

  async initialize() {
    if (this._initialized) return;
    console.log('\n🛡️ System Guardian — NEXUS + ATLAS iniciando...');

    try {
      // Boot NEXUS and ATLAS in parallel
      await Promise.all([
        this.nexus.initialize(),
        this.atlas.initialize()
      ]);

      // Wire up coordination
      this.coordinator.setupCommunication();
      console.log('  ✓ NexusAtlasCoordinator: comunicación activa');

      this._initialized = true;
      this.startedAt = new Date().toISOString();

      console.log('✅ System Guardian operativo — NEXUS + ATLAS 24/7\n');

      // Seed services if table is empty
      await this._seedServicesIfNeeded();

      // Startup notification (non-blocking)
      notifyNeiky(
        '🛡️ *System Guardian activo*\n' +
        '🔧 ATLAS: pruebas sintéticas cada minuto ($0)\n' +
        '🔮 ATLAS: predicciones cada 5 min\n' +
        '💰 NEXUS: monitoreo financiero cada hora\n' +
        '📊 NEXUS: reporte diario a las 8 AM CDMX\n' +
        '_El sistema está bajo vigilancia 24/7_ 🏰'
      ).catch(err => console.warn('[Guardian] Startup notification error:', err.message));

    } catch (err) {
      console.error('[Guardian] Initialization error:', err.message);
      // Don't crash the server
    }
  }

  async _seedServicesIfNeeded() {
    try {
      const { count } = await supabase
        .from('monitored_services')
        .select('*', { count: 'exact', head: true });

      if (count && count > 0) return; // Already seeded

      console.log('[Guardian] Seeding monitored_services...');
      const services = [
        { service_key: 'railway_backend', name: 'Railway Backend', type: 'hosting', importance_level: 5, health_url: (process.env.BACKEND_URL || 'https://fractal-virtual-team-production.up.railway.app') + '/webhook/health' },
        { service_key: 'supabase', name: 'Supabase DB', type: 'database', importance_level: 5 },
        { service_key: 'redis', name: 'Redis Cache', type: 'cache', importance_level: 5 },
        { service_key: 'anthropic_api', name: 'Anthropic API', type: 'api', importance_level: 5 },
        { service_key: 'twilio_whatsapp', name: 'Twilio WhatsApp', type: 'api', importance_level: 5 },
        { service_key: 'vercel_frontend', name: 'Vercel Frontend', type: 'hosting', importance_level: 4, health_url: 'https://fractal-virtual-team.vercel.app/' },
        { service_key: 'gmail_api', name: 'Gmail API', type: 'api', importance_level: 4 },
        { service_key: 'higgsfield', name: 'Higgsfield', type: 'api', importance_level: 3 },
        { service_key: 'recraft', name: 'Recraft', type: 'api', importance_level: 3 },
        { service_key: 'elevenlabs', name: 'ElevenLabs', type: 'api', importance_level: 3 }
      ];

      const { error } = await supabase.from('monitored_services').insert(services);
      if (error) console.warn('[Guardian] Seed error:', error.message);
      else console.log(`[Guardian] ${services.length} servicios configurados para monitoreo`);
    } catch (err) {
      console.warn('[Guardian] Seed check error:', err.message);
    }
  }

  async getStatus() {
    const [nexusStatus, atlasStatus] = await Promise.allSettled([
      this.nexus.getStatus(),
      this.atlas.getStatus()
    ]);

    // Count healthy services
    const { data: services } = await supabase
      .from('monitored_services')
      .select('current_status')
      .eq('is_active', true)
      .catch(() => ({ data: [] }));

    const statusCounts = (services || []).reduce((acc, s) => {
      acc[s.current_status] = (acc[s.current_status] || 0) + 1;
      return acc;
    }, {});

    return {
      initialized: this._initialized,
      started_at: this.startedAt,
      nexus: nexusStatus.status === 'fulfilled' ? nexusStatus.value : { error: nexusStatus.reason?.message },
      atlas: atlasStatus.status === 'fulfilled' ? atlasStatus.value : { error: atlasStatus.reason?.message },
      services: statusCounts,
      total_services: services?.length || 0
    };
  }
}

// Singleton
let _instance = null;
function getGuardian() {
  if (!_instance) _instance = new SystemGuardian();
  return _instance;
}

module.exports = { SystemGuardian, getGuardian };
