// backend/src/oracle/quota/quota-manager.js
// Soft daily quotas per agent — never blocks, only warns.

const { supabase } = require('../../core/supabase');

class QuotaManager {
  async loadQuotas() {
    try {
      const { data: agents, error } = await supabase.from('agents').select('id');
      if (error || !agents) {
        console.warn('[QuotaManager] No agents found:', error?.message);
        return;
      }

      // Upsert default quotas for every agent (ignore if already exists)
      for (const agent of agents) {
        await supabase
          .from('oracle_quotas')
          .upsert({ agent_id: agent.id }, { onConflict: 'agent_id', ignoreDuplicates: true });
      }
      console.log(`  ✓ ORACLE quotas loaded for ${agents.length} agents`);
    } catch (err) {
      console.warn('[QuotaManager] loadQuotas error:', err.message);
    }
  }

  async check(agentId, model) {
    if (!agentId) return { allowed: true, warning: false };

    try {
      const { data } = await supabase
        .from('oracle_quotas')
        .select('*')
        .eq('agent_id', agentId)
        .single();

      if (!data) return { allowed: true, warning: false };

      const map = {
        haiku:  { used: data.used_today_quick,    limit: data.daily_quick_queries },
        sonnet: { used: data.used_today_standard, limit: data.daily_standard_queries },
        opus:   { used: data.used_today_premium,  limit: data.daily_premium_queries }
      };
      const { used, limit } = map[model] || map.sonnet;
      const percent = limit > 0 ? (used / limit) * 100 : 0;

      return {
        allowed: true,           // soft limit — always allowed
        warning: percent >= 80,
        used,
        limit,
        percent
      };
    } catch (err) {
      return { allowed: true, warning: false };
    }
  }

  async consume(agentId, model) {
    if (!agentId) return;
    const fieldMap = {
      haiku:  'used_today_quick',
      sonnet: 'used_today_standard',
      opus:   'used_today_premium'
    };
    const field = fieldMap[model];
    if (!field) return;

    try {
      // Use the SQL function created in fase5_7_oracle.sql
      await supabase.rpc('increment_quota', { agent_id: agentId, field_name: field });
    } catch (err) {
      console.warn('[QuotaManager] consume error:', err.message);
    }
  }

  async resetDaily() {
    try {
      // Set all rows to zero for the daily counters
      await supabase
        .from('oracle_quotas')
        .update({
          used_today_quick: 0,
          used_today_standard: 0,
          used_today_premium: 0,
          used_today_research: 0,
          daily_cost_accumulated: 0,
          last_reset_at: new Date().toISOString()
        })
        .gt('daily_quick_queries', -1); // matches all rows
      console.log('🔄 ORACLE quotas reseteadas');
    } catch (err) {
      console.warn('[QuotaManager] resetDaily error:', err.message);
    }
  }
}

module.exports = QuotaManager;
